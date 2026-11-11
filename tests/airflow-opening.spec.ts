import { expect, test, type Page } from '@playwright/test';
import { planById } from '../src/lib/experiments/airflow/homes/plans';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { OPENING_END } from '../src/lib/experiments/airflow/scene/camera/opening';
import { HOME_ZOOM } from '../src/lib/experiments/airflow/scene/camera/sims';
import { blankSetup } from '../src/lib/experiments/airflow/state';
import { cappedClock, countFrames, framesSince, pageNow, requireWebGL2 } from './webgl';

/**
 * The first seconds of a visit (#81 and #82): the loading screen while the world loads, compiles and measures the device, then the
 * opening, in which the camera drifts from the default view to the living room while the cross-ventilation Scenario runs, and the one
 * hint, at the Build tool. Reduced motion opens at the drift's end, a share link opens on its setup, and a reload in the same visit does
 * not play the opening again. The camera's state is read from the Stage's `data-zoom`, `data-yaw` (the way it looks, degrees clockwise
 * from north) and `data-focus` (x,z in metres), which the host writes as it draws, and the drift's from its `data-opening` (playing,
 * ended or stopped), written with them.
 */

const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const hint = (page: Page) => page.getByRole('note').filter({ hasText: 'Drop a fan' });
const camera = async (page: Page) => {
	const stage = view(page);
	const [zoom, yaw, focus] = await Promise.all([stage.getAttribute('data-zoom'), stage.getAttribute('data-yaw'), stage.getAttribute('data-focus')]);
	return { zoom: Number(zoom), yaw: Number(yaw), focus: focus ?? '' };
};
/** The world is on show: the Stage is live and the loading screen is on its way out. */
async function shown(page: Page) {
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
}
/** Where the drift ends in the two-bedroom: the living room's middle (2.4, 5.4) moved as `OPENING_END` says. */
const END = { zoom: OPENING_END.zoom, yaw: OPENING_END.heading, focus: `${(2.4 + OPENING_END.dx).toFixed(2)},${(5.4 + OPENING_END.dz).toFixed(2)}` };

/**
 * The drift keeps its own clock: each frame moves it on by the time since the last, but by a quarter of a second at most
 * (`AirflowStage.tick`), so a tab that was hidden does not jump. At 4 frames a second or more that is the page's clock. Below it the drift
 * runs slower: at one frame a second, as CI's WebKit draws, its 6 s take 24. So the checks wait on the drift itself, the camera it moves and
 * its `data-opening`, with room for that, and time it on the clock it keeps (`cappedClock`).
 */
const CAP = 0.25;
/** Long enough for the drift to move the camera a little (1.5 s of its clock, 6 frames), at one frame every 5 s. */
const MOVES = 30_000;
/** Long enough for the whole drift (24 frames) at one frame every 2.5 s. */
const ARRIVES = 60_000;

test.use({ viewport: { width: 1280, height: 800 } });

// Software WebGL (the headless CI browsers) compiles the world's shaders for many seconds, and then draws a frame or two a second, so a
// test that waits for the world and then for the drift gets 120 s.
test.beforeEach(async ({ page }) => {
	test.setTimeout(120_000);
	await requireWebGL2(page);
	await countFrames(page);
});

