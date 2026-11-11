import { expect, test, type Page } from '@playwright/test';
import { openAirflow, status } from './dock';

/**
 * A hidden tab does not run the simulation (#64). The page's frames stop while `document.hidden` is true, and the clock is
 * carried by those frames, so simulated time must stand still while the tab is hidden and go on once it is shown again. Run in
 * every browser: Chromium, Firefox and WebKit each run the page here on the CPU worker, since none exposes WebGPU to Playwright.
 *
 * Playwright cannot hide a tab, so the test sets `document.hidden` and `visibilityState` itself and fires `visibilitychange`, which
 * is what a browser does when its tab is switched away from.
 */

/** The coarsest grid, pinned, so no auto-tuner warm-up loads a busy machine (as airflow-runaway.spec.ts does). */
const PAGE = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';

/** The simulated clock's readout: "m:ss", one second at a time. */
const clock = (page: Page) => page.locator('.clock-time');

async function setHidden(page: Page, hidden: boolean) {
	await page.evaluate((hidden) => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
		document.dispatchEvent(new Event('visibilitychange'));
	}, hidden);
}

test.use({ locale: 'en-US' });

test('simulated time stands still while the tab is hidden, and goes on once it is shown again', async ({ page }) => {
	test.setTimeout(120_000);
	await openAirflow(page, PAGE);
	await expect(status(page)).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
	// Some simulated time first, so that a clock stuck at 0:00 cannot pass for a paused one.
	await expect(clock(page)).not.toHaveText('0:00', { timeout: 30_000 });

	await setHidden(page, true);
	// Let the frames that were already scheduled land, then wait well past a second of real time: at 1× the clock would have
	// moved on by several seconds.
	await page.waitForTimeout(1_000);
	const hiddenAt = await clock(page).textContent();
	await page.waitForTimeout(4_000);
	expect(await clock(page).textContent(), 'simulated time while the tab is hidden').toBe(hiddenAt);

	await setHidden(page, false);
	await expect.poll(async () => clock(page).textContent(), { timeout: 20_000, message: 'simulated time once the tab is shown again' }).not.toBe(hiddenAt);
	await expect(status(page)).toHaveAttribute('data-status', 'running');
});
