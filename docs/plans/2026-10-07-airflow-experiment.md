# Airflow, room by room: design

Issue: https://github.com/knakamura13/svelte-kyle-nakamura-dev-website/issues/30. This file records how the experiment is built and why, in the order a new contributor needs it. Sources for every number a benchmark or the catalog relies on are in `docs/research/airflow/`.

## Pieces

```
src/lib/experiments/airflow/
  solver/           the physics, with no knowledge of homes, devices or pages
    grid.ts types.ts geometry.ts fan.ts backend.ts
    cpu/            the reference implementation (also the fallback backend)
    gpu/            the WebGPU implementation: the same algorithm, kernel for kernel
  homes/            plans (validated data), rasterizing a plan into solver geometry
  devices/          fan and purifier catalogs and how a device becomes solver inputs
  scene/            the three.js dollhouse, slice plane, tracers, devices, probes
  ui/               Dock sections, legends, the Physics panel
tests/solver/       Node-only benchmarks and invariants (`yarn test:solver`)
```

The solver is a library with one boundary, `FlowBackend` (`solver/backend.ts`): step it, tell it what changed, ask for snapshots. The CPU reference implements it directly (`cpu/backend.ts`) and can run in a Web Worker; the WebGPU solver implements it with reads back from the GPU. The page never reads a solver's arrays.

## Conventions

- Axes: x east, y up, z south (north is −z). One staggered (MAC) grid of cubic cells, size `h`. Every array, whatever it holds, uses the padded layout of `solver/grid.ts`: (nx+1)(ny+1)(nz+1) values, x fastest, so strides never differ between arrays.
- SI units. Particulates are ppm by mass (mg of particles per kg of air; 1 ppm ≈ 1,200 µg/m³ at 20 °C, 1 atm). Temperature is carried as θ, kelvin above a fixed reference.
- A face's open fraction `a` is 0 for a wall, 1 for open air, and between for a part-open door or window. Furniture is solid cells. Interior walls are blocked faces, not cells, so a 10 cm wall does not cost a layer of 5 cm cells. An opening's `a` is the exact overlap of its open part with the face, so the open area is exact whatever the grid.
- The host pads each dimension so the multigrid can coarsen four or five levels (multiples of 16 or 32). A grid whose dimensions are odd cannot coarsen and the pressure solve stalls.

## One step (`cpu/solver.ts`)

1. Eddy viscosity from the current flow (shear-length closure).
2. Advect velocity. The carried quantity is the velocity plus half a step of last step's pressure gradient, buoyancy and fan push; the carrier is the divergence-free velocity of the last step. Semi-Lagrangian with a midpoint (RK2) backtrace and a MacCormack correction clamped to the stencil's range.
3. Add the other half of buoyancy and fan push.
4. Explicit viscous diffusion with ν + ν_t, in as many substeps as keep 6·ν·dt/h² below 0.9. A wall's ghost value gives it its own velocity (no-slip, moving lid, or free-slip); a part-open door blends the ghost and the real neighbour by its open fraction.
5. Pressure projection with half a step's weight. Cell flux balance with face conductances `a·h·dt/ρ`; exterior opening faces are Robin boundaries following the orifice law `u = Cd·√(2|Δp|/ρ)` (or a window fan's curve), linearised about the last step's pressure. Geometric multigrid, V(2,2) cycles, red-black Gauss-Seidel, 2×2×2 aggregation with piecewise-constant transfer; coarse conductances are sums of the fine ones across the interface, halved for interior faces.
6. Scalars (temperature, particulates): conservative flux form, van Leer limiter, substepped to a cell-crossing count of 0.45, with turbulent diffusion, surface deposition, settling, emitters and purifier sinks (implicit). Exterior openings carry the outdoor value in. Every flux that crosses the box is tallied, so the particulate mass balance closes to rounding.

### Decisions the benchmarks forced

