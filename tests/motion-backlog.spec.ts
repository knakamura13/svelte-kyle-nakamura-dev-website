import { expect, test } from '@playwright/test';

test.describe('motion backlog', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('records stagger by 50ms and stop at 100ms', async ({ page }) => {
		await page.goto('/#about');
		const delays = await page.locator('#about .record').evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDelay.split(',')[0].trim()));
		expect(delays).toEqual(['0s', '0.05s', '0.1s']);
	});

	test('the story example waits 50ms behind its paragraph', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect.poll(() => page.locator('.case-example').evaluate((el) => getComputedStyle(el).transitionDelay.split(',')[0].trim())).toBe('0.05s');
	});

	test('the promoted Korean card darkens the second syllable', async ({ page }) => {
		await page.goto('/');
		const syllable = page.locator('.stack-korean .hangul > span');
		await page.locator('.stack-korean').focus();
		await expect.poll(() => page.locator('.stack-korean').getAttribute('data-active')).toBe('true');
		await expect.poll(() => syllable.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(49, 83, 59)');
	});

	test('a left arrow nudges left on focus and an up-right arrow nudges up-right', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		const left = page.locator('.page-back svg');
		await page.locator('.page-back').focus();
		await expect.poll(() => left.evaluate((el) => getComputedStyle(el).transform)).toContain('matrix(1, 0, 0, 1, -2');
		await page.goto('/');
		const up = page.locator('.personal-links .text-link svg').first();
		await page.locator('.personal-links .text-link').first().focus();
		await expect.poll(() => up.evaluate((el) => getComputedStyle(el).transform)).toContain('matrix(1, 0, 0, 1, 2, -2');
	});

	test('capsule links press to 0.97 and stay full size when motion is reduced', async ({ page }) => {
		await page.goto('/');
		const link = page.locator('.capsule').getByRole('link', { name: 'Work' });
		await link.hover();
		await page.mouse.down();
		await expect.poll(() => link.evaluate((el) => getComputedStyle(el).scale)).toBe('0.97');
		await page.mouse.up();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const again = page.locator('.capsule').getByRole('link', { name: 'Work' });
		await again.hover();
		await page.mouse.down();
		await expect.poll(() => again.evaluate((el) => getComputedStyle(el).scale)).not.toBe('0.97');
		await page.mouse.up();
	});

	test('thumbnail hover and focus stay within 1.02', async ({ page }) => {
		await page.goto('/#work');
		const img = page.locator('#korean .korean-thumbnail img');
		await page.locator('#korean .korean-thumbnail').focus();
		await expect.poll(() => img.evaluate((el) => getComputedStyle(el).transform)).toContain('matrix(1.02');
	});

	test('the ㅁ outline is drawn once and is already drawn when motion is reduced', async ({ page }) => {
		await page.goto('/projects/learning-korean#lesson');
		const rect = page.locator('.discover rect');
		await expect(rect).toHaveCount(1);
		await expect.poll(() => rect.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(142, 175, 126)');
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/projects/learning-korean#lesson');
		await expect.poll(() => page.locator('.discover rect').evaluate((el) => getComputedStyle(el).strokeDashoffset)).toBe('0px');
	});
});