test.describe('the loading screen', () => {
	test('is in the page from its first paint, fills one bar as the world fetches, compiles and warms up, then fades into the world and leaves', async ({ page }) => {
		// A browser that draws WebGL in software (the headless shells) compiles the world's shaders for many seconds.
		test.setTimeout(90_000);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		// The server's HTML already has it, so there is no blank page before the script runs.
		const html = await (await page.request.get('/experiments/airflow')).text();
		expect(html).toContain('Airflow, room by room');
		expect(html).toMatch(/role="progressbar"/);

		await page.goto('/experiments/airflow', { waitUntil: 'commit' });
		const screen = page.locator('.loading');
		const bar = screen.getByRole('progressbar', { name: 'Loading the world' });
		await expect(bar).toBeVisible();
		await expect(screen).toContainText('Airflow, room by room');
		await expect(screen).toContainText('Watch the air come in');
		await expect(screen.locator('.stages li')).toContainText(['Fetching the home', 'Compiling shaders', 'Measuring this device']);
		// The HUD waits under it, out of sight and out of reach of Tab and of a screen reader.
		expect(await page.locator('.hud').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
		await expect(page.locator('article.airflow-world')).toHaveAttribute('inert', '');

		// The bar only goes forward, and is full when the world is shown. (Read by its markup: once the world is shown it is hidden from the accessibility tree.)
		const values: number[] = [];
		const deadline = Date.now() + 60_000;
		while ((await view(page).getAttribute('data-state')) !== 'live' && Date.now() < deadline) {
			const value = await page
				.locator('.loading [role="progressbar"]')
				.getAttribute('aria-valuenow', { timeout: 1000 })
				.catch(() => null);
			if (value !== null) values.push(Number(value));
			await page.waitForTimeout(50);
		}
		await shown(page);
		expect(values.length, 'it was seen loading').toBeGreaterThan(0);
		expect(values.every((value, n) => n === 0 || value >= values[n - 1]), `${values.join(' ')}`).toBe(true);
		await expect(screen, 'it leaves the page once it has faded').toHaveCount(0, { timeout: 5_000 });
		await expect(page.locator('article.airflow-world')).not.toHaveAttribute('inert', /.*/);
		await expect.poll(() => page.locator('.hud').evaluate((el) => getComputedStyle(el).opacity), { message: 'and the HUD is up' }).toBe('1');
		// The load is timed, from the start of the navigation to the world on show.
		expect(Number(await view(page).getAttribute('data-first-frame'))).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('the grid the warm-up picks is the grid: it does not change once the world is on show', async ({ page }) => {
		test.setTimeout(90_000);
		await page.goto('/experiments/airflow');
		await shown(page);
		const status = page.locator('.sim-status');
		await expect(status).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 30_000 });
		const cells = () => status.textContent().then((text) => text?.match(/([\d,]+) cells/)?.[1] ?? '');
		const first = await cells();
		expect(first).not.toBe('');
		// Twenty seconds is four times what the old tuner took to restart on a finer grid in view.
		for (let n = 0; n < 10; n++) {
			await page.waitForTimeout(2000);
			expect(await cells(), `after ${2 * (n + 1)} s`).toBe(first);
		}
		await expect(status).not.toContainText(/Restarted|Switched/);
	});
});

test.describe('the opening', () => {
	test('the camera drifts from the default view toward the living room over five to eight seconds, while the Scenario runs, and stops there', async ({ page }) => {
		test.setTimeout(150_000);
		await page.goto('/experiments/airflow');
		await shown(page);
		await expect(page.locator('.hud [data-tool]').first()).toBeVisible();
		await expect(page.getByRole('button', { name: /Scenario/ })).toContainText('Cross-ventilation');
		const start = await camera(page);
		expect(start.zoom, 'it starts on the default view, or just past it').toBeGreaterThan(END.zoom + 0.1);
		expect(start.zoom).toBeLessThanOrEqual(HOME_ZOOM + 1e-9);
		await expect.poll(async () => (await camera(page)).zoom, { message: 'it moves', timeout: MOVES }).toBeLessThan(start.zoom - 0.05);
		await expect(view(page), 'and arrives').toHaveAttribute('data-opening', 'ended', { timeout: ARRIVES });
		const ended = await pageNow(page);
		expect(await camera(page), 'at the drift’s end').toEqual(END);
		// Seconds from the world shown, when the drift starts (`data-first-frame`), to its end, so it is a drift and not a cut, and on time
		// however fast the browser draws: on the clock the drift keeps, which is the page's own at 4 frames a second or more. (Timed from the
		// test's first look, as it was, a page drawing a frame a second has played part of the drift before the test's own reads come back.)
		const began = Number(await view(page).getAttribute('data-first-frame'));
		const took = await cappedClock(page, began, ended, CAP);
		const drawn = await framesSince(page, began);
		test.info().annotations.push({ type: 'frames', description: `The page drew ${drawn?.frames} frames in ${drawn?.seconds.toFixed(1)} s while the drift played, ${took?.toFixed(1)} s on its clock.` });
		expect(took, 'the frames the page drew were counted').not.toBeNull();
		expect(took).toBeGreaterThan(3.5);
		expect(took).toBeLessThan(10);
		await page.waitForTimeout(1500);
		expect(await camera(page), 'and stays there').toEqual(END);
		await expect(page.locator('.sim-status')).toHaveAttribute('data-status', 'running');
	});

	test('anything the visitor does takes the camera at once: a key stops the drift where it is', async ({ page }) => {
		await page.goto('/experiments/airflow');
		await shown(page);
		const start = await camera(page);
		await expect.poll(async () => (await camera(page)).zoom, { timeout: MOVES }).toBeLessThan(start.zoom - 0.03);
		await page.keyboard.press('Shift');
		await expect(view(page)).toHaveAttribute('data-opening', 'stopped');
		const held = await camera(page);
		expect(held.zoom, 'stopped part way').toBeGreaterThan(END.zoom + 0.02);
		await page.waitForTimeout(1500);
		expect(await camera(page), 'and it does not move on by itself').toEqual(held);
	});

	test('the wheel takes the camera too, and zooms from where the drift was', async ({ page }) => {
		await page.goto('/experiments/airflow');
		await shown(page);
		const start = await camera(page);
		await expect.poll(async () => (await camera(page)).zoom, { timeout: MOVES }).toBeLessThan(start.zoom - 0.03);
		const box = (await view(page).boundingBox())!;
		await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
		await page.mouse.wheel(0, -120);
		// Firefox and WebKit hand the wheel to the page a moment after the call returns.
		await page.waitForTimeout(400);
		const zoomed = await camera(page);
		await page.waitForTimeout(1500);
		const after = await camera(page);
		expect(after.zoom, 'the wheel’s own zoom, and no more drift').toBeCloseTo(zoomed.zoom, 2);
		expect(after.yaw).toBe(zoomed.yaw);
		expect(after.zoom).toBeGreaterThan(END.zoom - 0.2);
	});

	test('it plays once a visit: a reload opens where the drift ended, with no drift', async ({ page }) => {
		// Three loads of the world, each up to a minute where WebGL is drawn in software.
		test.setTimeout(180_000);
		await page.goto('/experiments/airflow');
		await shown(page);
		await expect.poll(async () => (await camera(page)).zoom, { timeout: MOVES }).toBeLessThan(HOME_ZOOM - 0.05);
		await page.reload();
		await shown(page);
		expect(await camera(page)).toEqual(END);
		await page.waitForTimeout(1500);
		expect(await camera(page), 'it stays').toEqual(END);
		// A visit in another tab is another visit, and sees the opening.
		const other = await page.context().newPage();
		await other.goto('/experiments/airflow');
		await shown(other);
		expect((await camera(other)).zoom).toBeGreaterThan(END.zoom + 0.1);
		await other.close();
	});

	test('a camera the address asks for is the view: no opening moves it', async ({ page }) => {
		await page.goto('/experiments/airflow?camera=6,3.9,90,0.8,0');
		await shown(page);
		const asked = await camera(page);
		expect(asked.yaw).toBe(90);
		await page.waitForTimeout(2000);
		expect(await camera(page)).toEqual(asked);
	});
});

test.describe('for a visitor who prefers reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the world opens at the drift’s end with no drift, paused, and the hint still shows', async ({ page }) => {
		await page.goto('/experiments/airflow');
		await shown(page);
		expect(await camera(page)).toEqual(END);
		await page.waitForTimeout(1500);
		expect(await camera(page), 'nothing moves').toEqual(END);
		await expect(hint(page)).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.sim-status')).toHaveAttribute('data-status', 'paused', { timeout: 30_000 });
	});
});

