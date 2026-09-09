# Desktop

The accepted desktop layout: one Shell-owned Status Bar, a fixed centered Home control, and Core represented as a blinking cartoon seed.

**Built:**
- Layout accepted: a shared top Status Bar with context-sensitive menus/settings; a centered Home control (globe plus home symbol plus square outline) that stays fixed across every page and never closes running apps; Core as an intact, uncracked, blinking cartoon seed, visually distinct from the opt-in SEED feature
- A first layout study running (`npm run preview:desktop`, browser-only, no native data access) exercising Desktop → Core → destination → Home, contextual settings, search, and a Scribble example
- A native version running (`SHELL_DESKTOP=enabled`) with real Files navigation — see `docs/acceptance/native-desktop-files.md`
- Study verification passed: navigation, settings-context switching, search, focus restoration, responsive layout at four widths, reduced motion, and route rejection outside the design assets; the full repository test suite passed

**Not built yet:**
- Core's expanded visual treatment beyond the study, file mutations, app switching/window controls, the system/session menu, and further service integration
- Native OS and canonical app integration beyond the current Files slice
