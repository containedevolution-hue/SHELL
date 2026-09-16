param(
    [ValidateSet('Create', 'List', 'Restore')]
    [string]$Action = 'List',

    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,47}$')]
    [string]$Name,

    [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$vmRoot = Join-Path $repoRoot '.artifacts\vm\msi-gf63-11uc'
$diskPath = Join-Path $vmRoot 'shell-os.qcow2'
$varsPath = Join-Path $vmRoot 'uefi-vars.fd'
$checkpointRoot = Join-Path $vmRoot 'checkpoints'
$qemuImg = 'C:\Program Files\qemu\qemu-img.exe'

if (-not (Test-Path -LiteralPath $qemuImg)) { throw "QEMU image tool is missing: $qemuImg" }
if (-not (Test-Path -LiteralPath $diskPath)) { throw "SHELL VM disk is missing: $diskPath" }
if (-not (Test-Path -LiteralPath $varsPath)) { throw "SHELL VM UEFI state is missing: $varsPath" }
if (Get-Process qemu-system-x86_64 -ErrorAction SilentlyContinue) {
    throw 'The SHELL VM is running. Shut down Arch and close QEMU before managing a checkpoint.'
}

if ($Action -in @('Create', 'Restore') -and -not $Name) {
    throw '-Name is required for Create and Restore.'
}

if ($Action -eq 'List') {
    Write-Host 'Virtual disk checkpoints:'
    & $qemuImg snapshot -l $diskPath
    if ($LASTEXITCODE -ne 0) { throw 'QEMU could not list virtual disk checkpoints.' }
    Write-Host "`nSaved UEFI states:"
    if (Test-Path -LiteralPath $checkpointRoot) {
        Get-ChildItem -LiteralPath $checkpointRoot -Directory | Select-Object Name, LastWriteTime
    } else {
        Write-Host '(none)'
    }
    exit 0
}

$checkpointPath = Join-Path $checkpointRoot $Name
$savedVarsPath = Join-Path $checkpointPath 'uefi-vars.fd'

if ($Action -eq 'Create') {
    if (Test-Path -LiteralPath $checkpointPath) { throw "Checkpoint already exists: $Name" }
    New-Item -ItemType Directory -Path $checkpointPath -Force | Out-Null
    try {
        Copy-Item -LiteralPath $varsPath -Destination $savedVarsPath
        & $qemuImg snapshot -c $Name $diskPath
        if ($LASTEXITCODE -ne 0) { throw 'QEMU could not create the virtual disk checkpoint.' }
        $manifest = [ordered]@{
            schemaVersion = 1
            name = $Name
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            disk = 'shell-os.qcow2'
            uefiState = 'uefi-vars.fd'
        } | ConvertTo-Json
        Set-Content -LiteralPath (Join-Path $checkpointPath 'checkpoint.json') -Value $manifest -Encoding utf8
    } catch {
        if (Test-Path -LiteralPath $checkpointPath) {
            Remove-Item -LiteralPath $checkpointPath -Recurse -Force
        }
        throw
    }
    Write-Host "Created offline SHELL VM checkpoint: $Name"
    exit 0
}

if (-not $ConfirmRestore) {
    throw 'Restore replaces the current VM disk and UEFI state. Re-run with -ConfirmRestore after verifying the checkpoint name.'
}
if (-not (Test-Path -LiteralPath $savedVarsPath)) { throw "Saved UEFI state is missing for checkpoint: $Name" }

& $qemuImg snapshot -a $Name $diskPath
if ($LASTEXITCODE -ne 0) { throw "QEMU could not restore virtual disk checkpoint: $Name" }
Copy-Item -LiteralPath $savedVarsPath -Destination $varsPath -Force
Write-Host "Restored SHELL VM checkpoint: $Name"
Write-Host 'Changes made inside the VM after that checkpoint are no longer in the active disk state.'

