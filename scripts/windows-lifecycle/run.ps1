param(
    [Parameter(Mandatory)][ValidateSet('0.8.2','0.9.1','0.9.2','0.10.0')][string]$From,
    [AllowEmptyString()][string]$CandidateSha = ''
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if (!$IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
    throw 'This installer test requires a fresh GitHub-hosted Windows job.'
}
$profileRoot = [Environment]::GetFolderPath('UserProfile')
$localData = [Environment]::GetFolderPath('LocalApplicationData')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$osProfile = Get-ItemProperty "HKLM:/Software/Microsoft/Windows NT/CurrentVersion/ProfileList/$sid"
if ([Environment]::ExpandEnvironmentVariables($osProfile.ProfileImagePath) -ine $profileRoot -or
    $env:USERPROFILE -ine $profileRoot -or $localData -ine $env:LOCALAPPDATA -or
    $env:WEBVIEW2_USER_DATA_FOLDER) { throw 'Windows profile identity mismatch' }
$appData = Join-Path $localData 'io.github.styayur.skimmer-scraper'
$uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Skimmer-Scraper'
$registration = "HKCU:\$uninstallKey"
$sidRegistration = "Registry::HKEY_USERS\$sid\$uninstallKey"
$scratch = Join-Path $env:RUNNER_TEMP "skimmer-lifecycle"
$install = Join-Path $scratch 'installed'
$exe = Join-Path $install 'skimmer-scraper.exe'
$out = Join-Path $env:GITHUB_WORKSPACE 'acceptance/windows-lifecycle'
if ((Test-Path $appData) -or (Test-Path $registration) -or (Test-Path $scratch) -or (Test-Path $out)) {
    throw 'The runner already has a Skimmer installation, data or receipt.'
}
if ($CandidateSha -and $CandidateSha -cnotmatch '^[0-9a-f]{40}$') { throw 'Expected a full candidate commit' }
New-Item -ItemType Directory $scratch,$out | Out-Null
$releases = Get-Content "$PSScriptRoot/releases.json" -Raw | ConvertFrom-Json -AsHashtable
$target = '0.10.0'
$rollback = '0.9.2'
$scope = 'historical rehearsal'
if ($CandidateSha) {
    $target = '0.11.0'
    $rollback = '0.10.0'
    $scope = 'candidate'
    $candidate = Get-Content candidate-package/identity.json -Raw | ConvertFrom-Json -AsHashtable
    if ($candidate.source -cne $CandidateSha) { throw 'Candidate build artifact identity mismatch' }
    $releases[$target] = $candidate
}
$receipt = [ordered]@{
    scope = $scope; from = $From; target = $target; rollback = $rollback
    harness = (git rev-parse HEAD); run = $env:GITHUB_RUN_ID; attempt = $env:GITHUB_RUN_ATTEMPT
    image = $env:ImageVersion; sid = $sid; profile = $profileRoot; localAppData = $localData
    registry = $registration; installDirectory = $install; initialRegistrationAbsent = $true
    initialDataAbsent = $true; stages = @(); passed = $false
}
function Save-Receipt {
    $receipt | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 "$out/lifecycle.json"
}
function Get-Digest($file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
function Install-Version($version) {
    $identity = $releases[$version]
    if ($CandidateSha -and $version -ceq $target) {
        $installer = Join-Path 'candidate-package' $identity.installer
    } else {
        $installer = Join-Path $scratch $identity.installer
        if (!(Test-Path -LiteralPath $installer)) {
            $url = "https://github.com/styayur/Skimmer-Scraper/releases/download/v$version/" + $identity.installer
            Invoke-WebRequest -Uri $url -OutFile $installer -MaximumRetryCount 3
        }
    }
    if ((Get-Digest $installer) -cne $identity.installerSha256) { throw "Installer hash mismatch for $version" }
    $process = Start-Process -FilePath (Resolve-Path -LiteralPath $installer).Path -ArgumentList '/S',"/D=$install" -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw "NSIS $version exited with $($process.ExitCode)" }
    $reg = Get-ItemProperty $registration
    $hive = Get-ItemProperty $sidRegistration
    if ($reg.DisplayVersion -cne $version -or $hive.DisplayVersion -cne $version -or
        $reg.InstallLocation.Trim('"') -ine $install -or $hive.InstallLocation -ine $reg.InstallLocation) {
        throw "Expected the existing current-user registration at $install for $version"
    }
    $hash = Get-Digest $exe
    if ($hash -cne $identity.exeSha256) { throw "Installed executable hash mismatch for $version" }
    return [ordered]@{ version = $version; source = $identity.source; installer = $identity.installer
        installerSha256 = $identity.installerSha256; exeSha256 = $hash; exitCode = $process.ExitCode
        displayVersion = $reg.DisplayVersion; installLocation = $reg.InstallLocation }
}
try {
    foreach ($stage in @('original','upgrade','rollback','reupgrade')) {
        $version = switch ($stage) { original { $From } upgrade { $target } rollback { $rollback } reupgrade { $target } }
        $entry = [ordered]@{ step = $stage; version = $version }
        $receipt.stages += $entry
        Save-Receipt
        Write-Host "Running $stage with registered version $version"
        if ($stage -ne 'original') {
            python "$PSScriptRoot/snapshot.py" capture $appData "$scratch/backup-$stage" "$out/$stage-before.json"
        }
        $entry.install = Install-Version $version
        Save-Receipt
        if ($stage -ne 'original') {
            python "$PSScriptRoot/snapshot.py" verify $appData "$scratch/backup-$stage" "$out/$stage-after-nsis.json"
        }
        node "$PSScriptRoot/witness.mjs" $exe $out $stage $version $releases[$version].source $scope
    }
    # Reopen the re-upgraded binary once more without reinstalling or reseeding it.
    node "$PSScriptRoot/witness.mjs" $exe $out 'relaunch' $target $releases[$target].source $scope
    $receipt.passed = $true
} catch {
    $receipt.error = $_.Exception.Message
    throw
} finally { Save-Receipt }
