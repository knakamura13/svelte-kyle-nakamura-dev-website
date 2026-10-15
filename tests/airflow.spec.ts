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

/**
 * The largest gap between a pixel's brightest and dimmest colour channel, over the four corners of a picture: near 0 for a plain tint,
 * large for coloured speckle. The corners hold only the ground and the sky: the Stage is narrower beside the Dock, so the home reaches
 * the left and right edges, and the top and bottom corners are what stay empty.
 */
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
		const w = Math.round(image.width * 0.12);
		const h = Math.round(image.height * 0.2);
		let worst = 0;
		for (const x of [0, image.width - w])
			for (const y of [0, image.height - h]) {
				const { data } = context.getImageData(x, y, w, h);
				for (let i = 0; i < data.length; i += 4) worst = Math.max(worst, Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]));
			}
		return worst;
	}, png.toString('base64'));
}

/** How much of a Stage changed between two pictures: the share of pixels where any colour channel moved by more than a little. */
async function changedShare(page: Page, before: Buffer, after: Buffer) {
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
			const [first, second] = [await pixels(a), await pixels(b)];
			let changed = 0;
			for (let i = 0; i < first.length; i += 4) if (Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i + 1] - second[i + 1]), Math.abs(first[i + 2] - second[i + 2])) > 12) changed++;
			return changed / (first.length / 4);
		},
		[before.toString('base64'), after.toString('base64')]
	);
}

/**
 * The airflow page before it has a Dock: the home is drawn, the status line says honestly whether the simulation is
 * running, and nothing throws. Where the browser has WebGPU the simulation runs on it (paused here, for reduced motion); where it
 * does not, it runs on the processor in a worker at reduced detail, and the page says so. Only a browser that has neither says
 * the simulation cannot run, and still shows the home.
 */
test.describe('the airflow page', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('draws the home, labels its rooms, and says whether the simulation runs, without errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// A browser with no WebGPU runs the worker and says so as a warning, so an error of any kind is a fault.
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.goto('/experiments/airflow');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Airflow');
		const view = page.getByRole('application', { name: /^The air in the/ });
		await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
		test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');

		await expect(view.locator('canvas')).toHaveCount(1);
		const status = page.locator('.sim-status');
		await expect(status).toHaveAttribute('data-status', /^(paused|running)$/, { timeout: 30_000 });
		await expect(status).toContainText(/cells, each/);

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
		// The corners of the Stage hold only the ground and the sky: no home, no slice, no labels.
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

	test.describe('in a browser with no WebGPU', () => {
		test.beforeEach(async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			// The page's own test of WebGPU is for `navigator.gpu`, so this is what Firefox and many phones look like to it, in any browser.
			await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
		});

		test('the simulation runs on a worker at reduced detail: the air is drawn from the solver, it moves, and a probe reads it', async ({ page }) => {
			test.setTimeout(120_000);
			const errors: string[] = [];
			const warnings: string[] = [];
			const workers: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
				if (message.type() === 'warning') warnings.push(message.text());
			});
			page.on('worker', (worker) => workers.push(worker.url()));
			await page.setViewportSize({ width: 1280, height: 900 });
			// The grid is pinned at 20 cm (`?cell=0.2`): on a slow machine the auto-tuner would restart the world on another grid, which starts another
			// worker and changes the count of them below, and says so in the status line, between the cell size and the rate.
			await page.goto('/experiments/airflow?cell=0.2');
			const view = page.getByRole('application', { name: /^The air in the/ });
			await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
			test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');

			const status = page.locator('.sim-status');
			await expect(status).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
			await expect(status).toContainText('Running on the processor at reduced detail');
			await expect(status).toContainText(/cells, each/);
			// The Scenarios start at five times real time, which the processor cannot reach, so the status line says how fast it does run.
			await expect(status).toContainText(/across\. Running at (under )?\d+(\.\d)?× real time\./);
			expect(workers, 'the solver is in a worker of its own, so no step is on the page\u2019s thread').toHaveLength(1);
			expect(warnings.join('\n')).toContain('WebGPU is not available');

			// The air develops from rest: a picture a few seconds in is not the picture a few seconds later, and neither is a flat tint.
			await page.waitForTimeout(3000);
			const early = await view.screenshot();
			await page.waitForTimeout(4000);
			const late = await view.screenshot();
			expect(await dominantShare(page, late)).toBeLessThan(0.9);
			expect(await changedShare(page, early, late), 'the Stage is redrawn from new solver data').toBeGreaterThan(0.002);

			// A click on the home leaves a probe, and its reading comes back from the worker.
			const box = (await view.boundingBox())!;
			const probe = view.locator('.stage-label[data-tone="probe"]');
			for (const [x, y] of [
				[0.5, 0.55],
				[0.42, 0.5],
				[0.58, 0.5],
				[0.4, 0.62],
				[0.6, 0.62],
				[0.5, 0.45]
			]) {
				await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
				await page.waitForTimeout(700);
				if (await probe.count()) break;
			}
			await expect(probe).toHaveCount(1);
			await expect(probe.locator('.stage-label-name')).toHaveText('Probe 1');
			await expect(probe.locator('.stage-label-value'), 'with a speed in it').toHaveText(/\d/);

			// Another home is a new world on a new worker, and the old worker is stopped while a read of it may still be waiting. That says nothing.
			await page.evaluate((hash) => (location.hash = hash), setupToHash(blankSetup('studio')));
			await expect(page.locator('.airflow-figure figcaption')).toContainText(planById('studio')!.name);
			await expect(status).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
			await page.waitForTimeout(2000);
			expect(workers, 'a worker for each world').toHaveLength(2);
			expect(errors).toEqual([]);
		});

		test('a browser that has no Web Worker either says the simulation cannot run, and still shows the home', async ({ page }) => {
			await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }));
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			await page.goto('/experiments/airflow');
			const view = page.getByRole('application', { name: /^The air in the/ });
			await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
			test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
			const status = page.locator('.sim-status');
			await expect(status).toHaveAttribute('data-status', 'unsupported', { timeout: 30_000 });
			await expect(status).toContainText('cannot run the simulation');
			await expect(status).toContainText('Web Worker');
			await expect(view.locator('.stage-label[data-tone="room"]')).toContainText(['Living room', 'Bedroom 1']);
			expect(errors, 'not a fault').toEqual([]);
		});
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
