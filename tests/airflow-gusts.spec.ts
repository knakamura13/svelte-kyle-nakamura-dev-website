import { expect, test, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { decodeSetup, linkCatalog } from '../src/lib/experiments/airflow/link';

/**
 * Issue 92's Gusty switch in the weather: off at first, reached and turned on from the keyboard and said politely, kept in the Share link
 * and back on from it, and while it is on the wind chip's speed moves (and holds still, saying "gusty", with reduced motion asked for).
 * On a phone it is in the weather sheet. The physics is tests/solver/gusts.spec.ts and tests/gpu/gusts.gpu.ts.
 */

/** The coarsest grid and the Home's own view, as the HUD's specs pin them, so the warm-up does not load a busy machine. */
const PAGE = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';
const catalog = linkCatalog(plans, DEVICE_MODELS);

test.use({ locale: 'en-US' });

const hud = (page: Page) => page.locator('.hud');
const live = (page: Page) => page.locator('.hud p[aria-live="polite"]');
const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const gusty = (page: Page) => page.getByRole('switch', { name: 'Gusty' });

async function open(page: Page, path = PAGE) {
	await page.goto(path);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
	await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
}

/** The chip's text, read every 300 ms for `seconds`. */
async function chipTexts(page: Page, chip: string, seconds: number) {
	const seen: string[] = [];
	for (let n = 0; n < seconds / 0.3; n++) {
		seen.push((await page.locator(chip).first().textContent())?.trim() ?? '');
		await page.waitForTimeout(300);
	}
	return seen;
}

test.describe('the Gusty switch on a desktop', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width: 1440, height: 900 });
	});

	test('is off at first, turns on from the keyboard with a polite word, and the wind chip’s speed then moves', async ({ page, browserName }) => {
		await open(page);
		await page.getByRole('button', { name: 'Weather details' }).click();
		await expect(gusty(page)).toHaveAttribute('aria-checked', 'false');
		// A wind to gust: the Fresh breeze, then Tab on to the switch.
		await page.locator('.weather .chip', { hasText: 'Fresh' }).click();
		const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		for (let n = 0; n < 10 && !(await gusty(page).evaluate((el) => el === document.activeElement)); n++) await page.keyboard.press(key);
		await expect(gusty(page)).toBeFocused();
		await page.keyboard.press('Space');
		await expect(gusty(page)).toHaveAttribute('aria-checked', 'true');
		await expect(live(page)).toHaveText('Gusty wind on. The wind’s speed rises and falls about its mean, and its direction wobbles.');
		await expect(page.locator('#hud-gusty-note')).toContainText('nearly twice the mean');
		// The chip names the mean, and the word gusty, for a screen reader; its number moves with the gusts.
		const chip = '.summary .speed-chip';
		await expect(page.locator(chip)).toHaveAttribute('aria-label', /, gusty\. Next speed$/);
		await expect(page.locator(chip)).toHaveAttribute('data-gusty', 'true');
		const seen = await chipTexts(page, chip, 8);
		console.log(`${browserName}: the chip over 8 s: ${[...new Set(seen)].join(', ')}`);
		expect(new Set(seen).size, 'the chip showed more than one speed').toBeGreaterThan(1);
		// Enter turns it off again, and it says so.
		await page.keyboard.press('Enter');
		await expect(gusty(page)).toHaveAttribute('aria-checked', 'false');
		await expect(live(page)).toHaveText('Gusty wind off. The wind blows steady.');
		await expect(page.locator(chip)).not.toHaveAttribute('data-gusty');
	});

	test('is kept in the Share link, and the link turns it back on', async ({ page, browserName }) => {
		const written = await stubClipboard(page, 'succeed');
		await open(page);
		await page.getByRole('button', { name: 'Weather details' }).click();
		await page.locator('.weather .chip', { hasText: 'Gentle' }).click();
		await gusty(page).click();
		await expect(gusty(page)).toHaveAttribute('aria-checked', 'true');
		await page.getByRole('button', { name: 'Advanced' }).click();
		await page.getByRole('button', { name: 'Copy link' }).click();
		await expect.poll(async () => (await written()).length).toBe(1);
		const [link] = await written();
		const hash = new URL(link).hash;
		const setup = decodeSetup(decodeURIComponent(hash.slice(hash.indexOf('s=') + 2)), catalog);
		expect(setup?.conditions.gusty, `${browserName}: the copied link says gusty`).toBe(true);

		// A visitor who opens the link: a page of its own, as a new tab would be.
		const visitor = await page.context().newPage();
		await open(visitor, `${PAGE}${hash}`);
		await visitor.getByRole('button', { name: 'Weather details' }).click();
		await expect(gusty(visitor)).toHaveAttribute('aria-checked', 'true');
		await expect(visitor.locator('.summary .speed-chip')).toHaveAttribute('aria-label', /, gusty\. Next speed$/);
		await visitor.close();
	});

	test('with reduced motion the chip holds the mean and says gusty, while the gusts go on', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await open(page);
		await page.getByRole('button', { name: 'Weather details' }).click();
		await page.locator('.weather .chip', { hasText: 'Fresh' }).click();
		await gusty(page).click();
		// Reduced motion starts the clock paused (experience.svelte.ts); run it, so time passes and the gusts with it.
		const resume = page.getByRole('button', { name: 'Resume' });
		if (await resume.isVisible()) await resume.click();
		const chip = '.summary .speed-chip';
		await expect(page.locator(chip)).toHaveText(/ gusty$/);
		const seen = await chipTexts(page, chip, 3);
		expect(new Set(seen).size, 'the chip holds still').toBe(1);
	});
});

test.describe('the Gusty switch on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });

	test('is in the weather sheet, in full, and the pill’s speed moves once it is on', async ({ page }) => {
		test.setTimeout(180_000);
		await open(page, '/experiments/airflow?cell=0.3');
		await expect(hud(page)).toHaveClass(/\bphone\b/);
		await page.locator('.weather-pill').tap();
		const sheet = page.getByRole('dialog', { name: 'Weather' });
		await expect(sheet.getByRole('switch', { name: 'Gusty' }), 'the switch waits for the grabber').toBeHidden();
		await sheet.getByRole('button', { name: 'Show all of the weather' }).tap();
		await sheet.locator('.chip', { hasText: 'Fresh' }).tap();
		const toggle = sheet.getByRole('switch', { name: 'Gusty' });
		await expect(toggle).toBeVisible();
		const box = (await toggle.boundingBox())!;
		expect(box.height, 'a 44 px target').toBeGreaterThanOrEqual(44);
		await toggle.tap();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');
		await expect(live(page)).toHaveText(/^Gusty wind on\./);
		const seen = await chipTexts(page, '.pill-speed', 8);
		expect(new Set(seen).size, 'the pill showed more than one speed').toBeGreaterThan(1);
	});
});
