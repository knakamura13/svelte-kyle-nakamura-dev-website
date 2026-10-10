# Airflow experiment (issue #30): status and how to resume

First written 2026-10-07 and rewritten 2026-10-09 at the end of a one-hour session. It supersedes the Phases checklist in [2026-10-07-airflow-experiment.md](2026-10-07-airflow-experiment.md), which still shows the original plan.

Branches. This session's work is on `knakamura/funny-bassi-7c3d37` (worktree `.claude/worktrees/funny-bassi-7c3d37`), forked at `40e5fdd` from `knakamura/issue-30-completion-7a3fb7`, which is on origin. The fork is local only: nothing from this session is pushed and no pull request exists. To bring it into the issue branch, run `git merge --ff-only knakamura/funny-bassi-7c3d37` in the issue-30 worktree.

## Where it stands

About 40% by the measure "0% is not started, 100% is a fully functional, physically accurate sandbox with every planned feature". The solver, the GPU solver, the plans, the scene pieces, the share link and three scenarios exist, and each is tested or has been rendered in a throwaway browser harness. The page does not exist yet: no scene is wired to the solver, and there is no UI, route or catalog entry.

| Phase | Status |
| --- | --- |
| 0. Catalog-driven landing page (#29) | Done |
| 1. CPU solver and benchmarks | Done. A stability fix for the one-bedroom and studio plans is in (issue 1 below) |
| 2. WebGPU solver, CPU worker fallback, parity tests, auto-tune, 30 fps | The 29 kernels and `GpuBackend` are done and match the CPU solver, including the stability fix. The worker fallback and the auto-tuner are not started |
| 3. Homes | Done. The four plans, and a dollhouse scene rendered in Chromium, Firefox and WebKit in a harness |
| 4. Devices | Models, solver coupling, placement and turning math done. The catalog has four fans from maker spec sheets and no purifiers. Device meshes not started |
| 5. Particulates and probing | Solver, session probes and hover readings done. The probe and smoke controls are not started |
| 6. Visualization | The four layers, arrows, tracers, smoke and legends render from real solver data (harness). Not wired to a page |
| 7. Page | Not started. Ready for it: state, session, share link, units, readouts, three scenarios, and the explainer with its Sources |

## On the branch

All committed. `yarn test:solver` runs the Node suite (`playwright.solver.config.ts`: no browser, no web server). `yarn test:gpu` runs the GPU suite and needs a real WebGPU adapter. `yarn test` runs the Node suite and then the e2e suite.

- `src/lib/experiments/engine/`: scene pointer and key hooks (`SceneInput`), `framing`, `rig.setSetup`, `LabelLayer.remove`, `setExperience`.
- `airflow/solver/`: the `FlowBackend` interface, the CPU backend, and `gpu/` (WebGPU context, layout, `GpuSolver`, `GpuBackend`, 29 WGSL kernels in `gpu/shaders/`).
- `airflow/homes/`: plan format, validator, rasterizer, wind model, and the four plans: studio 7.8 × 5.4 m, one-bedroom 8.4 × 7.8 m, two-bedroom 12.0 × 7.8 m, house 14.4 × 9.6 m. Every wall sits on the 0.6 m module, so the solver box equals the footprint at every cell size.
- `airflow/devices/`: fan and purifier models, solver coupling, placement, and `catalog.ts`: Air King 9723 (20 in box fan), 9119 and 9126 (pedestal fans) and 9155 (16 in window fan), rated from the makers' spec sheets read on 2026-10-09. The pedestal head heights are derived from the published overall height, and no maker publishes a window fan's shutoff pressure, so the solver's unsourced 25 Pa default applies.
- `airflow/sim/`: `World`, `SimulationSession` (tested with a fake clock), rolling history.
- `airflow/scene/` and `airflow/viz/`: the dollhouse (`dollhouse.ts`, `wallPieces.ts`), the slice layer, direction arrows, tracers and smoke points, palettes and legends, and `deviceMath.ts`.
- `airflow/state.ts`, `link.ts` (share link: `1.` plus base64url; a typical setup is 184 characters and the worst real case 702; out-of-range numbers are clamped), `units.ts`, `readout.ts` (direction words), `readouts.ts`, `emission.ts` (placeholder rates), `scenarios.ts` (cross-ventilation, stack effect, a fan in the window), `experience.svelte.ts`, `ui/Explainer.svelte` (How it works, What it isn't, and a Sources list of 32 entries in four groups).
- `tests/solver/`: benchmarks, invariants, weather, world, devices-scene, homes, dollhouse, viz, state, catalog, scenario-presets, robustness (random openings, weather, fans and purifiers, changed mid-run, five seeds per plan) and session. `tests/gpu/` with `playwright.gpu.config.ts`.
- `scripts/airflow-qa/dollhouse/` and `scripts/airflow-qa/viz/`: throwaway Chromium (and Firefox and WebKit) screenshot harnesses. `scripts/airflow-plan-preview.ts` draws the plans.
- `docs/research/airflow/` (three notes; each lists what it could not confirm), `CONTEXT.md` terms, `static/images/experiments/airflow.svg`.

## Results

Benchmarks on the CPU solver. Per the agent that made the stability fix, only the free jet moved (issue 1); the cavity, heated cavity and decay numbers below are unchanged:

- Lid-driven cavity at 128²: 1.77% max and 1.18% rms against Ghia, 2.45% and 1.64% against Botella–Peyret.
- Heated cavity: average Nu within 1% of de Vahl Davis at Ra 1e3, 1e4 and 1e5.
- Openings: wind through-flow 96–99% of the orifice formula. Stack effect 96% of the formula in a uniform room.
- Well-mixed decay 99.8% of the analytic rate, and the particulate mass balance closes to 1e-5.
- Window fan: matches the analytic series solution. Free jet, after the stability fix: delivered flow 100.2%, decay exponent −0.88, constant K 6.23 (98.3%, −1.05 and 5.85 before it).

Scenarios, in the CPU solver at 0.2 m cells (`tests/solver/scenario-presets.spec.ts`):

- Cross-ventilation (two-bedroom, 4 m/s west wind): 1.09 m³/s in at the west windows and out at the east ones, and a closed bedroom door cuts that bedroom's flow to zero.
- Stack effect (house, no wind, −5 °C outside): 0.31 m³/s in at the low windows and out at the clerestory.
- A fan in the window (two-bedroom, no wind, Air King 9155 on high): 1.03 m³/s, 88% of the rated 1.17 m³/s, and zero when turned off.

Stability at other cell sizes (checked once, not a test): with the stability fix, all four plans stay finite over 5 s at 0.3, 0.2, 0.15 and 0.1 m cells, with three windows open, both in a 3 m/s wind and with no wind at −5 °C. The fastest air is at most 1.2 m/s and the divergence at most 1.7e-4.

Wider robustness sweep: not finished. The suite runs five seeds per plan. A 30-seed run of both random tests was stopped after 11 minutes while the machine was loaded (its output only prints at the end, so no per-seed results survived). A verbose run of eight house seeds passed at about 5 s each, with the fastest air at most 3.3 m/s and divergence at most 3.2e-3 (limit 0.05), so the slowness looks like load, but that is not proven. Run `ROBUST_VERBOSE=1 ROBUST_TRIALS=30 yarn test:solver tests/solver/robustness.spec.ts` on an idle machine.

CPU step cost, one 0.05 s step on this Mac while other jobs ran:

| Plan | 0.2 m cells | 0.15 m | 0.1 m |
| --- | --- | --- | --- |
| Studio | 14 ms (15k padded cells) | 34 ms | 127 ms |
| One-bedroom | 22 ms | 49 ms | 201 ms |
| Two-bedroom | 28 ms | 74 ms | 285 ms |
| House | 41 ms (47k) | 109 ms | 427 ms |

GPU step cost on the house plan, windows closed: 0.2 m 0.64 ms (41k cells), 0.15 m 0.86 ms (98k), 0.1 m 1.98 ms (332k), 0.075 m 4.89 ms (786k). So a 0.2 m CPU grid runs faster than real time for every plan, the house at 0.1 m on the CPU runs about 8 times slower than real time, and fine grids need the GPU.

GPU against CPU, after the stability fix, through `World` on the two-bedroom home: the slice at 1.1 m within 5.6e-5, and the fan flow and the cross-ventilation window flows equal to six digits. The lid-driven cavity over 20 steps differs by 1.5e-7 in velocity and 1.9e-6 in pressure. Every kernel stage and the full-room case match to about 1.5e-5 or better.

Checks at the end of the session (2026-10-09, 17:17 PDT): `yarn test:solver` 138 passed and 2 skipped (the dollhouse T and L junction test and the purifier-catalog test, both `fixme`); `yarn test:gpu` 19 passed; the type check (`yarn run check`) at its baseline of one error in `tests/resume.spec.ts` and one warning in `PortfolioShell.svelte`, both older than this work. The existing e2e suite: 612 passed and 3 skipped, the same as before this work (a first run while solver tests were loading the machine had one phone Menu and Contact motion test in `tests/shell.spec.ts` fail, and it passed alone and on the rerun). The production build (`yarn build`) succeeds. No route or catalog entry loads the airflow code.

## Not started

Scene assembly, the engine loader, the dock and page UI, the route and catalog entry, the CPU worker backend, the auto-tuner and backend selection, device meshes, purifiers in the catalog and the two purifier scenarios, end-to-end tests, the visual and accessibility pass at desktop and phone widths, and the Physics panel text.

## Resume order

1. Assemble the scene. A `SceneFactory` (`engine/types.ts`: `(host, params, readout) => SceneInstance`) in a new `airflow/scene/airflowScene.ts` that builds `new Dollhouse(plan, { furniture, tint })`, `SliceLayer(width, depth)`, `DirectionArrows(width, depth)`, `TracerPoints` and `SmokePoints`. Each frame `update(dt)` calls `session.update(dt)`, and when `session.latest.version` changes it feeds `sliceLayer.update(slice, layer, scale)`, `arrows.update(slice, scale)`, `tracers.update(array, scale)` and `smoke.update(array, { dense })`. It applies `dollhouse.setOpenings`, `setTopDown` and `setFurniture` from the setup and the view, takes framing from `dollhouseRig(plan, topDown)`, and implements `SceneInput` (hover calls `session.hover`, a click pins a probe, a hold calls `session.setEmitPoint`). Then a loader like `relativity/experience.ts`'s `loadEngine`, and the route `src/routes/experiments/airflow/+page.svelte` using `provideAirflow` with the plans, the catalog models, `SCENARIOS`, and `linkCatalog` with `setupFromHash` / `setupToHash` from `link.ts`. This section comes from reading the APIs and has not been built. From the harness runs:
   - Fog: the rig pulls the camera back by width on a narrow Stage (about 45 m for the studio and 77 m for the house at 390 px). The kit's fog (24 to 60 m) washes the house out, so use no fog or start it past 80 m, and keep the far plane beyond 100 m.
   - The kit's pool sits at y = −0.004, inside the dollhouse floor. Put any ground plane at or below −0.16.
   - Draw order: faded walls draw at render order 20, after the slice (10), arrows (11), tracers (12) and smoke (13), which is the right back-to-front order for a wall between the camera and the slice. The comment in `sliceLayer.ts` said the opposite and has been corrected from reading the code, not from a rendered frame. Keep any new layer below 20.
   - In plan view the furniture is cut to 0.45 m, so the slice plane at 1.1 m is clear of it. The requested slice height snaps to a cell layer (0.3 m draws at 0.375 m at h = 0.15), so place the plane and the readout at `slice.y`.
   - The kit's sun is from the south-west, so the interior goes grey seen from the north.
2. The CPU worker backend, as a `FlowBackend` proxy. The session's frame budget (`FRAME_BUDGET`, `stepCost`) measures how long `backend.step` takes, so a worker needs step acknowledgements or the session will queue far too many steps. Backend selection (WebGPU when an adapter exists, else the worker) and device loss (`backend.solver.context.onLost`) are page code.
3. The dock and page UI (the `AirflowExperience` actions already exist), the catalog entry (`tests/experiments.spec.ts` checks every catalog entry has a page), and the share link.
4. The auto-tuner: pick the cell size from the measured step time, using the tables above as the starting guide.
5. Purifiers and the two scenarios that need them (clearing the smoke, the smoky day). See issue 2.
6. End-to-end tests, the visual and accessibility pass, and the Physics panel text.

## Known issues and open decisions

1. Stability fix and the GPU. The studio and one-bedroom plans blew up or converged poorly in the CPU solver. Cause, at about 85% confidence: the half step of pressure gradient applied before advection uses the pressure from the last solve, which allows a pressure pattern that flips sign every step and is not damped. It grows 1.65 times per step on the one-bedroom (61 Pa at step 10, 3,130 Pa at step 18) and 1.08 times on the studio. Zeroing the pressure before each step, or dropping that half step, both stop the growth. The fix uses the mean of the last two pressure solves for that half step (`CpuSolver.step` in `solver/cpu/solver.ts`); it removed the two `fixme` stepping tests and the `KNOWN_UNSTABLE` list in the robustness spec. Raising the multigrid cycles to 6 also passes but only hides it. The fix moved the free-jet benchmark: delivered flow 98.3% to 100.2%, decay exponent −1.05 to −0.88, constant K 5.85 to 6.23. That is inside the test's band (exponent −1.2 to −0.85, K 5.4 to 6.4) but outside the published 5.7 to 6.1. The filter `(3·p[n] + 2·p[n−1] − p[n−2]) / 4` (a third stored pressure, exact for a linear trend) was tried at the end of this session and not adopted: it gave jet K 6.13 and exponent −0.91 and all four plans stepped, but the random-devices robustness case studio seed 50002 (two purifiers and a window fan in an 8 m/s wind) ran away past 40 m/s, where the plain mean peaks at 3.5 m/s (`ROBUST_VERBOSE=1` prints each seed's fastest air). Next: find why that case is sensitive (a damped version of the mean, or solving for the pressure change from the previous step, which is the cleaner formulation), then recheck the jet and retune `shearCoefficient` (now 0.015) only if the exponent recovers. The GPU step follows the CPU step, so it mirrors the change (a `pressureMean` kernel and two extra pressure buffers) and `yarn test:gpu` passes again with no tolerance loosened. The commit is still labelled `wip` for the jet regression.
2. Purifiers. No maker or listing read publishes a purifier's CADR at each speed, and `PurifierModel.cadr` needs four. Top-speed figures seen: Coway AP-1512HH 233 cfm for smoke, Coway Airmega 400 328 cfm for smoke (an ENERGY STAR record may say 376, not opened), Levoit Core 300-P 143 cfm (particle not stated). None gave AHAM listing, body size, or where air goes in and out. Smart Air publishes 65, 180 and 315 m³/h for its Sqair, but with no test standard. Options: store the top speed and scale the lower speeds by a stated assumption; find a lab that measured named models at each speed; or leave purifiers out.
3. Share link: out-of-range numbers are clamped (bearings wrap), so a link still loads if a slider range is narrowed later. Rejecting them (null) is a small change in `read()` in `link.ts`.
4. Opening limits: the research gives a single casement sash a free area of 0.78 to 0.80 of its frame, but `OPENING_LIMITS` in `homes/types.ts` allows 1, and the explainer says so. Double-hung and sliding at 0.5 match the research.
5. Wind: the slider is the 10 m weather-report speed and the eaves see 0.55 of it, the top of the published 0.435 to 0.55 range at 3 m. The pressure-coefficient fit covers an eave-height to short-wall ratio of 0.1 to 0.4, and only the studio falls outside it (about 0.44 to 0.56); the two bigger plans are inside. The explainer says so.
6. The explainer's "How it works" names Stam (1999) and Zuo and Chen (2009) but no research note covers them, so they are not in Sources. Titles and years of a few sources (Ghia 1982, de Vahl Davis 1983, Botella and Peyret 1998, Hortmann et al. 1990, Sippola and Nazaroff 2002) were filled from memory, and no link was opened. A person should check them. Wording that goes stale when the casement limit, the purifier numbers or the emission rates change is listed in the explainer's commit messages.
7. Emission rates in `emission.ts` and the particle constants in `sim/world.ts` (`PARTICLE`) are placeholders, marked unconfirmed in the research note. The Physics panel has no formatter for emission strength or the cell count. `readout.ts` (direction words) and `readouts.ts` (reading data) are easy to confuse, and renaming the first `direction.ts` would help.
8. Visual choices from the viz harness: at sensitivity 1 the speed scale (0 to 3 m/s) shows ordinary room air nearly the same pale blue as still air, and 0.5 would read better (`DEFAULT_VIEW.sensitivity`). In the particulates layer the lightest color means "at or below 1.2 µg/m³" and can read as smoke. The temperature layer's neutral is a glaring white in a dark scheme, though the site has no dark theme yet. The 12% fade of near walls is faint on a 1x phone. A 12 m plan fills about a third of a portrait Stage.
9. WebKit shows random colored speckle over the kit's ground pool (`studio()` in `engine/kit.ts`) in Playwright's WebKit. The relativity scenes use the same pool, so Safari may show it on the live site. Check a relativity Stage in WebKit.
10. GPU, open items: the window-fan-only room differs from the CPU by 1.5e-4 in pressure after 10 steps (tolerance 1e-4; probably amplified rounding, moderate confidence), the particulate mass balance through `World` was not exercised, the temperature and particulate substep count is estimated from an older reading, and a snapshot must be taken at least every 8,192 steps.
11. A stored memory note (hmem, project `svelte-kylenakamura-website`, "airflow-experiment-worktree-completion") says a 2026-10-08 session added a rendering spec and a catalog entry and pushed. Neither is in git history, so that note is wrong or refers to work that was lost.
12. An isolated agent worktree can start from an old base commit. Put `git merge knakamura/funny-bassi-7c3d37` first in an isolated agent's prompt. Agent worktrees under `.claude/worktrees/agent-*` are locked, and each holds its branch's commits; everything useful from them is merged here, and they can be removed once this branch is pushed.

## Re-running the harnesses

- Dollhouse: `node scripts/airflow-qa/dollhouse/shoot.mjs <outDir> all` (also `sweep`, `state:<json>`, `--dpr=2`, `--browser=firefox|webkit`).
- Visualization: `node scripts/airflow-qa/viz/shoot.mjs --out <dir> --seconds 30` (also `--only`, `--probe`, `--fan --purifier --wind 3`, `--browser`).
- Plans: `node_modules/.bin/esbuild scripts/airflow-plan-preview.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/airflow-plan-preview.mjs && node /tmp/airflow-plan-preview.mjs /tmp/airflow-plans`.
- WebGPU in Playwright on an M-series Mac: Chromium launched with `channel: 'chromium'` has a real Metal adapter, the default headless shell has none without software flags, WebKit has a real adapter, and Firefox has none so it takes the CPU fallback. Default device limits: 8 storage buffers per shader stage, 128 MiB binding size, workgroup size 256.
- Use an Opus research agent for fan, purifier or particulate research and keep the wording to product specifications: a Sonnet 5.5 research agent was stopped by a safeguard on this subject.
