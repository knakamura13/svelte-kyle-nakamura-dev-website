import { expect, test, type Page } from '@playwright/test';

const progress = (page: Page) =>
	page.locator('.resume-section h2').evaluateAll((headings) =>
		headings.map((heading) => {
			const transform = getComputedStyle(heading, '::after').transform;
			return transform === 'none' ? 0 : Number(transform.slice(7).split(',')[0]);
		})
	);
const scrollTo = async (page: Page, y: number | 'end') => {
	await page.evaluate((target) => scrollTo(0, target === 'end' ? document.documentElement.scrollHeight : target), y);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const progressAnimations = (page: Page) =>
	page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation && a.animationName.includes('resume-progress')).length);
/** Scroll-driven animations catch up to a programmatic jump over a few frames; wait until they stop changing. */
const settled = async (page: Page) => {
	let last = JSON.stringify(await progress(page));
	await expect
		.poll(async () => {
			await page.waitForTimeout(250);
			const now = JSON.stringify(await progress(page));
			const stable = now === last;
			last = now;
			return stable;
		})
		.toBe(true);
};
const supportsTimelines = (page: Page) => page.evaluate(() => CSS.supports('animation-timeline: view()') && CSS.supports('view-timeline-inset: 0'));


test('résumé lists every Record and skill group, without the phone number', async ({ page }) => {
	await page.goto('/resume');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Résumé,\s*in full\./);
	await expect(page.locator('#experience .record')).toHaveCount(5);
	await expect(page.locator('#projects .record')).toHaveCount(3);
	await expect(page.locator('#education .record')).toHaveCount(2);
	await expect(page.locator('.skill-groups dt')).toHaveText(['Professional', 'Software Dev.', 'ML & Technical']);
	await expect(page.locator('#experience .record h3').first()).toContainText('HighPoint Technology Solutions');
	const text = await page.locator('main').innerText();
	expect(text).not.toMatch(/388-5416|6263885416/);
});

test('the PDF download link serves a PDF', async ({ page, request }) => {
	await page.goto('/resume');
	const link = page.getByRole('link', { name: /Download PDF/ });
	await expect(link).toHaveAttribute('download', /\.pdf$/);
	const response = await request.get((await link.getAttribute('href')) ?? '');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('application/pdf');
});

test.describe('on desktop', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('the section label stays in view while its Records scroll', async ({ page }) => {
		await page.goto('/resume');
		const heading = page.locator('#experience-heading');
		const records = page.locator('#experience .record');
		await records.nth(3).scrollIntoViewIfNeeded();
		const box = await heading.boundingBox();
		expect(box?.y ?? -1).toBeGreaterThanOrEqual(100);
		expect(box?.y ?? 1000).toBeLessThan(200);
	});
});

test.describe('section progress rules on desktop', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('each rule follows its own section down and back up, finishing at the end', async ({ page }) => {
		await page.goto('/resume');
		test.skip(!(await supportsTimelines(page)), 'scroll-driven animations are unsupported here');
		expect(await progress(page)).toEqual([0, 0, 0, 0]);
		await scrollTo(page, 1300);
		await expect.poll(async () => (await progress(page))[0]).toBeGreaterThan(0.1);
		await settled(page);
		const [middle, ...later] = await progress(page);
		expect(middle).toBeLessThan(0.95);
		expect(later).toEqual([0, 0, 0]);
		await scrollTo(page, 'end');
		await expect.poll(() => progress(page)).toEqual([1, 1, 1, 1]);
		await scrollTo(page, 1300);
		await expect.poll(async () => (await progress(page))[0]).toBeCloseTo(middle, 1);
	});

	test('the rule is decorative, adds no layout shift and is not time-based', async ({ page }) => {
		await page.goto('/resume');
		test.skip(!(await supportsTimelines(page)), 'scroll-driven animations are unsupported here');
		const before = await page.locator('#experience-heading').boundingBox();
		await scrollTo(page, 1300);
		await expect.poll(async () => (await progress(page))[0]).toBeGreaterThan(0.1);
		await settled(page);
		const idle = await progress(page);
		await page.waitForTimeout(500);
		expect(await progress(page)).toEqual(idle);
		expect(await page.locator('[role="progressbar"]').count()).toBe(0);
		expect(before?.width).toBeGreaterThan(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});

	test('reduced motion and print show no rule', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/resume');
		await scrollTo(page, 1300);
		expect(await progress(page)).toEqual([0, 0, 0, 0]);
		expect(await progressAnimations(page)).toBe(0);
		await page.emulateMedia({ reducedMotion: 'no-preference', media: 'print' });
		expect(await page.locator('#experience-heading').evaluate((h) => getComputedStyle(h, '::after').display)).toBe('none');
	});
});

test.describe('on phones', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

	test('a Record keeps its logo beside the title and gives its points the full width', async ({ page }) => {
		await page.goto('/resume');
		const record = page.locator('#experience .record').first();
		const [logo, title, points, row] = await Promise.all(
			['.logo-tile', 'h3', 'ul', ':scope'].map((sel) => record.locator(sel).first().boundingBox())
		);
		if (!logo || !title || !points || !row) throw new Error('Record parts are not rendered');
		expect(title.x).toBeGreaterThan(logo.x + logo.width);
		expect(Math.abs(title.y - logo.y)).toBeLessThan(8);
		expect(Math.abs(points.x - row.x)).toBeLessThan(2);
	});

	test('section labels have no progress rule', async ({ page }) => {
		await page.goto('/resume');
		await scrollTo(page, 1300);
		expect(await progress(page)).toEqual([0, 0, 0, 0]);
		expect(await progressAnimations(page)).toBe(0);
	});
});

test('home About starts with the HighPoint Record', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('#about .record h3')).toHaveText([
		/Software engineer\s*HighPoint Technology Solutions/,
		/Full-stack developer\s*Azusa Pacific University/,
		/M\.S\. Computer Science\s*Georgia Institute of Technology/
	]);
});
