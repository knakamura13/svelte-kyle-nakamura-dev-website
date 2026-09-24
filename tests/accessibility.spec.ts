import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = ['/', '/projects/learning-korean', '/resume', '/send-money', '/does-not-exist'];

for (const path of pages) {
	test.describe(`${path}`, () => {
		// Reduced motion keeps reveal.ts from fading sections to opacity 0, which axe would skip as hidden.
		for (const width of [1440, 390]) {
			test(`has no WCAG 2.1 A/AA violations that axe can detect at ${width}px`, async ({ page }) => {
				await page.setViewportSize({ width, height: 900 });
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await page.goto(path);
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
				expect(notDecorative).toEqual([]);
			});
		}

		// 320px wide is WCAG 1.4.10 reflow; 720px is a 1440px window at 200% zoom. The shell clips
		// overflow, so un-clip it and check that nothing extends past the viewport.
		for (const width of [320, 720]) {
			test(`reflows without cutting off content at ${width}px`, async ({ page }) => {
				await page.setViewportSize({ width, height: 800 });
				await page.goto(path);
				await page.addStyleTag({ content: '.concept { overflow: visible !important; }' });
				const outside = await page.evaluate(() =>
					[...document.querySelectorAll('main *')]
						.filter((el) => { const box = el.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1); })
						.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
				);
				expect(outside).toEqual([]);
				expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
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
