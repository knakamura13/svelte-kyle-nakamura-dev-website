import AxeBuilder from '@axe-core/playwright';
import { chromium, devices, expect, test, type CDPSession, type Page } from '@playwright/test';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { blankSetup } from '../src/lib/experiments/airflow/state';

/**
 * The airflow page on a phone (#83): the world keeps most of the screen with a sheet at its peek and no panel covers another, every
 * sheet folds to its peek and opens in full, the camera frames the whole home above the sheets, the first frame's hint points at Build
 * from over the toolbar, the weather pill says its readings, the fingers move the camera (one pans, two pinch and twist, a tap opens a
 * window's menu), the low tier's air is clearly visible, axe finds nothing, and the low tier holds 30 frames a second under a phone's
 * processor. Emulated: an iPhone's 390 by 844 and an Android phone's 360 by 800, with a touch screen. Chromium alone can make several
 * fingers touch at once (its DevTools protocol), so the pinch, the twist and the drags run there.
 */

const PHONES = [
	{ name: 'an iPhone', width: 390, height: 844, userAgent: devices['iPhone 13'].userAgent },
	{ name: 'an Android phone', width: 360, height: 800, userAgent: devices['Galaxy S24'].userAgent }
] as const;

/** The coarsest grid, which a phone runs anyway, so the specs do not wait for a tuner. */
const PAGE = '/experiments/airflow?cell=0.3';
const NO_HOVER = "Firefox's touch emulation does not hover the world with the mouse, which is how the spec finds a window.";

const hud = (page: Page) => page.locator('.hud');
const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Tools' });

async function openPhone(page: Page, path = PAGE) {
	await page.goto(path);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
	await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
	await expect(hud(page)).toHaveClass(/\bphone\b/);
}

/**
 * The HUD's panels as boxes (each outermost glass panel or sheet that shows), the share of the screen none of them covers, any two
 * that overlap and any that reach past the screen's edge.
 */
