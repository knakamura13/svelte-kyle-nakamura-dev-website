# Airflow: the immersive redesign (decided 2026-10-16)

The airflow page was built as an article: a 3D view in a card, a column of slider groups (the Dock) beside it, and an explainer under it. On 2026-10-16 Kyle saw it for the first time and rejected the design, the controls, the layout, the options and the performance. What he wants is an immersive, full-screen 3D experience in the manner of The Sims 4, with the polish of a big-studio game. This doc records what was decided in that interview and the plan to get there. It replaces the Dock-based page; the solver, the session, the state, the Homes, the Devices and the Scenarios stay.

The lesson from the misalignment: show the look early and often. Every milestone below ends with a check-in of screenshots (eye level, side view, bird's-eye) and a short recording, before the next milestone starts.

## Decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | Camera | One continuous Sims-style orbit camera: scroll in to stand at eye height inside a room and look around, scroll out to a bird's-eye view. Walls cut away as the camera moves. |
| 2 | Framing | Its own full-screen route. The whole window is the 3D world with the HUD over it; the site's nav is hidden behind a small exit button; the explainer becomes an "About this simulation" panel. |
| 3 | Art style | Sims-like stylized realism: warm, clean, slightly toy-like, soft lighting, real furniture, readable at every zoom. |
| 4 | Devices | Desktop first. Phones and tablets get a lighter version that still works. |
| 5 | Air | Particles and overlays, polished. Air and smoke are visible from every angle: no opaque plane cuts the room, and particles fill the whole volume of the room (today's slice plane hid everything below 1.1 m and nothing showed from the side). |
| 6 | Controls | Sims build/buy style: a side catalog of fans and purifiers with thumbnails to drag into rooms, a context menu on a clicked window, door or device, a bottom time bar, a weather widget with a compass dial. Sliders only where nothing better fits. |
| 7 | Assets | Free CC0 packs (Poly Haven, Kenney, Quaternius, KayKit) plus procedural detail; the first download near 20 to 30 MB. |
| 8 | Accuracy | The solver drives everything that moves: particles ride the simulated air, smoke is the simulated PM2.5. Decorative touches only if the simulation drives them. |
| 9 | Audience | A portfolio showpiece for engineers and hiring managers. The first frame is cinematic and already alive (a Scenario playing), with one obvious invitation ("Drop a fan") instead of a wall of controls. The science stays one click away. |
| 10 | Performance | Measured, not guessed: load time to the first frame, frame rate, how blocky the air looks, the restarts while the grid tunes, control latency. The worst today: the restarts while the grid tunes and the coarse look without WebGPU. |
| 11 | Options | Keep: Homes, Scenarios, time controls, weather, Openings (adjusted by clicking the window or door itself), fans and purifiers (dragged from the catalog), smoke and Probes. Advanced panel: sensitivity, units, the Physics panel and the smoke books. Cut: the top-down toggle (the camera does it), the Look/Probe/Emit toggle (tools in a toolbar instead), the furniture toggle. |
| 12 | References | The Sims 4 for the camera, the build/buy catalog and the time bar; Cities: Skylines for the data overlays ("info views"); Two Point Hospital for friendly context menus. |

Decided by the agent from those answers (Kyle asked for no more questions, and to be checked in with): the HUD layout, the camera's input scheme, the wall modes, the overlay set, the loading screen and the fate of the existing work, all below. Each is shown at a check-in and can be changed there.

## The experience

**First 30 seconds.** A short loading screen (the title, a progress bar, one line of what is about to happen) while the page fetches the assets and measures the device to pick the grid. Then the Two-bedroom fades in at golden hour with the cross-breeze Scenario already running: the camera drifts from a three-quarter view toward the living room while streaks of air pour through the open windows. A single hint bubble points at the Build tool: "Drop a fan and watch the air change." Nothing else asks for attention.

**Camera.**
- It orbits a focus point on the floor. Zoom runs continuously from eye level (the camera at 1.6 m, looking nearly level, inside a room) to bird's-eye (the whole home from above at about 75°). The pitch follows the zoom by default, as in The Sims 4; dragging up or down tilts it within limits.
- Mouse: wheel to zoom, right-drag (or Alt+left-drag) to rotate and tilt, middle-drag to pan, double-click the floor to fly the focus there. Keys: WASD or the arrows pan, Q and E rotate, + and − zoom, Home resets. Touch: one finger pans, pinch zooms, two-finger twist rotates.
- Motion is damped (critically damped springs, no overshoot) and respects reduced motion.
- The camera never shows the inside of a wall: below roof height it stays inside the home, and the walls cut away.

**Walls.** The default is cutaway: walls between the camera and the room it looks into drop to a low cut (about 0.4 m) with a clean cap on top, and the others stand full height. Walls up and walls down are a toggle in the bottom bar, as in The Sims. The roof is never drawn.

**The world.**
- Lighting: physically based materials, an HDRI sky for ambient light and reflections, a low sun with soft shadows, ambient occlusion (three.js `GTAOPass`), gentle bloom, AgX tone mapping and a warm grade.
- Surfaces: wood or tile floors, painted plaster walls with skirting, windows with frames and glass, doors that swing on their hinges, grass and a few trees outside.
- Furniture: models from CC0 packs fitted to each piece's solid box in the plan. The solver keeps the boxes.

**The air.** All of it is driven by the solver.
- **Streaks.** Thousands of velocity-aligned streaks (about 15,000 on a desktop, 3,000 on a phone) are carried through the whole 3D field. They are stretched by speed and fade in and out. They are born where the air moves and at the openings.
- **Smoke.** Smoke is a ray-marched volume of the PM2.5 field, lit by the sun, visible from every side. Phones draw it as puffs instead.
- **Overlays.** The overlays are Off, Air speed, Temperature and Smoke. With one on, the streaks take that quantity's colour and a faint see-through haze shows it through the rooms, with a legend at the bottom. The world keeps its own colours, at most lightly desaturated.
- **No plane anywhere.** There is no slice plane, by default or under an overlay. Decided 2026-10-20, when Kyle asked why a nearly opaque horizontal plane was needed. What it showed (one quantity across the whole home at one height) is carried by the coloured streaks, the haze and the Probes. The hover reading and the Probes still read the solver's slice and probe data; only the drawn plane is gone.
- **Probes.** A Probe is a glowing pin with a floating card (speed and direction, temperature, PM2.5).

**HUD.** Dark glass panels with rounded corners, icon buttons of at least 44 px, tooltips on everything, one accent colour, and the site's type.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [← Exit] [Two-bedroom ▾] [Scenario ▾]                  [wind dial · 18°C · air] │
│ ┌──────┐                                                       ┌────────┐ │
│ │Select│                                                       │Inspector│ │
│ │Build │──▶ catalog drawer: Fans | Purifiers (thumbnail cards) │(object) │ │
│ │Probe │                                                       └────────┘ │
│ │Smoke │                     3D world, full screen                         │
│ └──────┘                                                                   │
│ [⏸ ▶ ▶▶ ▶▶▶  sim 00:04:12]  [Off · Speed · Temperature · Smoke]  [walls] [ⓘ] [⚙] │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Tools (left rail).** Select (click things), Build (opens the catalog), Probe (click air to pin), Smoke (hold to release, strength chips from candle to cooking burst).
- **Catalog.** Category tabs, cards with a rendered thumbnail, the name and the rated flow. Drag a card into the world: a ghost shows green or red with the reason, R rotates, click places.
- **Context menus.** A compact card anchored to the clicked thing.
  - Window: Closed, Cracked, Half and Wide presets, plus a fine slider up to the window's limit.
  - Door: open or closed.
  - Fan: Off, Low, Medium and High, oscillate, rotate, move, remove.
  - Purifier: Sleep, Low, Medium and High, move, remove.
  - Probe: its reading, remove.
- **Inspector (right).** The selected object's details and every setting, for the keyboard.
- **Weather widget (top right).** A compass dial (drag the arrow to set the wind's direction, a speed chip beside it), outdoor and indoor temperature steppers, and outdoor air presets (Clean, Hazy, Smoky, Wildfire, with µg/m³ in the tooltip).
- **Bottom bar.** Pause, 1×, 5× and 20×, the simulated clock, the overlay switcher, walls up/cutaway/down, About (the explainer in a panel) and Advanced (Physics panel, sensitivity, units, graphics quality, copy link, restart and reset).
- **Phones.** The rail becomes a bottom toolbar, panels become bottom sheets, and quality drops (fewer streaks, puff smoke, no ambient occlusion).

**Accessibility, kept at a sensible floor.** Every HUD control works by keyboard with a visible focus ring and a name; readings exist as text (probe cards, the inspector); reduced motion turns off camera inertia and the intro move; HUD text meets contrast. The 3D world itself is described by the status line and the probe cards, not navigated by a screen reader.

## Performance budgets

- Desktop (an M-series MacBook or an RTX laptop): 60 fps at 1440p with ambient occlusion on. Phones: 30 fps at reduced quality.
- The first interactive frame within 8 s on a first visit over broadband, within 4 s on a cached reload.
- Assets at most 30 MB, fetched in priority order (the Home being shown first).
- No visible restarts after the loading screen. The grid is picked during loading from a measured warm-up. A device that later falls behind steps down once, with a resample rather than a restart where possible, and says so once.

## Architecture

**Stays:** the CPU and WebGPU solvers, `World`, the session, `state.ts` and the share link, the Homes and plans, the Devices and catalog, placement (`devices/surfaces.ts`), the Scenarios, the auto-tuner's logic, and the pure word and unit modules the Dock used (`weather.ts`, `openings.ts`, `probeWords.ts`, `smokeWords.ts`, `clock.ts`, `physicsPanel.ts`, `massBalance.ts`).

**Replaced:** the article page and the Dock (`ui/Dock.svelte` and its groups), the slice-plane-first scene, the dollhouse wall fade and the Look/Probe/Emit mode toggle.

**New:**
- `routes/experiments/airflow`: full screen, out of the site's layout, with an exit button.
- `scene/camera/`: the Sims camera, pure and unit-tested.
- `scene/walls/`: cutaway.
- `scene/look/`: lighting, materials, post-processing, quality tiers.
- `scene/air/`: streaks, the smoke volume and the overlays, fed by a new downsampled volume snapshot from the backends (velocity, PM2.5 and temperature on a grid of at most about 64,000 cells, up to 10 times a second; a compute kernel on the GPU, a transfer from the worker on the CPU).
- `ui/hud/`: the tools, the catalog, the context menus, the inspector, the weather widget, the time bar, the overlay switcher, About and Advanced.
- Assets: `static/airflow/` (models, textures and an HDRI), each with its licence in `static/airflow/LICENSES.md`.

## Milestones and check-ins

1. **Look and camera.** The full-screen route, the Sims camera, the cutaway walls, the lighting and post-processing, placeholder furniture, and today's particles filling the room volume (no slice plane). Check-in: eye level in a room, side view, bird's-eye.
2. **Air.** The volume snapshot, the streaks, the smoke volume and the overlays. Check-in: the same three views with a breeze, smoke and each overlay.
3. **HUD and interactions.** Tools, catalog drag and drop, context menus, inspector, weather widget, time bar, About and Advanced. Check-in: the HUD over the world, a fan dropped in, a window opened from its menu.
4. **Assets, opening, loading, phones.** CC0 furniture and textures, the first-30-seconds opening, the loading screen with grid tuning, the phone version. Check-in: a short recording of the first 30 seconds, and the phone.
5. **Hardening.** End-to-end tests in place of the Dock specs, the performance pass against the budgets, the accessibility floor, the status doc and the issues, then the launch issue (#69).

## What happens to the existing work

- The Dock slices (#49 to #55) are done but superseded. Their pure logic is reused by the HUD, and their end-to-end specs retire when the HUD replaces them.
- #56 (the auto-tuner) changes: it tunes during the loading screen instead of restarting while the visitor watches.
- #61 to #64 and #68 are re-scoped to the new page.
- #58, #59, #60, #65 and #69 are unchanged.
- New sub-issues for milestones 1 to 5 are added to #30 after the first check-in confirms the direction.

## Where it stands (2026-10-16, paused)

Kyle paused the project after the first build round. The three milestone agents stopped early, and their work is merged into the working branch, but nothing new is on screen yet: `/experiments/airflow` still shows the Dock page. So the first check-in (screenshots of the new look) has not happened. It comes after milestone 1's rendering is wired in.

**Milestone 1 (look and camera): about a quarter done.**
- **Done and tested:**
  - `scene/camera/sims.ts`, the orbit maths. Zoom 0 is eye level at 1.6 m, looking 5° down; zoom 1 is bird's-eye at 75°. The pitch follows the zoom, with a tilt of up to 24° either way. The focus is kept 0.5 m off the walls close in. Motion uses critically damped springs.
  - `scene/camera/controls.ts` (`SimsCamera`): every input in the spec.
  - `scene/walls/cutaway.ts`: up, cutaway and down. A wall drops to 0.4 m when the line of sight to the focus crosses it, with hysteresis.
  - `scene/look/quality.ts`, with `?quality=` to override.
  - Tests: `tests/solver/sims-camera.spec.ts` and `walls-cutaway.spec.ts`.
- **Written but never rendered:** `scene/walls/walls.ts` and `scene/look/{boxes,materials,textures}.ts`. They cover per-room paint, skirting, siding, window frames, sills and glass, panelled doors, and procedural oak, tile, plaster, siding, paving, grass and fabric.
- **Next, in order:**
  1. `look/lighting.ts`, `post.ts`, `floors.ts`, `furniture.ts`, and a `look/home.ts` that replaces the old dollhouse in `airflowScene.ts`.
  2. `look/stage.ts`, an airflow-only input host. It needs one type-only change to `EngineLoader` in `engine/experience.svelte.ts`.
  3. A `slice` view field, off by default.
  4. The full-screen route. A layout reset cannot escape the root layout, so `src/routes/+layout.svelte` must skip `PortfolioShell` when `page.data.immersive` is set.
  5. Tests, then the screenshots for the first check-in.
- **Open:**
  - In the default view the cutaway rule leaves the west wall standing.
  - The "Look mode" sentence in `probeWords.ts` will be wrong once the arrow keys pan.

**Milestone 1, 2026-10-20 session (branch `worktree-agent-adbd1572cd109344b`, on top of `knakamura/issue-30-completion-7a3fb7`): built; the first check-in is ready for Kyle.**
- Built: `look/{assets,floors,furniture,outside,lighting,post,home,stage}.ts`, the far cutaway rule (from half way out, every wall facing the camera drops), `?camera=x,z,heading,zoom,tilt`, `view.slice` (off), the full-screen route (`+layout.ts` says immersive and the root layout skips the shell), the Dock as a drawer that pushes the world aside, a lighter tier for WebGL in software, and a default view for an upright phone.
- Measured on this M3 Max, on AC power with the machine quiet: the high tier holds 60 fps at 1440x900 at one and two device pixels, with GTAO at full resolution (p95 16.8 ms); the tuner climbs to 0.075 m cells. The first frame comes 0.46 to 0.5 s after navigation with the shaders cached, and about 6 s on the first visit, nearly all of it Metal compiling the shaders (the assets are in by 0.3 s on the local preview).
- Tests: `tests/solver/look-home.spec.ts` (new) and additions to `walls-cutaway` and `sims-camera` pass; the type check is at its baseline. The airflow e2e specs were adapted (drawer helper, data-focus after an arrow key, the new Look mode words, the explainer in the drawer); the tests that only check the old article layout are skipped, each naming milestone 3.
- Screenshots and the recording: `?camera=` and `?cell=0.15` (so the tuner does not restart the air) reproduce them.
- Open: the Kenney models are low-poly and some are stretched to their boxes (the dining table, the sideboard); the old tracers and smoke puffs stand in until milestone 2; a cold first visit spends about 6 s compiling shaders (milestone 4's loading screen, or `compileAsync`); the hover ring still sits at the slice height with the slice off; `scene/dollhouse.ts` is no longer drawn but is still imported by its Node test and the old QA harness.

**Milestones 2 and 3 in the new world, 2026-10-20 (branch `worktree-agent-a631a2d6d36c24400`, on top of milestone 1): ready for the second check-in.**
- Merged the air (`scene/air/`) and the HUD (`ui/hud/`) into milestone 1's world. `createAir` runs in `createAirflowScene` in place of the old tracers and smoke points (the session reads the volume and keeps no particles), mutes the Home and the devices under an overlay, lights the smoke with `lighting.sun`, and follows the stage's tier. The selection is wired in with its outlines, ghost, menu anchors and tool-routed clicks; a click stops at a standing wall (`WallsView.standingBoxes`) and cannot take an Opening in a cut wall (`openingCut`), and a Probe, smoke or a carried device does not land behind one.
- The page is `<Hud {status} {tuning} {behind} />` over the world, with no frame and no `?hud`. The Dock's groups, their end-to-end specs and the helpers only they used are deleted in one commit (bb56fd7), which reverts alone. The Physics panel, the explainer and the pure modules stay.
- Connected: the bottom bar's wall modes drive the cutaway; Advanced's Graphics drives the stage's tiers; the overlay switcher drives `setOverlay`, and its legend and the colour sensitivity are the air's own (`scene/air/legend.ts`); Slice height is now "Probe and smoke height"; the marker under the pointer and the smoke's marker stand on a stem from the floor.
- Fixed on the way: about one frame in ten was blank on the high and medium tiers (a NaN from `pow` at a streak's tail, spread by the bloom); the mute changed only material colours, which left maps and vertex colours (most of the new world) unmuted, so it is now one shared shader uniform; the smoke volume whited a room out, so its extinction now grows with the square of the concentration, in a cool grey; markers drew under the smoke; a click rang the whole window in blue (a script focus); the compass dial turned the wrong way for the new camera; the near streaks hung like a curtain at eye level; the compass letters sat on room names; the HUD's backdrop blur cost one frame in nine at two device pixels, so the glass is a little more opaque and unblurred.
- Measured on this M3 Max on mains power, load averages 9 to 15 (macOS media analysis and a Time Machine backup running): at 1440x900 on the high tier, with the tuner at 7.5 cm cells, 60.0 fps with the overlays off and with smoke released, 58.2 fps under Air speed at two device pixels (18 of 583 frames over 20 ms), and 60.0 fps in all three at one device pixel.
- Tests: the type check at its baseline; the Node suite 489 passed, 1 skipped; the GPU suite 43 passed, 15 skipped; `tests/airflow.spec.ts`, `airflow-tune.spec.ts` and `airflow-hud.spec.ts` 66 passed in Chromium, Firefox and WebKit at two workers. The HUD spec gained a test that the wall modes, the overlays and Graphics change the world.
- Open: smoke is a soft volume, not wisps, because the volume averages blocks of up to 0.3 m; on a phone the air is still faint; the bookcase and some Kenney pieces read as boxes; the old `scene/particles.ts`, `arrows.ts`, `SliceLayer` and `dollhouse.ts` are only imported by tests now; doors and windows in a wall that is cut away can be opened only from the Inspector or with the walls up.

**Milestone 2 (air): the data side done.**
- **Done and tested: the volume snapshot** (`solver/volume.ts`).
  - It holds velocity, air share, temperature and PM2.5, averaged over blocks of at most 64,000 cells, with strides chosen per axis. No block is over 0.3 m on any grid the tuner picks.
  - On the worker it is sent as transferred buffers. On the GPU a `volume` kernel writes it, read back through one reused buffer.
  - The session opts in with `volume: true`: up to 10 a second while running, once when paused. `particles: false` turns off the old tracers.
  - Cost per snapshot: on the GPU, +0.06 ms (two-bedroom at 0.15 m) to +0.31 ms (house at 0.075 m); on the worker, +0.33 to +0.75 ms.
  - Tests: `tests/solver/volume.spec.ts` and `tests/gpu/volume.gpu.ts`. The GPU matches the CPU within 2e-7.
- **Fixed: a GPU snapshot race.**
  - A snapshot read `fanCount`, the time, the steps and dt after its `await`, so a fan added mid-read made it read a null buffer. Before the fix, 6 of 25 rounds threw and 17 more returned the wrong fan count.
  - Regression test: `tests/gpu/snapshots.gpu.ts`.
- **Not started:** `scene/air/` (streaks, the smoke volume and puffs, the overlays, `createAir`) and its hook in `airflowScene.ts`.
- **Plan for the renderers:**
  - The CPU picks spawn points, weighted by speed and by open windows with inflow, and uploads them as a texture.
  - A full-resolution wall mask is built from `raster.geometry` and rebuilt when `World.revision` changes.
  - One depth pre-pass is shared by the smoke and overlay ray-marches.

**Milestone 3 (HUD): the logic done.**
- **Done and tested:**
  - `scene/selection.ts`. It picks the door, window, device or probe under the pointer from the plan's geometry, anchors menus, outlines the chosen and hovered thing, and draws the carried ghost, which R rotates. `ToolInput` routes clicks by tool. It is not yet connected to `airflowScene.ts`.
  - `state.ts`: `Tool` and `Target`, plus `overlay`, `walls` and `quality` in the view state. `overlay` starts on Air speed so today's page is unchanged.
  - `ui/hud/{tools,presets,compass,menus,layout,catalog}.ts`.
  - Tests: `tests/solver/hud.spec.ts`.
- **To check before launch:** the outdoor air presets (0, 35, 150 and 350 µg/m³) and the wind speeds were picked from the US EPA bands and the Beaufort scale from memory, not looked up.
- **Not started:**
  - Every Svelte component: the top bar, the tool rail, the catalog drawer with thumbnails and dragging, the context menus, the inspector, the weather widget, the bottom bar, About, Advanced, the probe cards, the smoke chips and the phone layout.
  - The page mount and `tests/airflow-hud.spec.ts`.
- **Resume in order:**
  1. The store: tool, selection, hover and menu state, and `yaw` and `moving` on the drag preview.
  2. The scene wiring, about 8 lines in `airflowScene.ts`.
  3. The components.
- **Open:** until the cutaway hook is connected, picking can select something behind a full-height wall, or inside a wall that is cut away.

**Assets (milestone 4): researched, nothing downloaded.** The recommended CC0 set, with every link, licence and size, is in `docs/research/airflow/cc0-assets.md`:

| Asset | Download size |
| --- | --- |
| Kenney Furniture Kit | about 5.0 MB |
| Kenney Nature Kit | about 9.8 MB |
| Poly Haven Laminate Floor 02, Interior Tiles and Beige Wall 001, at 1K | 3.78 MB together |
| ambientCG Grass004 at 1K (or a procedural lawn) | 11.0 MB |
| Poly Haven Kloppenheim 06 pure-sky HDRI at 1K | 1.17 MB |
| **Total** | **about 30.7 MB** |

What the page itself loads is an estimated 10 to 15 MB. The downloads wait for Kyle's explicit OK.

**Checks on the merged tree (2026-10-16):**
- The type check is at its baseline.
- The full Node suite: 453 passed, 1 skipped.
- Every airflow e2e spec, in Chromium on a production build: 130 passed.
- The GPU suite: 37 passed on the milestone 2 branch. It was not rerun after merging milestones 1 and 3, which do not touch the GPU code.

**Notes for the agents that resume this:**
- A worktree may start from `main`, where merging this branch conflicts (`playwright.config.ts`, `RangeField.svelte`). Point the empty branch at this branch's tip instead.
- Vite refuses to serve a `node_modules` that is a symlink into another worktree. Either allow it in a scratch config (`server.fs.allow`), as the milestone 3 agent did, or install `node_modules` in the worktree.
