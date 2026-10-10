import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'world.ts');
});

const call = (name: string, ...args: unknown[]) => page.evaluate(([name, args]) => (window as any).world[name as string](...(args as unknown[])), [name, args] as const) as Promise<any>;

test('GpuBackend matches CpuBackend through World: two-bedroom home, west wind, two windows, one fan, 20 steps', async () => {
	// dt 0.01 s keeps the fan jet (about 10 m/s) under one cell per step at h = 0.15 m.
	const r = await call('windyHome', 20, 0.15, 0.01);
	console.log(JSON.stringify(r));
	expect(r.kind).toEqual(['cpu', 'webgpu']);
	expect(r.fluidCells[1]).toBe(r.fluidCells[0]);
	expect(r.fluid.maxAbs).toBe(0);
	// f32 kernels against the CPU, 20 steps of a flow with a fan jet and wind-driven openings.
	expect(r.slice.rel).toBeLessThan(1e-3);
	const { cpu, gpu } = r.diagnostics;
	expect(gpu.steps).toBe(cpu.steps);
	expect(Math.abs(gpu.maxSpeed - cpu.maxSpeed) / cpu.maxSpeed).toBeLessThan(1e-3);
	expect(Math.abs(gpu.cfl - cpu.cfl) / cpu.cfl).toBeLessThan(1e-3);
	expect(Math.abs(gpu.divergence - cpu.divergence)).toBeLessThan(1e-3 * Math.max(cpu.divergence, 1e-3) + 1e-4);
	expect(r.fanFlow.gpu.length).toBe(r.fanFlow.cpu.length);
	r.fanFlow.gpu.forEach((q: number, n: number) => expect(Math.abs(q - r.fanFlow.cpu[n]) / Math.abs(r.fanFlow.cpu[n])).toBeLessThan(1e-3));
	expect(r.rooms.rel).toBeLessThan(1e-3);
	expect(r.sampleCount[1]).toBe(r.sampleCount[0]);
	expect(r.samples.rel).toBeLessThan(1e-3);
	expect(r.tracers).toBe(4 * 500);
	expect(r.smoke).toBe(4 * 300);
	expect(r.tracersFinite).toBe(true);
	expect(r.writeDoubled.maxAbs).toBe(0);
	expect(r.writeRestored.maxAbs).toBe(0);
});

test('cross-ventilation scenario, 10 simulated seconds: the flow through the west and east windows matches', async () => {
	const r = await call('crossVentilation', 10, 0.2);
	console.log(JSON.stringify(r));
	for (const facade of ['west', 'east'] as const) expect(Math.abs(r.gpu[facade] - r.cpu[facade]) / Math.abs(r.cpu[facade])).toBeLessThan(1e-2);
});

test('step time of the house plan on the GPU backend', async () => {
	for (const h of [0.2, 0.15, 0.1, 0.075]) {
		const r = await call('houseStepTime', h, 20);
		console.log(`house h ${h} m: ${r.nx}x${r.ny}x${r.nz} = ${r.cells} cells (${r.fluidCells} air): ${r.ms.toFixed(2)} ms per step`);
	}
});

test('GpuBackend profiling readout on the house plan (timestamp queries, 256-byte slots)', async () => {
	const r = await call('houseProfile', 0.1);
	console.log(`house h 0.1 m profile: ${r.groups ? Object.entries(r.groups).map(([g, ms]) => `${g} ${(ms as number).toFixed(3)} ms`).join(', ') : 'timestamp-query not offered'}`);
	expect(r.validation).toBe('');
	if (r.groups) for (const ms of Object.values(r.groups)) expect(ms as number).toBeGreaterThanOrEqual(0);
});