async function layout(page: Page) {
	return page.evaluate(() => {
		const shows = (el: Element) => {
			const style = getComputedStyle(el);
			const box = el.getBoundingClientRect();
			return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && box.width > 1 && box.height > 1;
		};
		const panels: Element[] = [];
		for (const el of document.querySelectorAll('.hud .glass, .hud [data-sheet]')) {
			if (!shows(el) || panels.some((outer) => outer.contains(el))) continue;
			panels.push(el);
		}
		const boxes = panels.map((el) => {
			const box = el.getBoundingClientRect();
			return { name: (el.getAttribute('class') ?? '').replace(/svelte-\w+/g, '').trim(), left: box.left, top: box.top, right: box.right, bottom: box.bottom };
		});
		const [width, height] = [innerWidth, innerHeight];
		let free = 0;
		let all = 0;
		for (let y = 1; y < height; y += 2)
			for (let x = 1; x < width; x += 2) {
				all++;
				if (!boxes.some((b) => x >= b.left && x < b.right && y >= b.top && y < b.bottom)) free++;
			}
		const overlaps: string[] = [];
		for (let i = 0; i < boxes.length; i++)
			for (let j = i + 1; j < boxes.length; j++) {
				const [a, b] = [boxes[i], boxes[j]];
				// A pixel's rounding is not an overlap.
				if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${a.name} over ${b.name}`);
			}
		const outside = boxes.filter((b) => b.left < -0.5 || b.top < -0.5 || b.right > width + 0.5 || b.bottom > height + 0.5).map((b) => b.name);
		return { free: free / all, overlaps, outside, boxes };
	});
}

/** Moves the mouse over the world, row by row, until the HUD says it is over a window: what a tap there would open. */
async function findWindow(page: Page) {
	const { width, height } = page.viewportSize()!;
	for (let fy = 0.15; fy <= 0.75; fy += 0.012)
		for (let fx = 0.05; fx <= 0.95; fx += 0.03) {
			await page.mouse.move(width * fx, height * fy);
			const hovered = (await hud(page).getAttribute('data-hovered')) ?? '';
			if (/^opening:.*window/.test(hovered)) return { x: width * fx, y: height * fy, id: hovered.slice('opening:'.length) };
		}
	throw new Error('No window under the pointer anywhere on the world.');
}

// ---- several fingers at once, through Chromium's DevTools protocol ----

type Finger = { x: number; y: number; id: number };
const send = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Finger[]) =>
	cdp.send('Input.dispatchTouchEvent', { type, touchPoints: fingers.map((f) => ({ ...f, radiusX: 6, radiusY: 6, force: 1 })) });

/** One finger from `a` to `b`, in small steps. */
async function swipe(cdp: CDPSession, a: { x: number; y: number }, b: { x: number; y: number }, steps = 24) {
	await send(cdp, 'touchStart', [{ ...a, id: 1 }]);
	for (let i = 1; i <= steps; i++) await send(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps, id: 1 }]);
	await send(cdp, 'touchEnd', []);
}

/** Two fingers about a centre, their spread going from `from` to `to` px and their line turning by `turn` radians. */
async function twoFingers(cdp: CDPSession, centre: { x: number; y: number }, from: number, to: number, turn: number, steps = 24) {
	const at = (spread: number, angle: number): Finger[] => [
		{ x: centre.x - (Math.cos(angle) * spread) / 2, y: centre.y - (Math.sin(angle) * spread) / 2, id: 1 },
		{ x: centre.x + (Math.cos(angle) * spread) / 2, y: centre.y + (Math.sin(angle) * spread) / 2, id: 2 }
	];
	await send(cdp, 'touchStart', at(from, -0.6));
	for (let i = 1; i <= steps; i++) await send(cdp, 'touchMove', at(from + ((to - from) * i) / steps, -0.6 + (turn * i) / steps));
	await send(cdp, 'touchEnd', []);
}

const camera = (page: Page) =>
	view(page).evaluate((el) => ({ yaw: Number(el.dataset.yaw), zoom: Number(el.dataset.zoom), focus: (el.dataset.focus ?? '0,0').split(',').map(Number) }));

// ---- the air in pixels ----

/** A picture of the world with the HUD painted black, which the counts below leave out. */
const worldShot = (page: Page) => view(page).screenshot({ mask: [page.locator('.hud .glass'), page.locator('.hud [data-sheet]'), page.locator('.hud .sim-status')], maskColor: '#000000' });

/**
 * The share of the world's pixels that are clearly the air's blue (blue over red by 25 or more, and over green), and, given a second
 * picture, the share that it shows clearly lighter and greyer than the first (luminance up by 30, chroma down by 20): smoke over the room.
 */
async function airShares(page: Page, first: Buffer, second?: Buffer) {
	return page.evaluate(
		async ([a, b]) => {
			const pixels = async (base64: string) => {
				const image = new Image();
				image.src = `data:image/png;base64,${base64}`;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d')!;
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, canvas.width, canvas.height).data;
			};
			const one = await pixels(a);
			const two = b ? await pixels(b) : null;
			const luminance = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
			const chroma = (d: Uint8ClampedArray, i: number) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
			let world = 0;
			let blue = 0;
			let smoke = 0;
			for (let i = 0; i < one.length; i += 4) {
				if (one[i] + one[i + 1] + one[i + 2] === 0 || (two && two[i] + two[i + 1] + two[i + 2] === 0)) continue;
				world++;
				if (one[i + 2] - one[i] > 25 && one[i + 2] > one[i + 1]) blue++;
				if (two && luminance(two, i) - luminance(one, i) > 30 && chroma(one, i) - chroma(two, i) > 20) smoke++;
			}
			return { blue: blue / world, smoke: smoke / world };
		},
		[first.toString('base64'), second?.toString('base64') ?? '']
	);
}

for (const phone of PHONES) {
	test.describe(`on ${phone.name}, ${phone.width} by ${phone.height}`, () => {
		test.use({
			viewport: { width: phone.width, height: phone.height },
			deviceScaleFactor: 2,
			isMobile: true,
			hasTouch: true,
			userAgent: phone.userAgent,
			locale: 'en-US'
		});
		// The pointer's search for a window, and WebGL drawn in software, take a while.
		test.beforeEach(() => test.setTimeout(120_000));

		test('the world keeps at least 55% of the screen with a tool’s sheet, the View sheet or the weather at its peek, and no panel covers another', async ({ page }) => {
			test.setTimeout(120_000);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const check = async (what: string) => {
				const seen = await layout(page);
				expect(seen.free, `${what}: the share of the screen the HUD leaves the world`).toBeGreaterThanOrEqual(0.55);
				expect(seen.overlaps, `${what}: panels that cover one another`).toEqual([]);
				expect(seen.outside, `${what}: panels past the screen's edge`).toEqual([]);
			};
			await check('nothing open');
			const sheet = async (open: () => Promise<void>, what: string) => {
				await open();
				await expect(hud(page), what).toHaveAttribute('data-sheet-size', 'peek');
				await check(`${what} at its peek`);
			};
			for (const tool of ['build', 'probe', 'smoke'] as const) await sheet(() => toolbar(page).locator(`[data-tool="${tool}"]`).tap(), `the ${tool} sheet`);
			await toolbar(page).locator('[data-tool="select"]').tap();
			await sheet(() => toolbar(page).getByRole('button', { name: 'View' }).tap(), 'the View sheet');
			await toolbar(page).getByRole('button', { name: 'View' }).tap();
			await sheet(() => page.locator('.weather-pill').tap(), 'the weather sheet');
		});

		test('a window’s menu, at its peek, leaves the world at least 55% of the screen and covers no panel', async ({ page, browserName }) => {
			test.skip(browserName === 'firefox', NO_HOVER);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const window = await findWindow(page);
			await page.touchscreen.tap(window.x, window.y);
			await expect(page.getByRole('dialog', { name: /window/ })).toBeVisible();
			await expect(hud(page)).toHaveAttribute('data-sheet-size', 'peek');
			const seen = await layout(page);
			expect(seen.free, 'the share of the screen the HUD leaves the world').toBeGreaterThanOrEqual(0.55);
			expect(seen.overlaps, 'panels that cover one another').toEqual([]);
			expect(seen.outside, "panels past the screen's edge").toEqual([]);
		});

		test('the camera frames the whole home above a sheet at its peek, under the top bar', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			// On the default view, which a share link opens on: a visit without one opens on the opening's view of the living room (#82).
			await openPhone(page, `${PAGE}${setupToHash(blankSetup('two-bedroom'))}`);
			await toolbar(page).locator('[data-tool="build"]').tap();
			await expect(hud(page)).toHaveAttribute('data-sheet-size', 'peek');
			const top = (await page.locator('.hud-top .topbar').boundingBox())!;
			const catalog = (await page.getByRole('region', { name: 'Build' }).boundingBox())!;
			const rooms = view(page).locator('.stage-label[data-tone="room"]');
			await expect(rooms.first()).toBeVisible();
			const shown = [];
			for (const room of await rooms.all()) if (await room.isVisible()) shown.push(room);
			expect(shown, 'every room of the two-bedroom is named in view').toHaveLength(7);
			for (const room of shown) {
				const box = (await room.boundingBox())!;
				const name = await room.textContent();
				expect(box.y, `${name} is under the top bar`).toBeGreaterThanOrEqual(top.y + top.height);
				expect(box.y + box.height, `${name} is over the catalog`).toBeLessThanOrEqual(catalog.y);
				expect(box.x, `${name} is on the screen`).toBeGreaterThanOrEqual(0);
				expect(box.x + box.width, `${name} is on the screen`).toBeLessThanOrEqual(phone.width);
			}
		});

		test('the first frame’s hint stands over the toolbar with its pointer on Build', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const hint = page.getByRole('note').filter({ hasText: 'Drop a fan' });
			await expect(hint).toBeVisible({ timeout: 6_000 });
			const build = (await toolbar(page).locator('[data-tool="build"]').boundingBox())!;
			const bubble = (await hint.boundingBox())!;
			// The pointer is the bubble's ::before, a small square turned to a diamond: the bubble points where its middle is.
			const pointer = await hint.evaluate((el) => {
				const style = getComputedStyle(el, '::before');
				return parseFloat(style.left) + parseFloat(style.width) / 2;
			});
			const tip = bubble.x + pointer;
			expect(tip, 'the pointer is over the middle of Build').toBeGreaterThan(build.x + build.width / 4);
			expect(tip, 'the pointer is over the middle of Build').toBeLessThan(build.x + (build.width * 3) / 4);
			expect(bubble.y + bubble.height, 'the bubble stands over the toolbar').toBeLessThanOrEqual(build.y);
			expect(bubble.x, 'the bubble is on the screen').toBeGreaterThanOrEqual(0);
			expect(bubble.x + bubble.width, 'the bubble is on the screen').toBeLessThanOrEqual(phone.width);
		});

		test('the weather pill says the wind, the temperature and the outdoor air, and opens them as a sheet', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const pill = page.locator('.weather-pill');
			await expect(pill).toBeVisible();
			await expect(pill.locator('.pill-wind')).toHaveText(/^(N|NE|E|SE|S|SW|W|NW|NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW)\s*\d+\s*mph$|^Calm$/);
			await expect(pill.locator('.pill-rest')).toContainText(/-?\d+\s*°F/);
			await expect(pill.locator('.pill-rest')).toContainText(/Clean|Hazy|Smoky|Wildfire|µg\/m³/);
			await expect(pill).toHaveAttribute('aria-label', /^Weather: (calm|wind from the [a-z-]+ at [\d.]+ miles per hour); [\d.-]+ degrees Fahrenheit outside; outdoor air [a-z0-9 ]+\.$/);
			await pill.tap();
			const sheet = page.getByRole('dialog', { name: 'Weather' });
			await expect(sheet).toBeVisible();
			await expect(sheet.getByRole('slider', { name: 'Wind direction' })).toBeVisible();
			await expect(sheet.getByRole('group', { name: 'Outdoor temperature' }), 'the temperatures wait for the grabber').toBeHidden();
			await sheet.getByRole('button', { name: 'Show all of the weather' }).tap();
			await expect(sheet.getByRole('group', { name: 'Outdoor temperature' })).toBeVisible();
			await expect(sheet.getByRole('group', { name: 'Outdoor air' })).toBeVisible();
		});

		test('each sheet folds to its peek and shows all of itself from its grabber', async ({ page, browserName }) => {
			test.skip(browserName === 'firefox', NO_HOVER);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			await toolbar(page).locator('[data-tool="build"]').tap();
			const catalog = page.getByRole('region', { name: 'Build' });
			const grip = catalog.getByRole('button', { name: 'Show all of the catalog' });
			await expect(grip).toHaveAttribute('aria-expanded', 'false');
			await expect(catalog.locator('.card-maker').first(), 'at its peek a card is its picture and its name').toBeHidden();
			const peek = (await catalog.boundingBox())!.height;
			await grip.tap();
			await expect(grip).toHaveAttribute('aria-expanded', 'true');
			await expect(catalog.locator('.card-maker').first()).toBeVisible();
			expect((await catalog.boundingBox())!.height, 'in full it is taller').toBeGreaterThan(peek + 80);
			await grip.tap();
			await expect(grip).toHaveAttribute('aria-expanded', 'false');
			await expect(catalog.locator('.card-maker').first()).toBeHidden();
			// A window's menu folds to its presets.
			await toolbar(page).locator('[data-tool="select"]').tap();
			const window = await findWindow(page);
			await page.touchscreen.tap(window.x, window.y);
			const menu = page.getByRole('dialog', { name: /window/ });
			await expect(menu.getByRole('button', { name: 'Half' })).toBeVisible();
			await expect(menu.getByRole('slider'), 'the fine control waits for the grabber').toBeHidden();
			await menu.getByRole('button', { name: /^Show all of / }).tap();
			await expect(menu.getByRole('slider')).toBeVisible();
		});

		test('a sheet dragged down by its grabber folds to its peek, and dragged down again it closes', async ({ page, browserName }) => {
			test.skip(browserName !== 'chromium', 'Only Chromium can drag a finger across the page (its DevTools protocol).');
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			await toolbar(page).locator('[data-tool="build"]').tap();
			const catalog = page.getByRole('region', { name: 'Build' });
			await catalog.getByRole('button', { name: 'Show all of the catalog' }).tap();
			await expect(hud(page)).toHaveAttribute('data-sheet-size', 'full');
			const cdp = await page.context().newCDPSession(page);
			const down = async () => {
				const at = (await catalog.locator('.grip').boundingBox())!;
				await swipe(cdp, { x: at.x + at.width / 2, y: at.y + 10 }, { x: at.x + at.width / 2, y: at.y + 160 });
			};
			await down();
			await expect(hud(page)).toHaveAttribute('data-sheet-size', 'peek');
			await down();
			await expect(catalog).toHaveCount(0);
			await expect(hud(page), 'closing the catalog puts the Build tool down').toHaveAttribute('data-tool', 'select');
		});

		test('a tap on a window opens its menu', async ({ page, browserName }) => {
			test.skip(browserName === 'firefox', NO_HOVER);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const window = await findWindow(page);
			await page.touchscreen.tap(window.x, window.y);
			await expect(hud(page)).toHaveAttribute('data-selection', `opening:${window.id}`);
			await expect(page.getByRole('dialog', { name: /window/ })).toBeVisible();
			await expect(page.getByRole('dialog', { name: /window/ }).getByRole('button', { name: 'Wide' })).toBeVisible();
		});

		test('one finger pans, two pinch to zoom and twist to turn, in any tool, and a pinch over the Probe tool pins nothing', async ({ page, browserName }) => {
			test.skip(browserName !== 'chromium', 'Only Chromium can touch with several fingers at once (its DevTools protocol).');
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const cdp = await page.context().newCDPSession(page);
			const middle = { x: phone.width / 2, y: phone.height * 0.45 };
			const start = await camera(page);
			await swipe(cdp, { x: middle.x + 40, y: middle.y + 60 }, { x: middle.x - 40, y: middle.y - 60 });
			await expect.poll(async () => { const now = await camera(page); return Math.hypot(now.focus[0] - start.focus[0], now.focus[1] - start.focus[1]); }, { message: 'a finger moves the view across the home, m' }).toBeGreaterThan(0.5);
			const panned = await camera(page);
			expect(panned.zoom, 'and does not zoom').toBe(start.zoom);
			await twoFingers(cdp, middle, 100, 240, 0);
			await expect.poll(async () => (await camera(page)).zoom, { message: 'fingers spread apart zoom in' }).toBeLessThan(panned.zoom - 0.2);
			const pinched = await camera(page);
			await twoFingers(cdp, middle, 200, 200, 0.7);
			await expect.poll(async () => Math.abs(((((await camera(page)).yaw - pinched.yaw + 540) % 360) - 180)), { message: 'a twist of 40° turns the view about as much, degrees' }).toBeGreaterThan(25);
			await twoFingers(cdp, middle, 240, 100, 0);
			await expect.poll(async () => (await camera(page)).zoom, { message: 'fingers pinched together zoom out' }).toBeGreaterThan(pinched.zoom + 0.2);

			// The Probe tool keeps one finger for itself, and lets two move the camera.
			await toolbar(page).locator('[data-tool="probe"]').tap();
			const before = await camera(page);
			await twoFingers(cdp, middle, 120, 240, 0.5);
			await expect.poll(async () => (await camera(page)).zoom, { message: 'a pinch zooms over the Probe tool too' }).toBeLessThan(before.zoom - 0.2);
			await page.waitForTimeout(500);
			await expect(view(page).locator('.stage-label[data-tone="probe"]'), 'and pins nothing').toHaveCount(0);
		});

		test('the low tier draws the air clearly: its streaks, and a cooking burst’s smoke', async ({ page }) => {
			test.setTimeout(150_000);
			// The low tier by name, so a browser drawing WebGL in software draws it rather than its own lighter one.
			await openPhone(page, `${PAGE}&quality=low`);
			await expect(view(page)).toHaveAttribute('data-quality', 'low');
			await expect(page.locator('.sim-status')).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
			const pause = toolbar(page).getByRole('button', { name: /^(Pause|Resume)$/ });
			// The cross-ventilation Scenario, a few seconds in, held still.
			await page.waitForTimeout(8000);
			await pause.tap();
			await page.waitForTimeout(800);
			const air = await worldShot(page);
			const { blue } = await airShares(page, air);
			test.info().annotations.push({ type: 'streaks', description: `${(blue * 100).toFixed(2)}% of the world's pixels are clearly the air's blue` });
			// Measured 2026-10-21 at 390 by 844: 1.5 to 1.8% with the low tier's look (quality.ts), 0.01 to 0.02% with the desktop's. A cooking
			// burst's plume, below, covers 0.5 to 0.8% within three seconds where the simulation runs on a GPU, and 0.4 to 0.6% with the old puffs.
			expect(blue, 'the share of the world in clear streaks').toBeGreaterThan(0.005);

			// A cooking burst from the keyboard's cursor, moved from the middle of the home to the living room's, caught as it is released.
			await toolbar(page).locator('[data-tool="smoke"]').tap();
			await page.locator('[data-mark="burst"]').tap();
			await pause.tap();
			await view(page).focus();
			for (const key of ['Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Shift+ArrowDown', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(key);
			await page.keyboard.press('Enter');
			await expect(page.locator('.hud [role="status"][data-releasing]')).toBeVisible();
			// How much smoke is out depends on how fast this machine runs the simulation, so the plume is watched as it grows. The streaks
			// moving meanwhile are not counted: where one comes or goes, a pixel turns bluer or darker, never lighter and greyer.
			let smoke = 0;
			await expect
				.poll(async () => (smoke = (await airShares(page, air, await worldShot(page))).smoke), { message: 'the share of the world a burst of smoke clearly covers', timeout: 20_000, intervals: [1000] })
				.toBeGreaterThan(0.003);
			test.info().annotations.push({ type: 'smoke', description: `${(smoke * 100).toFixed(2)}% of the world's pixels are clearly lighter and greyer` });
		});

		test('has no WCAG 2.1 A/AA violations that axe can detect, with the sheets at their peek and in full', async ({ page, browserName }) => {
			test.skip(browserName === 'firefox', NO_HOVER);
			test.setTimeout(120_000);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await openPhone(page);
			const scan = async (what: string) => {
				const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
				expect(
					violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
					what
				).toEqual([]);
			};
			await scan('nothing open');
			await toolbar(page).locator('[data-tool="build"]').tap();
			await scan('the catalog at its peek');
			await page.getByRole('region', { name: 'Build' }).getByRole('button', { name: 'Show all of the catalog' }).tap();
			await scan('the catalog in full');
			await toolbar(page).locator('[data-tool="select"]').tap();
			await page.locator('.weather-pill').tap();
			await scan('the weather at its peek');
			await page.getByRole('button', { name: 'Show all of the weather' }).tap();
			await scan('the weather in full');
			await page.locator('.weather-pill').tap();
			const window = await findWindow(page);
			await page.touchscreen.tap(window.x, window.y);
			await expect(page.getByRole('dialog', { name: /window/ })).toBeVisible();
			await scan('a window’s menu');
		});
	});
}

