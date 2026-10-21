import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { focusRing, worldShot } from './dock';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';

/**
 * The HUD over the full-screen world: every control works from the keyboard with a focus ring, a click on a window in the world opens
 * that window's menu, a fan dragged out of the Build catalog lands in a room, and axe finds nothing at desktop and phone widths.
 */

/** The grid is pinned at the coarsest cell, so the auto-tuner's warm-up does not load a busy machine: these specs are about the HUD, not the air. */
const HUD = '/experiments/airflow?cell=0.3';
const twoBedroom = plans.find((plan) => plan.id === 'two-bedroom')!;
const boxFan = DEVICE_MODELS.find((model) => model.kind === 'box-fan')!;

test.use({ locale: 'en-US' });

const hud = (page: Page) => page.locator('.hud');
const live = (page: Page) => page.locator('.hud p[aria-live="polite"]');
const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });

/** How much of a picture changed between two shots: the share of pixels where any channel moved by more than a little. */
async function changedShare(page: Page, before: Buffer, after: Buffer) {
	return page.evaluate(
		async ([a, b]) => {
			const pixels = async (base64: string) => {
				const image = new Image();
				image.src = `data:image/png;base64,${base64}`;
				await image.decode();
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d')!;
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, canvas.width, canvas.height).data;
			};
			const [first, second] = [await pixels(a), await pixels(b)];
			let changed = 0;
			for (let i = 0; i < first.length; i += 4) if (Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i + 1] - second[i + 1]), Math.abs(first[i + 2] - second[i + 2])) > 12) changed++;
			return changed / (first.length / 4);
		},
		[before.toString('base64'), after.toString('base64')]
	);
}

/** Opens the HUD and waits until the page's script runs it: the Stage goes live once the engine has taken it over. */
async function openHud(page: Page) {
	await page.goto(HUD);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
	await expect(hud(page)).toHaveAttribute('data-tool', 'select');
}

/**
 * Presses Tab (Shift+Tab with `back`) until the focus is on an element that matches, and returns whether it got there. WebKit moves to
 * every control with Alt+Tab, as Safari does with its option to press Tab to highlight each item.
 */
async function tabTo(page: Page, browserName: string, selector: string, back = false, limit = 30) {
	const key = `${back ? 'Shift+' : ''}${browserName === 'webkit' ? 'Alt+Tab' : 'Tab'}`;
	for (let i = 0; i < limit; i++) {
		if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return true;
		await page.keyboard.press(key);
	}
	return page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
}

/**
 * Moves the mouse over the world, row by row, until the HUD says the pointer is over a thing of this kind (`data-hovered`, which is
 * what a click there would take). Returns that point.
 */
async function pointAt(page: Page, kind: 'opening' | 'device' | 'probe', id: RegExp = /.*/) {
	const box = (await view(page).boundingBox())!;
	for (let fy = 0.2; fy <= 0.86; fy += 0.03)
		for (let fx = 0.15; fx <= 0.9; fx += 0.025) {
			const x = box.x + box.width * fx;
			const y = box.y + box.height * fy;
			await page.mouse.move(x, y);
			const hovered = (await hud(page).getAttribute('data-hovered')) ?? '';
			if (hovered.startsWith(`${kind}:`) && id.test(hovered.slice(kind.length + 1))) return { x, y, id: hovered.slice(kind.length + 1) };
		}
	throw new Error(`Nothing of kind ${kind} under the pointer anywhere on the Stage.`);
}

