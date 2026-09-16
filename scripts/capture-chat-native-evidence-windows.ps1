$ErrorActionPreference = 'Stop'

# Read-only discovery helper. It never launches, focuses, moves, minimizes, closes,
# registers, or reads window titles, command lines, credentials, or environment data.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public sealed class CeWindowEvidenceSample {
    public long Hwnd;
    public uint Pid;
    public ulong ProcessStartTime;
    public string PackageFamilyName;
    public string ApplicationUserModelId;
    public string PackageFullName;
    public string ProcessExecutable;
    public string WindowClass;
    public bool RootSelf;
    public bool OwnerAbsent;
    public bool Visible;
    public bool Iconic;
    public bool Cloaked;
    public bool ToolWindow;
    public int X;
    public int Y;
    public int Width;
    public int Height;
    public uint Dpi;
}

public static class CeWindowEvidence {
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);
    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct FILETIME { public uint Low, High; }

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder value, int maximum);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong32(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out uint value, uint size);
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder value, ref uint size);
    [DllImport("kernel32.dll")] private static extern bool GetProcessTimes(IntPtr process, out FILETIME created, out FILETIME exited, out FILETIME kernel, out FILETIME user);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetPackageFamilyName(IntPtr process, ref uint length, StringBuilder value);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder value);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetPackageFullName(IntPtr process, ref uint length, StringBuilder value);

    private static long WindowStyle(IntPtr hwnd) {
        return IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, -20).ToInt64() : GetWindowLong32(hwnd, -20);
    }
    private static string Family(IntPtr process) {
        uint length = 0;
        if (GetPackageFamilyName(process, ref length, null) != 122 || length < 2 || length > 512) return null;
        var value = new StringBuilder((int)length);
        return GetPackageFamilyName(process, ref length, value) == 0 ? value.ToString() : null;
    }
    private static string Aumid(IntPtr process) {
        uint length = 0;
        if (GetApplicationUserModelId(process, ref length, null) != 122 || length < 2 || length > 512) return null;
        var value = new StringBuilder((int)length);
        return GetApplicationUserModelId(process, ref length, value) == 0 ? value.ToString() : null;
    }
    private static string FullName(IntPtr process) {
        uint length = 0;
        if (GetPackageFullName(process, ref length, null) != 122 || length < 2 || length > 512) return null;
        var value = new StringBuilder((int)length);
        return GetPackageFullName(process, ref length, value) == 0 ? value.ToString() : null;
    }

    public static CeWindowEvidenceSample[] Capture() {
        var samples = new List<CeWindowEvidenceSample>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
            try {
                uint pid;
                if (GetWindowThreadProcessId(hwnd, out pid) == 0 || pid == 0) return true;
                IntPtr process = OpenProcess(0x1000, false, pid);
                if (process == IntPtr.Zero) return true;
                try {
                    string family = Family(process);
                    string aumid = Aumid(process);
                    string fullName = FullName(process);
                    if (String.IsNullOrEmpty(family) || String.IsNullOrEmpty(aumid) || String.IsNullOrEmpty(fullName)) return true;
                    uint imageLength = 32768;
                    var image = new StringBuilder((int)imageLength);
                    if (!QueryFullProcessImageName(process, 0, image, ref imageLength)) return true;
                    FILETIME created, exited, kernel, user;
                    if (!GetProcessTimes(process, out created, out exited, out kernel, out user)) return true;
                    var className = new StringBuilder(256);
                    if (GetClassName(hwnd, className, className.Capacity) < 1) return true;
                    RECT rect;
                    if (!GetWindowRect(hwnd, out rect)) return true;
                    uint cloaked = 0;
                    DwmGetWindowAttribute(hwnd, 14, out cloaked, sizeof(uint));
                    samples.Add(new CeWindowEvidenceSample {
                        Hwnd = hwnd.ToInt64(), Pid = pid,
                        ProcessStartTime = ((ulong)created.High << 32) | created.Low,
                        PackageFamilyName = family, ApplicationUserModelId = aumid,
                        PackageFullName = fullName, ProcessExecutable = image.ToString(),
                        WindowClass = className.ToString(),
                        RootSelf = GetAncestor(hwnd, 2) == hwnd, OwnerAbsent = GetWindow(hwnd, 4) == IntPtr.Zero,
                        Visible = IsWindowVisible(hwnd), Iconic = IsIconic(hwnd), Cloaked = cloaked != 0,
                        ToolWindow = (WindowStyle(hwnd) & 0x80) != 0,
                        X = rect.Left, Y = rect.Top, Width = rect.Right - rect.Left, Height = rect.Bottom - rect.Top,
                        Dpi = GetDpiForWindow(hwnd)
                    });
                } finally { CloseHandle(process); }
            } catch { }
            return true;
        }, IntPtr.Zero);
        return samples.ToArray();
    }
}
'@

