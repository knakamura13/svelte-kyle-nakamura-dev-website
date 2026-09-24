import { expect, test } from '@playwright/test';

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
});

test('home About starts with the HighPoint Record', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('#about .record h3')).toHaveText([
		/Software engineer\s*HighPoint Technology Solutions/,
		/Full-stack developer\s*Azusa Pacific University/,
		/M\.S\. Computer Science\s*Georgia Institute of Technology/
	]);
});
