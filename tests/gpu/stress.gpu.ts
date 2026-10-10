import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The random-setup stress of tests/solver/robustness.spec.ts on GpuBackend at the cell sizes the GPU path runs, with
 * the same seeds (plan index · 1000 + trial + 1 for openings and weather, 50000 + plan index · 1000 + trial for fans
 * and purifiers) and thresholds, plus long runs where growth would compound. A failing case is rerun on CpuBackend
 * and both results are logged. `STRESS_PLANS=studio,one-bedroom` and `STRESS_TRIALS=5` choose the sweep.
 */
const PLANS = (process.env.STRESS_PLANS ?? 'studio,one-bedroom').split(',');
const TRIALS = Number(process.env.STRESS_TRIALS ?? 5);
const SIZES: Record<string, number[]> = { studio: [0.15, 0.1, 0.075, 0.05] };
const sizesFor = (plan: string) => SIZES[plan] ?? [0.15, 0.1, 0.075];
/** Failing cases are rerun on CpuBackend at this cell size and coarser (`STRESS_CPU_RERUN_BELOW=0.05` for all of them). */
const CPU_RERUN_BELOW = Number(process.env.STRESS_CPU_RERUN_BELOW ?? 0.1);

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'stress.ts');
});

const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).stress[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;
const failed = (r: any) => r.nonFinite.length > 0 || !(r.maxSpeed < 40) || !(r.divergence < 0.05);
const line = (r: any) => `fastest ${Number(r.maxSpeed).toFixed(2)} m/s, divergence ${Number(r.divergence).toExponential(2)}${r.nonFinite.length ? `, NOT FINITE: ${r.nonFinite.join(' ')}` : ''}`;

async function check(kind: 'randomOpenings' | 'randomDevices', plan: string, seed: number, h: number) {
	const r = await call(kind, plan, seed, h, 'gpu');
	console.log(`${failed(r) ? 'FAIL' : 'ok  '} gpu ${kind} ${r.where} (${r.cells}): ${line(r)}`);
	if (failed(r) && h < CPU_RERUN_BELOW) console.log(`     cpu rerun skipped: below ${CPU_RERUN_BELOW} m the CPU takes too long for this sweep; rerun this seed on CpuBackend by hand before blaming the GPU`);
	if (failed(r) && h >= CPU_RERUN_BELOW) {
		const c = await call(kind, plan, seed, h, 'cpu');
		console.log(`     cpu ${kind} same case: ${c.stoppedAt ? `also fails, past the thresholds at step ${c.stoppedAt} of 100 (stopped there): ` : ''}${line(c)}`);
	}
	expect.soft(r.nonFinite, `${r.where}: non-finite fields`).toEqual([]);
	expect.soft(r.maxSpeed, `${r.where}: fastest air`).toBeLessThan(40);
	expect.soft(r.divergence, `${r.where}: divergence`).toBeLessThan(0.05);
}

for (const plan of PLANS)
	for (const h of sizesFor(plan)) {
		test(`${plan} at ${h} m: random openings and weather, and random fans and purifiers, on GpuBackend`, async () => {
			test.setTimeout(600_000);
			const index = await call('planIndex', plan);
			for (let trial = 0; trial < TRIALS; trial++) await check('randomOpenings', plan, index * 1000 + trial + 1, h);
			for (let trial = 0; trial < TRIALS; trial++) await check('randomDevices', plan, 50000 + index * 1000 + trial, h);
		});

		test(`${plan} at ${h} m: 30 s with a 3 m/s west wind, and 30 s still at −5 °C outside, on GpuBackend`, async () => {
			test.setTimeout(600_000);
			for (const kind of ['wind', 'cold'] as const) {
				const r = await call('longRun', plan, h, kind, 'gpu');
				console.log(`${failed(r) ? 'FAIL' : 'ok  '} gpu long ${r.where} (${r.cells}): ${r.series.map((s: any) => `${s.step}: ${s.maxSpeed.toFixed(2)} m/s ${s.divergence.toExponential(1)}`).join(' | ')}${r.nonFinite.length ? ` NOT FINITE: ${r.nonFinite.join(' ')}` : ''}`);
				expect.soft(r.nonFinite, `${r.where}: non-finite fields`).toEqual([]);
				for (const s of r.series) {
					expect.soft(s.maxSpeed, `${r.where}, step ${s.step}: fastest air`).toBeLessThan(40);
					expect.soft(s.divergence, `${r.where}, step ${s.step}: divergence`).toBeLessThan(0.05);
				}
			}
		});
	}
