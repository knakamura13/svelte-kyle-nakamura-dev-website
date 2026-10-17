import { expect, test, type Page } from '@playwright/test';
import { bundle, openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The volume snapshot on a real WebGPU device: the `volume` kernel against the CPU's `extractVolume`, on the same fields and on the same
 * world stepped by each backend, and what a volume read costs on the GPU and on the CPU solver in a real Web Worker.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'volume.ts', { '/worker.js': await bundle('src/lib/experiments/airflow/solver/cpu/worker.ts') });
});

const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).volume[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;

test('on the same fields, the GPU kernel averages every block as the CPU does, on whole and partial blocks', async () => {
	// Strides of 1 (the studio at 0.2 m), uneven blocks (the house at 0.075 m: 3 × 2 × 3 over 192 × 32 × 128), and two in between.
	for (const [plan, h] of [
		['studio', 0.2],
		['two-bedroom', 0.15],
		['one-bedroom', 0.1],
		['house', 0.075]
	] as const) {
		const r = await call('sameFields', plan, h);
		console.log(`${plan} at ${h} m: ${r.cells} volume cells ${JSON.stringify(r.gpuSpec)}, ${Object.entries(r.lanes).map(([lane, d]: [string, any]) => `${lane} ${d.maxAbs.toExponential(1)}`).join(', ')}`);
		expect(r.gpuSpec).toEqual(r.cpuSpec);
		// The share of air is a ratio of two counts, which WGSL may divide a unit in the last place off the correctly rounded value.
		for (const lane of ['u', 'v', 'w', 'air', 'theta', 'particulates']) expect(r.lanes[lane].maxAbs, `${plan} ${lane}`).toBeLessThan(1e-6);
	}
});

test('the same breezy world stepped on each backend gives volumes that agree as closely as the fields do', async () => {
	const r = await call('sameWorld', 'two-bedroom', 0.15, 40);
	console.log(JSON.stringify(r));
	expect(r.fastest, 'the breeze is in it').toBeGreaterThan(0.3);
	expect(r.lanes.air.maxAbs).toBeLessThan(1e-6);
	for (const lane of ['u', 'v', 'w']) expect(r.lanes[lane].maxAbs, lane).toBeLessThan(2e-3 * r.fastest);
	expect(r.lanes.theta.maxAbs).toBeLessThan(1e-3);
	expect(r.lanes.particulates.rel).toBeLessThan(2e-3);
});

test('what a volume read costs: the GPU kernel and read back, and the CPU in a real Web Worker', async () => {
	test.setTimeout(300_000);
	const rows: string[] = [];
	for (const [plan, h] of [
		['two-bedroom', 0.075],
		['house', 0.075],
		['two-bedroom', 0.1],
		['two-bedroom', 0.15]
	] as const) {
		const r = await call('costs', plan, h, 'gpu');
		rows.push(`GPU ${plan} ${h} m (${r.cells} cells, volume ${r.volumeCells}): snapshot ${r.without.toFixed(2)} ms, with the volume ${r.withVolume.toFixed(2)} ms (+${r.extra.toFixed(2)}), kernel ${r.kernel.toFixed(3)} ms`);
		expect(r.extra).toBeLessThan(25);
	}
	for (const [plan, h] of [
		['two-bedroom', 0.2],
		['house', 0.2],
		['studio', 0.15]
	] as const) {
		const r = await call('costs', plan, h, 'worker', 15, 1);
		rows.push(`Worker ${plan} ${h} m (${r.cells} cells, volume ${r.volumeCells}): snapshot ${r.without.toFixed(2)} ms, with the volume ${r.withVolume.toFixed(2)} ms (+${r.extra.toFixed(2)})`);
		expect(r.extra).toBeLessThan(40);
	}
	console.log(rows.join('\n'));
});
