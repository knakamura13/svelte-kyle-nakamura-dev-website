import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dockGroup, focusRing, live, openAirflow, status } from './dock';
import { emissionMarks, emissionPosition } from '../src/lib/experiments/airflow/emission';
import { describeStrength, formatEmissionRate } from '../src/lib/experiments/airflow/smokeWords';
import { MAX_PINS } from '../src/lib/experiments/airflow/state';

/**
 * The Probes and smoke group, driven the way a visitor does: the mode toggle that serves touch and keys, the readout under
 * the pointer, the list of Probes, and the Smoke strength with its reference marks. The simulation runs on the worker in every
 * browser (WebGPU is removed), so a Probe has a reading to show wherever this runs. It is paused (reduced motion) wherever a
 * test does not need the air moving, because a paused page shows each reading once and holds still, and so is quick and steady.
 * Numbers are metric (en-GB), so the text can be compared with the table in emission.ts, except where a test says otherwise.
 */
test.use({ locale: 'en-GB' });

const stage = (page: Page) => page.locator('.airflow-figure .stage-view');
const rows = (page: Page) => page.locator('#dock-probes .probe-list > li');
const hoverTile = (page: Page) => page.locator('#dock-probes .probe-hover');
const smokeStatus = (page: Page) => page.locator('#dock-probes .smoke-status');
const toggle = (page: Page) => page.getByRole('group', { name: 'What touch and keys do' });
const mode = (page: Page, name: 'Look' | 'Probe' | 'Emit') => toggle(page).getByRole('radio', { name, exact: true });
const slider = (page: Page) => page.getByRole('slider', { name: 'Smoke strength' });
const marks = (page: Page) => page.locator('#dock-probes .marks li');
const count = (page: Page) => page.locator('#dock-probes .probe-count');

/** The names of a reading's five rows, as the eye reads them. */
const FIVE = ['Direction', 'Speed', 'Average, 10 s', 'Temperature', 'PM2.5'];

/** A number of metres, with the unit, as a screen reader is told it: "3.88 metres", "10.3 metres". */
const METRES = String.raw`\d+(?:\.\d+)? metres`;
const SPEED = String.raw`\d+(?:\.\d+)? metres per second`;

