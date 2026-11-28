$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SkimmerKnownFolders {
    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);
    public static string Read(string id) {
        var folder = new Guid(id);
        IntPtr path;
        Marshal.ThrowExceptionForHR(SHGetKnownFolderPath(ref folder, 0, IntPtr.Zero, out path));
        try { return Marshal.PtrToStringUni(path); }
        finally { Marshal.FreeCoTaskMem(path); }
    }
}
'@
# dirs-sys uses this API with flags 0 and the current process token.
$folders = @{
    'F1B32785-6FBA-4FCF-9D55-7B8E7F157091' = $env:LOCALAPPDATA
    '3EB685DB-65F9-4CF6-A03A-E3EF65729F3D' = $env:APPDATA
}
foreach ($id in $folders.Keys) {
    $resolved = [SkimmerKnownFolders]::Read($id)
    if ([IO.Path]::GetFullPath($resolved) -ne [IO.Path]::GetFullPath($folders[$id])) {
        throw 'Windows did not resolve both native data directories inside the new QA profile.'
    }
}
Write-Output 'Verified isolated Windows local and roaming known folders.'
