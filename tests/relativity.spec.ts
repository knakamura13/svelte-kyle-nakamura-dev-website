import { expect, test, type Page } from '@playwright/test';
import { formatChance } from '../src/lib/experiments/relativity/format';
import { muonSurvival } from '../src/lib/experiments/relativity/physics';

const chapterIds = ['frames', 'light-speed', 'light-clock', 'twins', 'muons', 'gravity'];

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

test.describe('the relativity page', () => {
	test.beforeEach(async ({ page }) => {
		// Reduced motion keeps every chapter paused, so the numbers below are the same on every run.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/experiments/relativity');
	});

	test('the chapter index reaches every chapter', async ({ page }) => {
		const links = page.getByRole('navigation', { name: 'Chapters' }).getByRole('link');
		await expect(links).toHaveText([/^1\s+Frames/, /^2\s+Light$/, /^3\s+The light clock/, /^4\s+Twins/, /^5\s+Muons/, /^6\s+Gravity/]);
		for (const id of chapterIds) {
			await expect(page.locator(`section#${id}`)).toHaveCount(1);
			await expect(page.locator(`nav[aria-label="Chapters"] a[href="#${id}"]`)).toHaveCount(1);
		}
	});

	test('every chapter starts paused for people who prefer reduced motion', async ({ page }) => {
		for (const id of chapterIds) {
			await expect(page.locator(`#${id}`).getByRole('button', { name: 'Play animation' })).toBeVisible();
		}
	});

	test('the light clock reports the slowdown for the speed you pick', async ({ page }) => {
		const speed = page.locator('#light-clock-speed');
		const gamma = page.locator('#light-clock .readouts dd').first();
		await speed.fill('0.6');
		await expect(gamma).toHaveText('1.25');
		await speed.fill('0.8');
		await expect(gamma).toHaveText('1.67');
		await speed.fill('0.95');
		await expect(gamma).toHaveText('3.20');
		await expect(speed).toHaveAttribute('aria-valuetext', /0\.95 times the speed of light/);
	});

	test('speed presets move the slider and show which one is chosen', async ({ page }) => {
		const chip = page.locator('#light-clock').getByRole('button', { name: '0.9 c' });
		await chip.click();
		await expect(page.locator('#light-clock-speed')).toHaveValue('0.9');
		await expect(chip).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('#light-clock').getByRole('button', { name: '0.5 c' })).toHaveAttribute('aria-pressed', 'false');
	});

	test('clicking the graph sets the light clock’s speed, and the numbers are available as a table', async ({ page }) => {
		const svg = page.locator('#light-clock .chart svg');
		await svg.scrollIntoViewIfNeeded();
		const box = (await svg.boundingBox())!;
		// The plot runs from 40px in to 16px short of the right edge; 0.5 c sits halfway along it.
		await page.mouse.click(box.x + 40 + 0.5 * (box.width - 56), box.y + 100);
		await expect(page.locator('#light-clock-speed')).toHaveValue('0.5');
		await page.getByText('Show the numbers').click();
		await expect(page.locator('#light-clock .chart-table tbody tr')).toHaveCount(7);
		await expect(page.locator('#light-clock .chart-table tbody tr').nth(2)).toContainText('1.67');
	});

	test('muons reach the ground only when relativity is real', async ({ page }) => {
		const chance = page.locator('#muons .readouts dd').first();
		await expect(chance).toHaveText('10%');
		await page.locator('#muons').getByRole('radio', { name: 'Ignore it' }).check();
		await expect(chance).toHaveText(formatChance(muonSurvival(0.995, false)));
		await expect(chance).toHaveText(/^1 in \d(\.\d)? billion$/);
		await page.locator('#muons').getByRole('radio', { name: 'Relativity is real' }).check();
		await page.locator('#muons').getByRole('button', { name: '0.9999 c' }).click();
		await expect(chance).toHaveText('72%');
	});

	test('the traveling twin ends up younger than the twin who stayed home', async ({ page }) => {
		const readouts = page.locator('#twins .readouts');
		await page.locator('#twins').getByRole('button', { name: 'Proxima Centauri' }).click();
		// 72% of a 4.2 light-year round trip at 0.9 c: 6.7 years on Earth, 2.9 aboard, and a road 1.8 light-years long from the ship.
		await expect(readouts).toContainText('6.7');
		await expect(readouts).toContainText('2.9');
		await expect(readouts).toContainText('1.8');
	});

	test('switching on reduced motion while the page is open pauses every chapter', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/experiments/relativity');
		await expect(page.locator('#light-clock').getByRole('button', { name: 'Pause animation' })).toBeVisible();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		for (const id of chapterIds) {
			await expect(page.locator(`#${id}`).getByRole('button', { name: 'Play animation' })).toBeVisible();
		}
	});

	test('scrubbing the twins’ trip pauses playback', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto('/experiments/relativity');
		const twins = page.locator('#twins');
		await expect(twins.getByRole('button', { name: 'Pause animation' })).toBeVisible();
		await twins.locator('#twins-progress').fill('0.5');
		await expect(twins.getByRole('button', { name: 'Play animation' })).toBeVisible();
		await expect(twins.locator('#twins-progress')).toHaveValue('0.5');
	});

	test('a clock deep in the well ticks slowly', async ({ page }) => {
		await page.locator('#gravity').getByRole('button', { name: 'Near the horizon' }).click();
		await expect(page.locator('#gravity #gravity-radius')).toHaveValue('1.1');
		await expect(page.locator('#gravity .readouts dd').first()).toHaveText('0.30×');
	});

	test('the train chapter shows the ball’s sideways speed in each frame', async ({ page }) => {
		await page.locator('#frames-speed').fill('4');
		const readouts = page.locator('#frames .readouts');
		await expect(readouts).toContainText('0 m/s');
		await expect(readouts).toContainText('4 m/s');
		await page.locator('#frames').getByRole('radio', { name: 'The train' }).check();
		await expect(page.locator('#frames').getByRole('radio', { name: 'The train' })).toBeChecked();
	});

	test('sliders announce what changed to screen readers, politely and after a pause', async ({ page }) => {
		await page.locator('#light-clock-speed').fill('0.9');
		await expect(page.locator('p[aria-live="polite"]')).toContainText('0.90 times the speed of light', { timeout: 3000 });
	});
});