test.describe('the HUD', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(120_000);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.setViewportSize({ width: 1440, height: 900 });
	});

	test('works from the keyboard: tools, the catalog, the dial, the Inspector, the clock, each with a focus ring', async ({ page, browserName }) => {
		await openHud(page);
		const tools = page.getByRole('toolbar', { name: 'Tools' });

		// The number keys pick a tool; the rail is a toolbar the arrow keys move along.
		await page.keyboard.press('2');
		await expect(hud(page)).toHaveAttribute('data-tool', 'build');
		const catalog = page.getByRole('region', { name: 'Build' });
		await expect(catalog).toBeVisible();
		await tools.getByRole('button', { name: 'Build' }).focus();
		await page.keyboard.press('ArrowUp');
		await expect(tools.getByRole('button', { name: 'Select' })).toBeFocused();
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(hud(page)).toHaveAttribute('data-tool', 'build');

		// Enter on a catalog card puts that device at the best free spot, and says so.
		expect(await tabTo(page, browserName, `.card[data-model="${boxFan.id}"]`)).toBe(true);
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('Enter');
		await expect(catalog).toContainText('1 of 6 placed');
		await expect(live(page)).toHaveText(`${boxFan.name} added.`);
		await expect(hud(page)).toHaveAttribute('data-selection', /^device:/);

		// The compass dial, back up in the weather, is a slider: the arrow keys turn the wind, and it says where from.
		const dial = page.getByRole('slider', { name: 'Wind direction' });
		const before = Number(await dial.getAttribute('aria-valuenow'));
		expect(await tabTo(page, browserName, '[role="slider"][aria-label="Wind direction"]', true)).toBe(true);
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(dial).toHaveAttribute('aria-valuenow', String((before + 5) % 360));
		await expect(dial).toHaveAttribute('aria-valuetext', /^from the /);

		// The Inspector opens on the chosen thing (the fan just added) and takes the focus; Back lists everything in the home.
		expect(await tabTo(page, browserName, '[aria-controls="hud-inspector"]')).toBe(true);
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('Enter');
		await expect(page.getByRole('region', { name: boxFan.name })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Back to everything in the home' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('region', { name: 'Two-bedroom' })).toBeVisible();
		// Enter on a window shows its settings, and a preset sets it.
		const window = twoBedroom.openings.find((o) => o.kind === 'double-hung' || o.kind === 'casement')!;
		expect(await tabTo(page, browserName, `[data-target="opening:${window.id}"]`)).toBe(true);
		await page.keyboard.press('Enter');
		const settings = page.getByRole('region', { name: window.name });
		await expect(settings).toBeVisible();
		await expect(page.getByRole('button', { name: 'Back to everything in the home' })).toBeFocused();
		expect(await tabTo(page, browserName, '[data-preset="half"]')).toBe(true);
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('Space');
		await expect(settings.getByRole('button', { name: 'Half' })).toHaveAttribute('aria-pressed', 'true');
		await expect(live(page)).toContainText(`${window.name}, 50 percent of travel`);

		// P pauses and resumes from anywhere but a text field; the button says which it will do.
		const paused = await page.getByRole('button', { name: 'Resume' }).count();
		await page.keyboard.press('p');
		await expect(page.getByRole('button', { name: paused ? 'Pause' : 'Resume' })).toBeVisible();

		// The Advanced panel takes the focus, Escape closes it, and the focus goes back to its button.
		expect(await tabTo(page, browserName, 'button[aria-label="Advanced"]')).toBe(true);
		await page.keyboard.press('Enter');
		await expect(page.getByRole('dialog', { name: 'Advanced' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Close Advanced' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Advanced' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Advanced' })).toBeFocused();
	});

	test('a click on a window in the world opens its menu beside it, and its presets open the window', async ({ page }) => {
		await openHud(page);
		const at = await pointAt(page, 'opening', /window/);
		const opening = twoBedroom.openings.find((o) => o.id === at.id)!;
		await page.mouse.click(at.x, at.y);
		const menu = page.getByRole('dialog', { name: opening.name });
		await expect(menu).toBeVisible();
		await expect(hud(page)).toHaveAttribute('data-selection', `opening:${opening.id}`);
		await expect(menu).toContainText(/window/);
		// The card hangs beside the window, not over it.
		const card = (await menu.boundingBox())!;
		expect(at.x < card.x || at.x > card.x + card.width || at.y < card.y || at.y > card.y + card.height).toBe(true);
		await menu.getByRole('button', { name: 'Closed' }).click();
		await expect(menu.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true');
		await expect(menu.getByRole('slider')).toHaveValue('0');
		await menu.getByRole('button', { name: 'Wide' }).click();
		await expect(menu.getByRole('slider')).toHaveValue('100');
		await expect(live(page)).toContainText(`${opening.name}, 100 percent of travel`);
		await page.keyboard.press('Escape');
		await expect(menu).toHaveCount(0);
		// The choice stays for the Inspector after its menu closes.
		await expect(hud(page)).toHaveAttribute('data-selection', `opening:${opening.id}`);
	});

	test('a fan dragged out of the Build catalog shows where it would land, and letting go puts it in the room', async ({ page }) => {
		await openHud(page);
		await page.keyboard.press('2');
		const catalog = page.getByRole('region', { name: 'Build' });
		await expect(catalog).toContainText('0 of 6 placed');
		const card = page.locator(`.card[data-model="${boxFan.id}"]`);
		const from = (await card.boundingBox())!;
		const stage = (await view(page).boundingBox())!;
		let placed = false;
		for (const [fx, fy] of [
			[0.52, 0.55],
			[0.45, 0.6],
			[0.6, 0.6],
			[0.5, 0.45],
			[0.4, 0.5],
			[0.65, 0.5]
		]) {
			await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
			await page.mouse.down();
			await page.mouse.move(from.x + from.width + 60, from.y + 40, { steps: 5 });
			await page.mouse.move(stage.x + stage.width * fx, stage.y + stage.height * fy, { steps: 8 });
			// While it is carried, the chip by the pointer says whether letting go puts it there.
			await expect(page.locator('.carry')).toBeVisible();
			await page.mouse.up();
			await page.waitForTimeout(150);
			if ((await catalog.textContent())?.includes('1 of 6 placed')) {
				placed = true;
				break;
			}
			// It could not go there: it is still carried, and Escape puts it back.
			await page.keyboard.press('Escape');
			await expect(page.locator('.carry')).toHaveCount(0);
		}
		expect(placed, 'a spot in the home took the fan').toBe(true);
		await expect(live(page)).toHaveText(`${boxFan.name} added.`);
		await expect(hud(page)).toHaveAttribute('data-selection', /^device:/);
		await expect(page.locator('.carry')).toHaveCount(0);
		await expect(page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Build' })).toContainText('1');
	});

	test('the wall modes, the overlays and the graphics quality change the world, and the height probes and smoke use is named for them', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(`${error.message}\n${error.stack ?? ''}`));
		await openHud(page);
		const stage = view(page);
		// Paused (as reduced motion starts it), the streaks hold still, so what changes the picture is the control.
		if (await page.getByRole('button', { name: 'Pause' }).count()) await page.keyboard.press('p');
		await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
		const walls = page.getByRole('group', { name: 'Walls' });
		const before = await worldShot(page, stage);
		await walls.getByRole('button', { name: 'Walls up' }).click();
		await expect(walls.getByRole('button', { name: 'Walls up' })).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(async () => changedShare(page, before, await worldShot(page, stage)), { message: 'the walls stand up', timeout: 10_000 }).toBeGreaterThan(0.01);
		await walls.getByRole('button', { name: 'Walls down' }).click();
		const down = await worldShot(page, stage);
		await walls.getByRole('button', { name: 'Cutaway' }).click();
		await expect.poll(async () => changedShare(page, down, await worldShot(page, stage)), { message: 'cut away again', timeout: 10_000 }).toBeGreaterThan(0.01);

		// An overlay colours the air and shows its legend, in the page's units.
		const overlay = page.getByRole('group', { name: 'Overlay' });
		await overlay.getByRole('button', { name: /Air speed/ }).click();
		await expect(page.getByRole('group', { name: 'Legend: Air speed' })).toBeVisible();
		await expect(live(page)).toHaveText('Overlay: Air speed.');
		await overlay.getByRole('button', { name: /Off/ }).click();
		await expect(page.getByRole('group', { name: /^Legend/ })).toHaveCount(0);

		// Advanced: the graphics quality is the world's tier, and the height a probe is pinned and smoke released at says so.
		await page.getByRole('button', { name: 'Advanced' }).click();
		const advanced = page.getByRole('dialog', { name: 'Advanced' });
		await expect(advanced.getByRole('slider', { name: /^Probe and smoke height/ })).toBeVisible();
		for (const [name, tier] of [
			['Medium', 'medium'],
			['Low', 'low'],
			['High', 'high']
		]) {
			await advanced.getByRole('button', { name, exact: true }).click();
			await expect(advanced.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
			// WebGL drawn in software (the headless browsers) compiles a tier's post-processing for seconds before the next frame comes.
			await expect(stage, errors.join('\n')).toHaveAttribute('data-quality', tier, { timeout: 30_000 });
		}
		expect(errors).toEqual([]);
	});

	for (const [width, height] of [
		[1440, 900],
		[390, 844]
	]) {
		test(`has no WCAG 2.1 A/AA violations that axe can detect at ${width}px, closed and with panels open`, async ({ page }) => {
			await page.setViewportSize({ width, height });
			await openHud(page);
			const scan = async () => {
				const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
				return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
			};
			expect(await scan()).toEqual([]);
			// The catalog and, on a phone, the View sheet; on a desktop, the Inspector and the weather's details.
			await page.keyboard.press('2');
			await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
			if (width < 700) {
				await page.getByRole('button', { name: 'View' }).click();
				await expect(page.getByRole('dialog', { name: 'View' })).toBeVisible();
			} else {
				await page.getByRole('button', { name: 'Inspector' }).click();
				await page.getByRole('button', { name: 'Weather details' }).click();
				await expect(page.getByRole('slider', { name: 'Wind direction' })).toBeVisible();
			}
			expect(await scan()).toEqual([]);
		});
	}
});
