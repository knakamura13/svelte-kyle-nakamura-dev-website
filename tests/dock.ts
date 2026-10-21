import { expect, type Locator, type Page } from '@playwright/test';

/** What the airflow page's specs share: the polite live region, the status line, opening the page, a picture of the world and a focus ring. A helper module, not a spec. */

/** The page's polite live region: what a screen reader is told after a control is used. */
export const live = (page: Page) => page.locator('article.airflow p[aria-live="polite"]');

/** The page's status line, in the HUD. */
export const status = (page: Page) => page.locator('.sim-status');

/**
 * Opens the page and waits until it can be used. The HUD is in the server's HTML, so it can be seen before the page's script has attached
 * to it, and a click then does nothing: the Stage leaves `pending` once the script has taken the page over.
 */
export async function openAirflow(page: Page, path = '/experiments/airflow') {
	await page.goto(path);
	await expect(page.getByRole('application', { name: /^The air in the/ })).not.toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
}

/**
 * A picture of the world, with the HUD's panels that float over it painted over: the clock and the status line change as the simulation
 * runs ("Running at 0.9× real time"), and a comparison of two pictures is about the world.
 */
export const worldShot = (page: Page, view: Locator) => view.screenshot({ mask: [page.locator('.hud .glass'), page.locator('.hud .sim-status')], maskColor: '#000000' });

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
