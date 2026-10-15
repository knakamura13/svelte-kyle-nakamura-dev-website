import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The choice of backend and the session against a real WebGPU device, which the Node tests cannot have: the device is
 * destroyed underneath a running backend, as a driver reset or the browser's GPU process crashing would, and the page has
 * to notice, stop stepping it and carry on on the worker (the worker itself is stood in for by the solver host behind a
 * message channel in the page; the real `Worker` is covered by the end-to-end test in tests/airflow.spec.ts).
 */

let page: Page;
test.beforeEach(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'choice.ts');
});
test.afterEach(async () => {
	await page.close();
});

const call = (name: string) => page.evaluate((name) => (window as any).choice[name](), name) as Promise<any>;

test('a device destroyed under a running backend is reported as lost, and the choice moves to the worker at 0.2 m cells', async () => {
	const r = await call('lostDeviceMovesTheChoiceToTheWorker');
	console.log(JSON.stringify(r));
	expect(r.before).toEqual({ kind: 'webgpu', h: 0.15, steps: 5, failures: 0 });
	expect(r.failures).toHaveLength(1);
	expect(r.failures[0].reason).toBe('lost');
	expect(r.failures[0].message).toContain('graphics device was lost');
	expect(r.after.kind).toBe('cpu');
	expect(r.after.h).toBe(0.2);
	expect(r.after.steps).toBe(5);
	expect(r.after.finite).toBe(true);
	expect(r.warnings.filter((w: string) => w.includes('lost'))).toHaveLength(1);
	expect(r.errors).toEqual([]);
});

test('the session drops a world whose device was destroyed, and carries on with a new one on the worker, saying so', async () => {
	const r = await call('sessionSurvivesALostDevice');
	console.log(JSON.stringify(r));
	expect(r.first.backend).toBe('webgpu');
	expect(r.first.cellSize).toBe(0.15);
	expect(r.first.status).toBe('running');
	expect(r.first.time).toBeGreaterThan(0.1);
	expect(r.first.slice).toBe(true);

	expect(r.dropped.world).toBe(true);
	expect(r.dropped.status).toBe('loading');
	expect(r.dropped.announced).toHaveLength(1);
	expect(r.dropped.announced[0]).toContain('graphics device was lost');

	expect(r.second.backend).toBe('cpu');
	expect(r.second.reduced).toBe(true);
	expect(r.second.cellSize).toBe(0.2);
	expect(r.second.status).toBe('running');
	expect(r.second.time, 'the air starts again from rest, and runs').toBeGreaterThan(0.1);
	expect(r.second.slice).toBe(true);
	expect(Number.isFinite(r.second.maxSpeed)).toBe(true);
	expect(r.errors, 'a lost device is not a fault of the page').toEqual([]);
});
