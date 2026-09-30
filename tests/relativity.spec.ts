import { expect, test } from '@playwright/test';
import { formatChance } from '../src/lib/experiments/relativity/format';
import { muonSurvival } from '../src/lib/experiments/relativity/physics';

const chapterIds = ['frames', 'light-speed', 'light-clock', 'twins', 'muons', 'gravity'];

test.describe('the experiments index', () => {
	test('lists the relativity experiment and links to it', async ({ page }) => {
		await page.goto('/experiments');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Experiments,\s*to play with\./);
		const link = page.getByRole('link', { name: 'Relativity, in three dimensions' });
		await expect(link).toHaveAttribute('href', '/experiments/relativity');
		await expect(page.getByRole('img', { name: /Two light clocks/ })).toBeVisible();
	});
});

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