/** Opens the page with the simulation on the worker, and waits until it has a world to read. */
async function open(page: Page, { moving = false } = {}) {
	await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
	await page.emulateMedia({ reducedMotion: moving ? 'no-preference' : 'reduce' });
	await openAirflow(page);
	test.skip((await stage(page).getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
	await expect(status(page)).toHaveAttribute('data-status', moving ? 'running' : 'paused', { timeout: 60_000 });
	await expect(status(page)).toContainText(/cells, each/);
	await dockGroup(page, 'Probes and smoke');
}

/** Errors the page throws or logs, to be checked at the end of a test. */
function collectErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

/** Where on the Stage to try for air, as fractions of its width and height: the middle of the picture, where the home is. Some land on furniture or a wall, which a click or a touch there does nothing with. */
const SPOTS: [number, number][] = [];
for (let fy = 0.4; fy <= 0.81; fy += 0.06) for (let fx = 0.28; fx <= 0.73; fx += 0.06) SPOTS.push([fx, fy]);

async function stageAt(page: Page, [fx, fy]: [number, number]) {
	// The Stage is on screen only once the page has been scrolled to it (the intro is above it), and it is measured each time: the page may have scrolled since the last.
	await stage(page).scrollIntoViewIfNeeded();
	const box = (await stage(page).boundingBox())!;
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Pins Probes with the mouse (or a finger), in whatever mode the Stage is in, until the list has `wanted` of them. */
async function pinProbes(page: Page, wanted: number, { touch = false } = {}) {
	for (const spot of SPOTS) {
		if ((await rows(page).count()) >= wanted) break;
		const { x, y } = await stageAt(page, spot);
		if (touch) await page.touchscreen.tap(x, y);
		else await page.mouse.click(x, y);
		// Longer than the half second in which two clicks are one double click.
		await page.waitForTimeout(650);
	}
	await expect(rows(page)).toHaveCount(wanted);
}

/** Moves the mouse over the Stage until the readout under it has a reading. Returns the spot, to come back to: the page may scroll before it does, so where it is on the page is measured again each time. */
async function hoverAir(page: Page) {
	for (const spot of SPOTS) {
		const { x, y } = await stageAt(page, spot);
		await page.mouse.move(x, y);
		await page.waitForTimeout(100);
		if ((await hoverTile(page).getAttribute('data-state')) === 'reading') return spot;
	}
	throw new Error('There was no air under the pointer anywhere on the Stage.');
}

/**
 * Moves the keyboard cursor, with the Stage focused in Probe or Emit mode, until the readout says it is on air: to the north-west
 * corner of the home first, since it starts in the middle, and then along each row in turn. The readout is the cursor's own word
 * for it, so Enter is pressed only where it has something to do.
 */
async function cursorToAir(page: Page) {
	const tile = hoverTile(page);
	for (let n = 0; n < 7; n++) await page.keyboard.press('Shift+ArrowLeft');
	for (let n = 0; n < 5; n++) await page.keyboard.press('Shift+ArrowUp');
	let along = 'Right';
	for (let row = 0; row < 9; row++) {
		for (let step = 0; step < 13; step++) {
			if ((await tile.getAttribute('data-state')) === 'reading') return;
			await page.keyboard.press(`Shift+Arrow${along}`);
		}
		along = along === 'Right' ? 'Left' : 'Right';
		await page.keyboard.press('Shift+ArrowDown');
	}
	throw new Error('The keyboard cursor found no air in the home.');
}

/** What a live region says each time it changes, from now on. */
async function record(page: Page, selector: string) {
	const key = `__log${Math.round(Math.random() * 1e9)}`;
	await page.evaluate(
		([target, name]) => {
			const element = document.querySelector(target)!;
			const log: string[] = [];
			Reflect.set(window, name, log);
			new MutationObserver(() => log.push((element.textContent ?? '').trim())).observe(element, { childList: true, characterData: true, subtree: true });
		},
		[selector, key]
	);
	return () => page.evaluate((name) => [...(Reflect.get(window, name) as string[])], key);
}

/** The page's polite live region. */
const LIVE = 'article.airflow p[aria-live="polite"]';

/** What a finger meets in the group: the buttons, and the visible face of a segment (its input is invisible, laid over it). Each is to be at least 44 px each way. */
const TARGETS = '#dock-probes button, #dock-probes .segment span';

test.describe('the mode toggle', () => {
	test('changes what touch and keys do, and announces each mode with how to use it', async ({ page }) => {
		const errors = collectErrors(page);
		await open(page);
		const canvas = stage(page).locator('canvas');
		await expect(mode(page, 'Look')).toBeChecked();
		// The page is the world, full screen, and nothing scrolls: a finger is the world's in every mode (in Look mode it moves the view).
		await expect(canvas, 'in Look mode a finger moves the view').toHaveCSS('touch-action', 'none');

		await mode(page, 'Probe').check();
		await expect(mode(page, 'Probe')).toBeChecked();
		await expect(live(page)).toHaveText('Probe mode. Touch the home to read the air, and lift to pin a probe. Or move the cursor with the arrow keys in the 3D view and press Enter to pin a probe.');
		const help = page.locator('#dock-probes .probe-mode .dock-notice[data-mode]');
		await expect(help).toHaveAttribute('data-mode', 'probe');
		await expect(help, 'the help beside the toggle says the same, for the eye').toContainText('press Enter to pin a probe');
		await expect(canvas, 'in Probe mode the scene keeps a finger for itself').toHaveCSS('touch-action', 'none');

		await mode(page, 'Emit').check();
		await expect(live(page)).toHaveText('Emit mode. Touch the home to release smoke where your finger is. Or move the cursor with the arrow keys in the 3D view and press Enter to start or stop smoke.');
		await expect(help).toContainText('Escape');
		await expect(canvas).toHaveCSS('touch-action', 'none');

		await mode(page, 'Look').check();
		await expect(live(page)).toHaveText('Look mode. A finger or the arrow keys move the view, and Q and E turn it.');
		await expect(canvas).toHaveCSS('touch-action', 'none');
		expect(errors).toEqual([]);
	});

	test('is a radio group the keyboard works: the arrow keys choose the mode, each is announced, and the toggle shows where it is', async ({ page }) => {
		await open(page);
		await mode(page, 'Look').focus();
		expect(await focusRing(page), 'the toggle shows where it is').toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(mode(page, 'Probe')).toBeChecked();
		await expect(live(page)).toHaveText(/^Probe mode\./);
		await page.keyboard.press('ArrowRight');
		await expect(mode(page, 'Emit')).toBeChecked();
		await expect(live(page)).toHaveText(/^Emit mode\./);
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(mode(page, 'Look')).toBeChecked();
		await expect(live(page)).toHaveText('Look mode. A finger or the arrow keys move the view, and Q and E turn it.');
		// It is one stop in the order of the page, and the arrow keys move within it.
		await expect(page.locator(':focus')).toHaveAccessibleName('Look');
	});

	test('says how to use the keys: in the help beside it, in the Stage’s own help, and with a button that takes the focus to the 3D view', async ({ page }) => {
		await open(page);
		const help = page.locator('#stage-help');
		for (const part of ['arrow keys', 'Probe or Emit mode', 'Enter pins a probe', 'starts and stops smoke', 'Escape', 'press and hold to release smoke']) await expect(help, part).toContainText(part);
		await expect(stage(page), 'the Stage is described by it').toHaveAttribute('aria-describedby', 'stage-help');
		// The arrow keys act only while the Stage has focus, and a button in the Dock takes the focus there.
		const button = page.getByRole('button', { name: 'Go to the 3D view' });
		await button.focus();
		await page.keyboard.press('Enter');
		await expect(stage(page)).toBeFocused();
		expect(await stage(page).evaluate((el) => getComputedStyle(el, '::after').borderTopWidth), 'the Stage shows that it has the focus').toBe('3px');
	});

	test('keeps the arrow keys for moving the view in Look mode, and gives them to the cursor in Probe mode', async ({ page }) => {
		await open(page);
		// The arrow keys pan the Sims camera: what moves is the point it looks at on the floor (`data-focus`), not the way it faces.
		const focus = () => stage(page).getAttribute('data-focus');
		const yaw = () => stage(page).getAttribute('data-yaw');
		const start = await focus();
		const facing = await yaw();
		await stage(page).focus();
		await page.keyboard.press('ArrowRight');
		await expect.poll(focus, 'in Look mode the arrow key moves the view').not.toBe(start);
		expect(await yaw(), 'and does not turn it').toBe(facing);
		const moved = await focus();
		await mode(page, 'Probe').check();
		await stage(page).focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await expect(hoverTile(page), 'in Probe mode it moved a cursor, which reads the air').toHaveAttribute('data-state', /^(reading|no-air)$/);
		await page.waitForTimeout(500);
		expect(await focus(), 'and left the view as it was').toBe(moved);
	});
});

test.describe('with a mouse and no mode', () => {
	test('hovering reads the air under the pointer, a click pins a Probe that the list shows, and a press and hold releases smoke', async ({ page }) => {
		test.setTimeout(90_000);
		const errors = collectErrors(page);
		await open(page);
		await expect(mode(page, 'Look'), 'no mode was chosen').toBeChecked();
		await expect(hoverTile(page)).toHaveAttribute('data-state', 'empty');
		await expect(hoverTile(page)).toContainText('Point at the air, or move the cursor with the arrow keys.');

		const spot = await hoverAir(page);
		const tile = hoverTile(page);
		await expect(tile.locator('.spot-facts dt')).toHaveText(FIVE);
		await expect(tile.locator('.spot-place')).toContainText('of the north-west corner');
		await expect(tile.locator('[data-key="speed"] dd')).toHaveText(/^\d+(\.\d+)? m\/s$/);
		// Its sentence follows its label ("Under the pointer") and does not say it again.
		await expect(tile.locator('.sr-only')).toHaveText(new RegExp(`^${METRES} east and ${METRES} south of the north-west corner, at a height of ${METRES}\\. Air `));
		// Leaving the Stage puts the empty state back.
		await page.mouse.move(2, 2);
		await expect(tile).toHaveAttribute('data-state', 'empty');

		// A click leaves a Probe, and the list shows its row.
		await expect(rows(page)).toHaveCount(0);
		await expect(count(page)).toHaveText(`0 of ${MAX_PINS} probes`);
		const hint = page.locator('#dock-probes > summary .dock-group-hint');
		await expect(hint, 'a closed group still says how many Probes are pinned').toHaveText(`0 of ${MAX_PINS} probes`);
		const at = await stageAt(page, spot);
		await page.mouse.click(at.x, at.y);
		await expect(rows(page)).toHaveCount(1);
		await expect(live(page)).toHaveText('Probe 1 pinned.');
		await expect(count(page)).toHaveText(`1 of ${MAX_PINS} probes`);
		await expect(hint).toHaveText(`1 of ${MAX_PINS} probes`);
		const row = rows(page).first();
		await expect(row.locator('.probe-name')).toHaveText('Probe 1');
		await expect(row.locator('.spot-facts dt')).toHaveText(FIVE, { timeout: 15_000 });

		// A press that stays on the air releases smoke until it lifts.
		const again = await stageAt(page, spot);
		await page.mouse.move(again.x, again.y);
		await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		await page.mouse.down();
		await expect(smokeStatus(page)).toHaveText('Releasing smoke');
		await page.mouse.up();
		await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		await expect(rows(page), 'a hold is not a click: it pinned nothing').toHaveCount(1);
		expect(errors).toEqual([]);
	});

	test('a Probe shows its reading while the air is running, and the ten-second average arrives by itself', async ({ page }) => {
		test.setTimeout(150_000);
		await open(page, { moving: true });
		await pinProbes(page, 1);
		const row = rows(page).first();
		const average = row.locator('[data-key="average"] dd');
		await expect(row.locator('.spot-facts dt'), 'a reading arrives').toHaveText(FIVE, { timeout: 15_000 });
		// The air starts from rest, so for the first ten simulated seconds there is no average, and the row says so.
		await expect(average).toHaveText(/^(not yet|\d+(\.\d+)? m\/s)$/);
		await expect(row.locator('.sr-only').first()).toContainText(/The average over the last 10 seconds is not available yet\.|Average over the last 10 seconds, /);
		// While it runs the row is rewritten, and the average arrives without anyone asking.
		await expect(average, 'the ten-second average arrives while the air runs').toHaveText(/^\d+(\.\d+)? m\/s$/, { timeout: 120_000 });
		await expect(row.locator('.sr-only').first()).toContainText('Average over the last 10 seconds, ');
	});

	test('a Probe pinned while the air is paused shows its reading once, and holds still', async ({ page }) => {
		await open(page);
		await pinProbes(page, 1);
		const sentence = rows(page).first().locator('.sr-only').first();
		await expect(sentence, 'the reading arrives without the air running').toContainText('Temperature 21.');
		const once = await sentence.textContent();
		await page.waitForTimeout(2500);
		expect(await sentence.textContent(), 'nothing is rewritten while it is paused').toBe(once);
		await expect(rows(page).first().locator('[data-key="average"] dd'), 'and with no time gone by there is no average').toHaveText('not yet');
		await expect(status(page)).toHaveAttribute('data-status', 'paused');
	});
});

test.describe('the Probe list', () => {
	test('lets a Probe be removed, by mouse and by keyboard, and keeps the focus on the list', async ({ page, browserName }) => {
		test.setTimeout(90_000);
		const errors = collectErrors(page);
		await open(page);
		await pinProbes(page, 3);
		await expect(rows(page).locator('.probe-name')).toHaveText(['Probe 1', 'Probe 2', 'Probe 3']);

		// The mouse.
		const second = page.getByRole('button', { name: 'Remove Probe 2' });
		await second.scrollIntoViewIfNeeded();
		await second.click();
		await expect(rows(page).locator('.probe-name')).toHaveText(['Probe 1', 'Probe 3']);
		await expect(live(page)).toHaveText('Probe 2 removed.');
		await expect(count(page)).toHaveText(`2 of ${MAX_PINS} probes`);
		await expect(stage(page).locator('.stage-label[data-tone="probe"] .stage-label-name'), 'and it is gone from the Stage').toHaveText(['Probe 1', 'Probe 3']);
		// The focus went on to the Remove button that took its place, not to the top of the page.
		expect(await page.evaluate(() => document.activeElement?.closest('li')?.getAttribute('data-probe')), 'the focus is on the next Probe’s Remove button').toBe('p3');

		// The keyboard: Shift+Tab from the Remove button the focus is on to the one before it, then Enter, then Space.
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');
		await expect(page.getByRole('button', { name: 'Remove Probe 1' })).toBeFocused();
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('Enter');
		await expect(rows(page).locator('.probe-name')).toHaveText(['Probe 3']);
		await expect(live(page)).toHaveText('Probe 1 removed.');
		await expect(page.getByRole('button', { name: 'Remove Probe 3' })).toBeFocused();
		await page.keyboard.press('Space');
		await expect(rows(page)).toHaveCount(0);
		await expect(live(page)).toHaveText('Probe 3 removed.');
		await expect(page.locator('#dock-probes .probe-field .dock-notice')).toContainText('No probes yet');
		// With none left the focus goes to the list's heading, not nowhere.
		await expect(page.locator('#airflow-probes-label')).toBeFocused();
		expect(await focusRing(page), 'and shows it').toBe(true);
		expect(errors).toEqual([]);
	});

	test('refuses the fifth Probe and says why, and takes the next one when one is removed', async ({ page }) => {
		test.setTimeout(120_000);
		await open(page);
		await pinProbes(page, MAX_PINS);
		const note = page.locator('#dock-probes [data-full]');
		await expect(count(page)).toHaveText(`${MAX_PINS} of ${MAX_PINS} probes`);
		await expect(note).toHaveText('A home holds at most four probes. Remove one to add another.');
		// A fifth click, on air that took a Probe a moment ago.
		const spot = await hoverAir(page);
		await page.waitForTimeout(700);
		const first = await stageAt(page, spot);
		await page.mouse.click(first.x, first.y);
		await expect(live(page)).toHaveText(`A home holds at most ${MAX_PINS} probes. Remove one to add another.`);
		await expect(rows(page), 'nothing was added').toHaveCount(MAX_PINS);

		const remove = page.getByRole('button', { name: 'Remove Probe 3' });
		await remove.scrollIntoViewIfNeeded();
		await remove.click();
		await expect(note).toHaveCount(0);
		await expect(count(page)).toHaveText(`3 of ${MAX_PINS} probes`);
		// The page has scrolled to the Remove button, so the Stage is somewhere else on the screen: find air again, as the fifth click did. The first spot that had air is 3 cm from a wall, and a pixel's difference in where the Stage sits puts a click on the wall in Firefox and WebKit.
		const free = await hoverAir(page);
		await page.waitForTimeout(700);
		const second = await stageAt(page, free);
		await page.mouse.click(second.x, second.y);
		await expect(rows(page)).toHaveCount(MAX_PINS);
		await expect(rows(page).locator('.probe-name'), 'the number that was free is the one it takes, and the list is in order').toHaveText(['Probe 1', 'Probe 2', 'Probe 3', 'Probe 4']);
	});

	test('has a text equivalent for every reading: one sentence a row, the numbers hidden from a screen reader, and nothing that announces by itself', async ({ page }) => {
		test.setTimeout(90_000);
		await open(page, { moving: true });
		const heard = await record(page, LIVE);
		await pinProbes(page, 2);
		const row = rows(page).first();
		const sentence = row.locator('.sr-only').first();
		const direction = String.raw`(?:Air is still|Air moving (?:toward the [a-z-]+, (?:level|rising \d+ degrees|sinking \d+ degrees)|straight (?:up|down)))`;
		const mean = String.raw`(?:Average over the last 10 seconds, ${SPEED}|The average over the last 10 seconds is not available yet)`;
		await expect(sentence).toHaveText(
			new RegExp(
				`^Probe 1, ${METRES} east and ${METRES} south of the north-west corner, at a height of ${METRES}\\. ${direction}, at ${SPEED}\\. ${mean}\\. ` +
					String.raw`Temperature (?:minus )?\d+(?:\.\d)? degrees Celsius\. PM2\.5 (?:less than )?[\d.,]+ parts per million, (?:less than )?[\d.,]+ micrograms per cubic metre\.$`
			),
			{ timeout: 20_000 }
		);
		// What the eye gets is not read a second time, and nothing in it is a symbol a screen reader says badly. The sentence is for the ear only: it takes up no room on the page.
		const room = await sentence.evaluate((el) => {
			const box = el.getBoundingClientRect();
			return { width: box.width, height: box.height };
		});
		expect(room.width <= 1 && room.height <= 1, `the sentence is visually hidden (${room.width} by ${room.height})`).toBe(true);
		await expect(row.locator('.spot-facts')).toHaveAttribute('aria-hidden', 'true');
		await expect(row.locator('.probe-id')).toHaveAttribute('aria-hidden', 'true');
		expect((await sentence.textContent()) ?? '').not.toMatch(/[°µ³<−]/);
		const snapshot = await row.ariaSnapshot();
		expect(snapshot, 'a screen reader finds the sentence and then the button').toMatch(/listitem[\s\S]*Probe 1, [\s\S]*button "Remove Probe 1"/);
		expect(snapshot, 'and not the pile of numbers').not.toContain('Speed');
		// Every number the Stage draws has its row.
		await expect(stage(page).locator('.stage-label[data-tone="probe"] .stage-label-name')).toHaveText(['Probe 1', 'Probe 2']);
		await expect(rows(page).nth(1).locator('.sr-only').first()).toHaveText(/^Probe 2, /);
		await expect(stage(page).locator('.stage-labels'), 'the picture’s labels are for the eye').toHaveAttribute('aria-hidden', 'true');

		// None of it is a live region, and while the air runs and the numbers are rewritten a screen reader is told nothing.
		const inLive = await page.evaluate(() => {
			const wrong: string[] = [];
			for (const el of document.querySelectorAll('#dock-probes .probe-list, #dock-probes .probe-list *, #dock-probes .probe-hover, #dock-probes .probe-hover *')) {
				if (el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [aria-atomic]')) wrong.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
			}
			return wrong;
		});
		expect(inLive, 'nothing under the readouts is a live region').toEqual([]);
		await page.waitForTimeout(700);
		const before = (await heard()).length;
		await page.waitForTimeout(4000);
		expect((await heard()).length, 'the air running rewrote the numbers and announced nothing').toBe(before);
		expect(await heard()).toEqual(['Probe 1 pinned.', 'Probe 2 pinned.']);
	});

	test.describe('in the United States', () => {
		test.use({ locale: 'en-US' });

		test('tells the numbers in the visitor’s own units: miles per hour, degrees Fahrenheit and feet', async ({ page }) => {
			test.setTimeout(90_000);
			await open(page);
			await pinProbes(page, 1);
			const row = rows(page).first();
			await expect(row.locator('[data-key="speed"] dd')).toHaveText(/^\d+(\.\d+)? mph$/, { timeout: 15_000 });
			await expect(row.locator('[data-key="temperature"] dd')).toHaveText(/^\d+\.\d °F$/);
			await expect(row.locator('.spot-place')).toHaveText(/ft/);
			const sentence = row.locator('.sr-only').first();
			await expect(sentence).toContainText(/ feet |inches/);
			await expect(sentence).toContainText('miles per hour');
			await expect(sentence).toContainText('degrees Fahrenheit');
			// The particulates read the same in both.
			await expect(row.locator('[data-key="particulates"] dd')).toHaveText(/ppm \(.*µg\/m³\)$/);
		});
	});
});

test.describe('the Smoke strength', () => {
	test('is a slider that says its rate in mg of PM2.5 per minute and the real source it is about, and announces a change once', async ({ page }) => {
		await open(page);
		const range = slider(page);
		await expect(range).toBeVisible();
		await expect(range).toHaveAttribute('min', '0');
		await expect(range).toHaveAttribute('max', '1');
		// It starts in the middle of the scale, which is about incense.
		const start = describeStrength(0.5);
		await expect(range).toHaveAttribute('aria-valuetext', start.spoken);
		await expect(page.locator('#dock-probes .smoke .field-value')).toHaveText(start.rate.text);
		await expect(page.locator('#dock-probes .smoke-near'), 'and the eye is told the nearest real source in words').toHaveText('About incense');

		const heard = await record(page, LIVE);
		await range.focus();
		expect(await focusRing(page), 'the slider shows where it is').toBe(true);
		// Three presses close together are one change to a screen reader, said once, after the last.
		for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(1200);
		const value = Number(await range.inputValue());
		expect(value).toBeCloseTo(0.53, 2);
		const words = describeStrength(value);
		await expect(range).toHaveAttribute('aria-valuetext', words.spoken);
		await expect(page.locator('#dock-probes .smoke .field-value')).toHaveText(words.rate.text);
		expect(await heard(), 'one announcement for three presses').toEqual([words.announcement]);

		// Between two sources it says so, and does not claim to be one of them.
		await range.fill('0.2');
		await expect(page.locator('#dock-probes .smoke-near')).toHaveText('Between a candle and incense');
		await expect(live(page)).toHaveText('Smoke strength between a candle and incense, 0.069 milligrams per minute');
		// At the far ends it is a candle and a cooking burst.
		await range.fill('0');
		await expect(live(page)).toHaveText('Smoke strength about a candle, 0.02 milligrams per minute');
		await range.fill('1');
		await expect(live(page)).toHaveText('Smoke strength about a cooking burst, 10 milligrams per minute');
		await expect(page.locator('#dock-probes .smoke .field-value')).toHaveText('10 mg/min');
	});

	test('labels its reference points from the emission table, each at the position the table gives, and a screen reader gets them as a list', async ({ page }) => {
		await open(page);
		const table = emissionMarks();
		await expect(marks(page)).toHaveCount(table.length);
		const track = (await slider(page).boundingBox())!;
		// The thumb's centre runs from half its width in from each end of the track, which is where a mark sits.
		const edge = 11;
		for (const [n, mark] of table.entries()) {
			const item = marks(page).nth(n);
			expect(Number(await item.getAttribute('data-position')), mark.id).toBeCloseTo(mark.position, 6);
			await expect(item.getByRole('button'), mark.id).toContainText(mark.label);
			const tick = await item.evaluate((el) => el.getBoundingClientRect().left);
			const expected = track.x + edge + mark.position * (track.width - 2 * edge);
			expect(Math.abs(tick - expected), `${mark.label} sits where ${mark.mgPerMinute} mg per minute falls along the track`).toBeLessThanOrEqual(2);
			// The button says the rate in words as well, and its name starts with what the eye reads.
			await expect(item.getByRole('button'), mark.id).toHaveAccessibleName(`${mark.label} ${formatEmissionRate(mark.mgPerMinute).spoken}`);
		}
		const list = page.getByRole('list', { name: 'Set the strength to a real source' });
		await expect(list.getByRole('listitem')).toHaveCount(table.length);
		await expect(list.getByRole('button')).toHaveCount(table.length);
		await expect(page.locator('#dock-probes .mark-rate')).toHaveText(table.map((mark) => formatEmissionRate(mark.mgPerMinute).value));
	});

	test('sets the strength to a mark when the mark is pressed, and says which mark it is at', async ({ page }) => {
		await open(page);
		const range = slider(page);
		const pressed = page.locator('#dock-probes .marks button[aria-pressed="true"]');
		await expect(pressed, 'the middle of the scale is at no mark').toHaveCount(0);
		for (const mark of emissionMarks()) {
			const button = page.getByRole('button', { name: new RegExp(`^${mark.label} `) });
			await button.scrollIntoViewIfNeeded();
			await button.click();
			const words = describeStrength(mark.position);
			expect(Number(await range.inputValue()), `${mark.label}: the slider is at its position`).toBeCloseTo(mark.position, 1);
			await expect(range).toHaveAttribute('aria-valuetext', words.spoken);
			await expect(page.locator('#dock-probes .smoke .field-value'), `${mark.label}: shows the rate the table gives`).toHaveText(formatEmissionRate(mark.mgPerMinute).text);
			await expect(live(page)).toHaveText(words.announcement);
			await expect(pressed).toHaveCount(1);
			await expect(button).toHaveAttribute('aria-pressed', 'true');
		}
		// Frying is announced the way the Dock words it, and the eye reads it under the marks.
		await page.getByRole('button', { name: /^Frying / }).click();
		await expect(live(page)).toHaveText('Smoke strength about frying, 2 milligrams per minute');
		await expect(page.locator('#dock-probes .smoke-near')).toHaveText('About frying');
		expect(describeStrength(emissionPosition(2)).announcement).toBe('Smoke strength about frying, 2 milligrams per minute');
		// Moving the slider off a mark releases the mark.
		await slider(page).focus();
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(pressed).toHaveCount(0);
	});
});

test.describe('releasing smoke and pinning a Probe without a mouse', () => {
	test('by keyboard: choose Emit, go to the 3D view, move the cursor and press Enter to start the smoke and Enter again to stop it', async ({ page, browserName }) => {
		test.setTimeout(90_000);
		const errors = collectErrors(page);
		await open(page);
		const heard = await record(page, '#dock-probes .smoke-status');
		await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		// Choosing the mode is a keyboard job too: the toggle is a radio group, and the button after it moves the focus to the Stage.
		await mode(page, 'Look').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await expect(mode(page, 'Emit')).toBeChecked();
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
		await expect(page.locator(':focus')).toHaveAccessibleName('Go to the 3D view');
		await page.keyboard.press('Enter');
		await expect(stage(page)).toBeFocused();

		await cursorToAir(page);
		await page.keyboard.press('Enter');
		await expect(smokeStatus(page)).toHaveText('Releasing smoke');
		await page.keyboard.press('Enter');
		await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		// Escape stops it too, and puts the cursor away.
		await page.keyboard.press('Enter');
		await expect(smokeStatus(page)).toHaveText('Releasing smoke');
		await page.keyboard.press('Escape');
		await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		// The status is a polite live region, and each change was said: started, stopped, started, stopped, and nothing between.
		expect(await heard()).toEqual(['Releasing smoke', 'Not releasing smoke', 'Releasing smoke', 'Not releasing smoke']);
		await expect(smokeStatus(page)).toHaveAttribute('role', 'status');
		expect(errors).toEqual([]);
	});

	test('by keyboard in Probe mode: the arrow keys move a cursor that reads the air, and Enter pins a Probe there', async ({ page, browserName }) => {
		test.setTimeout(90_000);
		await open(page);
		await mode(page, 'Look').focus();
		await page.keyboard.press('ArrowRight');
		await expect(mode(page, 'Probe')).toBeChecked();
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
		await page.keyboard.press('Enter');
		await expect(stage(page)).toBeFocused();
		await cursorToAir(page);
		// The cursor is read as it moves: what is under it is in the readout, with no pointer in the Stage.
		await expect(hoverTile(page).locator('.spot-facts dt')).toHaveText(FIVE);
		await page.keyboard.press('Enter');
		await expect(rows(page)).toHaveCount(1);
		await expect(live(page)).toHaveText('Probe 1 pinned.');
		await expect(hoverTile(page), 'the cursor is still reading').toHaveAttribute('data-state', 'reading');
	});

	test.describe('by touch', () => {
		test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

		test('in Look mode a finger only moves the view: a tap pins nothing and releases nothing', async ({ page }) => {
			await open(page);
			await expect(mode(page, 'Look')).toBeChecked();
			const { x, y } = await stageAt(page, SPOTS[Math.floor(SPOTS.length / 2)]);
			await page.touchscreen.tap(x, y);
			await page.touchscreen.tap(x + 40, y);
			await page.waitForTimeout(700);
			await expect(rows(page)).toHaveCount(0);
			await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		});

		test('in Probe mode a tap on the home pins a Probe, and the list shows it', async ({ page }) => {
			test.setTimeout(90_000);
			await open(page);
			const probe = mode(page, 'Probe');
			await probe.scrollIntoViewIfNeeded();
			await probe.tap();
			await expect(probe).toBeChecked();
			await expect(live(page)).toHaveText(/^Probe mode\. Touch the home/);
			await pinProbes(page, 1, { touch: true });
			await expect(live(page)).toHaveText('Probe 1 pinned.');
			await expect(rows(page).first().locator('.probe-name')).toHaveText('Probe 1');
			await expect(rows(page).first().locator('.sr-only').first()).toContainText('Probe 1, ');
		});

		test('in Emit mode a touch releases smoke, and lifting the finger stops it', async ({ page }) => {
			test.setTimeout(90_000);
			const errors = collectErrors(page);
			await open(page);
			const emit = mode(page, 'Emit');
			await emit.scrollIntoViewIfNeeded();
			await emit.tap();
			await expect(emit).toBeChecked();
			await expect(live(page)).toHaveText(/^Emit mode\. Touch the home to release smoke/);
			const heard = await record(page, '#dock-probes .smoke-status');
			// A finger down and up. Smoke starts under it and stops as it lifts: the status line said both, in that order.
			for (const spot of SPOTS) {
				const { x, y } = await stageAt(page, spot);
				await page.touchscreen.tap(x, y);
				await page.waitForTimeout(400);
				if ((await heard()).length > 0) break;
			}
			expect(await heard()).toEqual(['Releasing smoke', 'Not releasing smoke']);
			await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
			await expect(rows(page), 'Emit mode pins nothing').toHaveCount(0);
			expect(errors).toEqual([]);
		});

		test('in Emit mode a finger held on the glass releases smoke for as long as it stays, wherever it moves on the air (Chromium holds a touch down)', async ({ page, browserName }) => {
			test.skip(browserName !== 'chromium', 'Only Chromium can hold a touch down from a test.');
			test.setTimeout(90_000);
			await open(page);
			const emit = mode(page, 'Emit');
			await emit.scrollIntoViewIfNeeded();
			await emit.tap();
			await expect(emit).toBeChecked();
			const client = await page.context().newCDPSession(page);
			let held = false;
			for (const spot of SPOTS) {
				const { x, y } = await stageAt(page, spot);
				await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
				await page.waitForTimeout(350);
				if ((await smokeStatus(page).textContent()) === 'Releasing smoke') {
					held = true;
					await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 12, y: y + 6 }] });
					await page.waitForTimeout(300);
					await expect(smokeStatus(page), 'still releasing while the finger moves').toHaveText('Releasing smoke');
				}
				await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
				if (held) break;
			}
			expect(held, 'a held touch released smoke').toBe(true);
			await expect(smokeStatus(page)).toHaveText('Not releasing smoke');
		});
	});
});

