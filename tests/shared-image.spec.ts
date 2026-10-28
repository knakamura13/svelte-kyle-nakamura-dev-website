import { expect, test, type Page } from '@playwright/test';

const SHARED = 'korean-project';

// Which images carry the shared name right now. The Project Stack copy must never be one of them.
async function named(page: Page) {
	return page.evaluate((name) => {
		return [...document.images]
			.filter((img) => img.style.viewTransitionName === name)
			.map((img) => {
				if (img.closest('.stack-korean')) return 'stack';
				if (img.closest('.korean-thumbnail')) return 'thumbnail';
				if (img.closest('.case-figure')) return 'figure';
				return 'other';
			});
	}, SHARED);
}

// Records the shared name on the old snapshot and again after the route has rendered.
async function watchShared(page: Page) {
	const shots: { old: string[]; neu: string[] } = { old: [], neu: [] };
	await page.addInitScript((name) => {
		const shots: { old: string[]; neu: string[] } = { old: [], neu: [] };
		Object.defineProperty(window, '__shared', { value: shots });
		const list = () =>
			[...document.images]
				.filter((img) => img.style.viewTransitionName === name)
				.map((img) => {
					if (img.closest('.stack-korean')) return 'stack';
					if (img.closest('.korean-thumbnail')) return 'thumbnail';
					if (img.closest('.case-figure')) return 'figure';
					return 'other';
				});
		const native = document.startViewTransition?.bind(document);
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value: (update: () => Promise<void> | void) => {
				shots.old = list();
				const run = async () => {
					await update?.();
					shots.neu = list();
				};
				if (!native) {
					void run();
					return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} };
				}
				return native(run);
			}
		});
	}, SHARED);
	return async () => page.evaluate(() => Reflect.get(window, '__shared') as { old: string[]; neu: string[] });
}

test.describe('shared image', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	for (const [name, locate] of [
		['thumbnail', (page: Page) => page.locator('#korean .korean-thumbnail')],
		['title', (page: Page) => page.locator('#korean h3 a')],
		['"Read the project story"', (page: Page) => page.locator('#korean').getByRole('link', { name: 'Read the project story' })]
	] as const) {
		test(`the ${name} link morphs the thumbnail into the story figure`, async ({ page }) => {
			const shots = await watchShared(page);
			await page.goto('/#work');
			await locate(page).click();
			await expect(page).toHaveURL(/\/projects\/learning-korean$/);
			await expect.poll(async () => (await shots()).neu).toEqual(['figure']);
			expect((await shots()).old).toEqual(['thumbnail']);
			await expect.poll(() => named(page)).toEqual([]);
		});
	}

	test('a return to /#work morphs the figure back into the thumbnail, not the Project Stack', async ({ page }) => {
		const shots = await watchShared(page);
		await page.goto('/projects/learning-korean');
		await page.locator('.page-back').click();
		await expect(page).toHaveURL(/\/#work$/);
		await expect(page.locator('#work')).toHaveAttribute('data-arrived', '');
		await expect.poll(async () => (await shots()).neu).toEqual(['thumbnail']);
		expect((await shots()).old).toEqual(['figure']);
		expect((await shots()).old).not.toContain('stack');
		expect((await shots()).neu).not.toContain('stack');
		await expect.poll(() => named(page)).toEqual([]);
		// The morph is a view-transition pseudo, so the thumbnail itself is not left transformed.
		await expect.poll(() => page.locator('#korean .korean-thumbnail img').evaluate((img) => getComputedStyle(img).transform)).toBe('none');
	});

	test('an offscreen thumbnail navigates with no shared name', async ({ page }) => {
		const shots = await watchShared(page);
		await page.goto('/#work');
		await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
		await page.evaluate(() => {
			const link = document.querySelector('#korean h3 a');
			if (!(link instanceof HTMLAnchorElement)) throw new Error('missing title link');
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window }));
		});
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await expect.poll(async () => (await shots()).old).toEqual([]);
		expect((await shots()).neu).toEqual([]);
		await expect.poll(() => named(page)).toEqual([]);
	});

	test('a thumbnail that has not decoded yet navigates with no shared name', async ({ page }) => {
		const shots = await watchShared(page);
		await page.goto('/#work');
		await page.evaluate(() => {
			const img = document.querySelector('#korean .korean-thumbnail img');
			if (!(img instanceof HTMLImageElement)) throw new Error('missing thumbnail');
			img.src = '/images/does-not-exist.png';
		});
		await page.locator('#korean h3 a').click();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await expect.poll(async () => (await shots()).old).toEqual([]);
		expect((await shots()).neu).toEqual([]);
	});

	test('a short screen whose story figure is below the fold does not name that figure', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 500 });
		const shots = await watchShared(page);
		await page.goto('/#work');
		await page.locator('#korean h3 a').click();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		const figureTop = await page.locator('.case-figure img').evaluate((img) => img.getBoundingClientRect().top);
		expect(figureTop).toBeGreaterThan(500);
		await expect.poll(async () => (await shots()).neu).toEqual([]);
		await expect.poll(() => named(page)).toEqual([]);
	});

	test('an ineligible destination keeps the named source snapshot fading with the page', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 500 });
		await page.addInitScript((name) => {
			const native = document.startViewTransition?.bind(document);
			Object.defineProperty(document, 'startViewTransition', {
				configurable: true,
				value: (update: () => Promise<void> | void) => {
					const sourceNamed = [...document.images].some((img) => img.style.viewTransitionName === name && !!img.closest('.korean-thumbnail'));
					if (!native) {
						void update?.();
						return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} };
					}
					const transition = native(async () => {
						await update?.();
					});
					const sample = transition.ready.then(() => {
						const old = getComputedStyle(document.documentElement, `::view-transition-old(${name})`);
						const rootOld = getComputedStyle(document.documentElement, '::view-transition-old(root)');
						return {
							sourceNamed,
							opacity: old.opacity,
							animationName: old.animationName,
							rootAnimationName: rootOld.animationName,
							shared: document.documentElement.hasAttribute('data-shared-image')
						};
					});
					Object.defineProperty(window, '__fallback', { configurable: true, value: sample });
					return transition;
				}
			});
		}, SHARED);
		await page.goto('/#work');
		await page.locator('#korean h3 a').click();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		const figureTop = await page.locator('.case-figure img').evaluate((img) => img.getBoundingClientRect().top);
		expect(figureTop).toBeGreaterThan(500);
		const sample = await page.evaluate(async () => Reflect.get(window, '__fallback') as Promise<{ sourceNamed: boolean; opacity: string; animationName: string; rootAnimationName: string; shared: boolean }>);
		expect(sample.sourceNamed).toBe(true);
		expect(sample.shared).toBe(false);
		expect(sample.opacity).not.toBe('0');
		expect(sample.animationName).toBe(sample.rootAnimationName);
		expect(sample.rootAnimationName).not.toBe('none');
	});

	test('reduced motion does not name either image', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const shots = await watchShared(page);
		await page.goto('/#work');
		await page.locator('#korean h3 a').click();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		expect(await shots()).toEqual({ old: [], neu: [] });
		expect(await named(page)).toEqual([]);
	});

	test('a quick Back clears any shared name', async ({ page }) => {
		await watchShared(page);
		await page.goto('/#work');
		await page.locator('.capsule.pill-ready').waitFor();
		await page.locator('#korean h3 a').click();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await page.goBack();
		await expect(page).toHaveURL(/\/#work$/);
		await expect.poll(() => named(page)).toEqual([]);
		await expect.poll(() => page.evaluate(() => document.documentElement.dataset.routeTransition ?? null)).toBeNull();
	});
});
