import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { experiments } from '../src/lib/experiments/catalog';

const routes = fileURLToPath(new URL('../src/routes/experiments/', import.meta.url));

test.describe('the experiments landing page', () => {
	test('lists an experiment for every page under /experiments, and a page for every experiment', () => {
		const pages = readdirSync(routes, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		expect(experiments.map((experiment) => experiment.slug).sort()).toEqual(pages.sort());
	});

	test('shows each experiment and links to it', async ({ page }) => {
		await page.goto('/experiments');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Experiments,\s*to play with\./);
		await expect(page.getByRole('heading', { level: 3 })).toHaveText(experiments.map((experiment) => experiment.title));
		for (const experiment of experiments) {
			const href = `/experiments/${experiment.slug}`;
			const entry = page.locator('article.compact-entry').filter({ has: page.getByRole('heading', { level: 3, name: experiment.title }) });
			await expect(entry.getByRole('heading', { level: 3 }).getByRole('link')).toHaveAttribute('href', href);
			await expect(entry.getByRole('link', { name: `Open ${experiment.title}` })).toHaveAttribute('href', href);
			await expect(entry.getByRole('link', { name: /Explore the experiment/ })).toHaveAttribute('href', href);
			await expect(entry.getByRole('img', { name: experiment.alt })).toBeVisible();
		}
	});

	test('every page and thumbnail it points to exists', async ({ request }) => {
		for (const experiment of experiments) {
			expect((await request.get(`/experiments/${experiment.slug}`)).status(), experiment.slug).toBe(200);
			expect((await request.get(experiment.image)).status(), experiment.image).toBe(200);
		}
	});
});