test.describe('the low tier’s frame rate', () => {
	test('holds 30 frames a second under a mid-range phone’s processor (four times slower), at 390 by 844', async ({ browserName, baseURL }) => {
		test.skip(browserName !== 'chromium', 'Only Chromium can slow its processor down (its DevTools protocol).');
		test.setTimeout(150_000);
		// The browser with the machine's GPU (`channel: 'chromium'`): the tests' headless shell draws WebGL in software, which says nothing of a phone.
		const browser = await chromium.launch({ channel: 'chromium' });
		try {
			const phone = PHONES[0];
			const context = await browser.newContext({ viewport: { width: phone.width, height: phone.height }, screen: { width: phone.width, height: phone.height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: phone.userAgent, locale: 'en-US' });
			const page = await context.newPage();
			const renderer = await page.evaluate(() => {
				const gl = document.createElement('canvas').getContext('webgl2');
				const info = gl?.getExtension('WEBGL_debug_renderer_info');
				return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
			});
			test.skip(!renderer || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer), `No GPU here (${renderer || 'no WebGL'}), so a frame rate would say nothing.`);
			await page.goto(`${baseURL}/experiments/airflow`);
			await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
			await expect(view(page)).toHaveAttribute('data-quality', 'low');
			await expect(page.locator('.sim-status')).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
			const cdp = await context.newCDPSession(page);
			await page.waitForTimeout(3000);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
			await page.waitForTimeout(2000);
			const frames = await page.evaluate(
				(ms) =>
					new Promise<number[]>((resolve) => {
						const times: number[] = [];
						const tick = (now: number) => {
							times.push(now);
							if (now - times[0] < ms) requestAnimationFrame(tick);
							else resolve(times);
						};
						requestAnimationFrame(tick);
					}),
				8000
			);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
			const fps = (frames.length - 1) / ((frames.at(-1)! - frames[0]) / 1000);
			const gaps = frames
				.slice(1)
				.map((t, i) => t - frames[i])
				.sort((a, b) => a - b);
			test.info().annotations.push({ type: 'frame rate', description: `${fps.toFixed(1)} fps, median frame ${gaps[gaps.length >> 1].toFixed(1)} ms, on ${renderer}` });
			expect(fps, 'frames a second, the low tier with the air running').toBeGreaterThanOrEqual(30);
			await context.close();
		} finally {
			await browser.close();
		}
	});
});
