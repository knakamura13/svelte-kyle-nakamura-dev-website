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

/** The name of the WebGL renderer (`WEBGL_debug_renderer_info`), or '' where the browser does not say. */
export async function webglRenderer(page: Page): Promise<string> {
	return page.evaluate(() => {
		const gl = document.createElement('canvas').getContext('webgl2');
		const info = gl?.getExtension('WEBGL_debug_renderer_info');
		return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
	});
}

/**
 * Counts the frames the page draws with WebGL from the next navigation on: an animation frame in which any WebGL draw call is made
 * counts once, whatever drew it. Call it before `page.goto`. The page's own code is not touched: the count comes from wrapping the
 * browser's `requestAnimationFrame` and the WebGL draw calls, and it ticks whenever the stage draws, whether the camera moves or not.
 */
export async function countFrames(page: Page) {
	await page.addInitScript(() => {
		const drawn: number[] = [];
		let turn = 0;
		let counted = -1;
		const request = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (callback) =>
			request((time) => {
				turn = time;
				callback(time);
			});
		const contexts = [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype];
		for (const proto of contexts) {
			if (!proto) continue;
			for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'] as const) {
				const original = (proto as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
				if (typeof original !== 'function') continue;
				(proto as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
					if (counted !== turn) {
						counted = turn;
						drawn.push(performance.now());
						if (drawn.length > 20_000) drawn.splice(0, 10_000);
					}
					return original.apply(this, args);
				};
			}
		}
		Object.defineProperty(window, '__framesDrawn', { value: drawn });
	});
}

/**
 * The page's drawn frames (`countFrames`) since `since` (the page's `performance.now()`, ms), and the frame rate over that span. Null
 * when the count was not installed.
 */
export async function framesSince(page: Page, since: number): Promise<{ frames: number; seconds: number; fps: number; longest: number } | null> {
	return page.evaluate((since) => {
		const drawn = (window as unknown as { __framesDrawn?: number[] }).__framesDrawn;
		if (!drawn) return null;
		const now = performance.now();
		const times = drawn.filter((t) => t >= since);
		const seconds = (now - since) / 1000;
		let longest = 0;
		for (let i = 1; i < times.length; i++) longest = Math.max(longest, times[i] - times[i - 1]);
		if (times.length) longest = Math.max(longest, times[0] - since, now - times[times.length - 1]);
		else longest = now - since;
		return { frames: times.length, seconds, fps: times.length / Math.max(seconds, 1e-3), longest: longest / 1000 };
	}, since);
}

/** The page's clock (`performance.now()`, ms): where a span for `framesSince` starts. */
export const pageNow = (page: Page) => page.evaluate(() => performance.now());

/**
 * Runs a check, and if it fails, skips the test when the page drew fewer than `minFps` frames a second while the check waited, as
 * `countFrames` counts them (it must be installed before the page loads). `because` says why the check cannot hold below that rate,
 * from the page's design. The rate goes in the reason and in an annotation, so a skip on CI says what CI drew. Otherwise the failure
 * stands. A check that passes is never measured or skipped.
 */
export async function unlessDrawnUnder(page: Page, minFps: number, because: string, check: () => Promise<unknown>) {
	const since = await pageNow(page);
	try {
		await check();
	} catch (error) {
		const drawn = await framesSince(page, since).catch(() => null);
		if (!drawn) throw error;
		const rate = `${drawn.frames} frames in ${drawn.seconds.toFixed(1)} s (${drawn.fps.toFixed(1)} a second, the longest gap ${drawn.longest.toFixed(2)} s)`;
		test.info().annotations.push({ type: 'frames', description: `The page drew ${rate} while a failing check waited.` });
		test.skip(drawn.fps < minFps, `The page drew ${rate} here, under ${minFps} a second: ${because}`);
		throw error;
	}
}