test.describe('pinned figures', () => {
	// Whatever the window height, a pinned Stage and Dock must be fully on screen; a figure that is too tall scrolls instead.
	for (const [width, height] of [
		[1920, 1080],
		[1440, 900],
		[1280, 650]
	]) {
		test(`stay on screen or scroll normally at ${width}×${height}`, async ({ page }) => {
			await page.setViewportSize({ width, height });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto('/experiments/relativity');
			await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
			let pinned = 0;
			for (const id of chapterIds) {
				const figure = await page.evaluate((id) => {
					const section = document.getElementById(id)!;
					const el = section.querySelector<HTMLElement>('.chapter-figure')!;
					window.scrollTo(0, section.getBoundingClientRect().top + scrollY + 60);
					const box = el.getBoundingClientRect();
					return { pin: el.dataset.pin, position: getComputedStyle(el).position, top: box.top, bottom: box.bottom, viewport: innerHeight };
				}, id);
				if (figure.pin === 'true') {
					pinned++;
					expect(figure.position, id).toBe('sticky');
					expect(figure.top, id).toBeGreaterThanOrEqual(0);
					expect(figure.bottom, id).toBeLessThanOrEqual(figure.viewport);
				} else expect(figure.position, id).toBe('static');
			}
			// A generous window pins most chapters. A short one never pins the tallest, so it cannot hide its own controls.
			if (height >= 900) expect(pinned).toBeGreaterThanOrEqual(4);
			if (height <= 650) await expect(page.locator('#twins .chapter-figure')).toHaveAttribute('data-pin', 'false');
		});
	}
});

