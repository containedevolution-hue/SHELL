# Desktop

The current desktop direction was revised by the owner on 2026-09-09. Start with the desktop layout and its necessary menus, then design Files and the deeper Core surfaces. The earlier Box/Trunk/Canopy composition must not dictate this first layout.

## Accepted layout

- One Shell-owned Status Bar runs across the top. Each active page or application supplies its menus through that shared surface.
- Settings follows the active context: Desktop opens base Shell settings; Scribble opens Scribble settings. A settings menu keeps the identity of the surface that opened it.
- At the exact horizontal centre, the bar's separator dips into a curved outline around a circular Home control. The control contains a globe, a home symbol, and a square outline around the home symbol to signify Desktop.
- Home stays in the same place across every page and returns to Desktop. It remains reachable while menus are open. It does not close applications or end their work.
- Core is represented by a cartoon seed with bright, solid, smooth colours. The seed is intact, uncracked, unrooted, and has no sprout. Its eyes blink in the visual style of the CE Apps animals; reduced motion disables the blink.
- The visible label is **Core**. Opening the seed enters the computer's Core, including filesystem navigation and the previously discussed computer capabilities. This visual seed is distinct from the opt-in **SEED** feature inside Memory Box.

The [Status Bar contract](Status-Bar.md) owns shared system behaviour. [Core](../shells-core.md) owns the underlying navigation and custody requirements. The desktop seed is an entry point, not a new store.

## First layout study

Run `npm run preview:desktop` in Shell and open `http://127.0.0.1:4176`. Source is [design/desktop](../../design/desktop/index.html). It is also directly openable as a local file. The study is separate from the installed Shell frontend and does not load any app, file, connection, notification, or system data.

The study exercises Desktop → Core → a proposed destination → Home, page-specific settings, search over study destinations, menu dismissal and a Scribble **context example**. The example has no Scribble implementation or document behaviour. Real integration must consume Apps' published capabilities and canonical releases.

The initial seed position and size, amber colour, neutral background, pink separator, menu ordering, and Core destination arrangement are draft choices for review. They are not new permanent design rules. The eye reference is the CE Apps store's animal treatment; Shell owns its original seed drawing and animation without importing Apps' private source or assets.

Desktop currently proposes Apps and View on the left, with Search, contextual Settings and Shell notifications on the right. Home occupies the centre. The first Core navigation proposes Files, Applications, Connections, Memory Box and System activity. These are navigation outlines, not complete interiors. Search only searches these study destinations. Settings categories are labelled outlines; they do not imply working controls.

## Next design step

Review the desktop's geometry and seed first. Then design the Files opening view, folder navigation and necessary menus, keeping the same centre Home and contextual bar. Core's expanded visual treatment, app switching/window controls, the system/session menu and live service integration remain subsequent work.

## Verification

On 2026-09-09, the local Edge browser check passed Desktop/Core/Files/Home navigation, Desktop versus Scribble settings, study-destination search, Escape focus restoration, exact centre alignment, non-overlapping bar controls at 320/390/768/1440 pixels, reduced motion, and rejection of routes outside the design assets. Desktop and Scribble-settings screenshots at 1440 pixels and Desktop at 390 pixels were visually inspected. The Shell repository suite passed all 151 tests. These checks qualify the local study only; no native OS or canonical app integration was exercised.
