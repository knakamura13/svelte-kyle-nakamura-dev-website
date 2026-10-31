import { expect, test, type Page } from '@playwright/test';
import { bundle, openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The auto-tuner and the GPU's back-pressure on the real device, which the Node tests cannot have. The real session runs on the choice of
 * backend, drawing a frame at a time from the browser's own animation frames, and the tuner is told those frames as the page tells it. What
 * each test prints is what the status doc records: the grid each Home settles on, how fast the frames came, how much of real time the solver
 * kept up with, what a step costs, and how deep the GPU's queue is allowed to get. The harness draws no scene, so its frame rate says only that
 * the session and the reads leave the page's thread free; the real page's (with its WebGL drawing) was measured by hand and is in the status doc.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	// The worker's own script is served too, so the processor's path runs on a thread of its own, as it does in the page.
	await openHarness(page, 'tune.ts', { '/worker.js': await bundle('src/lib/experiments/airflow/solver/cpu/worker.ts') });
});
test.afterAll(async () => {
	await page.close();
});

const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).tune[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;
const HOMES = ['studio', 'one-bedroom', 'two-bedroom', 'house'];

const describe = (r: any) => {
	const sizes = r.changes.map((c: any) => `${c.size} m at ${c.at.toFixed(1)} s`).join(', then ');
	const warm = r.warmUp?.measured ? `warm-up ${r.warmUp.seconds.toFixed(2)} s, a step ${r.warmUp.measured.ms.toFixed(2)} ms at ${r.warmUp.measured.cells} cells  |  ` : '';
	return `${r.plan.padEnd(12)} ${r.kind === 'webgpu' ? 'GPU' : 'worker'} ${String(r.speed).padStart(2)}x  ${warm}${sizes}  |  ${r.finalCells} cells  settled ${r.settled}  last change at ${r.lastChangeAt.toFixed(1)} s of ${r.seconds.toFixed(1)} s  |  fps median ${r.fps.median.toFixed(1)} (slowest ${r.fps.slowest.toFixed(1)})  rate ${r.rate.toFixed(2)}  unfinished at most ${r.maxInFlight}${r.limit ? ` of ${r.limit}` : ''}`;
};

test.describe('on the GPU every Home gets a fine grid from its warm-up, before it is shown, and keeps it, and the page keeps drawing', () => {
	for (const plan of HOMES)
		test(plan, async () => {
			test.setTimeout(120_000);
			// Five times real time is what the Scenarios start at.
			const r = await call('tuneRun', plan, { speed: 5, seconds: 20 });
			console.log(describe(r));
			console.log(`    said: ${JSON.stringify(r.announced)}`);
			expect(r.warmUp.measured, 'the device was measured before the world was shown').not.toBeNull();
			expect(r.warmUp.seconds, 'in a moment').toBeLessThan(3);
			expect(r.fps.median, 'frames a second').toBeGreaterThanOrEqual(30);
			expect(r.finalSize, 'a fine grid on this machine').toBeLessThanOrEqual(0.1 + 1e-9);
			expect(r.settled, 'the tuner has settled').toBe(true);
			expect(r.changes, 'the grid the visitor first sees is the grid: nothing changes in view').toHaveLength(1);
			expect(r.rate, 'the solver kept up with the clock').toBeGreaterThanOrEqual(0.95 * 5);
			expect(r.maxInFlight, 'the queue stayed inside its limit').toBeLessThanOrEqual(r.limit);
			expect(r.errors).toEqual([]);
			// A grid picked before anything was shown is not news.
			expect(r.announced).toEqual([]);
		});
});

test('what a step costs on the device, and what building a world costs, for every Home at every size', async () => {
	test.setTimeout(120_000);
	const rows: string[] = [];
	for (const plan of HOMES)
		for (const h of [0.3, 0.2, 0.15, 0.1, 0.075]) {
			const r = await call('stepCost', plan, h);
			rows.push(`${plan.padEnd(12)} ${String(h).padEnd(6)} ${String(r.cells).padStart(7)} cells (${String(r.fluidCells).padStart(7)} air)  a step ${r.ms.toFixed(2).padStart(5)} ms  encoding it ${r.encodeMs.toFixed(2)} ms  building the world ${r.buildMs.toFixed(0).padStart(3)} ms`);
			expect(r.ms).toBeGreaterThan(0);
		}
	console.log('\n' + rows.join('\n'));
});

test('a grid too fine for the device, at 20 times real time, does not grow a queue: it stays inside its limit and the rate says the device is behind', async () => {
	test.setTimeout(180_000);
	// The house at 7.5 cm is 786,432 cells: about 6 ms a step here, and 20 times real time asks for seven steps in each frame of 17 ms.
	const bounded = await call('tuneRun', 'house', { speed: 20, seconds: 8, fixedCell: 0.075, drain: true });
	console.log(`bounded:   ${describe(bounded)}  |  the device took ${bounded.drainMs.toFixed(0)} ms to finish what was queued`);
	expect(bounded.limit).toBe(8);
	expect(bounded.maxInFlight, 'never more than its limit unfinished').toBeLessThanOrEqual(bounded.limit);
	expect(bounded.maxInFlight, 'and it did fill the queue: the device really is the limit').toBeGreaterThanOrEqual(bounded.limit - 1);
	expect(bounded.rate, 'the rate is below what the clock asked').toBeLessThan(0.75 * 20);
	expect(bounded.rate, 'and the device still did better than real time').toBeGreaterThan(1);
	// Measured by something other than the backend's own count: how long the device takes to finish what it was given.
	expect(bounded.drainMs, 'the device is a few steps behind, not seconds').toBeLessThan(500);

	// The same without the limit, which is what the GPU's backend was before: the page is told the device keeps up, and the queue grows without bound.
	const unbounded = await call('tuneRun', 'house', { speed: 20, seconds: 3, fixedCell: 0.075, drain: true, limit: 1_000_000_000 });
	console.log(`unbounded: ${describe(unbounded)}  |  the device took ${unbounded.drainMs.toFixed(0)} ms to finish what was queued`);
	expect(unbounded.maxInFlight, 'hundreds of steps queued within three seconds').toBeGreaterThan(100);
	expect(unbounded.rate, 'while the rate says it keeps up').toBeGreaterThan(18);
	expect(unbounded.drainMs, 'and the picture is seconds behind').toBeGreaterThan(1000);
});

test.describe('on the worker (no WebGPU) every Home runs close to real time on the grid its warm-up picks', () => {
	for (const plan of HOMES)
		test(plan, async () => {
			test.setTimeout(120_000);
			const r = await call('tuneRun', plan, { kind: 'cpu', speed: 1, seconds: 20 });
			console.log(describe(r));
			console.log(`    said: ${JSON.stringify(r.announced)}`);
			expect(r.warmUp.measured, 'the worker was measured before the world was shown').not.toBeNull();
			expect(r.settled).toBe(true);
			expect(r.changes, 'nothing changes in view').toHaveLength(1);
			expect(r.errors).toEqual([]);
			// The warm-up allows the worker 80% of its thread at real time. This is a measurement on a machine that may be busy: what it saw is in the status doc.
			expect(r.rate, 'the worker keeps up with real time on the grid it picked').toBeGreaterThanOrEqual(0.8);
		});
});

// One test for the smallest Home and one for the largest, so each can be run on its own (a Home takes the whole five minutes).
for (const plan of ['studio', 'house'])
	test(`five minutes on the GPU, the ${plan}: the grid the warm-up picks is the grid for all of it`, async () => {
		test.setTimeout(400_000);
		// Nothing ends the run early (the quiet time is never reached), so the Home runs the whole five minutes.
		const r = await call('tuneRun', plan, { speed: 5, seconds: 300, quiet: 1e9 });
		console.log(`${describe(r)}  |  ${r.changes.length} sizes in all, over ${r.seconds.toFixed(0)} s`);
		console.log(`    said: ${JSON.stringify(r.announced)}`);
		expect(r.seconds, 'the whole five minutes ran').toBeGreaterThanOrEqual(299);
		expect(r.changes, 'on a quiet machine nothing ever changes: no restart and no step down').toHaveLength(1);
		expect(r.lastChangeAt, 'and in any case nothing in the first minute').toBeLessThan(1);
		expect(r.settled).toBe(true);
		expect(r.fps.median, 'frames a second').toBeGreaterThanOrEqual(30);
		expect(r.rate, 'the solver kept up with the clock at the end').toBeGreaterThanOrEqual(0.9 * 5);
		expect(r.maxInFlight, 'the queue stayed inside its limit').toBeLessThanOrEqual(r.limit);
		expect(r.errors).toEqual([]);
	});
