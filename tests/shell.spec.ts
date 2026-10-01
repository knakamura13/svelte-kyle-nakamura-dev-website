import { expect, test, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';

test.describe('floating nav', () => {
	test('hides on downward scroll, returns on upward scroll and on keyboard focus', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Main navigation' });
		await page.mouse.move(300, 700);

		for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 150);
		await expect(nav).toHaveClass(/nav-hidden/);
		await expect.poll(async () => (await nav.boundingBox())?.y ?? 0).toBeLessThan(0);

		for (let i = 0; i < 2; i++) await page.mouse.wheel(0, -60);
		await expect(nav).not.toHaveClass(/nav-hidden/);
		await expect.poll(async () => (await nav.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);

		for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 150);
		await expect(nav).toHaveClass(/nav-hidden/);
		await page.getByRole('link', { name: 'Work' }).focus();
		await expect(nav).not.toHaveClass(/nav-hidden/);
		await expect.poll(async () => (await nav.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
	});
});

test.describe('contact panel', () => {
	test('Escape closes it and returns focus to the trigger', async ({ page }) => {
		await page.goto('/');
		const trigger = page.getByRole('button', { name: /^Contact/ });
		await trigger.click();
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('#contact-panel')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('#contact-panel')).toHaveCount(0);
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
		await expect(trigger).toBeFocused();
	});

	test('a click outside closes it', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: /^Contact/ }).click();
		await expect(page.locator('#contact-panel')).toBeVisible();
		await page.mouse.click(200, 600);
		await expect(page.locator('#contact-panel')).toHaveCount(0);
	});

	test('copy email reports success', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await page.goto('/');
		await page.getByRole('button', { name: /^Contact/ }).click();
		await page.getByRole('button', { name: /Copy email/ }).click();
		await expect(page.locator('.copy-status')).toHaveText('Email copied');
		expect(await writes()).toEqual(['knakamura13dev@gmail.com']);
	});

	test('copy email reports failure and leaves the address visible', async ({ page }) => {
		await stubClipboard(page, 'fail');
		await page.goto('/');
		await page.getByRole('button', { name: /^Contact/ }).click();
		await page.getByRole('button', { name: /Copy email/ }).click();
		await expect(page.locator('.copy-status')).toHaveText('Could not copy. Select the email address above.');
		await expect(page.locator('.email-link')).toContainText('knakamura13dev@gmail.com');
	});
});

