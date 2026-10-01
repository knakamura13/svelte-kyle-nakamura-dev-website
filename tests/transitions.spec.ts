import { expect, test, type Page } from '@playwright/test';

// Records every startViewTransition call and lets a test replace the browser's implementation.
async function watchTransitions(page: Page, mode: 'native' | 'missing' | 'throws' | 'rejects' = 'native') {
	await page.addInitScript((kind) => {
		const calls: string[] = [];
		Object.defineProperty(window, '__transitions', { value: calls });
		const native = document.startViewTransition?.bind(document);
		if (kind === 'missing') {
			Reflect.deleteProperty(Document.prototype, 'startViewTransition');
			return;
		}
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value: (update: () => Promise<void>) => {
				calls.push(location.pathname);
				if (kind === 'throws') throw new Error('boom');
				if (kind === 'rejects') {
					// A transition that is skipped before its update callback ever runs.
					const rejected = Promise.reject(new DOMException('Skipped', 'AbortError'));
					rejected.catch(() => {});
					return { ready: rejected, updateCallbackDone: rejected, finished: Promise.resolve(), skipTransition() {} };
				}
				if (!native) {
					void update();
					return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} };
				}
				return native(update);
			}
		});
	}, mode);
	return () => page.evaluate(() => [...(Reflect.get(window, '__transitions') as string[])]);
}

const settled = async (page: Page) => {
	await expect.poll(() => page.evaluate(() => document.documentElement.dataset.routeTransition ?? null)).toBeNull();
	expect(await page.evaluate(() => document.documentElement.style.scrollBehavior)).toBe('');
};
const storyResumeLink = (page: Page) => page.locator('.case-end').getByRole('link', { name: 'Résumé' });