test.describe('a share link', () => {
	test('opens straight onto the linked setup, on its default view, with no opening', async ({ page }) => {
		const house = planById('house')!;
		await page.goto(`/experiments/airflow${setupToHash(blankSetup('house'))}`);
		await expect(page.locator('.loading')).toContainText('Opening the setup you were sent');
		await shown(page);
		await expect(page.locator('.airflow-figure figcaption')).toContainText(house.name);
		const start = await camera(page);
		expect(start.zoom, 'the default view').toBeCloseTo(HOME_ZOOM, 2);
		await page.waitForTimeout(2000);
		expect(await camera(page), 'and it stays there').toEqual(start);
		// A link does not count as having seen the opening: the same visit without one still has it.
		await page.goto('/experiments/airflow');
		await shown(page);
		const first = await camera(page);
		await expect.poll(async () => (await camera(page)).zoom, { timeout: MOVES }).toBeLessThan(first.zoom - 0.03);
	});
});

test.describe('the hint', () => {
	test('points at the Build tool a moment after the world is shown, and goes for the visit when it is dismissed', async ({ page }) => {
		await page.goto('/experiments/airflow');
		await shown(page);
		await expect(hint(page)).toBeVisible({ timeout: 6_000 });
		await expect(hint(page)).toContainText('Drop a fan and watch the air change.');
		// Beside the Build tool, at its height.
		const build = (await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Build' }).boundingBox())!;
		const bubble = (await hint(page).boundingBox())!;
		expect(bubble.x).toBeGreaterThan(build.x + build.width);
		expect(Math.abs(bubble.y + bubble.height / 2 - (build.y + build.height / 2))).toBeLessThan(12);
		// While another tool is in use it waits, and it comes back after.
		await page.keyboard.press('3');
		await expect(hint(page)).toHaveCount(0);
		await page.keyboard.press('1');
		await expect(hint(page)).toBeVisible();
		await hint(page).getByRole('button', { name: 'Dismiss the hint' }).click();
		await expect(hint(page)).toHaveCount(0);
		await page.reload();
		await shown(page);
		await page.waitForTimeout(2500);
		await expect(hint(page), 'it does not come back on a reload').toHaveCount(0);
	});

	test('goes for the visit once the visitor places a device', async ({ page }) => {
		await page.goto('/experiments/airflow?cell=0.3');
		await shown(page);
		await expect(hint(page)).toBeVisible({ timeout: 6_000 });
		await page.keyboard.press('2');
		await expect(hint(page), 'it waits while the catalog is open').toHaveCount(0);
		await page.locator('.card').first().focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('region', { name: 'Build' })).toContainText('1 of 6 placed');
		await page.keyboard.press('1');
		await page.waitForTimeout(500);
		await expect(hint(page)).toHaveCount(0);
		await page.reload();
		await shown(page);
		await page.waitForTimeout(2500);
		await expect(hint(page), 'and a reload does not bring it back').toHaveCount(0);
	});

	test('a browser that refuses session storage still gets the opening and the hint, and nothing breaks', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(() => {
			Object.defineProperty(window, 'sessionStorage', {
				configurable: true,
				get() {
					throw new DOMException('The operation is insecure.', 'SecurityError');
				}
			});
		});
		await page.goto('/experiments/airflow?cell=0.3');
		await shown(page);
		const start = await camera(page);
		await expect.poll(async () => (await camera(page)).zoom, { timeout: MOVES }).toBeLessThan(start.zoom - 0.03);
		await expect(hint(page)).toBeVisible({ timeout: 6_000 });
		await hint(page).getByRole('button', { name: 'Dismiss the hint' }).click();
		await expect(hint(page)).toHaveCount(0);
		expect(errors).toEqual([]);
	});
});
