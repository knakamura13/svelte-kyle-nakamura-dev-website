import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * #93's first two tests on the GPU, as tests/solver/sealed-home.spec.ts runs them on the CPU: the two-bedroom home at the coarse
 * grid, in a fresh breeze from the west, 30 s. Same cases, same bounds.
 */

const H = 0.2;
const WEST = ['dining-window', 'living-window-1', 'living-window-2'];

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'sealed.ts');
});

const run = (name: string) => page.evaluate(([name, h]) => (window as any).sealed.run(name, h), [name, H] as const) as Promise<any>;

test('sealed home on the GPU: every window and door shut, a fresh breeze from the west: no flow passes through any opening beyond rounding', async () => {
	test.setTimeout(600_000);
	const r = await run('sealed');
	expect(r.kind, 'the GPU backend ran').toBe('webgpu');
	expect(r.finite, 'every reading finite').toBe(true);
	const peak = Math.max(...r.by.map((o: any) => o.peak));
	const worst = r.by.reduce((a: any, b: any) => (b.peak > a.peak ? b : a));
	console.log(
		`sealed home on the GPU: largest flow through any opening face ${peak.toExponential(2)} m³/s (${worst.id}), fastest air ${r.maxSpeed.toExponential(2)} m/s`
	);
	expect(r.by.length).toBeGreaterThan(0);
	for (const o of r.by) expect(o.peak, `${o.id}: flow through its faces, m³/s`).toBeLessThan(1e-6);
	expect(r.maxSpeed, 'fastest air in the home, m/s').toBeLessThan(1e-3);
	expect(r.maxSpeed * 0.05, 'CFL check').toBeLessThan(H);
});

test('windward windows only on the GPU: the west windows carry a small fraction of the flow they carry with the east windows open too', async () => {
	test.setTimeout(900_000);
	const both = await run('both');
	const windward = await run('windward');
	expect(both.kind).toBe('webgpu');
	expect(windward.kind).toBe('webgpu');
	expect(both.finite && windward.finite, 'every reading finite').toBe(true);
	const west = (r: any) => r.by.filter((o: any) => WEST.includes(o.id)).reduce((sum: number, o: any) => sum + o.net, 0);
	const bothIn = west(both);
	const windwardIn = west(windward);
	const fraction = windwardIn / bothIn;
	console.log(
		`windward only on the GPU: west windows ${windwardIn.toFixed(4)} m³/s with the east shut, ${bothIn.toFixed(4)} with the east open too: fraction ${fraction.toFixed(3)} (fastest air ${windward.maxSpeed.toFixed(3)} and ${both.maxSpeed.toFixed(3)} m/s)`
	);
	expect(bothIn).toBeGreaterThan(0.1);
	expect(Math.abs(fraction), 'windward-only flow as a share of the flow with the east open').toBeLessThan(0.2);
});
