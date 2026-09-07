# Chat Slice 3: separate Hyprland test session

Status: planned on hardware, with an executable read-only identity collector.
The 2026-09-06 work ran on Windows. No HP connection is configured in this
workspace's available access, no QEMU guest was running, and no Linux compositor
or installed provider identity was observed. The local collector reports
`win32`, `unavailable`, `not-performed`, and `productionEligible: false`.
No packages, sessions, providers, accounts, or HP data were changed.

## Preserve the working recovery session

The HP remains the working Arch/KDE machine recorded in
[HP development](HP-DEVELOPMENT.md). Do not erase, reinstall, remove Plasma,
replace SDDM, change its default session, or stop existing provider/remote work
to prepare this test. Do not restart a display manager underneath a live session.

1. On the actual HP, inspect Git status/revision, installed packages, pending
   updates, session entries, and available disk space. Preserve local work and
   export important browser documents. Run the existing isolated sidecar verifier.
2. Establish the HP's physical recovery checkpoint and a tested route back to
   KDE/TTY before any package/session change. The VM's disk/UEFI checkpoints
   do not protect the HP. Keep HP firewall/reboot verification on its own record.
3. Inspect the installed Hyprland version if present. If absent, plan a full
   supported Arch update and the distro's Hyprland/session/portal dependencies
   against current package metadata after recovery exists. Do not perform a
   partial Arch upgrade or downgrade Hyprland to satisfy this adapter.
4. Use a distinct login choice named `SHELL Chat Test (Hyprland)` and a separate
   test configuration. Start from the installed package's session launcher and
   version-matched configuration example. Keep the existing Plasma session and
   config intact. Verify a terminal, network settings, display controls, and
   explicit logout work in the test session before using it for Chat.
5. At a user-controlled login boundary, prove the new entry starts, logs out,
   and returns to the existing KDE session. Record those results. Do not log out
   while an existing provider or remote session would be interrupted. The test
   entry is a developer harness, not the O4 desktop replacement milestone.

Upstream's [master tutorial](https://wiki.hypr.land/getting-started/master-tutorial/)
documents session launch and SDDM support. Hyprland's
[0.55 release notes](https://hypr.land/news/update55/) describe the Lua transition;
copying current examples into an older command profile is unsafe. Shell's adapter
accepts only the explicit `legacy-0.55` profile and `0.55.x` version range. A newer
installed version stays unavailable until its adapter and tests are updated.

## Capture identity without enabling control

Inside the actual Hyprland test session, from its Shell checkout:

```bash
umask 077
mkdir -p .artifacts/chat-native
node scripts/capture-chat-native-evidence.js > .artifacts/chat-native/initial.json
```

The command prints a bounded local record and makes no changes to registry,
providers, accounts, sessions, or compositor state. A nonzero result means
inventory was unavailable/incomplete. It does not set either enable flag.
The collector uses read-only `hyprctl -j version`, `monitors`, `clients`, and
`/proc` identity inspection. The upstream
[hyprctl reference](https://wiki.hypr.land/Configuring/Advanced-and-Cool/Using-hyprctl/)
owns those inspection commands. Titles, command lines, provider content, monitor
serial numbers, and credentials are excluded. Review evidence before sharing it.

Open the actual installed/downloaded provider normally and repeat capture to a
new file. Record its installation provenance/version alongside the exact returned
initial class, `/proc` executable, pid, native session id, window address, and
monitor layout. Never invent a Linux identity from a Windows/macOS name or use
a browser window as the provider. Missing native installations remain unsupported.
The collector's observations alone never make a provider production eligible.

## Native host and capability qualification

First complete the [native attachment requirements](../contracts/chat/IN-PROCESS-BRIDGE.md):
canonical Chat artifact, authenticated Tauri transport, trusted measured slot,
native lifecycle callbacks, and test-session recovery. The in-process bridge
is implemented; these live producers are not. Provider candidates stay in local
test evidence until comparison passes. An isolated developer placement harness
may exercise the backend against an explicitly observed candidate; never insert
a fabricated `validation.status: passed` into the production service to begin
that test. The developer harness is still to be connected on Linux.

For each actual provider, record outside and inside results for repositories,
terminal, local files, tools, voice/microphone, remote sessions, permissions,
account/conversation, and every provider-specific function used. Record a
capability as unavailable outside when applicable; an inside regression blocks
that provider. Use the same process, account, and existing conversation. Never
replace the client with a webpage, iframe, API chat, changed account, or new chat.

Capture before/after identities and observed geometry for each sequence:

| Exercise | Required proof |
| --- | --- |
| Attach and A → B → A | One exact visible slot; former clients parked and alive; same session returns; batch outcome verified |
| Focus and keyboard | Complete usable client, correct focus transfer, Chat controls reachable; no trapped input |
| Standalone → Return to Lab | Same native process/window and capability comparison |
| Close bubble / Chat | Park/detach only; provider and remote work remain alive |
| Reopen / restart Chat | Old authority rejected, new native identity bound, eligible existing provider reacquired |
| Provider restart | Changed process/window reported; no false same-session acknowledgement; explicit attach to replacement |
| Compositor timeout / partial batch | Unknown outcome blocks mutations until observation; recovery never terminates clients |
| Move / resize / mixed DPI | Correct coordinates across negative origins, scale changes, monitor removal and rotation; invalid geometry parks |
| Chat crash / host crash | Native liveness recovery handles disappearance without stopping provider work |
| Suspend / resume / logout | Test only at an appropriate user-controlled boundary; record provider/remote behavior, do not assume continuity |
| Reduced motion | No forced animation or hidden loss of usable client area |

Intentional provider restart or logout must wait until it cannot terminate active
user work. Never induce a crash of a real working provider/remote session merely
to fill a test cell. Record pending checks honestly.

Only after complete provider comparison and installation-level gates pass may a
reviewed production registry entry reference the evidence and native bootstrap
supply acceptance. Keep unsupported versions, layouts, and clients unavailable.
Neither the Shell deterministic suite nor VM/browser-app persistence qualifies
this matrix.
