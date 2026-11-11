import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Issue 91 on the GPU: tests/solver/window-fan-steps.spec.ts says what ran away and why. The window-fan Scenario from rest, for a second
 * and a half through the fan's spin-up, at 1/120, 1/60 and 1/30 s on 0.15, 0.1 and 0.075 m cells; and on the finest grid at the page's
 * 1× step, the fan still draws its rating and the Scenario's notice still holds, as tests/solver/scenario-presets.spec.ts checks them on
 * the CPU fallback's coarse grid with the same bounds.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'windowFan.ts');
});

const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).windowFan[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;
/** tests/solver/window-fan-steps.spec.ts `FASTEST`: twice the fan's free-delivery speed through its window. */
const FASTEST = 3.7;

test('the window-fan Scenario stays bounded from rest at 1/120, 1/60 and 1/30 s on 0.15, 0.1 and 0.075 m cells', async () => {
	test.setTimeout(300_000);
	for (const h of [0.15, 0.1, 0.075])
		for (const rate of [120, 60, 30]) {
			const r = await call('bounded', h, rate, 1.5, FASTEST);
			console.log(`gpu window fan, ${h} m (${r.cells}), 1/${rate} s: fastest ${r.fastest.toFixed(2)} m/s at step ${r.at}, divergence ${r.divergence.toExponential(1)}`);
			expect.soft(r.fastest, `${h} m, 1/${rate} s: fastest air, at step ${r.at}`).toBeLessThan(FASTEST);
			expect.soft(r.divergence, `${h} m, 1/${rate} s: divergence`).toBeLessThan(0.05);
		}
});

test('on the finest grid at the page’s 1× step, the fan draws about its rating and the air goes where the notice says', async () => {
	test.setTimeout(300_000);
	const r = await call('delivery', 0.075, 60, 30);
	console.log(`gpu window fan, 0.075 m, 1/60 s, 30 s: ${r.drawn.toFixed(3)} m³/s in through the fan window (rated ${r.rated.toFixed(3)}), ${r.out.toFixed(3)} through the bedroom window; room speeds (m/s): ${Object.entries(r.speeds).map(([id, v]: [string, any]) => `${id} ${v.toFixed(3)}`).join(', ')}`);
	expect(r.drawn).toBeGreaterThan(0.5 * r.rated);
	expect(r.drawn).toBeLessThan(1.05 * r.rated);
	expect(Math.abs(r.drawn + r.out) / r.drawn).toBeLessThan(0.1);
	expect(r.speeds.dining).toBeGreaterThan(r.speeds.living);
	expect(r.speeds.hall).toBeGreaterThan(0.1);
	expect(r.speeds['bedroom-1']).toBeGreaterThan(0.1);
	expect(r.speeds['bedroom-2']).toBeLessThan(0.01);
	expect(r.speeds.bathroom).toBeLessThan(0.01);
});
