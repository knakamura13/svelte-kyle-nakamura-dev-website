import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A GPU snapshot is encoded at once and read back later, and the page goes on changing the setup in between. Everything it reports
 * must be of the moment it was asked for: a browser tour logged "Cannot read properties of null (reading '0')" from a snapshot that
 * was in flight when the visitor added a box fan, because the fan flows were read with the fan count of after the read, not of before.
 */

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'snapshots.ts');
});

test('fans added and removed while snapshots are in flight: every snapshot resolves, with a flow for each fan it was asked with', async () => {
	// 25 rounds go through every change of count in the cycle (0, 1, 3, 2, 0, 2, 1, 3, 0) almost three times, and end with three fans.
	const r = await page.evaluate(() => (window as any).snapshots.fansComeAndGo(25));
	console.log(JSON.stringify(r.results.map((x: any) => `${x.asked}->${x.got}${x.error ? ` ${x.error}` : ''}`)));
	for (const [n, result] of r.results.entries()) {
		expect(result.error, `round ${n}`).toBeUndefined();
		expect(result.got, `round ${n}: one flow per fan the backend had when asked`).toBe(result.asked);
		expect(result.finite, `round ${n}`).toBe(true);
	}
	expect(r.settled.expected).toBe(3);
	expect(r.settled.fans).toBe(3);
	for (const flow of r.settled.flows) expect(flow, 'a running box fan moves air').toBeGreaterThan(0.05);
});
