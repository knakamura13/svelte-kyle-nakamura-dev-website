import { expect, test, type Page } from '@playwright/test';

const ids = ['lesson', 'practice', 'guest', 'status'];
const active = (page: Page) => page.locator('.case-contents a[data-active]');
const scrollToSection = (page: Page, id: string, offset: number) =>
	page.evaluate(([target, delta]) => scrollTo(0, (document.getElementById(target as string)?.getBoundingClientRect().top ?? 0) + scrollY + (delta as number)), [id, offset]);

test.describe('Learning Korean contents', () => {
	// Reduced motion turns off smooth scrolling, so each jump lands immediately instead of racing the assertions.
	test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

	test('nothing is active before the first section, then one link follows the reader', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(active(page)).toHaveCount(0);
		const line = await page.locator('#lesson').evaluate((el) => parseFloat(getComputedStyle(el).scrollMarginTop));
		for (const id of ids.slice(0, 3)) {
			await scrollToSection(page, id, -line + 4);
			await expect(active(page)).toHaveCount(1);
			await expect(active(page)).toHaveAttribute('href', `#${id}`);
		}
		await scrollToSection(page, 'practice', -line - 80);
		await expect(active(page)).toHaveAttribute('href', '#lesson');
	});

	test('the short final section wins at the bottom and stays after the article', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
		await expect(active(page)).toHaveAttribute('href', '#status');
		await expect(active(page)).toHaveCount(1);
	});

	test('large jumps and direct fragment loads settle on the right section', async ({ page }) => {
		await page.goto('/projects/learning-korean#practice');
		await expect(active(page)).toHaveAttribute('href', '#practice');
		await page.goto('/projects/learning-korean#status');
		await expect(active(page)).toHaveAttribute('href', '#status');
		await page.evaluate(() => scrollTo(0, 0));
		await expect(active(page)).toHaveCount(0);
		await page.keyboard.press('End');
		await expect(active(page)).toHaveAttribute('href', '#status');
		await page.keyboard.press('Home');
		await expect(active(page)).toHaveCount(0);
	});

	test('scrolling never moves focus, and the marker adds no layout shift or live region', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		const links = page.locator('.case-contents a');
		const before = await links.evaluateAll((els) => els.map((el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]));
		await links.nth(2).focus();
		await scrollToSection(page, 'practice', 0);
		await expect(active(page)).toHaveAttribute('href', '#practice');
		await expect(links.nth(2)).toBeFocused();
		const after = await links.evaluateAll((els) => els.map((el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]));
		expect(after).toEqual(before);
		expect(await page.locator('.case-contents [aria-live], .case-contents [role="status"]').count()).toBe(0);
		await expect(links.nth(1)).toHaveAttribute('href', '#practice');
	});

	test('leaving and revisiting the route keeps working without errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/projects/learning-korean');
		await page.getByRole('link', { name: 'Back to selected projects' }).click();
		await expect(page).toHaveURL(/\/#work$/);
		await page.goBack();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await expect(page.locator('.case-contents a')).toHaveCount(4);
		// SvelteKit restores the saved scroll position after navigating back, so keep scrolling until it settles.
		await expect
			.poll(async () => {
				await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
				return active(page).getAttribute('href');
			})
			.toBe('#status');
		expect(errors).toEqual([]);
	});

});

test.describe('Learning Korean contents without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('keeps four working anchors and no active marker', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(page.locator('.case-contents a')).toHaveCount(4);
		await expect(active(page)).toHaveCount(0);
	});
});

test.describe('on phones', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

	test('the compact marker keeps 44px targets and no overflow', async ({ page }) => {
		await page.goto('/projects/learning-korean#guest');
		await expect(active(page)).toHaveAttribute('href', '#guest');
		for (const box of await page.locator('.case-contents a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
			expect(box).toBeGreaterThanOrEqual(44);
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
});
