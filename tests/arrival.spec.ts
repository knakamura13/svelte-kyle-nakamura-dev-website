import { expect, test, type Page } from '@playwright/test';

const frame = (page: Page, id: string) => page.locator(`#${id} .compact-image`);
const accentShadow = 'rgb(39, 107, 66) 0px 0px 0px 2px inset';
const ruleOpacity = (page: Page, id: string) =>
	page.locator(`#${id} h2`).evaluate((h) => getComputedStyle(h, '::before').getPropertyValue('content') !== 'none' && getComputedStyle(h, '::before').content !== 'normal');
const marked = (page: Page) => page.locator('[data-arrived]').evaluateAll((els) => els.map((el) => el.id));

test.describe('anchor arrival cue', () => {
	test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

	for (const id of ['korean', 'mlrose', 'oc-foods']) {
		test(`direct load of #${id} accents its thumbnail frame only`, async ({ page }) => {
			await page.goto(`/#${id}`);
			await expect(frame(page, id)).toHaveCSS('box-shadow', accentShadow);
			expect(await marked(page)).toEqual([id]);
			for (const other of ['korean', 'mlrose', 'oc-foods'].filter((o) => o !== id)) await expect(frame(page, other)).toHaveCSS('box-shadow', 'none');
		});
	}

	for (const id of ['work', 'about']) {
		test(`direct load of #${id} shows the heading rule`, async ({ page }) => {
			await page.goto(`/#${id}`);
			expect(await ruleOpacity(page, id)).toBe(true);
		});
	}

	test('Project Stack cards land on their description and move the cue; the previous one clears', async ({ page }) => {
		await page.goto('/');
		await page.locator('.project-stack a[href="#mlrose"]').click();
		await expect(page).toHaveURL(/#mlrose$/);
		await expect(frame(page, 'mlrose')).toHaveCSS('box-shadow', accentShadow);
		await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
		await page.locator('.project-stack a[href="#oc-foods"]').click();
		await expect(page).toHaveURL(/#oc-foods$/);
		await expect(frame(page, 'oc-foods')).toHaveCSS('box-shadow', accentShadow);
		await expect(frame(page, 'mlrose')).toHaveCSS('box-shadow', 'none');
		expect(await marked(page)).toEqual(['oc-foods']);
	});

	test('a cross-route Work link from the résumé gets the cue, and back/forward keeps it in step', async ({ page }) => {
		await page.goto('/resume');
		await page.locator('.capsule').getByRole('link', { name: 'Work' }).click();
		await expect(page).toHaveURL(/\/#work$/);
		expect(await ruleOpacity(page, 'work')).toBe(true);
		expect(await marked(page)).toEqual(['work']);
		await page.locator('.capsule').getByRole('link', { name: 'About' }).click();
		await expect(page).toHaveURL(/#about$/);
		expect(await marked(page)).toEqual(['about']);
		await page.goBack();
		await expect(page).toHaveURL(/#work$/);
		await expect.poll(() => marked(page)).toEqual(['work']);
	});

	test('the same destination twice keeps the cue without replaying', async ({ page }) => {
		await page.goto('/#korean');
		await expect(frame(page, 'korean')).toHaveCSS('box-shadow', accentShadow);
		await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
		await page.locator('.project-stack a[href="#korean"]').click();
		await expect(frame(page, 'korean')).toHaveCSS('box-shadow', accentShadow);
	});

	test('bare /, unknown hashes and other pages have no cue', async ({ page }) => {
		await page.goto('/');
		expect(await marked(page)).toEqual([]);
		await page.goto('/#nonsense');
		expect(await marked(page)).toEqual([]);
		for (const id of ['korean', 'mlrose', 'oc-foods']) await expect(frame(page, id)).toHaveCSS('box-shadow', 'none');
	});

	test('the cue does not change layout, and the thumbnail never fades', async ({ page }) => {
		await page.goto('/');
		const before = await frame(page, 'mlrose').boundingBox();
		await page.goto('/#mlrose');
		await expect(frame(page, 'mlrose')).toHaveCSS('box-shadow', accentShadow);
		const after = await frame(page, 'mlrose').boundingBox();
		expect([after?.width, after?.height].map((n) => Math.round(n ?? -1))).toEqual([before?.width, before?.height].map((n) => Math.round(n ?? -2)));
		await expect(frame(page, 'mlrose')).toHaveCSS('opacity', '1');
	});

	test('the frame stays distinct from keyboard focus', async ({ page }) => {
		await page.goto('/#korean');
		await page.locator('#korean .compact-image').focus();
		const focusOutline = await page.locator('#korean .compact-image').evaluate((el) => getComputedStyle(el).outlineColor);
		expect(focusOutline).not.toBe('rgb(39, 107, 66)');
	});

	for (const width of [320, 390]) {
		test(`at ${width}px the rule and frame are visible without overflow`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/#about');
			const rule = await page.locator('#about h2').evaluate((h) => {
				const box = h.getBoundingClientRect();
				return box.left - 14;
			});
			expect(rule).toBeGreaterThanOrEqual(0);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		});
	}
});

test.describe('anchor arrival without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test(':target alone gives the cue', async ({ page }) => {
		await page.goto('/#oc-foods');
		await expect(frame(page, 'oc-foods')).toHaveCSS('box-shadow', accentShadow);
	});
});
