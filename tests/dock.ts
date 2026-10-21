import { expect, type Locator, type Page } from '@playwright/test';

/** What every spec of the airflow Dock needs: the polite live region, the figure's caption, and finding a group and a focus ring. A helper module, not a spec, so the specs can share it. */

/** The page's polite live region: what a screen reader is told after a control is used. */
export const live = (page: Page) => page.locator('article.airflow p[aria-live="polite"]');

/** The line under the Stage that names the Home. */
export const caption = (page: Page) => page.locator('.airflow-figure figcaption');

/** The page's status line under the Stage. */
export const status = (page: Page) => page.locator('.sim-status');

/**
 * Opens the page and waits until it can be used, with the Dock showing. The page is the full-screen world, and the Dock is a drawer over
 * it that starts shut (until the HUD replaces it, milestone 3), so this opens it. The Dock is in the server's HTML, so it can be seen
 * before the page's script has attached to it, and a click then does nothing: the Stage leaves `pending` once the script has taken the
 * page over.
 */
export async function openAirflow(page: Page, path = '/experiments/airflow') {
	await page.goto(path);
	await expect(page.getByRole('application', { name: /^The air in the/ })).not.toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
	await openDrawer(page);
}

/**
 * Opens the drawer that holds the Dock, if it is shut, the way a keyboard does: a click would make the browser take the next focus for a
 * pointer's, which shows no ring, and the specs check the rings. It then waits for the drawer to finish sliding in, so a click aimed at a
 * control in it does not land on the world where the control was a moment before.
 */
export async function openDrawer(page: Page) {
	const toggle = page.locator('.airflow-drawer-toggle');
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.focus();
		await page.keyboard.press('Enter');
	}
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.locator('.airflow-dock')).toBeVisible();
	await expect(page.locator('.airflow-drawer')).toHaveCSS('transform', 'none');
}

/** A Dock group by its title. Opens the drawer and the group when they are closed, so its controls can be used. */
export async function dockGroup(page: Page, title: string): Promise<Locator> {
	await openDrawer(page);
	const group = page.locator('.dock-group', { has: page.locator('summary', { hasText: title }) });
	await expect(group, `a group called ${title}`).toHaveCount(1);
	if ((await group.getAttribute('open')) === null) {
		// Opened the way a keyboard opens it. A click would make the browser take the next focus for a pointer's, which shows no ring (Chromium takes a lone Shift as the keyboard being back, but Firefox and WebKit do not), and the specs that follow check the ring.
		await group.locator('summary').focus();
		await page.keyboard.press('Enter');
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
