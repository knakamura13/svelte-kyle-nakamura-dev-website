import { expect, test } from '@playwright/test';
import { evaluateAttempt, scenarios } from '../src/routes/projects/learning-korean/scheduler';

// Expected values are derived by hand from the pinned source rules (e993c60), not from the port:
// established card = ease 2.5, 10-day interval, 3 reps, 0 lapses.
//   Easy: ivl = 10 * (2.5 + 0.15) * 1.3 = 34.45, rounded to one decimal as the source does -> 34.5 days
//   Good: ivl = 10 * 2.5 = 25 days
//   Hard: ivl = max(1, 10 * 1.2) = 12 days
//   Again: due again after the 10-minute relearn delay, whatever the interval field says
//   New card (reps 0): Good -> 1 day, Hard -> 1 day, never Easy.
const established = (correct: boolean, ms: number) => evaluateAttempt({ correct, ms, scenario: 'established' });
const fresh = (correct: boolean, ms: number) => evaluateAttempt({ correct, ms, scenario: 'new' });

test.describe('review scheduler port', () => {
	test('established card: speed thresholds at their exact boundaries', () => {
		expect(established(true, 0)).toMatchObject({ grade: 'Easy', delay: '34.5 days' });
		expect(established(true, 2000)).toMatchObject({ grade: 'Easy', delay: '34.5 days' });
		expect(established(true, 3499)).toMatchObject({ grade: 'Easy', delay: '34.5 days' });
		expect(established(true, 3500)).toMatchObject({ grade: 'Good', delay: '25 days' });
		expect(established(true, 8999)).toMatchObject({ grade: 'Good', delay: '25 days' });
		expect(established(true, 9000)).toMatchObject({ grade: 'Hard', delay: '12 days' });
		expect(established(true, 10_000)).toMatchObject({ grade: 'Hard', delay: '12 days' });
		expect(established(true, 20_000)).toMatchObject({ grade: 'Hard', delay: '12 days' });
	});

	test('a new card never earns Easy and is due in a day when answered correctly', () => {
		expect(fresh(true, 100)).toMatchObject({ grade: 'Good', delay: '1 day' });
		expect(fresh(true, 3499)).toMatchObject({ grade: 'Good', delay: '1 day' });
		expect(fresh(true, 3500)).toMatchObject({ grade: 'Good', delay: '1 day' });
		expect(fresh(true, 9000)).toMatchObject({ grade: 'Hard', delay: '1 day' });
	});

	test('any incorrect answer is Again and due in ten minutes, in both scenarios and at any speed', () => {
		for (const ms of [0, 3500, 9000, 20_000]) {
			expect(established(false, ms)).toMatchObject({ grade: 'Again', delay: '10 minutes', delayMs: 600_000 });
			expect(fresh(false, ms)).toMatchObject({ grade: 'Again', delay: '10 minutes', delayMs: 600_000 });
		}
	});

	test('evaluations do not mutate the baseline or accumulate repetitions', () => {
		const before = JSON.stringify(scenarios);
		const first = established(true, 2000);
		for (let i = 0; i < 5; i++) established(true, 2000);
		established(false, 100);
		expect(established(true, 2000)).toEqual(first);
		expect(JSON.stringify(scenarios)).toBe(before);
	});

	test('the injected clock changes nothing about the relative delay', () => {
		expect(evaluateAttempt({ correct: true, ms: 2000, scenario: 'established', now: 5 }).delay).toBe('34.5 days');
	});
});