test.describe('the 3D views', () => {
	test('one canvas goes live at a time, follows scrolling, and can be rotated from the keyboard', async ({ page }) => {
		await page.goto('/experiments/relativity');
		const first = page.locator('#frames .stage-view');
		// Chapter 1 starts below the fold on most screens, so it only goes live once it is scrolled into view.
		await first.scrollIntoViewIfNeeded();
		await expect(first).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
		test.skip((await first.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');

		await expect(page.locator('.stage-view canvas')).toHaveCount(1);
		await page.locator('#gravity').scrollIntoViewIfNeeded();
		const last = page.locator('#gravity .stage-view');
		await expect(last).toHaveAttribute('data-state', 'live', { timeout: 15_000 });
		await expect(first).toHaveAttribute('data-state', 'idle');
		await expect(page.locator('.stage-view canvas')).toHaveCount(1);
		await expect(last.locator('canvas')).toHaveCount(1);

		// data-yaw appears with the first drawn frame.
		await expect(last).toHaveAttribute('data-yaw', /^-?\d+$/);
		const before = (await last.getAttribute('data-yaw'))!;
		await last.focus();
		await page.keyboard.press('ArrowRight');
		await expect(last).not.toHaveAttribute('data-yaw', before);
		await page.keyboard.press('0');
		await expect(last).toHaveAttribute('data-yaw', before);
	});

	test('the view is a labelled, focusable application with its keys described', async ({ page }) => {
		await page.goto('/experiments/relativity');
		const view = page.locator('#light-clock .stage-view');
		await expect(view).toHaveAttribute('role', 'application');
		await expect(view).toHaveAttribute('tabindex', '0');
		await expect(view).toHaveAttribute('aria-label', /Two light clocks/);
		await expect(page.locator('#stage-help')).toContainText('arrow keys rotate');
	});

	/**
	 * How blank a chapter's Stage is right now. A scene hidden under the Stage tint is one flat colour, once the labels and the
	 * site's floating menu, which can sit over the Stage, are set aside.
	 */
	async function blankness(page: Page, id: string) {
		const picture = await page.locator(`#${id} .stage-view`).screenshot({ style: '.stage-labels, .concept-header { visibility: hidden !important }' });
		return dominantShare(page, picture);
	}

	/**
	 * Waits until the chapter's Stage shows a scene. Looping scenes fade to their tint once per cycle by design (muons:
	 * about 11 s), and under load each Stage screenshot can take seconds, so the wait spans more than a full cycle rather
	 * than failing on a sample that lands on the fade.
	 */
	async function expectSceneInView(page: Page, id: string, when: string) {
		await expect.poll(() => blankness(page, id), { message: `${id} is blank ${when}`, timeout: 20_000 }).toBeLessThan(0.85);
	}

	/** Checks the Stage over a second, and no moment of it may be blank, so a redraw that lands late is still caught. */
	async function expectSceneStaysInView(page: Page, id: string, when: string) {
		for (let i = 0; i < 5; i++) {
			expect(await blankness(page, id), `${id} is blank ${when}`).toBeLessThan(0.85);
			await page.waitForTimeout(200);
		}
	}

	async function liveView(page: Page, id: string) {
		const view = page.locator(`#${id} .stage-view`);
		await view.scrollIntoViewIfNeeded();
		await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
		test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
	}

	test('every Stage shows its scene on the frame reduced motion starts on', async ({ page }) => {
		// Screenshots every Stage repeatedly; each one is slow when the suite runs in parallel.
		test.slow();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/experiments/relativity');
		for (const id of chapterIds) {
			await liveView(page, id);
			await expectSceneInView(page, id, 'when the page opens');
		}
	});

	test('pausing and restarting a looping scene leaves it in view', async ({ page }) => {
		// Screenshots every Stage repeatedly; each one is slow when the suite runs in parallel.
		test.slow();
		const restarts = { frames: 'Toss again', 'light-speed': 'Fire again', muons: 'Replay' };
		await page.goto('/experiments/relativity');
		for (const [id, restart] of Object.entries(restarts)) {
			await liveView(page, id);
			await expectSceneInView(page, id, 'while playing');
			const chapter = page.locator(`#${id}`);
			await chapter.getByRole('button', { name: 'Pause animation' }).click();
			await chapter.getByRole('button', { name: restart }).click();
			// The restart redraws the first frame, which is what the Stage must not hide.
			await expectSceneStaysInView(page, id, 'after a restart');
		}
	});

	test('leaving the page while the 3D engine is still downloading does not start it', async ({ page }) => {
		// The engine is by far the largest script. Hold it back until the visitor has already left.
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		let waiting = false;
		let delivered = false;
		await page.route(/\/_app\/immutable\/.*\.js$/, async (route) => {
			const response = await route.fetch();
			const body = await response.body();
			const engine = body.length > 300_000;
			if (engine) {
				waiting = true;
				await held;
			}
			await route.fulfill({ response, body });
			if (engine) delivered = true;
		});
		// Building the engine adds a listener for the tab being hidden, so count those.
		await page.addInitScript(() => {
			const counter = window as unknown as { visibilityListeners: number };
			counter.visibilityListeners = 0;
			const add = EventTarget.prototype.addEventListener;
			EventTarget.prototype.addEventListener = function (this: EventTarget, ...args: Parameters<typeof add>) {
				if (this === document && args[0] === 'visibilitychange') counter.visibilityListeners++;
				return add.apply(this, args);
			};
		});
		const listeners = () => page.evaluate(() => (window as unknown as { visibilityListeners: number }).visibilityListeners);

		await page.goto('/experiments/relativity', { waitUntil: 'domcontentloaded' });
		const first = page.locator('#frames .stage-view');
		await first.scrollIntoViewIfNeeded();
		await expect.poll(() => waiting).toBe(true);
		// The page must not be waiting on the engine itself: its Stage reports the engine as on its way.
		await expect(first).toHaveAttribute('data-state', 'loading');

		await page.evaluate(() => ((window as unknown as { sameDocument: boolean }).sameDocument = true));
		await page.getByRole('link', { name: 'All experiments' }).first().click();
		await expect(page).toHaveURL(/\/experiments$/);
		// Only a client-side navigation keeps the page's scripts, and with them the download still under way.
		expect(await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(true);
		const before = await listeners();

		release();
		await expect.poll(() => delivered).toBe(true);
		// Time for the engine's module to run, if it is going to.
		await page.waitForTimeout(500);
		expect(await listeners()).toBe(before);
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the text stays, and the controls that could not work are hidden', async ({ page }) => {
		await page.goto('/experiments/relativity');
		await expect(page.getByRole('heading', { level: 2, name: /A clock\s*made of light/ })).toBeVisible();
		await expect(page.locator('#light-clock .dock')).toBeHidden();
		// innerText, because Playwright's default text match skips <noscript> content.
		await expect(page.locator('#light-clock .stage-view')).toContainText('needs JavaScript', { useInnerText: true });
	});
});