test.describe('contact panel feedback and motion', () => {
	const trigger = (page: Page) => page.getByRole('button', { name: /^Contact/ });
	const copyButton = (page: Page) => page.getByRole('button', { name: /Copy email/ });

	test('success shows a checkmark, keeps focus on Copy email, and clears after four seconds', async ({ page }) => {
		await page.clock.install();
		await stubClipboard(page, 'succeed');
		await page.goto('/');
		await trigger(page).click();
		await copyButton(page).focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('.contact-panel .copy-glyph')).toHaveAttribute('data-state', 'success');
		await expect(page.locator('.contact-panel .glyph-check')).toHaveCSS('opacity', '1');
		await expect(page.locator('.copy-status')).toHaveText('Email copied');
		await expect(copyButton(page)).toBeFocused();
		await page.clock.fastForward(4100);
		await expect(page.locator('.contact-panel .copy-glyph')).toHaveAttribute('data-state', 'idle');
		await expect(page.locator('.copy-status')).toHaveText('');
	});

	test('failure shows no checkmark, selects only the address, keeps focus, and persists until retry or dismissal', async ({ page }) => {
		await page.clock.install();
		await stubClipboard(page, 'fail');
		await page.goto('/');
		await trigger(page).click();
		await copyButton(page).click();
		await expect(page.locator('.contact-panel .copy-glyph')).toHaveAttribute('data-state', 'failure');
		await expect(page.locator('.contact-panel .glyph-check')).toHaveCSS('opacity', '0');
		await expect(page.locator('.copy-status')).toHaveText('Could not copy. Select the email address above.');
		expect(await page.evaluate(() => getSelection()?.toString())).toBe('knakamura13dev@gmail.com');
		await expect(copyButton(page)).toBeFocused();
		await page.clock.fastForward(10_000);
		await expect(page.locator('.copy-status')).toHaveText('Could not copy. Select the email address above.');
		await page.keyboard.press('Escape');
		await expect(page.locator('#contact-panel')).toHaveCount(0);
		await trigger(page).click();
		await expect(page.locator('.copy-status')).toHaveText('');
	});

	test('a late write cannot change a closed and reopened panel', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve) => setTimeout(resolve, 500)) } });
		});
		await page.goto('/');
		await trigger(page).click();
		await copyButton(page).click();
		await page.keyboard.press('Escape');
		await expect(page.locator('#contact-panel')).toHaveCount(0);
		await trigger(page).click();
		await page.waitForTimeout(800);
		await expect(page.locator('.copy-status')).toHaveText('');
		await expect(page.locator('.contact-panel .copy-glyph')).toHaveAttribute('data-state', 'idle');
	});

	test('the leaving panel is inert, and rapid toggling ends with one coherent panel', async ({ page }) => {
		await page.goto('/');
		await trigger(page).click();
		await expect(page.locator('#contact-panel')).toBeVisible();
		await trigger(page).click();
		await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
		await expect(page.locator('#contact-panel')).toHaveAttribute('inert', '');
		await expect(page.locator('#contact-panel')).toHaveCount(0);
		for (let i = 0; i < 5; i++) await trigger(page).click();
		await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('#contact-panel')).toHaveCount(1);
		await expect(page.locator('#contact-panel')).not.toHaveAttribute('inert', '');
		await expect(copyButton(page)).toBeEnabled();
	});

	test('reduced motion removes the panel immediately and animates nothing', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await trigger(page).click();
		expect(await page.locator('#contact-panel').evaluate((el) => el.getAnimations().length)).toBe(0);
		await page.keyboard.press('Escape');
		await expect(page.locator('#contact-panel')).toHaveCount(0, { timeout: 100 });
	});

	test('status changes do not change the panel height', async ({ page }) => {
		await stubClipboard(page, 'fail');
		await page.goto('/');
		await trigger(page).click();
		const before = Math.round((await page.locator('#contact-panel').boundingBox())?.height ?? 0);
		await copyButton(page).click();
		await expect(page.locator('.copy-status')).not.toHaveText('');
		expect(Math.round((await page.locator('#contact-panel').boundingBox())?.height ?? -1)).toBe(before);
	});

	test('navigating away closes the panel', async ({ page }) => {
		await page.goto('/');
		await trigger(page).click();
		await page.getByRole('link', { name: /^Résumé/ }).first().click();
		await expect(page).toHaveURL(/\/resume$/);
		await expect(page.locator('#contact-panel')).toHaveCount(0);
	});

	test.describe('on phones', () => {
		test.use({ viewport: { width: 320, height: 700 }, hasTouch: true });

		test('Menu and Contact swap without leaving two live panels, and both fit', async ({ page }) => {
			await page.goto('/');
			const menu = page.getByRole('button', { name: /^Menu/ });
			await menu.click();
			await expect(page.locator('#mobile-links')).toBeVisible();
			await trigger(page).click();
			await expect(page.locator('#mobile-links')).toHaveCount(0);
			await expect(page.locator('#contact-panel')).toHaveCount(1);
			await expect(menu).toHaveAttribute('aria-expanded', 'false');
			// Measure after the panel's entrance; mid-slide, float rounding can read 44px as 43.99999px.
			await expect.poll(() => page.locator('#contact-panel').evaluate((el) => el.getAnimations().length)).toBe(0);
			const box = await page.locator('#contact-panel').boundingBox();
			expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
			expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
			for (const b of await page.locator('#contact-panel').getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
				expect(Math.round(b * 100) / 100).toBeGreaterThanOrEqual(44);
			}
		});
	});
});

test.describe('footer', () => {
	test('links to the experiments', async ({ page }) => {
		await page.goto('/resume');
		const link = page.getByRole('contentinfo').getByRole('link', { name: 'Experiments' });
		await expect(link).toHaveAttribute('href', '/experiments');
		await link.click();
		await expect(page).toHaveURL(/\/experiments$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Experiments,\s*to play with\./);
	});

	test('keeps each link on one line at 320 px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 800 });
		await page.goto('/');
		const links = page.getByRole('contentinfo').getByRole('link');
		await expect(links).toHaveCount(4);
		// A link taller than one line means its arrow wrapped beneath the label.
		const oneLine = (await links.first().boundingBox())!.height;
		for (const link of await links.all()) {
			expect((await link.boundingBox())!.height).toBeLessThan(oneLine * 1.25);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	});
});

test('unknown and removed routes return the styled 404', async ({ page }) => {
	for (const path of ['/curling', '/playground', '/does-not-exist']) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(404);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/This page\s*doesn’t exist\./);
		await expect(page.getByRole('link', { name: /Go to the home page/ })).toHaveAttribute('href', '/');
	}
});
