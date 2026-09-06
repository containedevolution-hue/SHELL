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

## Proof still required

The version-2 contract and deterministic pressure tests establish the boundary only. The first real implementation must prove Hyprland application matching without title spoofing, atomic switching, same-window reattachment, multi-monitor placement, focus recovery, provider crash/restart, Chat crash/restart, logout, suspend/resume, remote-session survival, reduced-motion behavior, and side-by-side capability comparison against every supported downloaded client. Until then Shell reports the native desk manager unavailable.
