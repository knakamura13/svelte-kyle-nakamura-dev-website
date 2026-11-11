import { devices, expect, test, type Page } from '@playwright/test';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { blankSetup } from '../src/lib/experiments/airflow/state';
import { requireWebGL2 } from './webgl';

/**
 * The Rooms' names never cover one another (#63): at a phone's 390 px the house's Bathroom sat half under Primary bathroom. Each Home,
 * opened from a share link on the view it opens on, at four widths: every Room is named, and no two names overlap.
 */

const WIDTHS = [
	{ width: 390, height: 844, phone: true },
	{ width: 768, height: 1024, phone: false },
	{ width: 1280, height: 800, phone: false },
	{ width: 1920, height: 1080, phone: false }
] as const;

const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });

/** The boxes of the Room names that show, by name. */
const roomNames = (page: Page) =>
	view(page)
		.locator('.stage-label[data-tone="room"]')
		.evaluateAll((labels) =>
			labels
				.filter((el) => !(el as HTMLElement).hidden && el.getBoundingClientRect().width > 0)
				.map((el) => {
					const box = el.getBoundingClientRect();
					return { name: el.textContent ?? '', left: box.left, top: box.top, right: box.right, bottom: box.bottom };
				})
		);

for (const size of WIDTHS)
	test.describe(`at ${size.width} by ${size.height}`, () => {
		test.use({
			viewport: { width: size.width, height: size.height },
			locale: 'en-US',
			reducedMotion: 'reduce',
			...(size.phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent } : {})
		});

		test('every Room of every Home is named, and no two names overlap', async ({ page }) => {
			// Four Homes, each a page load that draws the world in software in some browsers.
			test.setTimeout(240_000);
			// The names stand over the world, which needs WebGL 2 (Firefox on CI has none).
			await requireWebGL2(page);
			for (const plan of plans) {
				await page.goto(`/experiments/airflow?cell=0.3${setupToHash(blankSetup(plan.id))}`);
				await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
				await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
				await expect.poll(async () => (await roomNames(page)).length, { message: `the ${plan.name}'s Rooms are named` }).toBe(plan.rooms.length);
				const names = await roomNames(page);
				const overlaps: string[] = [];
				for (let i = 0; i < names.length; i++)
					for (let j = i + 1; j < names.length; j++) {
						const [a, b] = [names[i], names[j]];
						// A pixel's rounding is not an overlap.
						if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${a.name} over ${b.name}`);
					}
				expect(overlaps, `the ${plan.name}'s Room names that cover one another`).toEqual([]);
			}
		});
	});