test.describe('the group as a whole', () => {
	test('has no WCAG 2.1 A/AA violations that axe can detect, empty and with Probes and a reading, at desktop and phone widths', async ({ page }) => {
		test.setTimeout(120_000);
		const scan = async (where: string) => {
			const { violations } = await new AxeBuilder({ page }).include('#dock-probes').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
			expect(
				violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
				where
			).toEqual([]);
		};
		await open(page);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await scan(`${width}px wide, nothing pinned`);
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		await pinProbes(page, MAX_PINS);
		await hoverAir(page);
		await expect(hoverTile(page)).toHaveAttribute('data-state', 'reading');
		await scan('1440px wide, four Probes pinned and a reading under the pointer');
		await page.setViewportSize({ width: 390, height: 900 });
		await scan('390px wide, four Probes pinned');
	});

	test('keeps every control inside the card and every label whole, from 320 to 1440 px wide, with four Probes pinned', async ({ page }) => {
		test.setTimeout(120_000);
		await open(page);
		await page.setViewportSize({ width: 1280, height: 900 });
		await pinProbes(page, MAX_PINS);
		for (const width of [320, 360, 390, 700, 1000, 1159, 1160, 1280, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await page.waitForTimeout(200);
			const found = await page.evaluate((targets) => {
				const problems: string[] = [];
				const card = document.querySelector('.airflow-drawer')!.getBoundingClientRect();
				if (document.documentElement.scrollWidth > innerWidth) problems.push('the page scrolls sideways');
				for (const el of document.querySelectorAll('#dock-probes *')) {
					const box = el.getBoundingClientRect();
					const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
					if (box.width > 0 && (box.left < card.left - 1 || box.right > card.right + 1)) problems.push(`${name} is outside the card`);
				}
				// A label that does not fit its box is cut or runs over what is beside it.
				for (const el of document.querySelectorAll<HTMLElement>('#dock-probes .spot-facts dd, #dock-probes .spot-facts dt, #dock-probes .spot-place, #dock-probes .probe-name, #dock-probes .mark-name, #dock-probes .mark-rate, #dock-probes .spot')) {
					if (el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className} is wider than its box (${el.scrollWidth} against ${el.clientWidth})`);
				}
				// A finger needs 44 px.
				for (const el of document.querySelectorAll(targets)) {
					const box = el.getBoundingClientRect();
					if (box.width < 43.5 || box.height < 43.5) problems.push(`${(el.textContent ?? '').trim().slice(0, 20)} is ${Math.round(box.width)}x${Math.round(box.height)}`);
				}
				// The marks along the slider: whole, inside the list, and not over each other.
				const list = document.querySelector('#dock-probes .marks')!.getBoundingClientRect();
				const buttons = [...document.querySelectorAll('#dock-probes .marks button')].map((b) => ({ name: b.querySelector('.mark-name')!.textContent!, box: b.getBoundingClientRect() }));
				for (const [n, a] of buttons.entries()) {
					if (a.box.left < list.left - 0.5 || a.box.right > list.right + 0.5 || a.box.bottom > list.bottom + 0.5) problems.push(`the mark ${a.name} is outside its track`);
					for (const b of buttons.slice(n + 1)) {
						const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
						const down = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
						if (across > 0.5 && down > 0.5) problems.push(`the marks ${a.name} and ${b.name} overlap`);
					}
				}
				// The tiles hold every row: nothing hangs out of the bottom of one.
				for (const tile of document.querySelectorAll<HTMLElement>('#dock-probes .spot')) if (tile.scrollHeight > tile.clientHeight + 1) problems.push('a tile is shorter than what it holds');
				return problems;
			}, TARGETS);
			expect(found, `${width}px wide`).toEqual([]);
		}
	});

	test('has every control in the order it is read, each named, with a visible focus ring, and works with the keyboard alone', async ({ page, browserName }) => {
		test.setTimeout(90_000);
		await open(page);
		await pinProbes(page, 1);
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		const previous = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
		const order: [string, string][] = [
			['the Look mode', 'Look'],
			['the button to the 3D view', 'Go to the 3D view'],
			['the Smoke strength slider', 'Smoke strength'],
			...emissionMarks().map((mark): [string, string] => [`the ${mark.label} mark`, `${mark.label} ${formatEmissionRate(mark.mgPerMinute).spoken}`]),
			['the Remove button of Probe 1', 'Remove Probe 1']
		];
		// The focus is put on the first control and moved off and back with the keys, so the page has seen the keyboard and draws its ring.
		await mode(page, 'Look').focus();
		await page.keyboard.press(next);
		await page.keyboard.press(previous);
		for (const [what, name] of order) {
			if (what !== 'the Look mode') await page.keyboard.press(next);
			await expect(page.locator(':focus'), what).toHaveAccessibleName(name);
			expect(await focusRing(page), `${what} shows where it is`).toBe(true);
		}
		// A mark is pressed with Space.
		await page.keyboard.press(previous);
		await page.keyboard.press(previous);
		await page.keyboard.press('Space');
		await expect(page.locator('#dock-probes .marks button[aria-pressed="true"]')).toHaveCount(1);
	});
});
