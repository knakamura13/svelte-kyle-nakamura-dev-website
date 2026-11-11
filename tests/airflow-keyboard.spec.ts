import { expect, test, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { focusRing } from './dock';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { requireWebGL2 } from './webgl';

/**
 * Every task of the page from the keyboard alone (#62): pick a Home and a Scenario, place a fan and aim it, open a window, set the
 * weather, pin a Probe, release Smoke and copy the link. No mouse moves or clicks; every stop shows a focus ring, and each change is
 * said once, politely. WebKit moves to every control with Alt+Tab, as Safari does with its option to press Tab to highlight each item.
 */

const PAGE = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';
const twoBedroom = plans.find((plan) => plan.id === 'two-bedroom')!;
const boxFan = DEVICE_MODELS.find((model) => model.kind === 'box-fan')!;

test.use({ locale: 'en-US', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const live = (page: Page) => page.locator('.hud p[aria-live="polite"]');
const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });

/** Tab (Shift+Tab with `back`) until the focus is on an element that matches; true when it got there. */
async function tabTo(page: Page, browserName: string, selector: string, back = false, limit = 40) {
	const key = `${back ? 'Shift+' : ''}${browserName === 'webkit' ? 'Alt+Tab' : 'Tab'}`;
	for (let i = 0; i < limit; i++) {
		if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return true;
		await page.keyboard.press(key);
	}
	return page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
}

/** Moves the keyboard's cursor over the home, a step at a time, until the Probe panel reads air under it. Returns the keys it took. */
async function findAir(page: Page) {
	const path: string[] = [];
	const steps = ['ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'];
	for (const key of steps) {
		if (await page.locator('.under[data-state="reading"]').count()) return path;
		await page.keyboard.press(key);
		path.push(key);
		await page.waitForTimeout(200);
	}
	await expect(page.locator('.under[data-state="reading"]'), 'the cursor found air').toHaveCount(1, { timeout: 5_000 });
	return path;
}

test('every task from the keyboard alone, with a focus ring at every stop', async ({ page, browserName }) => {
	// About 250 round trips to the page, a key or a look at the focus each. They are quick only while a paused page stays quiet: when it
	// kept drawing in software, each one waited behind a frame, and the run took six minutes under load (#62).
	test.setTimeout(180_000);
	// Every task here is done in the world, which needs WebGL 2 (Firefox on CI has none).
	await requireWebGL2(page);
	const copied = await stubClipboard(page, 'succeed');
	await page.goto(PAGE);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 60_000 });
	await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
	const ring = async (what: string) => expect(await focusRing(page), `${what} shows a focus ring`).toBe(true);

	// A Home: the picker opens on the chosen one, and Enter on another picks it.
	expect(await tabTo(page, browserName, 'button[aria-label^="Home:"]')).toBe(true);
	await ring('the Home picker');
	await page.keyboard.press('Enter');
	await expect(page.locator('#hud-homes')).toBeVisible();
	expect(await tabTo(page, browserName, '#hud-homes .home:not([aria-pressed="true"])')).toBe(true);
	await ring('a Home');
	const picked = (await page.evaluate(() => document.activeElement?.querySelector('.home-name')?.textContent ?? '')).trim();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: /^Home:/ })).toHaveAttribute('aria-label', `Home: ${picked}`);
	await expect(page.getByRole('button', { name: /^Home:/ }), 'the focus goes back to the picker').toBeFocused();
	await expect(live(page)).toContainText(`${picked}.`);

	// A Scenario: cross-ventilation, back in the two-bedroom.
	expect(await tabTo(page, browserName, 'button[aria-label^="Scenario:"]')).toBe(true);
	await page.keyboard.press('Enter');
	await expect(page.locator('#hud-scenarios')).toBeVisible();
	expect(await tabTo(page, browserName, '#hud-scenarios .scenario:first-child')).toBe(true);
	await ring('a Scenario');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: /^Scenario:/ })).toHaveAttribute('aria-label', 'Scenario: Cross-ventilation');
	await expect(page.getByRole('button', { name: /^Home:/ })).toHaveAttribute('aria-label', 'Home: Two-bedroom');
	await expect(live(page)).toContainText('Cross-ventilation.');

	// A fan, put at the best free spot from the Build catalog.
	await page.keyboard.press('2');
	expect(await tabTo(page, browserName, `.card[data-model="${boxFan.id}"]`)).toBe(true);
	await ring('a catalog card');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('region', { name: 'Build' })).toContainText('1 of 6 placed');
	await expect(live(page)).toHaveText(`${boxFan.name} added.`);

	// Aimed from the Inspector, which opens on it: turned and tilted with the arrow keys.
	expect(await tabTo(page, browserName, '[aria-controls="hud-inspector"]')).toBe(true);
	await ring('the Inspector button');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('region', { name: boxFan.name })).toBeVisible();
	const faces = page.getByRole('slider', { name: 'Faces' });
	const aim = page.getByRole('slider', { name: 'Aim' });
	const facing = await faces.inputValue();
	// Power, then Faces, then Aim.
	expect(await tabTo(page, browserName, '#hud-inspector input[type="range"]')).toBe(true);
	await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
	await expect(faces).toBeFocused();
	await ring('the Faces slider');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(faces).not.toHaveValue(facing);
	await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
	await expect(aim).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(aim).not.toHaveValue('0');

	// A window opened from the Inspector's list of everything in the home.
	expect(await tabTo(page, browserName, '#hud-inspector .back', true)).toBe(true);
	await page.keyboard.press('Enter');
	const window = twoBedroom.openings.find((o) => o.kind === 'double-hung' || o.kind === 'casement')!;
	expect(await tabTo(page, browserName, `[data-target="opening:${window.id}"]`)).toBe(true);
	await ring('a window in the list');
	await page.keyboard.press('Enter');
	expect(await tabTo(page, browserName, '[data-preset="half"]')).toBe(true);
	await ring('a window preset');
	await page.keyboard.press('Space');
	await expect(page.getByRole('region', { name: window.name }).getByRole('button', { name: 'Half' })).toHaveAttribute('aria-pressed', 'true');
	await expect(live(page)).toContainText(`${window.name}, 50 percent of travel`);
	expect(await tabTo(page, browserName, 'button[aria-label="Close the Inspector"]', true)).toBe(true);
	await page.keyboard.press('Enter');

	// The weather: the details, the dial, a wind speed, a temperature and the outdoor air, then Escape back to the button.
	expect(await tabTo(page, browserName, 'button[aria-label="Weather details"]', true)).toBe(true);
	await ring('the weather button');
	await page.keyboard.press('Enter');
	const dial = page.locator('#hud-weather-details [role="slider"]');
	await expect(dial).toBeVisible();
	expect(await tabTo(page, browserName, '#hud-weather-details [role="slider"]')).toBe(true);
	await ring('the wind dial');
	const from = Number(await dial.getAttribute('aria-valuenow'));
	await page.keyboard.press('ArrowRight');
	await expect(dial).toHaveAttribute('aria-valuenow', String((from + 5) % 360));
	expect(await tabTo(page, browserName, '#hud-weather-details .chip:not([data-air]):not([aria-pressed="true"])')).toBe(true);
	await ring('a wind speed');
	await page.keyboard.press('Enter');
	await expect(live(page)).toContainText(/^Wind /);
	expect(await tabTo(page, browserName, 'button[aria-label="Raise the outdoor temperature"]')).toBe(true);
	await page.keyboard.press('Enter');
	await expect(live(page)).toContainText(/Outdoor temperature/i);
	expect(await tabTo(page, browserName, '#hud-weather-details .chip[data-air="hazy"]')).toBe(true);
	await page.keyboard.press('Enter');
	await expect(page.locator('#hud-weather-details .chip[data-air="hazy"]')).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await expect(page.locator('#hud-weather-details')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Weather details' })).toBeFocused();

	// A probe: the Probe tool, the button that takes the keys to the world, the cursor to air, Enter.
	await page.keyboard.press('3');
	expect(await tabTo(page, browserName, '.panel .btn')).toBe(true);
	await ring('Pin from the keyboard');
	await page.keyboard.press('Enter');
	await expect(view(page)).toBeFocused();
	const path = await findAir(page);
	// Where the cursor stopped is said once the keys stop: the Room, the height and the air there.
	await expect(live(page)).toHaveText(/^[A-Z][\w ]+, at a height of .+?\. Air (moving .+|is still), at [\d.]+ (metres per second|miles per hour)\.$/);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('list', { name: 'Probes' }).getByRole('listitem')).toHaveCount(1);
	await expect(live(page)).toHaveText('Probe 1 pinned.');

	// Smoke: the Smoke tool, the same spot, Enter to start and Enter to stop.
	await page.keyboard.press('4');
	for (const key of path) await page.keyboard.press(key);
	await page.keyboard.press('Enter');
	const releasing = page.locator('.hud [role="status"][data-releasing]');
	await expect(releasing).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(releasing).toHaveCount(0);

	// The link: Advanced, Copy link.
	await page.keyboard.press('1');
	expect(await tabTo(page, browserName, 'button[aria-label="Advanced"]')).toBe(true);
	await ring('Advanced');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Advanced' })).toBeVisible();
	expect(await tabTo(page, browserName, '.advanced .btn.primary')).toBe(true);
	await ring('Copy link');
	await page.keyboard.press('Enter');
	await expect(live(page)).toHaveText('Link copied.');
	expect((await copied()).at(-1)).toMatch(/\/experiments\/airflow#s=1\./);
});
