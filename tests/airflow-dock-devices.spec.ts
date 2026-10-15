import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { dockGroup, live, openAirflow } from './dock';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { fanFlow, purifierCadr } from '../src/lib/experiments/airflow/devices/model';
import type { FanModel } from '../src/lib/experiments/airflow/devices/types';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { linkCatalog, setupFromHash } from '../src/lib/experiments/airflow/link';
import { formatFlow } from '../src/lib/experiments/airflow/units';
import type { Setup } from '../src/lib/experiments/airflow/state';

/**
 * Fans and purifiers in the Dock: the tray, the list of what is in the home, the settings of the chosen device, moving it with the
 * buttons, dragging a new one in from the tray, and the Stage's own handling (a click chooses a device, a drag moves it, the ring turns it).
 * What a device is set to is read back through the Share link, which is what the visitor would copy: model, position, aim, power and sweep.
 */
const catalog = linkCatalog(plans, DEVICE_MODELS);
const boxFan = DEVICE_MODELS.find((m) => m.kind === 'box-fan')!;
const pedestal = DEVICE_MODELS.find((m) => m.kind === 'pedestal-fan') as FanModel;
const windowFan = DEVICE_MODELS.find((m) => m.kind === 'window-fan')!;

test.use({ locale: 'en-US' });

async function ready(page: Page) {
	await openAirflow(page);
	await expect(page.getByRole('application', { name: /^The air in the/ })).toHaveAttribute('data-state', 'live', { timeout: 20_000 });
	await dockGroup(page, 'Fans and purifiers');
}

const add = (page: Page, name: string) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
const rows = (page: Page) => page.locator('.device-row');

/** The setup the Share link would carry right now. */
async function shared(page: Page, read: () => Promise<string[]>): Promise<Setup> {
	await page.getByRole('button', { name: /Copy link|Link copied/ }).click();
	const links = await read();
	const link = links[links.length - 1];
	const setup = setupFromHash(new URL(link).hash, catalog);
	expect(setup, 'the link decodes').not.toBeNull();
	return setup!;
}

/** Where a point of the Stage, as fractions of its size, is on the screen now: measured fresh, because the page scrolls when a button below the Stage is used. */
async function onStage(page: Page, at: { fx: number; fy: number }, dx = 0, dy = 0) {
	const box = (await page.getByRole('application', { name: /^The air in the/ }).boundingBox())!;
	return { x: box.x + box.width * at.fx + dx, y: box.y + box.height * at.fy + dy };
}

/** The next thing the live region says, once it changes from `before` (its text as it was, repeats included: a repeat gets a no-break space). */
async function nextAnnouncement(page: Page, before: string) {
	await expect.poll(async () => (await live(page).textContent()) ?? '').not.toBe(before);
	return ((await live(page).textContent()) ?? '').trim();
}

/** A point on the Stage's floor where a box fan can stand, found by trying a few: the first the Dock accepts. Returns where on the Stage it was. */
async function dropOnTheHome(page: Page, model = boxFan): Promise<{ fx: number; fy: number }> {
	const grip = page.locator(`.tray-grip[data-model="${model.id}"]`);
	// Scroll first and measure after: a box measured before a scroll is not where the Stage is any more.
	await grip.scrollIntoViewIfNeeded();
	const box = (await page.getByRole('application', { name: /^The air in the/ }).boundingBox())!;
	const from = (await grip.boundingBox())!;
	const before = await rows(page).count();
	for (const [fx, fy] of [
		[0.5, 0.58],
		[0.42, 0.62],
		[0.58, 0.62],
		[0.35, 0.5],
		[0.62, 0.5],
		[0.5, 0.7],
		[0.3, 0.6]
	]) {
		const x = box.x + box.width * fx;
		const y = box.y + box.height * fy;
		await page.mouse.move(from.x + 20, from.y + from.height / 2);
		await page.mouse.down();
		await page.mouse.move(x - 40, y - 20, { steps: 6 });
		await page.mouse.move(x, y, { steps: 4 });
		await page.mouse.up();
		await page.waitForTimeout(120);
		if ((await rows(page).count()) > before) return { fx, fy };
	}
	throw new Error('No spot on the home took the dropped device.');
}

