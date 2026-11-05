import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The shell clips overflow, so un-clip it and check that nothing extends past the viewport.
async function expectReflow(page: Page, path: string, width: number) {
	await page.setViewportSize({ width, height: 800 });
	await page.goto(path);
	// addStyleTag waits on a load event that never fires with JavaScript disabled.
	await page.evaluate(() => document.head.append(Object.assign(document.createElement('style'), { textContent: '.concept { overflow: visible !important; }' })));
	const outside = await page.evaluate(() =>
		[...document.querySelectorAll('main *')]
			.filter((el) => { const box = el.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1); })
			.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
	);
	expect(outside).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

const pages = ['/', '/projects/learning-korean', '/resume', '/send-money', '/experiments', '/experiments/relativity', '/does-not-exist'];

for (const path of pages) {
	test.describe(`${path}`, () => {
		// Reduced motion keeps reveal.ts from fading sections to opacity 0, which axe would skip as hidden.
		for (const width of [1440, 390]) {
			test(`has no WCAG 2.1 A/AA violations that axe can detect at ${width}px`, async ({ page }) => {
				await page.setViewportSize({ width, height: 900 });
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await page.goto(path);
				// Contrast is measured against the real type. A fallback font still loading
				// makes axe report the text as unmeasured.
				await page.evaluate(() => document.fonts.ready);
				const { violations, incomplete } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
				expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
				if (width !== 390) return;
				// At 390px the Stacks are plain rows, so axe can measure every card; overlapping cards at
				// desktop come back as "incomplete" instead. Only decorative, aria-hidden glyphs may stay unmeasured.
				const unmeasured = incomplete.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
				const notDecorative = await page.evaluate(
					(selectors) => selectors.filter((s) => !document.querySelector(s)?.closest('[aria-hidden="true"]')),
					unmeasured
				);
				if (notDecorative.length === 0) return;
				// axe can't see through any SVG over text. Hide aria-hidden SVGs drawn only as outlines, then the text must pass.
				await page.evaluate(() => {
					for (const svg of document.querySelectorAll('svg[aria-hidden="true"]')) {
						const shapes = [...svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line, use, text, image')];
						if (shapes.length > 0 && shapes.every((s) => getComputedStyle(s).fill === 'none')) (svg as SVGElement).style.visibility = 'hidden';
					}
				});
				const builder = new AxeBuilder({ page }).withRules(['color-contrast']);
				for (const selector of notDecorative) builder.include(selector);
				const recheck = await builder.analyze();
				expect([...recheck.violations, ...recheck.incomplete].flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
			});
		}

		// 320px wide is WCAG 1.4.10 reflow; 720px is a 1440px window at 200% zoom.
		for (const width of [320, 720]) {
			test(`reflows without cutting off content at ${width}px`, async ({ page }) => {
				await expectReflow(page, path, width);
			});
		}

		test('shows all content with reduced motion', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto(path);
			await page.mouse.wheel(0, 10_000);
			await expect(page.locator('.reveal-pending')).toHaveCount(0);
		});
	});
}

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	// Server-rendered layout is what a slow device shows before hydration, so it must reflow too.
	for (const path of pages) {
		test(`${path} reflows at 320px before hydration`, async ({ page }) => {
			await expectReflow(page, path, 320);
		});
	}

	for (const path of pages) {
		test(`${path} renders its content visibly`, async ({ page }) => {
			await page.goto(path);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await expect(page.locator('.reveal-pending')).toHaveCount(0);
		});
	}

	test('send-money cards are usable links and a button', async ({ page }) => {
		await page.goto('/send-money');
		await expect(page.getByRole('link', { name: /Venmo.*@pileofkyle/ })).toHaveAttribute('href', 'https://venmo.com/u/pileofkyle');
		await expect(page.getByRole('button', { name: /Zelle.*\(626\) 388-5416/ })).toBeVisible();
	});
});

test('send-money exposes each payment method with its handle to assistive tech', async ({ page }) => {
	await page.goto('/send-money');
	await expect(page.getByRole('list', { name: 'Payment methods' })).toMatchAriaSnapshot(`
    - list "Payment methods":
      - listitem:
        - link /Venmo.*@pileofkyle/
      - listitem:
        - link /Cash App.*\\$KyleKyle/
      - listitem:
        - link /PayPal.*kylenakamura12/
      - listitem:
        - button /Zelle.*\\(626\\) 388-5416/
  `);
});
