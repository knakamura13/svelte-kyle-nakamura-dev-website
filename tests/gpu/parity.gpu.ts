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

test('turbulence (eddy viscosity) matches cpu/turbulence.ts', async () => {
	const c = await call<Comparison>(page, 'turbulenceParity', 4);
	report('turbulence', c);
	expect(c.rel).toBeLessThan(TOLERANCE);
});

test('the pressure solve (assembly, V-cycles, mean removal, projection) matches cpu/pressure.ts', async () => {
	for (const [nx, ny, nz] of [
		[12, 10, 8],
		[24, 20, 14]
	]) {
		const c = await call<{ levels: string; velocity: Comparison; pressure: Comparison }>(page, 'pressureParity', 5, nx, ny, nz);
		report(`pressure ${c.levels} velocity`, c.velocity);
		report(`pressure ${c.levels} p`, c.pressure);
		// The V-cycle sums many terms in a different order on the GPU (red-black, reductions), so rounding grows.
		expect(c.velocity.rel).toBeLessThan(1e-4);
		expect(c.pressure.rel).toBeLessThan(1e-4);
	}
});

test('steps of the lid-driven cavity match CpuSolver', async () => {
	for (const steps of [3, 20]) {
		const c = await call<{ velocity: Comparison; pressure: Comparison }>(page, 'cavityParity', 32, steps);
		report(`cavity ${steps} steps velocity`, c.velocity);
		report(`cavity ${steps} steps pressure`, c.pressure);
		expect(c.velocity.rel).toBeLessThan(1e-4);
		expect(c.pressure.rel).toBeLessThan(1e-4);
	}
});

test('steps of the heated cavity (buoyancy, scalars, particulates) match CpuSolver, 2D and 3D with turbulence', async () => {
	for (const [nz, turbulent] of [
		[1, false],
		[8, true]
	] as const) {
		const c = await call<Record<'velocity' | 'theta' | 'particulates' | 'nut', Comparison>>(page, 'heatedParity', 32, nz, 10, turbulent);
		for (const [name, comparison] of Object.entries(c)) report(`heated nz ${nz} ${name}`, comparison);
		expect(c.velocity.rel).toBeLessThan(1e-4);
		expect(c.theta.rel).toBeLessThan(1e-4);
		expect(c.particulates.rel).toBeLessThan(1e-4);
		if (turbulent) expect(c.nut.rel).toBeLessThan(1e-4);
	}
});

test('steps of a room with windows, a window fan, a fan, a source and a purifier match CpuSolver', async () => {
	const c = await call<{ outlet: boolean } & Record<'velocity' | 'pressure' | 'theta' | 'particulates' | 'nut' | 'fanFlow', Comparison>>(page, 'devicesParity', 10);
	expect(c.outlet).toBe(true);
	for (const [name, comparison] of Object.entries(c)) if (name !== 'outlet') report(`room ${name}`, comparison as Comparison);
	expect(c.velocity.rel).toBeLessThan(1e-4);
	expect(c.pressure.rel).toBeLessThan(1e-4);
	expect(c.theta.rel).toBeLessThan(1e-4);
	expect(c.particulates.rel).toBeLessThan(1e-4);
	expect(c.nut.rel).toBeLessThan(1e-4);
	expect(c.fanFlow.rel).toBeLessThan(1e-4);
	// The particulate mass log the Physics panel's mass balance is built from.
	for (const [name, comparison] of Object.entries(c)) if (name.startsWith('tally')) expect((comparison as Comparison).rel, name).toBeLessThan(1e-4);
});

test('the point sampler and the slice match cpu/readouts.ts on the same state', async () => {
	const c = await call<Record<'sample' | 'slice', Comparison>>(page, 'readoutParity', 9);
	report('readout sample', c.sample);
	report('readout slice', c.slice);
	expect(c.sample.rel).toBeLessThan(TOLERANCE);
	expect(c.slice.rel).toBeLessThan(TOLERANCE);
});

test('face updates (geometryScatter) leave the packed geometry the host expects', async () => {
	const c = await call<Comparison>(page, 'faceUpdateParity', 11);
	report('face updates', c);
	expect(c.maxAbs).toBe(0);
});

test('the diagnostics pass (measure, measureFinish) matches cpu/solver.ts measure and cpu/scalars.ts maxCfl', async () => {
	const c = await call<Record<string, Comparison>>(page, 'measureParity', 12);
	for (const [name, comparison] of Object.entries(c)) report(`measure ${name}`, comparison);
	for (const comparison of Object.values(c)) expect(comparison.rel).toBeLessThan(TOLERANCE);
});

test('the room statistics kernel matches cpu/readouts.ts roomStats', async () => {
	const c = await call<Record<string, Comparison>>(page, 'roomsParity', 13);
	for (const [name, comparison] of Object.entries(c)) report(`rooms ${name}`, comparison);
	for (const comparison of Object.values(c)) expect(comparison.rel).toBeLessThan(TOLERANCE);
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
