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

/** The stage's frame rate over two seconds, counted from its camera readouts (`data-zoom`), which it writes each time it draws a frame. */
async function framesPerSecond(page: Page): Promise<number> {
	return page.getByRole('application', { name: /^The air in the/ }).evaluate(
		(view) =>
			new Promise<number>((resolve) => {
				let writes = 0;
				const observer = new MutationObserver((records) => {
					for (const record of records) if (record.attributeName === 'data-zoom') writes++;
				});
				observer.observe(view, { attributes: true, attributeFilter: ['data-zoom'] });
				setTimeout(() => {
					observer.disconnect();
					resolve(writes / 2);
				}, 2000);
			})
	);
}

/**
 * Runs a check that waits for the camera to move. If it fails, the stage's frame rate is measured. When the stage draws fewer than
 * `minFps` frames a second, the test is skipped with that rate in the reason, because a camera that moves a few times in several
 * seconds cannot show a drift; otherwise the failure stands. Only a failing check is measured, so a browser that draws well is timed
 * as before.
 */
export async function unlessStalled(page: Page, check: () => Promise<unknown>, minFps = 2) {
	try {
		await check();
	} catch (error) {
		const fps = await framesPerSecond(page);
		if (fps < minFps) test.skip(true, `The stage drew ${fps.toFixed(1)} frames a second with WebGL in software here, under ${minFps}, so the camera's movement cannot be seen in the time the test allows.`);
		throw error;
	}
}