test.describe('route transitions', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('story to résumé transitions; Back is ordinary navigation; no temporary state remains', async ({ page }) => {
		const calls = await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await storyResumeLink(page).click();
		await expect(page).toHaveURL(/\/resume$/);
		await expect(page).toHaveTitle('Résumé — Kyle Nakamura');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await settled(page);
		await page.goBack();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await expect(page).toHaveTitle('Learning Korean — Kyle Nakamura');
		await settled(page);
		expect(await calls()).toHaveLength(1);
		// One capsule only: the shell is never duplicated into the page.
		await expect(page.locator('.capsule')).toHaveCount(1);
	});

	test('hash links and routes outside the eligible pairs use ordinary navigation', async ({ page }) => {
		const calls = await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await page.locator('.case-contents a[href="#practice"]').click();
		await expect(page).toHaveURL(/#practice$/);
		await page.goto('/resume');
		await page.getByRole('contentinfo').getByRole('link', { name: 'Experiments' }).click();
		await expect(page).toHaveURL(/\/experiments$/);
		expect(await calls()).toEqual([]);
	});

	test.describe('home and the Learning Korean story', () => {
		// The capsule hides on scroll; reveal it before using its links.
		const showCapsule = async (page: Page) => {
			const nav = page.getByRole('navigation', { name: 'Main navigation' });
			await expect
				.poll(async () => {
					await page.mouse.wheel(0, -80);
					return nav.evaluate((el) => !el.classList.contains('nav-hidden') && el.getBoundingClientRect().top >= 0);
				})
				.toBe(true);
		};

		for (const [name, locate] of [
			['thumbnail', (page: Page) => page.locator('#korean .korean-thumbnail')],
			['title', (page: Page) => page.locator('#korean h3 a')],
			['"Read the project story"', (page: Page) => page.locator('#korean').getByRole('link', { name: 'Read the project story' })]
		] as const) {
			test(`the ${name} link transitions from home to the story`, async ({ page }) => {
				const calls = await watchTransitions(page);
				await page.goto('/#work');
				await locate(page).click();
				await expect(page).toHaveURL(/\/projects\/learning-korean$/);
				await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Learning Korean,/);
				await settled(page);
				expect(await calls()).toHaveLength(1);
			});
		}

		for (const [name, locate] of [
			['"All projects"', (page: Page) => page.locator('.page-back')],
			['"Back to selected projects"', (page: Page) => page.locator('.case-end').getByRole('link', { name: 'Back to selected projects' })],
			['capsule Work', (page: Page) => page.locator('.capsule').getByRole('link', { name: 'Work' })]
		] as const) {
			test(`the ${name} link transitions from the story to /#work and the arrival cue shows`, async ({ page }) => {
				const calls = await watchTransitions(page);
				await page.goto('/projects/learning-korean');
				if (name === '"Back to selected projects"') await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
				if (name === 'capsule Work') await showCapsule(page);
				await locate(page).click();
				await expect(page).toHaveURL(/\/#work$/);
				await settled(page);
				expect(await calls()).toHaveLength(1);
				await expect(page.locator('#work')).toHaveAttribute('data-arrived', '');
				await expect.poll(() => page.locator('#work').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(200);
			});
		}

		test('the mobile Menu\'s Selected work link navigates plainly, since its panel is still closing', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			const calls = await watchTransitions(page);
			await page.goto('/projects/learning-korean');
			await page.getByRole('button', { name: /^Menu/ }).click();
			// The link closes the Menu on click; the leaving panel would be frozen into the snapshot.
			await page.locator('#mobile-links').getByRole('link', { name: /Selected work/ }).click();
			await expect(page).toHaveURL(/\/#work$/);
			await settled(page);
			expect(await calls()).toEqual([]);
		});

		test('other home journeys stay ordinary: same-page hashes, home to résumé, home to experiments, the Project Stack card', async ({ page }) => {
			const calls = await watchTransitions(page);
			await page.goto('/');
			await page.locator('.project-stack a[href="#korean"]').click();
			await expect(page).toHaveURL(/#korean$/);
			await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
			await page.locator('.intro-about').click();
			await expect(page).toHaveURL(/#about$/);
			await page.goto('/');
			await page.locator('.personal-links').getByRole('link', { name: /^Résumé/ }).click();
			await expect(page).toHaveURL(/\/resume$/);
			await page.goto('/');
			await page.getByRole('contentinfo').getByRole('link', { name: 'Experiments' }).click();
			await expect(page).toHaveURL(/\/experiments$/);
			await page.goto('/resume');
			await page.locator('.capsule').getByRole('link', { name: 'Work' }).click();
			await expect(page).toHaveURL(/\/#work$/);
			expect(await calls()).toEqual([]);
		});

		test('Back from the story to home is ordinary navigation', async ({ page }) => {
			const calls = await watchTransitions(page);
			await page.goto('/#work');
			await page.locator('#korean h3 a').click();
			await expect(page).toHaveURL(/\/projects\/learning-korean$/);
			await settled(page);
			await page.goBack();
			await expect(page).toHaveURL(/\/#work$/);
			await settled(page);
			expect(await calls()).toHaveLength(1);
		});
	});

	test('direct loads show their content without a transition', async ({ page }) => {
		const calls = await watchTransitions(page);
		await page.goto('/resume');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(await calls()).toEqual([]);
	});

	for (const mode of ['missing', 'throws', 'rejects'] as const) {
		test(`a ${mode} View Transitions API still reaches the route with content visible`, async ({ page }) => {
			await watchTransitions(page, mode);
			await page.goto('/projects/learning-korean');
			await storyResumeLink(page).click();
			await expect(page).toHaveURL(/\/resume$/);
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Résumé,\s*in full\./);
			await expect(page.locator('main')).toHaveCSS('opacity', '1');
			await settled(page);
		});
	}

	test('reduced motion skips the transition entirely', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const calls = await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await storyResumeLink(page).click();
		await expect(page).toHaveURL(/\/resume$/);
		expect(await calls()).toEqual([]);
	});

	test('rapid back and forward right after a transition keeps the URL and the page in step', async ({ page }) => {
		await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await storyResumeLink(page).click();
		// Back and forward while the first transition is still running.
		await expect(page).toHaveURL(/\/resume$/);
		await page.goBack();
		await page.goForward();
		await expect(page).toHaveURL(/\/resume$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Résumé,\s*in full\./);
		await settled(page);
	});

	test('back restores the scroll position and focus behaves like ordinary navigation', async ({ page }) => {
		await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
		const before = await page.evaluate(() => scrollY);
		await storyResumeLink(page).click();
		await expect(page).toHaveURL(/\/resume$/);
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
		await settled(page);
		await page.goBack();
		await expect(page).toHaveURL(/\/projects\/learning-korean$/);
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 5);
		await settled(page);
	});

	test('navigating with the Contact panel open closes it and skips the transition', async ({ page }) => {
		const calls = await watchTransitions(page);
		await page.goto('/projects/learning-korean');
		await page.getByRole('button', { name: /^Contact/ }).click();
		await expect(page.locator('#contact-panel')).toBeVisible();
		await page.locator('.capsule').getByRole('link', { name: /^Résumé/ }).click();
		await expect(page).toHaveURL(/\/resume$/);
		await expect(page.locator('#contact-panel')).toHaveCount(0);
		await settled(page);
		expect(await calls()).toEqual([]);
	});

	for (const [where, expected] of [['top', ''], ['bottom', undefined]] as const) {
		test(`the identity is held still only when it is on screen (${where})`, async ({ page }) => {
			await page.addInitScript(() => {
				const seen: Array<string | undefined> = [];
				Object.defineProperty(window, '__identityFlag', { value: seen });
				const native = document.startViewTransition?.bind(document);
				Object.defineProperty(document, 'startViewTransition', {
					configurable: true,
					value: (update: () => Promise<void>) => {
						seen.push(document.documentElement.dataset.routeIdentity);
						return native ? native(update) : (void update(), { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} });
					}
				});
			});
			await page.goto('/projects/learning-korean');
			if (where === 'bottom') {
				await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
				await storyResumeLink(page).click();
			} else {
				await page.locator('.capsule').getByRole('link', { name: /^Résumé/ }).click();
			}
			await expect(page).toHaveURL(/\/resume$/);
			await settled(page);
			expect(await page.evaluate(() => Reflect.get(window, '__identityFlag'))).toEqual([expected]);
			expect(await page.evaluate(() => document.documentElement.dataset.routeIdentity ?? null)).toBeNull();
		});
	}
});

test.describe('route transitions without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('links are ordinary page loads', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await storyResumeLink(page).click();
		await expect(page).toHaveURL(/\/resume$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Résumé,\s*in full\./);
	});
});