test.describe('schedule explorer on the story page', () => {
	test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

	const explorer = (page: import('@playwright/test').Page) => page.locator('.explorer');
	const summary = (page: import('@playwright/test').Page) => page.locator('.explorer .summary');
	const seconds = (page: import('@playwright/test').Page) => page.getByLabel('Response time in seconds');
	const slider = (page: import('@playwright/test').Page) => page.getByLabel('Response time', { exact: true });
	const announcement = (page: import('@playwright/test').Page) => page.locator('.explorer [aria-live="polite"]');

	test('the static comparison reads without JavaScript and the controls are hidden', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/projects/learning-korean');
		const items = page.locator('.static-compare li');
		await expect(items).toHaveText([
			'Correct in 2 seconds: graded Easy, due again in 34.5 days.',
			'Correct in 10 seconds: graded Hard, due again in 12 days.'
		]);
		await expect(explorer(page)).toBeHidden();
		await context.close();
	});

	test('after hydration the controls are live and default to the established card', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(explorer(page)).not.toHaveAttribute('inert', '');
		await expect(explorer(page)).not.toHaveAttribute('aria-hidden', 'true');
		await expect(page.getByLabel('Established review')).toBeChecked();
		await expect(page.getByLabel('Correct', { exact: true })).toBeChecked();
		await expect(summary(page)).toHaveText('Easy. Next review in 34.5 days.');
	});

	test('numeric entry, slider keys and both histories give the published results', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await seconds(page).fill('10');
		await expect(summary(page)).toHaveText('Hard. Next review in 12 days.');
		await seconds(page).fill('5');
		await expect(summary(page)).toHaveText('Good. Next review in 25 days.');
		await slider(page).focus();
		await page.keyboard.press('Home');
		await expect(seconds(page)).toHaveValue('0');
		await expect(summary(page)).toHaveText('Easy. Next review in 34.5 days.');
		await page.keyboard.press('End');
		await expect(seconds(page)).toHaveValue('20');
		await expect(summary(page)).toHaveText('Hard. Next review in 12 days.');

		await page.getByLabel('New card').check();
		await seconds(page).fill('1');
		await expect(summary(page)).toHaveText('Good. Next review in 1 day.');
		await page.getByLabel('Incorrect').check();
		await expect(summary(page)).toHaveText('Again. Next review in 10 minutes.');
		await page.getByLabel('Established review').check();
		await expect(summary(page)).toHaveText('Again. Next review in 10 minutes.');
		// Ten minutes is a sliver on a 35-day scale; the text carries it, so the bar is not inflated.
		expect((await page.locator('.explorer .fill').boundingBox())?.width ?? 99).toBeLessThan(1);
	});

	test('out-of-range and blank numeric entry never break the result', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await seconds(page).fill('99');
		await expect(summary(page)).toHaveText('Hard. Next review in 12 days.');
		await seconds(page).fill('');
		await expect(summary(page)).toHaveText(/Next review in/);
	});

	test('announces committed changes only, and Reset restores the defaults', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(announcement(page)).toHaveText('');
		// A drag fires input events; only the release (change) should be announced.
		await slider(page).evaluate((el: HTMLInputElement) => {
			el.value = '10';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await expect(summary(page)).toHaveText('Hard. Next review in 12 days.');
		await expect(announcement(page)).toHaveText('');
		await slider(page).evaluate((el: HTMLInputElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
		await expect(announcement(page)).toHaveText('Hard. Next review in 12 days.');

		await page.getByLabel('New card').check();
		await page.getByRole('button', { name: 'Reset' }).click();
		await expect(page.getByLabel('Established review')).toBeChecked();
		await expect(seconds(page)).toHaveValue('2');
		await expect(summary(page)).toHaveText('Easy. Next review in 34.5 days.');
		await expect(announcement(page)).toHaveText('Easy. Next review in 34.5 days.');
	});

	test('makes no network requests while used', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await page.waitForLoadState('networkidle');
		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		await page.getByLabel('New card').check();
		await seconds(page).fill('12');
		await page.getByLabel('Incorrect').check();
		await page.getByRole('button', { name: 'Reset' }).click();
		expect(requests).toEqual([]);
	});

	test('the bar does not animate under reduced motion', async ({ page }) => {
		await page.goto('/projects/learning-korean');
		await expect(page.locator('.explorer .fill')).toHaveCSS('transition-duration', '0s');
	});

	test('the contents indicator still lands on practice and status with the taller section', async ({ page }) => {
		await page.goto('/projects/learning-korean#practice');
		await expect(page.locator('.case-contents a[data-active]')).toHaveAttribute('href', '#practice');
		await page.goto('/projects/learning-korean#status');
		await expect(page.locator('.case-contents a[data-active]')).toHaveAttribute('href', '#status');
	});

	for (const width of [320, 390]) {
		test(`fits at ${width}px with 44px controls and no overflow`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/projects/learning-korean');
			await expect(explorer(page)).not.toHaveAttribute('inert', '');
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			const heights = await page
				.locator('.explorer fieldset label, .explorer input[type="range"], .explorer input[type="number"], .explorer .reset')
				.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
			for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
		});
	}
});
