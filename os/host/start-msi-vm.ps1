param(
    [ValidateSet('Installer', 'Disk')]
    [string]$Mode = 'Installer'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$artifactRoot = Join-Path $repoRoot '.artifacts'
$vmRoot = Join-Path $artifactRoot 'vm\msi-gf63-11uc'
$isoPath = Join-Path $artifactRoot 'isos\archlinux-2026.09.01-x86_64.iso'
$diskPath = Join-Path $vmRoot 'shell-os.qcow2'
$varsPath = Join-Path $vmRoot 'uefi-vars.fd'
$stdoutLog = Join-Path $vmRoot 'qemu.stdout.log'
$stderrLog = Join-Path $vmRoot 'qemu.stderr.log'
$qemuRoot = 'C:\Program Files\qemu'
$qemu = Join-Path $qemuRoot 'qemu-system-x86_64.exe'
$qemuImg = Join-Path $qemuRoot 'qemu-img.exe'
$uefiCode = Join-Path $qemuRoot 'share\edk2-x86_64-code.fd'
$uefiVarsTemplate = Join-Path $qemuRoot 'share\edk2-i386-vars.fd'

foreach ($required in @($qemu, $qemuImg, $uefiCode, $uefiVarsTemplate)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required QEMU file is missing: $required" }
}
if ($Mode -eq 'Installer' -and -not (Test-Path -LiteralPath $isoPath)) {
    throw "Verified Arch installer is missing: $isoPath"
}
if (Get-Process qemu-system-x86_64 -ErrorAction SilentlyContinue) {
    throw 'A QEMU VM is already running. Close it before starting another SHELL VM.'
}

New-Item -ItemType Directory -Force -Path $vmRoot | Out-Null
if (-not (Test-Path -LiteralPath $diskPath)) {
    & $qemuImg create -f qcow2 $diskPath 64G
    if ($LASTEXITCODE -ne 0) { throw 'QEMU could not create the disposable VM disk.' }
}
if (-not (Test-Path -LiteralPath $varsPath)) {
    Copy-Item -LiteralPath $uefiVarsTemplate -Destination $varsPath
}
$qemuArgs = @(
    '-name', 'SHELL OS - MSI development VM',
    '-machine', 'q35,accel=tcg',
    '-cpu', 'max',
    '-smp', '4',
    '-m', '8192',
    '-drive', "if=pflash,format=raw,readonly=on,file=$uefiCode",
    '-drive', "if=pflash,format=raw,file=$varsPath",
    '-drive', "file=$diskPath,if=virtio,format=qcow2",
    '-vga', 'std',
    '-display', 'sdl',
    '-device', 'virtio-net-pci,netdev=net0',
    '-netdev', 'user,id=net0',
    '-device', 'qemu-xhci',
    '-device', 'usb-tablet',
    '-audiodev', 'dsound,id=audio0',
    '-device', 'intel-hda',
    '-device', 'hda-duplex,audiodev=audio0'
)
if ($Mode -eq 'Installer') {
    $qemuArgs += @('-boot', 'order=d,menu=on', '-cdrom', $isoPath)
} else {
    $qemuArgs += @('-boot', 'order=c,menu=on')
}

$argumentLine = ($qemuArgs | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
$process = Start-Process -FilePath $qemu `
    -ArgumentList $argumentLine `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

Start-Sleep -Seconds 2
if ($process.HasExited) {
    $detail = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Raw).Trim() } else { '' }
    throw "QEMU exited during startup with code $($process.ExitCode). $detail"
}

Write-Host "Started disposable SHELL VM in $Mode mode (process $($process.Id))."
Write-Host 'This PowerShell window may now be closed; close the QEMU window to stop the VM.'
Write-Host "QEMU logs: $stderrLog"
