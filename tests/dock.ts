import { expect, type Locator, type Page } from '@playwright/test';

/** What every spec of the airflow Dock needs: the polite live region, the figure's caption, and finding a group and a focus ring. A helper module, not a spec, so the specs can share it. */

/** The page's polite live region: what a screen reader is told after a control is used. */
export const live = (page: Page) => page.locator('article.airflow p[aria-live="polite"]');

/** The line under the Stage that names the Home. */
export const caption = (page: Page) => page.locator('.airflow-figure figcaption');

/** The page's status line under the Stage. */
export const status = (page: Page) => page.locator('.sim-status');

/**
 * Opens the page and waits until it can be used. The Dock is in the server's HTML, so it can be seen before the page's script has
 * attached to it, and a click then does nothing. The Stage leaves `pending` once the script has taken the page over.
 */
export async function openAirflow(page: Page, path = '/experiments/airflow') {
	await page.goto(path);
	await expect(page.locator('.airflow-dock')).toBeVisible();
	await expect(page.getByRole('application', { name: /^The air in the/ })).not.toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
}

/** A Dock group by its title. Opens it when it is closed, so its controls can be used. */
export async function dockGroup(page: Page, title: string): Promise<Locator> {
	const group = page.locator('.dock-group', { has: page.locator('summary', { hasText: title }) });
	await expect(group, `a group called ${title}`).toHaveCount(1);
	if ((await group.getAttribute('open')) === null) {
		await group.locator('summary').click();
		// A click makes the browser take the next focus for a pointer's, which shows no ring: a key press says the keyboard is in use again, as it is for a test that tabs.
		await page.keyboard.press('Shift');
	}
	await expect(group).toHaveAttribute('open', '');
	return group;
}

/** Whether the focused element, or the control drawn beside a visually hidden one (a segment's input), shows a focus ring. */
export async function focusRing(page: Page) {
	return page.evaluate(() => {
		const active = document.activeElement as HTMLElement | null;
		if (!active) return null;
		const rings = [active, active.nextElementSibling].filter(Boolean).map((el) => {
			const style = getComputedStyle(el as Element);
			return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
		});
		return rings.some(Boolean);
	});
}

/** What the focused element is called to a screen reader: its label, or its text. */
export const focusedName = (page: Page) =>
	page.evaluate(() => {
		const active = document.activeElement as HTMLElement | null;
		if (!active) return '';
		const labelled = active.getAttribute('aria-labelledby');
		if (labelled) return labelled.split(' ').map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
		return active.getAttribute('aria-label') ?? (active.closest('label')?.textContent ?? active.textContent ?? '').trim();
	});
