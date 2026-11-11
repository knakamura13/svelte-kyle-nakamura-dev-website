import { test, type Page } from '@playwright/test';

/**
 * Skips the test when this browser cannot make a WebGL 2 context. The Airflow stage needs one (three.js has no WebGL 1 path), and
 * without it the stage reports `data-state="unsupported"` and draws no world, so there is nothing for the test to look at. This asks
 * the browser for the capability itself, not for a CI variable: a laptop without WebGL 2 skips the same way.
 */
export async function requireWebGL2(page: Page) {
	const webgl2 = await page.evaluate(() => {
		try {
			return document.createElement('canvas').getContext('webgl2') !== null;
		} catch {
			return false;
		}
	});
	test.skip(!webgl2, 'This browser has no WebGL 2, so the Airflow stage has no world to draw.');
}