$packages = @{}
Get-AppxPackage | ForEach-Object { $packages[$_.PackageFullName] = $_.InstallLocation }
$windows = @()
foreach ($sample in [CeWindowEvidence]::Capture()) {
    $candidate = if ($sample.PackageFamilyName -match '^OpenAI\.Codex_[A-Za-z0-9]+$') { 'chatgpt' }
        elseif ($sample.PackageFamilyName -match '^Claude_[A-Za-z0-9]+$') { 'claude' }
        else { $null }
    if ($null -eq $candidate -or -not $packages.ContainsKey($sample.PackageFullName)) { continue }
    # Match the native driver's user-window boundary before serializing. Electron
    # helper, tray, IME, crash and hidden staging HWNDs never enter the evidence.
    if (-not $sample.RootSelf -or -not $sample.OwnerAbsent -or $sample.ToolWindow -or
        (-not $sample.Visible -and -not $sample.Iconic) -or ($sample.Cloaked -and -not $sample.Iconic) -or
        $sample.Width -lt 1 -or $sample.Height -lt 1 -or $sample.Dpi -lt 1) { continue }
    $root = [IO.Path]::GetFullPath([string]$packages[$sample.PackageFullName]).TrimEnd('\')
    $executable = [IO.Path]::GetFullPath($sample.ProcessExecutable)
    $prefix = $root + '\'
    if (-not $executable.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { continue }
    $relative = $executable.Substring($prefix.Length).Replace('/', '\').ToLowerInvariant()
    $windows += [ordered]@{
        clientCandidate = $candidate
        packageFamilyName = $sample.PackageFamilyName
        applicationUserModelId = $sample.ApplicationUserModelId
        packageFullName = $sample.PackageFullName
        relativeExecutable = $relative
        windowClass = $sample.WindowClass
        pid = [int64]$sample.Pid
        processStartTime = [string]$sample.ProcessStartTime
        hwnd = ('0x{0:x}' -f $sample.Hwnd)
        rootSelf = $sample.RootSelf
        ownerAbsent = $sample.OwnerAbsent
        visible = $sample.Visible
        iconic = $sample.Iconic
        cloaked = $sample.Cloaked
        toolWindow = $sample.ToolWindow
        bounds = [ordered]@{ x = $sample.X; y = $sample.Y; width = $sample.Width; height = $sample.Height }
        dpi = [int64]$sample.Dpi
    }
}

$monitorIndex = 0
$monitors = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
    $value = [ordered]@{
        index = $monitorIndex
        primary = $_.Primary
        bounds = [ordered]@{ x = $_.Bounds.X; y = $_.Bounds.Y; width = $_.Bounds.Width; height = $_.Bounds.Height }
        workingArea = [ordered]@{ x = $_.WorkingArea.X; y = $_.WorkingArea.Y; width = $_.WorkingArea.Width; height = $_.WorkingArea.Height }
    }
    $monitorIndex += 1
    $value
})

[ordered]@{ windows = @($windows); monitors = @($monitors) } | ConvertTo-Json -Depth 6 -Compress
