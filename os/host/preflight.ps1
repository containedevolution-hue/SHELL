$ErrorActionPreference = 'Stop'

function Find-Command([string]$Name) {
    $found = Get-Command $Name -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

$system = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$tools = [ordered]@{
    qemu = if (Test-Path -LiteralPath 'C:\Program Files\qemu\qemu-system-x86_64.exe') {
        'C:\Program Files\qemu\qemu-system-x86_64.exe'
    } else {
        Find-Command 'qemu-system-x86_64'
    }
    virtualbox = Find-Command 'VBoxManage'
    vmware = Find-Command 'vmrun'
    wsl = Find-Command 'wsl'
}

$result = [ordered]@{
    report = 'shell-os-host-preflight-v1'
    readOnly = $true
    manufacturer = $system.Manufacturer
    model = $system.Model
    memoryGiB = [math]::Round($system.TotalPhysicalMemory / 1GB, 1)
    cpu = $cpu.Name.Trim()
    firmwareVersion = ($bios.SMBIOSBIOSVersion -join ', ')
    hypervisorPresent = $system.HypervisorPresent
    runners = $tools
    next = if ($tools.qemu -or $tools.virtualbox -or $tools.vmware) {
        'A VM runner is available; create a disposable VM from the checked-in target profile.'
    } else {
        'No desktop VM runner was found. Select and install one before image boot testing.'
    }
}

$result | ConvertTo-Json -Depth 4
