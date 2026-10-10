# Airflow experiment (issue #30): status and how to resume

First written 2026-10-07 and rewritten 2026-10-09 at the end of a one-hour session. It supersedes the Phases checklist in [2026-10-07-airflow-experiment.md](2026-10-07-airflow-experiment.md), which still shows the original plan.

Branch. All the work is on `knakamura/issue-30-completion-7a3fb7`, in the worktree `.claude/worktrees/funny-bassi-7c3d37`. It is the only worktree for this issue: on 2026-10-09 the original issue-30 worktree and the 13 agent worktrees were removed, after their commits were merged here and their uncommitted changes were either brought across or recorded in known issue 11. The branch is pushed to origin and a draft pull request carries it. Do not merge that pull request until the page exists, because the experiment is not reachable from the site yet.

## Where it stands

About 40% by the measure "0% is not started, 100% is a fully functional, physically accurate sandbox with every planned feature". The solver, the GPU solver, the plans, the scene pieces, the share link and three scenarios exist, and each is tested or has been rendered in a throwaway browser harness. The page does not exist yet: no scene is wired to the solver, and there is no UI, route or catalog entry.

| Phase | Status |
| --- | --- |
| 0. Catalog-driven landing page (#29) | Done |
| 1. CPU solver and benchmarks | Done. The pressure-solve instability that blew up the one-bedroom and studio plans is fixed (issue 1 below) |
| 2. WebGPU solver, CPU worker fallback, parity tests, auto-tune, 30 fps | The 30 kernels and `GpuBackend` are done and match the CPU solver, including the pressure fix, and a GPU stress sweep (random setups and 30 s runs on all four plans, down to 0.075 m and 0.05 m on the studio) passes. The worker fallback and the auto-tuner are not started |
| 3. Homes | Done. The four plans, and a dollhouse scene rendered in Chromium, Firefox and WebKit in a harness |
| 4. Devices | Models, solver coupling, placement and turning math done. The catalog has four fans from maker spec sheets and no purifiers. Device meshes not started |
| 5. Particulates and probing | Solver, session probes and hover readings done. The probe and smoke controls are not started |
| 6. Visualization | The four layers, arrows, tracers, smoke and legends render from real solver data (harness). Not wired to a page |
| 7. Page | Not started. Ready for it: state, session, share link, units, readouts, three scenarios, and the explainer with its Sources |

## On the branch

All committed. `yarn test:solver` runs the Node suite (`playwright.solver.config.ts`: no browser, no web server). `yarn test:gpu` runs the GPU suite and needs a real WebGPU adapter. `yarn test` runs the Node suite and then the e2e suite.

- `src/lib/experiments/engine/`: scene pointer and key hooks (`SceneInput`), `framing`, `rig.setSetup`, `LabelLayer.remove`, `setExperience`.
- `airflow/solver/`: the `FlowBackend` interface, the CPU backend, and `gpu/` (WebGPU context, layout, `GpuSolver`, `GpuBackend`, 30 WGSL kernels in `gpu/shaders/`).
- `airflow/homes/`: plan format, validator, rasterizer, wind model, and the four plans: studio 7.8 × 5.4 m, one-bedroom 8.4 × 7.8 m, two-bedroom 12.0 × 7.8 m, house 14.4 × 9.6 m. Every wall sits on the 0.6 m module, so the solver box equals the footprint at every cell size.
- `airflow/devices/`: fan and purifier models, solver coupling, placement, and `catalog.ts`: Air King 9723 (20 in box fan), 9119 and 9126 (pedestal fans) and 9155 (16 in window fan), rated from the makers' spec sheets read on 2026-10-09. The pedestal head heights are derived from the published overall height, and no maker publishes a window fan's shutoff pressure, so the solver's unsourced 25 Pa default applies.
- `airflow/sim/`: `World`, `SimulationSession` (tested with a fake clock), rolling history.
- `airflow/scene/` and `airflow/viz/`: the dollhouse (`dollhouse.ts`, `wallPieces.ts`), the slice layer, direction arrows, tracers and smoke points, palettes and legends, and `deviceMath.ts`.
- `airflow/state.ts`, `link.ts` (share link: `1.` plus base64url; a typical setup is 184 characters and the worst real case 702; out-of-range numbers are clamped), `units.ts`, `readout.ts` (direction words), `readouts.ts`, `emission.ts` (placeholder rates), `scenarios.ts` (cross-ventilation, stack effect, a fan in the window), `experience.svelte.ts`, `ui/Explainer.svelte` (How it works, What it isn't, and a Sources list of 32 entries in four groups).
- `tests/solver/`: benchmarks, invariants, weather, world, devices-scene, homes, dollhouse, viz, state, catalog, scenario-presets, robustness (random openings, weather, fans and purifiers, changed mid-run, five seeds per plan, plus 30 simulated seconds per plan; it stops a case at the first step the air passes 40 m/s; `ROBUST_H` sets the cell size, `ROBUST_TRIALS` the seeds per plan, `ROBUST_SEEDS` picks seeds, `ROBUST_VERBOSE=1` prints each seed), pressure (two fine-cell regressions that fail on the original solver), `randomSetups.ts` (the shared random-setup generators) and session. `tests/gpu/` with `playwright.gpu.config.ts`, including a stress sweep that runs only with `STRESS=1`.
- `scripts/airflow-qa/dollhouse/` and `scripts/airflow-qa/viz/`: throwaway Chromium (and Firefox and WebKit) screenshot harnesses. `scripts/airflow-plan-preview.ts` draws the plans.
- `docs/research/airflow/` (three notes; each lists what it could not confirm), `CONTEXT.md` terms, `static/images/experiments/airflow.svg`.

## Results

Benchmarks on the CPU solver, rerun after the final pressure fix. Only the free jet moved (issue 1); the others are as they were:

- Lid-driven cavity at 128²: 1.77% max and 1.18% rms against Ghia, 2.45% and 1.64% against Botella–Peyret.
- Heated cavity: average Nu within 1% of de Vahl Davis at Ra 1e3, 1e4 and 1e5.
- Openings: wind through-flow 96–99% of the orifice formula. Stack effect 96% of the formula in a uniform room.
- Well-mixed decay 99.8% of the analytic rate, and the particulate mass balance closes to 1e-5.
- Window fan: matches the analytic series solution. Free jet, after the pressure fix: delivered flow 100.1%, decay exponent −0.93, constant K 6.15 (98.3%, −1.05 and 5.85 originally).

Scenarios, in the CPU solver at 0.2 m cells (`tests/solver/scenario-presets.spec.ts`):

- Cross-ventilation (two-bedroom, 4 m/s west wind): 1.09 m³/s in at the west windows and out at the east ones, and a closed bedroom door cuts that bedroom's flow to zero.
- Stack effect (house, no wind, −5 °C outside): 0.31 m³/s in at the low windows and out at the clerestory.
- A fan in the window (two-bedroom, no wind, Air King 9155 on high): 1.03 m³/s, 88% of the rated 1.17 m³/s, and zero when turned off.

Stability at finer cells. A heads-up note said the random stress ran only at 0.2 m, while the GPU path mostly runs 0.05 to 0.1 m and the studio and one-bedroom had never run there. Running it found one root cause behind every failure, and a hang risk (issue 1). The random stress now takes `ROBUST_H` (cell size), `ROBUST_TRIALS`, `ROBUST_SEEDS` and `ROBUST_VERBOSE`, and stops a case at the first step the air passes 40 m/s. That is what made fine-cell runs possible: before it, a blown-up case took minutes per step. With the final solver:

- CPU, studio and one-bedroom, five seeds of each random generator (openings and weather changed mid-run; fans and purifiers turned mid-run): all pass at 0.15, 0.1 and 0.075 m. At 0.075 m the fastest air stays under 8 m/s and the divergence under 1e-2 (limit 0.05), which is the slow pressure convergence of issue 1 showing at fine cells.
- CPU, 30 simulated seconds in a 3 m/s wind and in still air at −5 °C: all four plans at 0.2 m (limits 10 m/s and divergence 0.01, passing), and the studio and one-bedroom at 0.15 and 0.1 m, where the fastest air stays under 1.2 m/s and the divergence under 5e-5 after the first 100 steps. The 0.075 m runs of these were not done (about 10 minutes each on the CPU).
- GPU (`STRESS=1 node_modules/.bin/playwright test -c playwright.gpu.config.ts stress.gpu`, under 2 minutes): all four plans, five seeds of each generator, at 0.15, 0.1 and 0.075 m, and at 0.05 m on the studio, plus 600-step runs in wind and in still cold air. All pass, and a rerun on this Mac passed all 14 stress tests. The worst case was the studio's seed 50004 at 0.05 m: 15 m/s and divergence 0.019.
- Five seeds per plan and size are a sample. A wider sweep is `ROBUST_TRIALS=30` on the CPU, or a larger count in the GPU sweep, on an idle machine.

CPU step cost, one 0.05 s step on this Mac while other jobs ran:

| Plan | 0.2 m cells | 0.15 m | 0.1 m |
| --- | --- | --- | --- |
| Studio | 14 ms (15k padded cells) | 34 ms | 127 ms |
| One-bedroom | 22 ms | 49 ms | 201 ms |
| Two-bedroom | 28 ms | 74 ms | 285 ms |
| House | 41 ms (47k) | 109 ms | 427 ms |

GPU step cost on the house plan, windows closed, three pressure cycles: 0.2 m 0.64 ms (41k cells), 0.15 m 0.86 ms (98k), 0.1 m 2.05 ms (332k), 0.075 m 5.19 ms (786k); about 10% more when the caller awaits only every fourth step. A caller that never awaits gets no CFL reading, so every step then takes 64 scalar substeps (6.3 ms at 0.1 m). So a 0.2 m CPU grid runs faster than real time for every plan, the house at 0.1 m on the CPU runs about 8 times slower than real time, and fine grids need the GPU.

GPU against CPU, after the final pressure fix: the room with windows, fans, a source and a purifier differs by 8.0e-6 in velocity and 2.5e-5 in pressure over 10 steps, and the lid-driven cavity by under 2.3e-7 and 3.5e-6. Through `World` on the two-bedroom home the slice at 1.1 m, the fan flow and the cross-ventilation window flows match within the tests' tolerances.

Checks at the end of the session (2026-10-09, 20:31 PDT): `yarn test:solver` 144 passed and 2 skipped (the dollhouse T and L junction test and the purifier-catalog test, both `fixme`); `yarn test:gpu` 19 passed, plus 14 stress tests that run only with `STRESS=1` and passed on a rerun; the type check (`yarn run check`) at its baseline of one error in `tests/resume.spec.ts` and one warning in `PortfolioShell.svelte`, both older than this work. The existing e2e suite (run earlier in the session, before the pressure fix, which touches no route) passed 612 with 3 skipped, the same as before this work, after one flaky phone-menu motion test passed alone and on the rerun. The production build (`yarn build`) succeeded at that point. No route or catalog entry loads the airflow code.

## Not started

Scene assembly, the engine loader, the dock and page UI, the route and catalog entry, the CPU worker backend, the auto-tuner and backend selection, device meshes, purifiers in the catalog and the two purifier scenarios, end-to-end tests, the visual and accessibility pass at desktop and phone widths, and the Physics panel text.

## Resume order

This list is the plan, and the steps go in order. There is one branch, `knakamura/issue-30-completion-7a3fb7`, and one worktree, `.claude/worktrees/funny-bassi-7c3d37`. Finish a step (code, tests and this doc), commit and push it before starting the next. Parallel agents may work on separate files in this worktree, or in isolated worktrees that are merged into this branch and removed, with their branches, before the next step starts. A new idea goes into this list or into the known issues, not onto a side branch.

1. Assemble the scene. A `SceneFactory` (`engine/types.ts`: `(host, params, readout) => SceneInstance`) in a new `airflow/scene/airflowScene.ts` that builds `new Dollhouse(plan, { furniture, tint })`, `SliceLayer(width, depth)`, `DirectionArrows(width, depth)`, `TracerPoints` and `SmokePoints`. Each frame `update(dt)` calls `session.update(dt)`, and when `session.latest.version` changes it feeds `sliceLayer.update(slice, layer, scale)`, `arrows.update(slice, scale)`, `tracers.update(array, scale)` and `smoke.update(array, { dense })`. It applies `dollhouse.setOpenings`, `setTopDown` and `setFurniture` from the setup and the view, takes framing from `dollhouseRig(plan, topDown)`, and implements `SceneInput` (hover calls `session.hover`, a click pins a probe, a hold calls `session.setEmitPoint`). Then a loader like `relativity/experience.ts`'s `loadEngine`, and the route `src/routes/experiments/airflow/+page.svelte` using `provideAirflow` with the plans, the catalog models, `SCENARIOS`, and `linkCatalog` with `setupFromHash` / `setupToHash` from `link.ts`. This section comes from reading the APIs and has not been built. From the harness runs:
   - Fog: the rig pulls the camera back by width on a narrow Stage (about 45 m for the studio and 77 m for the house at 390 px). The kit's fog (24 to 60 m) washes the house out, so use no fog or start it past 80 m, and keep the far plane beyond 100 m.
   - The kit's pool sits at y = −0.004, inside the dollhouse floor. Put any ground plane at or below −0.16.
   - Draw order: faded walls draw at render order 20, after the slice (10), arrows (11), tracers (12) and smoke (13), which is the right back-to-front order for a wall between the camera and the slice. The comment in `sliceLayer.ts` said the opposite and has been corrected from reading the code, not from a rendered frame. Keep any new layer below 20.
   - In plan view the furniture is cut to 0.45 m, so the slice plane at 1.1 m is clear of it. The requested slice height snaps to a cell layer (0.3 m draws at 0.375 m at h = 0.15), so place the plane and the readout at `slice.y`.
   - The kit's sun is from the south-west, so the interior goes grey seen from the north.
2. The CPU worker backend, as a `FlowBackend` proxy. The session's frame budget (`FRAME_BUDGET`, `stepCost`) measures how long `backend.step` takes, so a worker needs step acknowledgements or the session will queue far too many steps. Backend selection (WebGPU when an adapter exists, else the worker) and device loss (`backend.solver.context.onLost`) are page code.
3. The dock and page UI (the `AirflowExperience` actions already exist), the catalog entry (`tests/experiments.spec.ts` checks every catalog entry has a page, so add it in the same change as the route), and the share link. The 2026-10-08 session drafted the landing card, to go first in `experiments` in `catalog.ts` (newest first), with plain quotes as string delimiters: slug `airflow`; title "Airflow, room by room"; summary "Open a window and watch the air. A live simulation of indoor air movement driven by wind, temperature, and fans, and how that air carries smoke and heat around the rooms."; detail "Select a home, place a fan or open windows, and watch the flow patterns update in real time. Four homes to explore, from a studio to a house."; image `/images/experiments/airflow.svg`; alt "A dollhouse viewed three-quarter from above, with rooms tinted different colors and vectors showing air movement."; tech "Navier-Stokes solver · Three.js · SvelteKit · WebGPU".
4. The auto-tuner: pick the cell size from the measured step time, using the tables above as the starting guide.
5. Purifiers and the two scenarios that need them (clearing the smoke, the smoky day). See issue 2.
6. End-to-end tests, the visual and accessibility pass, and the Physics panel text.

## Known issues and open decisions

1. Pressure-solve instability: fixed on the CPU and the GPU, with one weak point left. The studio and one-bedroom plans blew up in the CPU solver, and the finer-cell stress found more. Root cause, with a falsifying test (`tests/solver/pressure.spec.ts` fails on the original solver and passes on the fix): the multigrid's coarse pressure operator halved interior faces. For 2×2×2 aggregation with piecewise-constant transfer that is the rediscretised operator, and the coarse correction came out about twice too large, so smooth pressure errors flipped sign every cycle. A solve with an odd number of cycles then fed a sign-flipping pressure into the next step. That is why the pressure flipped sign every step, and why one-bedroom seed 1004 at 0.15 m ran away with 3 and 5 cycles and not with 4 and 6. The fix sums the interface faces (the Galerkin operator, `coarsen` in `solver/cpu/pressure.ts`).
   - With it, seed 1004 is stable at 1 to 6 cycles at 0.12, 0.15 and 0.2 m. So are studio seed 50001 (two intake window fans against one small open window, first blamed on the fan curve's steep slope near stall, which changed nothing once the operator was right) and one-bedroom seeds 1004 and 1005 at 0.1 and 0.075 m. A coarse correction scaled by 2 reproduces the old failures exactly, and scales from 1 to 1.75 are all stable. Three cycles stay the default.
   - The averaging of the last two pressure solves (the first fix) stays as a second line of defence: without it, two-bedroom seed 52004 (two fans and a purifier in an 8 m/s wind) ran away at 0.075 m.
   - What remains: the solve converges only 0.73 to 0.97 per cycle (the old operator measured 0.54 to 0.87 by residual norm, but flipped sign), because aggregates straddle thin walls. Two cycles leave about three times the divergence of three. A faster, more accurate solve needs aggregates that follow the walls, or conjugate gradients with this cycle as the preconditioner, on the CPU and the GPU.
   - Numbers: the cavity, Nusselt, decay and through-flow results did not move. The free jet reads exponent −0.93 and K 6.15 (originally −1.05 and 5.85, and −0.88 and 6.23 with the averaging alone), so K sits 1% above the published 5.7 to 6.1, inside the test's band. `shearCoefficient` (0.015) was tuned against the old solver and can be retuned.
   - Hang risk: the CPU's scalar substep count had no cap, so a blown-up case took minutes per step, which would freeze the page's CPU fallback. It is capped at 64 like the GPU's. The page should also catch a runaway (a non-finite value or air faster than about 40 m/s in `diagnostics`) and offer a reset, not draw garbage.
2. Purifiers. No maker or listing read publishes a purifier's CADR at each speed, and `PurifierModel.cadr` needs four. Top-speed figures seen: Coway AP-1512HH 233 cfm for smoke, Coway Airmega 400 328 cfm for smoke (an ENERGY STAR record may say 376, not opened), Levoit Core 300-P 143 cfm (particle not stated). None gave AHAM listing, body size, or where air goes in and out. Smart Air publishes 65, 180 and 315 m³/h for its Sqair, but with no test standard. Options: store the top speed and scale the lower speeds by a stated assumption; find a lab that measured named models at each speed; or leave purifiers out.
3. Share link: out-of-range numbers are clamped (bearings wrap), so a link still loads if a slider range is narrowed later. Rejecting them (null) is a small change in `read()` in `link.ts`.
4. Opening limits: the research gives a single casement sash a free area of 0.78 to 0.80 of its frame, but `OPENING_LIMITS` in `homes/types.ts` allows 1, and the explainer says so. Double-hung and sliding at 0.5 match the research.
5. Wind: the slider is the 10 m weather-report speed and the eaves see 0.55 of it, the top of the published 0.435 to 0.55 range at 3 m. The pressure-coefficient fit covers an eave-height to short-wall ratio of 0.1 to 0.4, and only the studio falls outside it (about 0.44 to 0.56); the two bigger plans are inside. The explainer says so.
6. The explainer's "How it works" names Stam (1999) and Zuo and Chen (2009) but no research note covers them, so they are not in Sources. Titles and years of a few sources (Ghia 1982, de Vahl Davis 1983, Botella and Peyret 1998, Hortmann et al. 1990, Sippola and Nazaroff 2002) were filled from memory, and no link was opened. A person should check them. Wording that goes stale when the casement limit, the purifier numbers or the emission rates change is listed in the explainer's commit messages.
7. Emission rates in `emission.ts` and the particle constants in `sim/world.ts` (`PARTICLE`) are placeholders, marked unconfirmed in the research note. The Physics panel has no formatter for emission strength or the cell count. `readout.ts` (direction words) and `readouts.ts` (reading data) are easy to confuse, and renaming the first `direction.ts` would help.
8. Visual choices from the viz harness: at sensitivity 1 the speed scale (0 to 3 m/s) shows ordinary room air nearly the same pale blue as still air, and 0.5 would read better (`DEFAULT_VIEW.sensitivity`). In the particulates layer the lightest color means "at or below 1.2 µg/m³" and can read as smoke. The temperature layer's neutral is a glaring white in a dark scheme, though the site has no dark theme yet. The 12% fade of near walls is faint on a 1x phone. A 12 m plan fills about a third of a portrait Stage.
9. WebKit shows random colored speckle over the kit's ground pool (`studio()` in `engine/kit.ts`) in Playwright's WebKit. The relativity scenes use the same pool, so Safari may show it on the live site. Check a relativity Stage in WebKit.
10. GPU, open items: the window-fan-only room differs from the CPU by 1.5e-4 in pressure after 10 steps (tolerance 1e-4; probably amplified rounding, moderate confidence), the particulate mass balance through `World` was not exercised, and a snapshot must be taken at least every 8,192 steps. The GPU reads its CFL back without waiting, so a caller needs to await a snapshot every few steps: a reading more than 4 steps old is scaled up by 1.1 per step of age, and with no reading at all every step takes the 64-substep cap. The page's frame loop should be tried against that rule.
11. The 2026-10-08 session left uncommitted changes in a second worktree (`issue-30-completion-7a3fb7`), and the two worktrees were merged into this one on 2026-10-09. What came across: its `tests/solver/rendering.spec.ts`, tightened (it was mostly "does not throw" checks, with one assertion that could not fail), and its landing-card copy, now in the resume order above. What did not: its edit of `src/lib/experiments/catalog.ts` (typographic quotes as delimiters, so it did not compile, and it linked to a page that does not exist) and its rewrite of this status doc (superseded). A stored memory note (hmem, "airflow-experiment-worktree-completion") says that session pushed, but nothing was committed or pushed.
12. An isolated agent worktree can start from an old base commit. Put `git merge knakamura/issue-30-completion-7a3fb7` first in an isolated agent's prompt. Agent worktrees under `.claude/worktrees/agent-*` are locked while their session runs, so remove one with `git worktree unlock` and then `git worktree remove`, after its commits are in this branch. `git cherry HEAD <branch>` shows `-` for a commit that is, and `+` for one that is not; a commit amended after the agent branched also shows `+`, so compare its files before deleting the branch.

## Re-running the harnesses

- Dollhouse: `node scripts/airflow-qa/dollhouse/shoot.mjs <outDir> all` (also `sweep`, `state:<json>`, `--dpr=2`, `--browser=firefox|webkit`).
- Visualization: `node scripts/airflow-qa/viz/shoot.mjs --out <dir> --seconds 30` (also `--only`, `--probe`, `--fan --purifier --wind 3`, `--browser`).
- Plans: `node_modules/.bin/esbuild scripts/airflow-plan-preview.ts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/airflow-plan-preview.mjs && node /tmp/airflow-plan-preview.mjs /tmp/airflow-plans`.
- WebGPU in Playwright on an M-series Mac: Chromium launched with `channel: 'chromium'` has a real Metal adapter, the default headless shell has none without software flags, WebKit has a real adapter, and Firefox has none so it takes the CPU fallback. Default device limits: 8 storage buffers per shader stage, 128 MiB binding size, workgroup size 256.
- Use an Opus research agent for fan, purifier or particulate research and keep the wording to product specifications: a Sonnet 5.5 research agent was stopped by a safeguard on this subject.
