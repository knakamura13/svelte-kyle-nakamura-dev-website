import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Issue 93 on the GPU: one open window, 10 K colder outside and no wind, exchanges air at the single-opening rate. The room, the formula,
 * the tolerance and why the model is a few percent below the formula are in tests/solver/single-opening.spec.ts; here the same room runs
 * on GpuBackend on 0.1 m cells, which the CPU spec also runs, and on 0.075 m, the finest the page runs.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'singleOpening.ts');
});

for (const h of [0.1, 0.075])
	for (const isothermal of [true, false])
		test(`one open window, 10 K colder outside and no wind, exchanges air at the single-opening rate on ${h} m cells on the GPU, ${isothermal ? 'the room kept at one temperature' : 'the cold air coming in cold'}`, async () => {
			test.setTimeout(300_000);
			const r = await page.evaluate(([h, isothermal]) => (window as any).singleOpening.run(h, isothermal), [h, isothermal] as const);
			console.log(`gpu single opening, ${h} m (${r.cells}), ${isothermal ? 'one temperature' : 'cold inflow'}: in ${r.into.toFixed(4)} out ${r.out.toFixed(4)} m³/s, formula ${r.formula.toFixed(4)} (${((r.into / r.formula) * 100).toFixed(1)} %), fastest ${r.fastest.toFixed(2)} m/s`);
			expect(r.kind).toBe('webgpu');
			expect(r.into / r.formula).toBeGreaterThan(0.9);
			expect(r.into / r.formula).toBeLessThan(1.02);
			expect(Math.abs(r.into - r.out) / r.into).toBeLessThan(1e-3);
			expect(r.layered).toBeGreaterThan(0.9);
		});
