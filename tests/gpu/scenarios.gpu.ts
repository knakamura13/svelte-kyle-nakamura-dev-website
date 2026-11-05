import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The purifier Scenarios' notices hold on the finest grid the page runs, on the GPU, as tests/solver/scenario-presets.spec.ts checks them
 * on the CPU fallback's coarse grid: stepped as the page steps, each room's smoke is read at the same moments. A purifier draws its air in
 * and blows it out cleaned (`Sink`), so it clears a closed room at the same rate on every grid, which is what lets each notice give one figure.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'scenarios.ts');
});

const FINEST = 0.075;
const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).scenarios[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;

/** How long a room's smoke takes to halve, minutes, from its fall between half a minute and two minutes in. */
async function halving(name: string, h = FINEST) {
	const r = await call('pm25', name, h, [30, 120]);
	expect(r.finite, `${name} at ${h} m: finite`).toBe(true);
	return (Math.LN2 * 90) / Math.log(r.readings[0] / r.readings[1]) / 60;
}

test('clearing the smoke on the finest grid: the purifier on High halves bedroom 2’s smoke in about three and a half minutes, within a tenth of the coarse grid’s, and on Low about twice as long; the open window instead about ten and a half, as on the coarse grid', async () => {
	test.setTimeout(900_000);
	const high = await halving('clearing-high');
	const low = await halving('clearing-low');
	const window = await halving('clearing-window');
	// The grid between, and the CPU fallback's coarse one, stepped here on the GPU.
	const between = await halving('clearing-high', 0.1);
	const coarse = await halving('clearing-high', 0.2);
	console.log(`clearing the smoke at ${FINEST} m: halves in ${high.toFixed(2)} min on High, ${low.toFixed(2)} on Low (${(low / high).toFixed(2)} times), ${window.toFixed(2)} with the window instead; on High at 0.1 m ${between.toFixed(2)} and at 0.2 m ${coarse.toFixed(2)}`);
	expect(high).toBeGreaterThan(3.2);
	expect(high).toBeLessThan(3.9);
	expect(Math.abs(high / coarse - 1), 'the same rate on the finest grid as on the coarse one, within a tenth').toBeLessThan(0.1);
	expect(low / high).toBeGreaterThan(1.65);
	expect(low / high).toBeLessThan(2.2);
	expect(window).toBeGreaterThan(9.5);
	expect(window).toBeLessThan(11.5);
	expect(between).toBeGreaterThan(3.2);
	expect(between).toBeLessThan(3.9);
});

test('the smoky day on the finest grid: with the windows shut the purifier halves the main room’s smoke in about five minutes; with them open the room levels off at about three quarters of the smoke outside', async () => {
	test.setTimeout(900_000);
	const shut = await halving('smoky-shut');
	const open = await call('pm25', 'smoky-open', FINEST, [240, 300]);
	const [earlier, level] = open.readings;
	console.log(`the smoky day at ${FINEST} m: halves in ${shut.toFixed(2)} min with the windows shut; open, ${earlier.toFixed(1)} µg/m³ after four minutes and ${level.toFixed(1)} after five, ${(level / 150).toFixed(2)} of the smoke outside`);
	expect(open.finite).toBe(true);
	expect(shut).toBeGreaterThan(4.2);
	expect(shut).toBeLessThan(5.4);
	expect(level / 150).toBeGreaterThan(0.68);
	expect(level / 150).toBeLessThan(0.8);
	expect(Math.abs(earlier - level), 'levelled off: under 3 µg/m³ of change in its fifth minute').toBeLessThan(3);
});
