param(
    [Parameter(Mandatory)] [string] $InstallRoot,
    [Parameter(Mandatory)] [string] $ReportPath
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $InstallRoot).Path
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $env:TEMP ('skimmer-rc-window-'+[guid]::NewGuid())
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=0'
$app=Start-Process -FilePath (Join-Path $root 'skimmer-scraper.exe') -PassThru -WindowStyle Normal
try{
 $portFile=Join-Path $env:WEBVIEW2_USER_DATA_FOLDER 'EBWebView/DevToolsActivePort'
 $until=(Get-Date).AddSeconds(55)
 while(!(Test-Path $portFile) -and (Get-Date) -lt $until){Start-Sleep -Milliseconds 200}
 $env:QA_WINDOW_PORT=(Get-Content $portFile)[0]
 $check=@'
import {chromium} from '@playwright/test';
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+process.env.QA_WINDOW_PORT);
const page=browser.contexts()[0].pages()[0];
await page.waitForFunction(()=>!!window.__SKIMMER_SCRAPER__);
if(process.env.QA_WINDOW_STEP==='start'){
 await page.locator('#start-button').click();await page.waitForFunction(()=>window.__SKIMMER_SCRAPER__.snapshot().runTime>1);
 await page.locator('#game-canvas').click({position:{x:220,y:180},force:true});
 await page.waitForFunction(()=>!!document.pointerLockElement);
}
if(process.env.QA_WINDOW_STEP==='resume'&&await page.locator('#pause-panel').isVisible())await page.locator('#pause-resume').click();
console.log(JSON.stringify(await page.evaluate(async()=>({app:await(await fetch('./build-info.json')).json(),mode:window.__SKIMMER_SCRAPER__.snapshot().mode,focus:document.hasFocus(),lock:!!document.pointerLockElement}))));
await browser.close();
'@
 function State($step){$env:QA_WINDOW_STEP=$step;$result=$check | node --input-type=module -;if($LASTEXITCODE){throw 'Window snapshot failed'};return ($result | ConvertFrom-Json)}
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class QAFlightWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool on);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
 function ActivateTestApp {
    $app.Refresh()
    $w=$app.MainWindowHandle
    if($w -eq [IntPtr]::Zero){throw 'No QA main window'}
    $foreground=[QAFlightWindow]::GetForegroundWindow()
    if($foreground -eq $w){return}
    [uint32]$fgOwner=0
    $thread=[QAFlightWindow]::GetWindowThreadProcessId($foreground,[ref]$fgOwner)
    $self=[QAFlightWindow]::GetCurrentThreadId()
    $joined=$thread -ne $self -and [QAFlightWindow]::AttachThreadInput($self,$thread,$true)
    try{
      [void][QAFlightWindow]::ShowWindowAsync($w,9)
      [void][QAFlightWindow]::BringWindowToTop($w)
      [void][QAFlightWindow]::SetForegroundWindow($w)
    }finally{if($joined){[void][QAFlightWindow]::AttachThreadInput($self,$thread,$false)}}
    Start-Sleep -Milliseconds 250
    $foreground=[QAFlightWindow]::GetForegroundWindow()
    if($foreground -ne $w){
      [void][QAFlightWindow]::GetWindowThreadProcessId($foreground,[ref]$fgOwner)
      throw ("QA did not acquire OS focus. Expected "+$app.Id+" actual "+$fgOwner+" ("+(Get-Process -Id $fgOwner).ProcessName+")")
    }
 }
 ActivateTestApp
 $initial=State 'start'
 ActivateTestApp
 $app.Refresh()
 $window=$app.MainWindowHandle
 if($window -eq [IntPtr]::Zero -or [QAFlightWindow]::GetForegroundWindow() -ne $window){throw 'Test application must own the foreground for Escape'}
 (New-Object -ComObject WScript.Shell).SendKeys('{ESC}')
 Start-Sleep -Milliseconds 400
 $escape=State 'inspect'
 $running=State 'resume'
 [void][QAFlightWindow]::ShowWindowAsync($window,6)
 Start-Sleep -Milliseconds 600
 $minimized=State 'inspect'
 [void][QAFlightWindow]::ShowWindowAsync($window,9)
 Start-Sleep -Milliseconds 450
 $resumed=State 'resume'
 [ordered]@{initial=$initial;osEscape=$escape;beforeMinimize=$running;osMinimize=$minimized;afterRestoreAndResume=$resumed} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding utf8
 if($escape.mode -ne 'paused' -or $escape.lock -or $minimized.mode -ne 'paused' -or $resumed.mode -ne 'running'){throw 'Desktop pause/restore failed'}
}finally{
 if(!$app.HasExited){[void]$app.CloseMainWindow();[void]$app.WaitForExit(5000)}
}
