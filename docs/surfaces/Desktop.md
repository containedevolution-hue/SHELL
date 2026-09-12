# Desktop

The current CEE OS desktop layout: one OS-owned Status Bar containing only fixed Home and Notifications controls, with Core represented as a black-and-blue ember over an aerial rippled mesh.

**Built:**
- Layout implemented: a centered Home control (globe plus home symbol plus square outline) that stays fixed across every page and never closes running apps; Notifications remains the only other Status Bar control; Core is the CEE OS ember on Desktop
- The blue, black, and white aerial mesh persists across Desktop, Core, and every destination; content stays inside permanent clear left and right cycling lanes
- Core destinations and each destination's sections use solid dimensional spheres inside the surface instead of rendering menus in the Status Bar
- A desktop preview running (`npm run preview:desktop`, browser-only, no native data access) exercising Desktop → Core → destination → Home, contextual settings, search, and a Scribble example
- A native version running (`SHELL_DESKTOP=enabled`) with real Files navigation — see `docs/acceptance/native-desktop-files.md`
- Study verification passed: navigation, settings-context switching, search, focus restoration, responsive layout at four widths, reduced motion, and route rejection outside the design assets; the full repository test suite passed

**Not built yet:**
- Core's interior, file mutations, app switching/window controls, the system/session menu, container/powerhouse controls, and further service integration
- Native OS and canonical app integration beyond the current Files slice
