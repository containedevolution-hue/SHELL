# SHELL OS

SHELL OS is the Linux delivery of the same SHELL capability contract used by the
Windows bridge. The MSI GF63 remains a Windows daily driver while this path is
proved in a virtual machine, then a live USB, then an isolated SSD.

## First target

`targets/msi-gf63-11uc.json` is the checked-in machine profile. It records known
hardware and minimum proof gates; it is not an installer answer file and cannot
write to a disk.

Run the read-only host inspection from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File os/host/preflight.ps1
```

On the MSI Windows host, download and verify the pinned official installer, then
start the disposable VM:

```powershell
powershell -ExecutionPolicy Bypass -File os/host/download-arch-installer.ps1
powershell -ExecutionPolicy Bypass -File os/host/start-msi-vm.ps1 -Mode Installer
```

The ISO, UEFI variable store, and virtual disk live under ignored `.artifacts/`.
After Linux is installed, use `-Mode Disk` to boot without the installer ISO.

The first VM should use UEFI, 4 virtual CPUs, 8 GiB RAM, a 64 GiB dynamically
allocated disk, NAT networking, and a 1920x1080 display. Those settings leave
Windows enough room on the 32 GiB MSI while exercising SHELL at realistic scale.
The launcher prefers Windows Hypervisor Platform acceleration, uses VirtIO
graphics for the Linux guest, and falls back to QEMU software emulation when
hardware acceleration is unavailable.

## Boot contract

The guest image must install the SHELL bundle at `/opt/shell`, enable the user
unit in `guest/systemd/shell-session.service`, and start a graphical session
without requiring Tenari, cloud sync, or an account. `guest/bin/shell-session`
fails visibly if the packaged executable is missing; it does not silently fall
back to an unrelated desktop.

The image is not ready for the MSI until all gates in the target profile have
evidence. A VM success proves the session and update path only. Wi-Fi, Bluetooth,
hybrid graphics, audio, camera, suspend, keyboard, touchpad, external display,
Secure Boot, and recovery require later live-device passes.

## Recovery rule

No SHELL tooling in this repository partitions or formats the host. The VM disk
is disposable. Live USB is read-only by default. Physical installation requires
an explicitly selected non-Windows disk, a verified Windows recovery drive, a
fresh backup, and a tested way back to the previous boot entry.
