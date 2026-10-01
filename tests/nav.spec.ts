import { expect, test, type Page } from '@playwright/test';

const pill = (page: Page) => page.locator('.nav-pill');
const link = (page: Page, name: RegExp | string) => page.locator('.capsule > a.desktop-nav').filter({ hasText: name });
const box = async (locator: ReturnType<Page['locator']>) => {
	const b = await locator.boundingBox();
	if (!b) throw new Error('not rendered');
	return b;
};
// The pill moves with a transform, so give a running transition time to land before comparing bounds.
const expectPillOn = async (page: Page, target: ReturnType<Page['locator']>) => {
	await expect
		.poll(async () => {
			const [p, t] = [await box(pill(page)), await box(target)];
			return [p.x - t.x, p.width - t.width, p.y - t.y].every((d) => Math.abs(d) <= 1);
		})
		.toBe(true);
};
const expectNoPill = (page: Page) => expect(pill(page)).not.toHaveClass(/shown/);

test.describe('capsule highlight on desktop', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	const resting: Array<[string, string | null]> = [
		['/resume', 'Résumé'],
		['/projects/learning-korean', 'Work'],
		['/#about', 'About'],
		['/#work', 'Work'],
		['/#korean', 'Work'],
		['/#mlrose', 'Work'],
		['/#oc-foods', 'Work'],
		['/', null],
		['/#nonsense', null],
		['/experiments', null],
		['/does-not-exist', null]
	];
	for (const [path, name] of resting) {
		test(`rests on ${name ?? 'nothing'} at ${path}`, async ({ page }) => {
			await page.goto(path);
			if (name) {
				await expect(pill(page)).toHaveClass(/shown/);
				await expectPillOn(page, link(page, name));
			} else {
				await expectNoPill(page);
			}
		});
	}

	test('only the real current page link has aria-current, and the pill is decorative', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(page.locator('[aria-current]')).toHaveCount(0);
		await page.goto('/resume');
		await expect(page.locator('[aria-current]')).toHaveCount(1);
		await expect(link(page, 'Résumé')).toHaveAttribute('aria-current', 'page');
		await expect(pill(page)).toHaveAttribute('aria-hidden', 'true');
		await expect(pill(page)).toHaveCSS('pointer-events', 'none');
	});

	test('hover moves the pill and leaving returns it', async ({ page }) => {
		await page.goto('/resume');
		await link(page, 'About').hover();
		await expectPillOn(page, link(page, 'About'));
		await page.mouse.move(300, 600);
		await expectPillOn(page, link(page, 'Résumé'));
	});

	test('keyboard focus moves the pill, and Contact is left alone', async ({ page, browserName }) => {
		// Safari's default keeps links out of the Tab order, so Tab never reaches the capsule links there.
		test.skip(browserName === 'webkit', 'WebKit does not Tab to links by default');
		await page.goto('/resume');

		const tabTo = async (target: ReturnType<Page['locator']>) => {
			for (let i = 0; i < 12 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
			await expect(target).toBeFocused();
		};
		await tabTo(link(page, 'Work'));
		await expectPillOn(page, link(page, 'Work'));
		await tabTo(link(page, 'About'));
		await expectPillOn(page, link(page, 'About'));
		const contactButton = page.getByRole('button', { name: /^Contact/ });
		await tabTo(contactButton);
		await expectPillOn(page, link(page, 'Résumé'));
		const [p, contact] = [await box(pill(page)), await box(contactButton)];
		expect(p.x + p.width).toBeLessThanOrEqual(contact.x);
	});

	test('the resting link follows hash links and back/forward', async ({ page }) => {
		// Landing on a hash scrolls down, which hides the capsule; scrolling up brings it back.
		const reveal = async () => {
			const nav = page.getByRole('navigation', { name: 'Main navigation' });
			await expect
				.poll(async () => {
					await page.mouse.wheel(0, -80);
					return nav.evaluate((el) => !el.classList.contains('nav-hidden') && el.getBoundingClientRect().top >= 0);
				})
				.toBe(true);
		};
		// Reduced motion disables smooth scrolling, so the landing scroll cannot hide the capsule again mid-test.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/#work');
		await reveal();
		await link(page, 'About').click();
		await expect(page).toHaveURL(/#about$/);
		await page.mouse.move(300, 600);
		await expectPillOn(page, link(page, 'About'));
		await page.goBack();
		await expect(page).toHaveURL(/#work$/);
		await reveal();
		await page.mouse.move(310, 610);
		await expectPillOn(page, link(page, 'Work'));
	});

	test('the first placement does not fly in from the corner', async ({ page }) => {
		await page.addInitScript(() => {
			const worst: number[] = [0];
			Object.defineProperty(window, '__pillOffset', { value: worst });
			const tick = () => {
				const pillEl = document.querySelector('.nav-pill');
				const current = document.querySelector('.capsule > a[data-resting]');
				if (pillEl?.classList.contains('shown') && current) {
					worst[0] = Math.max(worst[0], Math.abs(pillEl.getBoundingClientRect().left - current.getBoundingClientRect().left));
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		await page.goto('/resume');
		await expect(pill(page)).toHaveClass(/shown/);
		await page.waitForTimeout(400);
		// Sub-pixel font-swap re-measures are fine; travelling from the capsule's corner is not.
		expect(await page.evaluate(() => Reflect.get(window, '__pillOffset')[0])).toBeLessThan(3);
	});

	test('it stays aligned after resizing across the breakpoint and after zoom-sized widths', async ({ page }) => {
		await page.goto('/resume');
		await expectPillOn(page, link(page, 'Résumé'));
		await page.setViewportSize({ width: 600, height: 900 });
		await expect(pill(page)).toBeHidden();
		await page.setViewportSize({ width: 720, height: 900 });
		await expectPillOn(page, link(page, 'Résumé'));
		await page.setViewportSize({ width: 1440, height: 900 });
		await expectPillOn(page, link(page, 'Résumé'));
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});

	test('reduced motion removes the travel', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/resume');
		await expect(pill(page)).toHaveCSS('transition-duration', '0s');
	});

	test('the Contact panel and hiding on scroll still work with the pill', async ({ page }) => {
		await page.goto('/resume');
		await page.getByRole('button', { name: /^Contact/ }).click();
		await expect(page.locator('#contact-panel')).toBeVisible();
		await expectPillOn(page, link(page, 'Résumé'));
	});
});

test.describe('capsule highlight without JavaScript', () => {
	test.use({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });

	test('the current link keeps a static background', async ({ page }) => {
		await page.goto('/resume');
		await expect(link(page, 'Résumé')).toHaveAttribute('data-resting', '');
		await expect(link(page, 'Résumé')).toHaveCSS('background-color', 'rgb(240, 242, 238)');
		await expect(link(page, 'Work')).not.toHaveAttribute('data-resting', '');
	});
});

test.describe('menu on phones', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

	test('no moving pill; the current destination is marked in the Menu', async ({ page }) => {
		await page.goto('/resume');
		await expect(pill(page)).toBeHidden();
		await page.getByRole('button', { name: /^Menu/ }).click();
		const current = page.locator('#mobile-links a[data-resting]');
		await expect(current).toHaveCount(1);
		await expect(current).toHaveAttribute('aria-current', 'page');
		await expect(current).toContainText('Résumé');
	});
});
