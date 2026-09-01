$ErrorActionPreference = 'Stop'

$release = '2026.09.01'
$expectedSha256 = 'be8458032f8105e60ee2a3067f950b6e3c007ee51b38dac50e8b48e765561c91'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$isoRoot = Join-Path $repoRoot '.artifacts\isos'
$isoPath = Join-Path $isoRoot "archlinux-$release-x86_64.iso"
$partialPath = "$isoPath.partial"
$url = "https://geo.mirror.pkgbuild.com/iso/$release/archlinux-$release-x86_64.iso"

New-Item -ItemType Directory -Force -Path $isoRoot | Out-Null
if (-not (Test-Path -LiteralPath $isoPath)) {
    Write-Host "Downloading the official Arch Linux $release installer..."
    & curl.exe --fail --location --continue-at - --output $partialPath $url
    if ($LASTEXITCODE -ne 0) { throw 'Arch Linux download failed.' }
    Move-Item -LiteralPath $partialPath -Destination $isoPath
}

$actualSha256 = (Get-FileHash -LiteralPath $isoPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) {
    throw "Installer checksum mismatch. Expected $expectedSha256 but received $actualSha256. The file was not launched."
}

Write-Host "Verified $isoPath"
Write-Host "SHA-256 $actualSha256"