| Decision | What was tried | Evidence |
| --- | --- | --- |
| Trapezoidal pressure and force treatment (half before advection, half after) | Plain Chorin splitting: advect, then project | Chorin loses energy in proportion to dt, as if the air were more viscous: numerical viscosity of an inviscid Taylor-Green vortex 8.4e-4 at CFL 0.5 and 1.9e-3 at CFL 1.5 on 64². With the trapezoidal treatment 3.9e-5 and 9.4e-5. The Re 1000 cavity error at 64² fell from 4.6 % to 3.3 % of the lid speed at CFL 0.5, and stopped depending on dt. |
| MacCormack correction on advection | Plain semi-Lagrangian | Inviscid Taylor-Green numerical viscosity 2.0e-3 against 3.9e-5 (64², CFL 0.5, both with the trapezoidal treatment). Re 1000 cavity at 64², before the trapezoidal treatment: error 18 % of the lid speed against 4.6 %. The clamp is not what costs accuracy (switching it off changed nothing to 4 digits). |
| Shear-length turbulence closure, ν_t = c·V·min(V/\|S\|, 0.5 m), c = 0.015 | Smagorinsky, ν_t = (Cs·Δ)²\|S\|, with Δ the grid or a fixed filter width | Smagorinsky leaves a fan's jet laminar: centreline decay exponent −0.09 (Δ = h), −0.36 to −0.43 (fixed Δ of 0.25 to 0.5 m), against −1 for a round turbulent jet. \|S\| falls as 1/distance² along a jet while a real jet needs a constant eddy viscosity. V/\|S\| is the jet's own width, so c·V·b is constant along it. The closure depends on neither the grid nor wall distance, so the auto-tuned resolution does not change the physics: at 5, 10 and 20 cm cells the far-field jet speed agrees. The closure is switched off for the laminar benchmarks. |
| Pressure matrix regularisation at rounding level, mean removed explicitly when the box has no opening | A relative shift of 1e-4 | A leak proportional to pressure and cell count swallowed 12 % of the flow through a small opening. |
| Fan curve calibrated so the open-air flow equals the rated flow | The curve as published | A disk in open air spends part of its pressure rise on the wake's kinetic energy (κ ≈ 1.6 of an ideal 2), so a disk given the published curve delivers 74 % of the rated flow. |

## Benchmarks (`tests/solver/benchmarks.spec.ts`, `yarn test:solver`)

| Benchmark | Reference | Result |
| --- | --- | --- |
| Lid-driven cavity, Re 1000 | Ghia, Ghia and Shin 1982 | 128²: max error 1.8 %, rms 1.2 % of the lid speed. 64²: 4.7 %, 3.0 % |
| Differentially heated cavity, Pr 0.71, 64² | de Vahl Davis 1983 | Ra 1e3, 1e4, 1e5: Nu within 0.7 %, 0.3 %, 0.1 %; peak velocities within 1 % |
| Two openings in series under a pressure difference | Q = Cd·A·√(2ΔP/ρ)/√2 | 96 to 99 % of the formula; in equals out to 1e-3 |
| Stack effect, openings at two heights | ASHRAE Fundamentals | 96 % (uniform room); 94 % five seconds in with cold inflow |
| Well-mixed room with ventilation, purifier and deposition | dC/dt = −(Q/V + CADR/V + v_d·A/V)·C | decay constant 100.0 % of predicted; mass balance closes to 1e-5 |
| Free round jet from a fan | 1/distance decay, K = 5.7 to 6.1 (Wygnanski and Fiedler 1969; Hussein, Capp and George 1994; Panchapakesan and Lumley 1993) | delivered flow about 100 % of rated, exponent −1.0, K about 5.9 |

Tolerances and what limits them are next to each assertion.

## Porting contract for the WebGPU solver (`solver/gpu/`)

- Same algorithm, same kernel boundaries, same padded layout and indexing, same fixed cycle and sweep counts, f32 everywhere. The CPU reference computes in double and stores f32; that is the only intended difference. Each CPU function in `cpu/` is one or a few kernels.
- Default WebGPU limits allow 8 storage buffers per shader stage and 128 MiB per binding. Keep every kernel to 8 bindings (a uniform buffer is separate).
- Parity is tested kernel by kernel on random fields, then whole steps on scenario builders from `tests/solver/scenarios.ts`, within a stated tolerance.
- The WebGPU path is the main path; the CPU reference, in a Web Worker at a coarse grid, is the fallback and gets a visible "reduced detail" note.

## Phases

- [x] Landing page driven by a catalog (#29)
- [x] 1. Solver core on the CPU, benchmarks 1, 4 and the two-height part of 3
- [ ] 2. WebGPU solver, CPU worker fallback, parity tests, auto-tune, the 30 fps budget
- [ ] 3. Homes
- [ ] 4. Devices, benchmark 2
- [ ] 5. Particulates and probing
- [ ] 6. Visualization
- [ ] 7. Page
