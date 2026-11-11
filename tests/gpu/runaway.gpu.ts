import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The runaway guard on the WebGPU solver (#59): the page's session runs a world on the real device, the clock is paused so no step
 * comes between, and `writeFields` puts a NaN or 50 m/s into the air. The session must stop the run, drop the world and its picture,
 * say so once, and start again on a reset. A GPU's `max` may pass over a NaN, so the NaN case also shows which of the device's
 * numbers carried it.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'runaway.ts');
});
test.afterAll(async () => {
	await page.close();
});

for (const kind of ['non-finite', 'too-fast'] as const)
	test(`${kind === 'non-finite' ? 'a NaN' : '50 m/s'} written into the air on the GPU with the clock paused stops the run, says so once, and a reset starts it again`, async () => {
		const r = await page.evaluate((kind) => (window as any).runaway.runAway(kind), kind);
		console.log(JSON.stringify(r));
		expect(r.before).toEqual({ status: 'running', backend: 'webgpu', volume: true });
		expect(r.direct.runaway, 'the device reports the written air').toBe(kind);
		if (kind === 'too-fast') expect(Number(r.direct.maxSpeed)).toBeGreaterThan(40);
		expect(r.stopped).toMatchObject({ caught: true, status: 'runaway', worldDropped: true, volume: false, probes: 0, rooms: 0, said: 1 });
		expect(r.stopped.note).toContain(kind === 'too-fast' ? 'its air reached 50 m/s' : 'its numbers stopped being numbers');
		expect(r.waiting, 'nothing is built again until the visitor asks').toEqual({ status: 'runaway', world: false });
		expect(r.after).toEqual({ status: 'running', volume: true, backend: 'webgpu' });
	});
