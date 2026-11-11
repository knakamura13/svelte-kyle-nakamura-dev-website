import { expect, test } from '@playwright/test';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { averageExchange, singleOpening, type BackendMaker } from './singleOpening';

/**
 * Issue 93: one open window, 10 K colder outside than in, no wind. Cold air comes in through the window's lower half and warm air leaves
 * through its upper half at the single-opening rate Q = (Cd/3)·A·√(g·H·ΔT/T̄) (`singleOpening.ts` and
 * docs/research/airflow/openings-and-wind.md, section 3d). tests/gpu/single-opening.gpu.ts runs the same room on the GPU.
 *
 * Tolerance: from 10 % below the formula to 2 % above it. Measured (2026-11-10), averaged over the fifth to tenth second: 94.6 % (0.15 m
 * cells) and 92.5 % (0.1 m) with the incoming air kept at the room's temperature, 93.1 % and 92.3 % with it coming in cold, and within a
 * point of that from 10 s to 30 s. The shortfall is not in the opening's law: applied to the pressure in the cells beside the window, the orifice law
 * gives the solver's flow to within 0.2 %. It is that the air leaving through the upper half speeds up toward the window inside the room,
 * so the pressure beside the window is lower than the still room's by about ½ρu² (0.03 to 0.05 Pa against differences of up to 0.24 Pa),
 * while the formula's Cd already counts that speeding up. The two-opening benchmark is low for the same reason, by 1 to 4 %. Finer cells
 * resolve more of the approach and lose a little more: 94.6, 92.5 and 91.3 % at 0.15, 0.1 and 0.075 m (the last on the GPU), the steps
 * shrinking, so a 0.05 m grid, which the page does not run, would sit near the bound. Cold air coming in cold pools on the floor,
 * and the model is up to a point and a half lower again. The formula itself takes a well-mixed room and a neutral plane at mid-height, and it averaged a
 * 14.7 % error against 50 measured single-sided flows (Pan et al. 2019), so the tolerance is well inside its own accuracy.
 */

const make: BackendMaker = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);

for (const h of [0.15, 0.1])
	for (const isothermal of [true, false])
		test(`one open window, 10 K colder outside and no wind, exchanges air at the single-opening rate on ${h} m cells, ${isothermal ? 'the room kept at one temperature' : 'the cold air coming in cold'}`, async () => {
			test.setTimeout(300_000);
			const room = await singleOpening(make, h, isothermal);
			const r = await averageExchange(room, 10, 0.05, 5);
			console.log(`single opening, ${h} m, ${isothermal ? 'one temperature' : 'cold inflow'}: in ${r.into.toFixed(4)} out ${r.out.toFixed(4)} m³/s, formula ${room.formula.toFixed(4)} (${((r.into / room.formula) * 100).toFixed(1)} %), fastest ${r.fastest.toFixed(2)} m/s`);
			expect(r.into / room.formula).toBeGreaterThan(0.9);
			expect(r.into / room.formula).toBeLessThan(1.02);
			// What comes in goes out through the same window, and it comes in low and goes out high, about a neutral plane near mid-height: with
			// the cold air pooling, a few faces in the row beside mid-height (3 of 54 at 0.1 m) flow the other way at times.
			expect(Math.abs(r.into - r.out) / r.into).toBeLessThan(1e-3);
			expect(r.layered).toBeGreaterThan(0.9);
			room.backend.dispose();
		});