test.describe('fans and purifiers in the Dock', () => {
	test.beforeEach(async ({ page }) => {
		// A page load, a hydration and a few clicks each: more than the default half minute when the machine is busy.
		test.setTimeout(90_000);
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('the tray lists every model with its rated flow in the visitor’s units, and Add puts it in the home, chosen, announced', async ({ page }) => {
		await ready(page);
		const tray = page.locator('.tray-list');
		for (const model of DEVICE_MODELS) {
			const flow = model.kind === 'air-purifier' ? purifierCadr(model, 1) : fanFlow(model, 1);
			const item = tray.locator('li', { has: page.locator(`[data-model="${model.id}"]`) });
			await expect(item).toContainText(model.name);
			await expect(item).toContainText(formatFlow(flow, 'imperial').text);
			await expect(item.getByRole('button', { name: `Add ${model.name}`, exact: true })).toBeVisible();
		}
		await expect(rows(page)).toHaveCount(0);
		await add(page, boxFan.name);
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first().getByRole('button', { pressed: true })).toContainText(boxFan.name);
		await expect(page.getByRole('group', { name: `Settings for ${boxFan.name}` })).toBeVisible();
		await expect(live(page)).toHaveText(`${boxFan.name} added.`);
		await expect(page.locator('#dock-devices > summary')).toContainText('1 of 6');
	});

	test('a home holds six, and the seventh says why it cannot be added, in the Dock and to a screen reader', async ({ page }) => {
		test.setTimeout(90_000);
		await ready(page);
		for (let n = 0; n < 6; n++) await add(page, n % 2 === 0 ? boxFan.name : pedestal.name);
		await expect(rows(page)).toHaveCount(6);
		await expect(page.locator('#dock-devices > summary')).toContainText('6 of 6');
		await add(page, boxFan.name);
		await expect(rows(page)).toHaveCount(6);
		const why = /holds at most 6 fans and purifiers\. Remove one to add another\./;
		await expect(page.locator('.tray-message')).toHaveText(why);
		await expect(live(page)).toHaveText(why);
		// Removing one makes room again.
		await rows(page).first().getByRole('button', { name: /^Remove/ }).click();
		await expect(rows(page)).toHaveCount(5);
		await add(page, boxFan.name);
		await expect(rows(page)).toHaveCount(6);
	});

	test('power: the slider and the presets set it, a screen reader is told once, and the Share link keeps it', async ({ page }) => {
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		await add(page, boxFan.name);
		const power = page.getByRole('slider', { name: 'Power' });
		await expect(power).toHaveValue('67');
		await power.fill('40');
		await expect(live(page)).toHaveText(`${boxFan.name} at 40 percent, Low.`);
		expect((await shared(page, clipboard)).devices[0].power).toBeCloseTo(0.4, 2);
		for (const [name, expected] of [
			['High', 1],
			['Low', 1 / 3],
			['Off', 0]
		] as const) {
			await page.getByRole('group', { name: 'Power presets' }).getByRole('button', { name, exact: true }).click();
			await expect(page.getByRole('group', { name: 'Power presets' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
			expect((await shared(page, clipboard)).devices[0].power, name).toBeCloseTo(expected, 2);
		}
	});

	test('direction and aim: the sliders turn and aim a fan and say which way; the Share link keeps model, position, aim and power', async ({ page }) => {
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		await add(page, boxFan.name);
		await page.getByRole('slider', { name: 'Direction it faces' }).fill('225');
		await expect(live(page)).toHaveText(`${boxFan.name} faces southwest, 225 degrees.`);
		await page.getByRole('slider', { name: 'Aim' }).fill('20');
		await expect(live(page)).toHaveText(`${boxFan.name} aimed 20 degrees up.`);
		await page.getByRole('slider', { name: 'Aim' }).fill('-10');
		await expect(live(page)).toHaveText(`${boxFan.name} aimed 10 degrees down.`);
		const device = (await shared(page, clipboard)).devices[0];
		expect(device.model).toBe(boxFan.id);
		expect(device.yaw).toBeCloseTo(225, 0);
		expect(device.tilt).toBeCloseTo(-10, 0);
		expect(Number.isFinite(device.x) && Number.isFinite(device.z)).toBe(true);
	});

	test('a pedestal fan sweeps and sets its head height; a window fan draws air in or pushes it out', async ({ page }) => {
		test.setTimeout(90_000);
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		await add(page, pedestal.name);
		await expect(page.getByRole('slider', { name: 'Sweep' })).toHaveCount(0);
		await page.getByLabel('Sweep from side to side').check();
		await expect(live(page)).toHaveText(`${pedestal.name} sweeps.`);
		await page.getByRole('slider', { name: 'Sweep', exact: true }).fill('60');
		await page.getByRole('slider', { name: 'Time for one sweep out and back' }).fill('12');
		const [low, high] = pedestal.heightRange!;
		const heightSlider = page.getByRole('slider', { name: 'Height of the head' });
		await heightSlider.fill(String(Math.round(((low + high) / 2) / 0.0254)));
		let device = (await shared(page, clipboard)).devices[0];
		expect(device.oscillation).toMatchObject({ on: true });
		expect(device.oscillation.sweep).toBeCloseTo(60, 0);
		expect(device.oscillation.period).toBeCloseTo(12, 0);
		expect(device.height).toBeGreaterThan(low);
		expect(device.height).toBeLessThan(high + 1e-6);

		await rows(page).first().getByRole('button', { name: /^Remove/ }).click();
		await add(page, windowFan.name);
		await expect(rows(page).first()).toContainText('in a window');
		await expect(page.getByRole('radio', { name: 'Draws air in' })).toBeChecked();
		await page.getByRole('radio', { name: 'Pushes air out' }).check();
		await expect(live(page)).toHaveText(`${windowFan.name} pushes air out.`);
		device = (await shared(page, clipboard)).devices[0];
		expect(device.opening).toBeTruthy();
		expect(device.intake).toBe(false);
	});

	test('the buttons move the chosen device a step at a time, a shifted press a metre, and a move that cannot be made says why', async ({ page }) => {
		test.setTimeout(120_000);
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		await add(page, boxFan.name);
		const start = (await shared(page, clipboard)).devices[0];
		const along = (device: { x: number; z: number }, dx: number, dz: number) => (device.x - start.x) * dx + (device.z - start.z) * dz;
		// A metre one way: the way that is free depends on where the fan was put, so each is tried until one is.
		const ways = [
			['Move west', -1, 0],
			['Move north', 0, -1],
			['Move east', 1, 0],
			['Move south', 0, 1]
		] as const;
		let way: (typeof ways)[number] | null = null;
		for (const candidate of ways) {
			const heard = (await live(page).textContent()) ?? '';
			await page.getByRole('button', { name: candidate[0] }).click({ modifiers: ['Shift'] });
			// What the press said, once the visitor has stopped: moved, or why not. (Copying the link would replace it, so it is read first.)
			const said = await nextAnnouncement(page, heard);
			expect(said).toMatch(/^(Moved the |That |The )/);
			const now = (await shared(page, clipboard)).devices[0];
			if (said.startsWith('Moved')) {
				expect(along(now, candidate[1], candidate[2]), 'a shifted press is a metre').toBeCloseTo(1, 1);
				way = candidate;
				break;
			}
			// Refused: the reason is on the screen too, and the fan has not moved.
			await expect(page.locator('.tray-message')).toHaveText(said);
			expect(now.x).toBeCloseTo(start.x, 1);
			expect(now.z).toBeCloseTo(start.z, 1);
		}
		expect(way, 'a metre was free in some direction').not.toBeNull();
		// Back toward where it was by a plain press (the way it came is free): a quarter of a metre.
		const back = ways.find((w) => w[1] === -way![1] && w[2] === -way![2])!;
		await page.getByRole('button', { name: back[0] }).click();
		await expect(live(page)).toHaveText(`Moved the ${boxFan.name}.`);
		const stepped = (await shared(page, clipboard)).devices[0];
		expect(along(stepped, way![1], way![2]), 'a step is a quarter of a metre').toBeCloseTo(0.75, 1);
		// Pushed on and on, the fan meets a wall or the edge of the home: it stays inside the home, and says why it stopped.
		for (let n = 0; n < 16; n++) await page.getByRole('button', { name: way![0] }).click({ modifiers: ['Shift'] });
		await expect(live(page)).toHaveText(/^(That|The) /);
		await expect(page.locator('.tray-message')).toHaveText(/^(That|The) /);
		const end = (await shared(page, clipboard)).devices[0];
		const home = plans.find((p) => p.id === 'two-bedroom')!;
		expect(end.x).toBeGreaterThanOrEqual(0);
		expect(end.x).toBeLessThanOrEqual(home.width);
		expect(end.z).toBeGreaterThanOrEqual(0);
		expect(end.z).toBeLessThanOrEqual(home.depth);
	});

	test('dragging a device in from the tray puts it where it is dropped; a window fan dropped on the floor, or a drop off the home, is refused with a reason; Escape cancels', async ({ page }) => {
		test.setTimeout(120_000);
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		const dropped = await dropOnTheHome(page);
		await expect(rows(page)).toHaveCount(1);
		await expect(live(page)).toHaveText(new RegExp(`^${boxFan.name} added`));
		const placed = (await shared(page, clipboard)).devices[0];
		expect(placed.model).toBe(boxFan.id);
		expect(placed.opening).toBeUndefined();

		// A window fan wants a window: held over floor that is not near one, it says so, and dropped there it is refused.
		const grip = page.locator(`.tray-grip[data-model="${windowFan.id}"]`);
		await grip.scrollIntoViewIfNeeded();
		const stage = (await page.getByRole('application', { name: /^The air in the/ }).boundingBox())!;
		const from = (await grip.boundingBox())!;
		await page.mouse.move(from.x + 20, from.y + from.height / 2);
		await page.mouse.down();
		let refused = false;
		for (const [fx, fy] of [
			[0.5, 0.55],
			[0.45, 0.5],
			[0.55, 0.6],
			[0.4, 0.62],
			[0.6, 0.5],
			[0.5, 0.45]
		]) {
			await page.mouse.move(stage.x + stage.width * fx, stage.y + stage.height * fy, { steps: 6 });
			if (/A window fan goes in a window/.test(await page.locator('.drag-chip').innerText())) {
				refused = true;
				break;
			}
		}
		expect(refused, 'somewhere on the home a window fan is told to go in a window').toBe(true);
		await page.mouse.up();
		await expect(rows(page)).toHaveCount(1);
		await expect(page.locator('.tray-message')).toContainText('A window fan goes in a window');

		// Escape drops a drag without adding anything.
		await grip.scrollIntoViewIfNeeded();
		const again = (await page.locator(`.tray-grip[data-model="${boxFan.id}"]`).boundingBox())!;
		await page.mouse.move(again.x + 20, again.y + again.height / 2);
		await page.mouse.down();
		const dropAt = await onStage(page, dropped, -120);
		await page.mouse.move(dropAt.x, dropAt.y, { steps: 6 });
		await expect(page.locator('.drag-chip')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.drag-chip')).toHaveCount(0);
		await page.mouse.up();
		await expect(rows(page)).toHaveCount(1);
	});

	test('on the Stage a click chooses a device and a drag moves it; the ring round a chosen fan turns it to face the pointer', async ({ page }) => {
		test.setTimeout(150_000);
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		const dropped = await dropOnTheHome(page);
		const before = (await shared(page, clipboard)).devices[0];
		const chosen = rows(page).first().locator('.device-pick');

		// Let go of it in the list, then click the Stage: the symbol on the slice plane stands above the spot on the floor where it was put,
		// so the press that takes it is a little above the drop point, and a few places are tried. (The page may have scrolled since the drop.)
		await chosen.click();
		await expect(chosen).toHaveAttribute('aria-pressed', 'false');
		let grab: { fx: number; fy: number; dy: number } | null = null;
		for (const dy of [0, -20, -40, -60, -80, 20, -100]) {
			const point = await onStage(page, dropped, 0, dy);
			await page.mouse.click(point.x, point.y);
			await page.waitForTimeout(150);
			if ((await chosen.getAttribute('aria-pressed')) === 'true') {
				grab = { ...dropped, dy };
				break;
			}
		}
		expect(grab, 'a click on the Stage chose the device').not.toBeNull();

		// Dragging it east and south moves it east and south, by about as far as the pointer went across the floor.
		const from = await onStage(page, grab!, 0, grab!.dy);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x + 40, from.y + 20, { steps: 6 });
		await page.mouse.move(from.x + 80, from.y + 40, { steps: 6 });
		await page.mouse.up();
		const moved = (await shared(page, clipboard)).devices[0];
		expect(moved.x, 'it went east').toBeGreaterThan(before.x + 0.3);
		expect(moved.z, 'and south').toBeGreaterThan(before.z);

		// The ring: where it is on the screen depends on the camera, so places round the device are tried, pressing and dragging south, and the
		// first that turns the fan is taken. What turned it is read from the Dock's own slider, which follows the handle.
		const yaw = page.getByRole('slider', { name: 'Direction it faces' });
		const startYaw = Number(await yaw.inputValue());
		let turned: number | null = null;
		search: for (const dy of [-8, -22, 6, -36, 18, -50]) {
			for (const dx of [34, -34, 46, -46, 24]) {
				const stage = (await page.getByRole('application', { name: /^The air in the/ }).boundingBox())!;
				const centre = await onStage(page, grab!, 80, grab!.dy + 40);
				await page.mouse.move(centre.x + dx, centre.y + dy);
				await page.mouse.down();
				await page.mouse.move(centre.x + dx * 0.5, centre.y + dy + 30, { steps: 4 });
				await page.mouse.move(centre.x, Math.min(stage.y + stage.height - 6, centre.y + dy + 80), { steps: 4 });
				await page.mouse.up();
				const now = Number(await yaw.inputValue());
				if (Math.abs(now - startYaw) > 20 && Math.abs(now - startYaw) < 340) {
					turned = now;
					break search;
				}
			}
		}
		expect(turned, 'the ring took hold and turned the fan').not.toBeNull();
		// Pulled round to a point south of the fan, it faces south.
		expect(Math.abs(turned! - 180), `faces south, not ${turned}`).toBeLessThan(60);
	});

	test('the list works by keyboard: Tab to a device, Enter chooses it, its settings follow, Remove takes it out', async ({ page, browserName }) => {
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		await ready(page);
		await add(page, boxFan.name);
		await add(page, pedestal.name);
		await expect(rows(page)).toHaveCount(2);
		const first = rows(page).first().locator('.device-pick');
		await first.focus();
		await page.keyboard.press('Enter');
		await expect(first).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('group', { name: `Settings for ${boxFan.name}` })).toBeVisible();
		await expect(page.getByRole('slider', { name: 'Sweep' })).toHaveCount(0);
		await page.keyboard.press(next);
		await page.keyboard.press('Enter');
		await expect(rows(page)).toHaveCount(1);
		await expect(live(page)).toHaveText(`${boxFan.name} removed.`);
		await expect(page.getByRole('group', { name: /^Settings for/ })).toHaveCount(0);
	});

	test('has no WCAG 2.1 A/AA violations that axe can detect, with a fan chosen, at desktop and phone widths', async ({ page }) => {
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await ready(page);
			await add(page, pedestal.name);
			await page.getByLabel('Sweep from side to side').check();
			const { violations } = await new AxeBuilder({ page }).include('#dock-devices').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
			expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `${width}px wide`).toEqual([]);
		}
	});

	test('a Share link keeps what is in the home, and opening it again brings the same fans back, chosen settings and all', async ({ page }) => {
		const clipboard = await stubClipboard(page, 'succeed');
		await ready(page);
		await add(page, pedestal.name);
		await page.getByRole('slider', { name: 'Power' }).fill('80');
		await page.getByRole('slider', { name: 'Direction it faces' }).fill('90');
		await page.getByRole('slider', { name: 'Aim' }).fill('15');
		await page.getByLabel('Sweep from side to side').check();
		await add(page, windowFan.name);
		const setup = await shared(page, clipboard);
		expect(setup.devices.map((d) => d.model).sort()).toEqual([pedestal.id, windowFan.id].sort());
		const links = await clipboard();
		const hash = new URL(links[links.length - 1]).hash;
		await page.evaluate(() => (location.hash = ''));
		await page.getByRole('button', { name: /Remove/ }).first().click();
		await page.evaluate((h) => (location.hash = h), hash);
		await expect(rows(page)).toHaveCount(2);
		const back = (await shared(page, clipboard)).devices.find((d) => d.model === pedestal.id)!;
		expect(back.power).toBeCloseTo(0.8, 2);
		expect(back.yaw).toBeCloseTo(90, 0);
		expect(back.tilt).toBeCloseTo(15, 0);
		expect(back.oscillation.on).toBe(true);
	});
});
