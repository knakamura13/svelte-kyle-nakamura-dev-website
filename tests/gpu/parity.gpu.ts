import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';
import type { Comparison } from './entries/parity';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** f32 kernels against the f32 CPU reference: the same arithmetic, so differences stay at rounding level. */
const TOLERANCE = 1e-5;

function call<T>(page: Page, name: string, ...args: unknown[]) {
	return page.evaluate(([name, args]) => (window as any).parity[name as string](...(args as unknown[])), [name, args] as const) as Promise<T>;
}

function report(label: string, c: Comparison) {
	console.log(`${label}: rel ${c.rel.toExponential(2)} (max |diff| ${c.maxAbs.toExponential(2)}, scale ${c.scale.toExponential(2)}) worst ${c.worst}`);
}

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'parity.ts');
});

test('diffuse matches cpu/diffuse.ts on a random field', async () => {
	for (const seed of [1, 2]) {
		const c = await call<Comparison>(page, 'diffuseParity', seed);
		report(`diffuse seed ${seed}`, c);
		expect(c.rel).toBeLessThan(TOLERANCE);
	}
});

test('advection matches cpu/advect.ts, semi-Lagrangian and MacCormack', async () => {
	for (const maccormack of [false, true]) {
		const c = await call<Comparison>(page, 'advectParity', 3, maccormack);
		report(`advect ${maccormack ? 'maccormack' : 'semi-lagrangian'}`, c);
		expect(c.rel).toBeLessThan(TOLERANCE);
	}
});

test('a few steps of the lid-driven cavity match CpuSolver', async () => {
	const c = await call<{ velocity: Comparison; pressure: Comparison }>(page, 'cavityParity', 32, 3);
	report('cavity velocity', c.velocity);
	report('cavity pressure', c.pressure);
	expect(c.velocity.rel).toBeLessThan(1e-4);
	expect(c.pressure.rel).toBeLessThan(1e-4);
});

test('step time', async () => {
	for (const [nx, ny, nz] of [
		[64, 32, 48],
		[128, 48, 96]
	]) {
		const t = await call<{ cells: number; ms: number }>(page, 'stepTime', nx, ny, nz, 30);
		console.log(`step time ${nx}x${ny}x${nz} (${t.cells} cells): ${t.ms.toFixed(2)} ms`);
	}
});
