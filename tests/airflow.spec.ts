import { expect, test, type Page } from '@playwright/test';
import { planById } from '../src/lib/experiments/airflow/homes/plans';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { blankSetup } from '../src/lib/experiments/airflow/state';

/** How much of a picture its most common colour takes up: close to 1 for a Stage with nothing in it. */
async function dominantShare(page: Page, png: Buffer) {
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
		const counts = new Map<number, number>();
		for (let i = 0; i < data.length; i += 4) {
			// Five bits a channel, so shading and anti-aliasing do not split one colour into many.
			const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return Math.max(...counts.values()) / (data.length / 4);
	}, png.toString('base64'));
}

/** The largest gap between a pixel's brightest and dimmest colour channel, over the left and right edges of a picture: near 0 for a plain tint, large for coloured speckle. */
async function edgeSpread(page: Page, png: Buffer) {
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		const edge = Math.round(image.width * 0.12);
		let worst = 0;
		for (const x of [0, image.width - edge]) {
			const { data } = context.getImageData(x, 0, edge, image.height);
			for (let i = 0; i < data.length; i += 4) worst = Math.max(worst, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
		}
		return worst;
	}, png.toString('base64'));
}

/**
 * The airflow page before it has a Dock: the home is drawn, the status line says honestly whether the simulation is
 * running, and nothing throws. Where the browser has WebGPU the simulation runs (paused here, for reduced motion); where it
 * does not, the page says the simulation cannot start yet and still shows the home.
 */
test.describe('the airflow page', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('draws the home, labels its rooms, and says whether the simulation runs, without errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// A browser with no WebGPU is expected to log that the simulation could not start, once.
		page.on('console', (message) => {
			if (message.type() === 'error' && !/The simulation could not start/.test(message.text())) errors.push(message.text());
		});
		await page.goto('/experiments/airflow');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Airflow');
		const view = page.getByRole('application', { name: /^The air in the/ });
		await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
		test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');

		await expect(view.locator('canvas')).toHaveCount(1);
		const status = page.locator('.sim-status');
		await expect(status).toHaveAttribute('data-status', /^(paused|running|unsupported)$/, { timeout: 30_000 });
		if ((await status.getAttribute('data-status')) === 'unsupported') await expect(status).toContainText('WebGPU');
		else await expect(status).toContainText(/cells, each/);

		// The two-bedroom home is the default: its rooms are named over the picture, with the compass points.
		await expect(view.locator('.stage-label[data-tone="room"]')).toContainText(['Living room', 'Bedroom 1']);
		await expect(view.locator('.stage-label[data-tone="compass"]')).toHaveText(['N', 'E', 'S', 'W']);
		// The Stage is a picture of something, not a flat tint.
		expect(await dominantShare(page, await view.screenshot())).toBeLessThan(0.9);
		expect(errors).toEqual([]);
	});

	test('the ground around the home is a smooth tint: WebKit once drew a speckle of magenta, green and yellow over the floor pool', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto('/experiments/airflow');
		const view = page.getByRole('application', { name: /^The air in the/ });
		await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
		test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
		await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(paused|running|unsupported)$/, { timeout: 30_000 });
		// The outer fifth of the Stage holds only the ground and the sky: no home, no slice, no labels.
		expect(await edgeSpread(page, await view.screenshot())).toBeLessThan(40);
	});

	test('the Stage is as wide as its card at every width, so no part of the home is cut off or out of reach', async ({ page }) => {
		for (const [width, height] of [
			[360, 740],
			[390, 844],
			[430, 900],
			[700, 900],
			[768, 1024],
			[900, 900],
			[1000, 900],
			[1280, 800]
		]) {
			await page.setViewportSize({ width, height });
			await page.goto('/experiments/airflow');
			const stage = (await page.locator('.airflow-figure .stage-view').boundingBox())!;
			const card = (await page.locator('.airflow-figure').boundingBox())!;
			expect(Math.round(stage.width), `${width}px wide: the Stage fills its card`).toBe(Math.round(card.width));
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px wide: no sideways scroll`).toBe(true);
		}
	});

	test('keyboard focus on the Stage draws a ring over the picture, where the canvas cannot hide it', async ({ page }) => {
		await page.goto('/experiments/airflow');
		const view = page.getByRole('application', { name: /^The air in the/ });
		for (let n = 0; n < 30 && !(await view.evaluate((el) => document.activeElement === el)); n++) await page.keyboard.press('Tab');
		expect(await view.evaluate((el) => document.activeElement === el), 'Tab reaches the Stage').toBe(true);
		const ring = await view.evaluate((el) => {
			const after = getComputedStyle(el, '::after');
			return { width: after.borderTopWidth, position: after.position, events: after.pointerEvents };
		});
		expect(ring).toEqual({ width: '3px', position: 'absolute', events: 'none' });
	});

	test('a share link in the address picks the home it names, and one pasted into the open page does too', async ({ page }) => {
		const house = planById('house')!;
		const studio = planById('studio')!;
		await page.goto(`/experiments/airflow${setupToHash(blankSetup('house'))}`);
		await expect(page.locator('.airflow-figure figcaption')).toContainText(house.name, { timeout: 15_000 });
		await page.evaluate((hash) => (location.hash = hash), setupToHash(blankSetup('studio')));
		await expect(page.locator('.airflow-figure figcaption')).toContainText(studio.name);
		// A link that cannot be read leaves things as they are.
		await page.evaluate(() => (location.hash = '1.not-a-real-link'));
		await expect(page.locator('.airflow-figure figcaption')).toContainText(studio.name);
	});
});
