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

test.describe('Hangul syllable builder', () => {
	test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

	const stage = (page: Page) => page.locator('.builder .stage');
	const toggle = (page: Page) => page.getByRole('button', { name: /Build syllable|Separate pieces/ });
	const result = (page: Page) => page.locator('.builder .result');
	const rect = async (page: Page, selector: string) => {
		const box = await page.locator(`.builder ${selector}`).boundingBox();
		if (!box) throw new Error(`${selector} not rendered`);
		return box;
	};

	test('both equations are readable text before and without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/projects/learning-korean');
		const equations = page.locator('.equations li');
		await expect(equations).toHaveCount(2);
		await expect(equations.nth(0)).toContainText('ㅂ + ㅏ → 바');
		await expect(equations.nth(0)).toContainText('tall vowel');
		await expect(equations.nth(1)).toContainText('ㅅ + ㅗ → 소');
		await expect(equations.nth(1)).toContainText('wide vowel');
		await expect(page.locator('.builder button, .builder input')).toHaveCount(0);
		expect((await page.locator('.builder').boundingBox())?.height ?? 1).toBeLessThan(2);
		await context.close();
	});

	test('ba assembles with the consonant beside the vowel, then separates', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(stage(page)).toHaveAttribute('data-state', 'separated');
		const apart = { c: await rect(page, '.consonant'), v: await rect(page, '.vowel') };
		await toggle(page).click();
		await expect(stage(page)).toHaveAttribute('data-state', 'assembled');
		await expect(result(page)).toContainText('ㅂ + ㅏ = 바 (ba)');
		const together = { c: await rect(page, '.consonant'), v: await rect(page, '.vowel') };
		const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
		expect(centre(together.c)).toBeLessThan(centre(together.v));
		expect(Math.abs(together.c.y - together.v.y)).toBeLessThan(2);
		expect(centre(together.v) - centre(together.c)).toBeLessThan(centre(apart.v) - centre(apart.c));
		await expect(page.locator('.builder .glyph')).toHaveCSS('opacity', '1');
		await toggle(page).click();
		await expect(stage(page)).toHaveAttribute('data-state', 'separated');
		await expect(page.locator('.builder .glyph')).toHaveCSS('opacity', '0');
		await expect(result(page)).toContainText('ㅂ and ㅏ are apart.');
	});

	test('so stacks the consonant above the vowel, and switching examples resets to separated', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await page.getByLabel(/ㅅ \+ ㅗ/).check();
		await expect(stage(page)).toHaveAttribute('data-example', 'so');
		await expect(stage(page)).toHaveAttribute('data-state', 'separated');
		await toggle(page).click();
		await expect(result(page)).toContainText('ㅅ + ㅗ = 소 (so)');
		const c = await rect(page, '.consonant');
		const v = await rect(page, '.vowel');
		expect(c.y + c.height / 2).toBeLessThan(v.y + v.height / 2);
		expect(Math.abs(c.x - v.x)).toBeLessThan(30);
		await page.getByLabel(/ㅂ \+ ㅏ/).check();
		await expect(stage(page)).toHaveAttribute('data-state', 'separated');
		await expect(result(page)).toContainText('ㅂ and ㅏ are apart.');
		await expect(page.locator('.builder .piece.consonant')).toHaveText('ㅂ');
	});

	test('rapid toggling settles on the last state and focus stays on the button', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		for (let i = 0; i < 7; i++) await toggle(page).click();
		await expect(stage(page)).toHaveAttribute('data-state', 'assembled');
		// Safari does not focus buttons on click, so focus explicitly before using the keyboard.
		await page.getByRole('button', { name: 'Separate pieces' }).focus();
		await page.keyboard.press('Space');
		await expect(stage(page)).toHaveAttribute('data-state', 'separated');
		await page.keyboard.press('Enter');
		await expect(stage(page)).toHaveAttribute('data-state', 'assembled');
		await expect(page.getByRole('button', { name: 'Separate pieces' })).toBeFocused();
	});

	test('the figure is decorative to assistive tech and the result is a single polite region', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(stage(page)).toHaveAttribute('aria-hidden', 'true');
		await expect(page.locator('.builder [aria-live="polite"]')).toHaveCount(1);
	});

	test('reduced motion changes state with no running animation', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await toggle(page).click();
		expect(await page.locator('.builder .piece').first().evaluate((el) => el.getAnimations().length)).toBe(0);
		await expect(page.locator('.builder .glyph')).toHaveCSS('opacity', '1');
	});

	test('the contents indicator still follows the reader after the lesson grew', async ({ page }) => {
		await page.goto('/projects/learning-korean#practice');
		await expect(active(page)).toHaveAttribute('href', '#practice');
	});

	for (const width of [320, 390]) {
		test(`fits at ${width}px with 44px controls and no overflow`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/projects/learning-korean');
			await expect(toggle(page)).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			for (const height of await page.locator('.builder label, .builder .toggle').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
				expect(height).toBeGreaterThanOrEqual(44);
			}
			const box = await stage(page).boundingBox();
			expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
		});
	}
});
