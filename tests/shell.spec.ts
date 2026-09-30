import { expect, test } from '@playwright/test';
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
