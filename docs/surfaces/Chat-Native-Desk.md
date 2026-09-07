# Chat native desk

Chat is the owner's lab. Provider applications are complete native clients working inside that lab; they are not recreated, embedded, cropped, proxied, or replaced by browser/API imitations.

Shell reserves one visible native window slot inside the Chat layout. The Chat application remains behind and around that slot, providing desk bubbles, Seed, connection status, and lab controls. Shell identifies a registered provider application, starts it when absent or reacquires its existing window, and asks the active compositor to place that top-level surface precisely over the reserved slot. Hyprland is the first Linux target. It controls placement, focus, workspace membership, animation, and decoration; it is not the application launcher or the renderer of provider content.

Only one provider client occupies the slot at a time. Selecting another desk atomically parks the current window on a Shell-owned holding workspace and attaches the requested window. Parked applications keep running. Selecting the former desk returns the same process, native window, account surface, conversation, permissions, tools, and remote work whenever the provider itself preserves them.

Closing a Chat bubble parks its client. Closing Chat detaches every managed client and returns or parks its real window according to the session recovery policy; it never terminates the provider process. Application termination remains an explicit action in the original application or a separate Shell process-management surface. Reopening Chat reacquires eligible running windows only after verifying their registered application identity.

## Capability rule

Capability preservation is a release gate, not a preference. A client enters the lab slot only when Shell can present the complete downloaded/native application. The integration fails if entering Chat removes repository, terminal, local-file, tool, voice, remote-session, account, conversation, or provider-specific capability that works in the same application outside Chat. Unsupported clients remain ordinary standalone applications; Chat states the limitation and never substitutes a generic webpage or metered API conversation.

## Troubleshooting escape hatch

Every desk has **Troubleshoot** and **Open app separately**. The latter moves the same native session out of the lab into an ordinary visible workspace. The user tests the disputed capability in the original surface, then chooses **Return to Lab** to reattach the same session.

Shell reports only observable facts: application found, process running, window attached, required Shell permissions, remote-session continuity, and the last attach/detach result. It does not infer provider account identity or capability from a window title. Working separately isolates the fault to Chat/Shell window management; failing separately points to the provider application, account, permission, or connection; failure to launch points to installation or discovery; a wrong conversation/account points to session routing.

Troubleshooting never collects passwords, clears provider data, changes an installation, terminates a process, resets a session, or performs a repair without a separate explicit action.

## Slice 3 foundation

The first executable host foundation now lives in `node-sidecar/lib/native-desk-*.js` and `hyprland-native-desk.js`. It loads only Shell's trusted registry, verifies exact initial class plus `/proc` executable identity, derives a process-start-bound session id, serializes mutations, parks rather than closes, preserves the exact window through standalone and return, and blocks new changes until observation reconciles an uncertain compositor result. The Hyprland adapter selects windows only by compositor address and contains no close, kill, terminate, credential, URL, or arbitrary-command operation.

The shipped registry is empty and the general capability discovery reports window management as planned. Enabling the adapter requires an explicit local Shell flag, an explicit `legacy-0.55` command profile, Hyprland `0.55.x`, a real compositor session, a validated provider registry entry, and a trusted caller that supplies the acceptance result. Page content cannot enable it. The [authenticated in-process bridge](../../contracts/chat/IN-PROCESS-BRIDGE.md) now binds one exact native peer and Chat process/window identity, validates fresh trusted geometry, serializes observation/management/close, and revokes on identity or geometry loss. Changed geometry parks the previous overlay before adopting new coordinates. Unknown compositor results block every provider's mutations until reconciliation. The canonical Chat launcher, Tauri IPC wiring, native geometry producer, and lifecycle callbacks remain pending; there is no unauthenticated loopback management endpoint.

## Proof still required

Deterministic pressure tests do not establish live placement. A real Hyprland session must still prove the registered downloaded application, atomic batch behavior and recovery, same-window reattachment, multi-monitor coordinates, focus recovery, provider crash/restart, Chat crash/restart, logout, suspend/resume, remote-session survival, reduced-motion behavior, and side-by-side capability comparison for every supported client. The [separate test-session procedure](../../os/CHAT-HYPRLAND-TEST.md) preserves KDE recovery and includes a read-only identity collector. The installed Hyprland command profile must be captured as evidence. Until those gates pass on the target Shell installation, Shell reports the native desk manager unavailable.
