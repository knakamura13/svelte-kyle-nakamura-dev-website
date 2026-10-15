import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { focusRing, live, openAirflow, status } from './dock';
import { dockLegend } from '../src/lib/experiments/airflow/viz/dockLegend';
import { SENSITIVITY_SLIDER, describeLayer, describeSensitivity, describeSliceHeight, sensitivityFromSlider } from '../src/lib/experiments/airflow/viz/viewControls';
import type { LayerId } from '../src/lib/experiments/airflow/state';

/**
 * The View group and the legend, driven the way a visitor does: the Layer picker, the colour sensitivity and Slice height sliders, the
 * Top-down view and Tracers switches and the unit toggle, and the legend of the Layer on the Slice that follows them. The simulation is
 * paused (reduced motion), so the air stands still and the Stage is the same picture every time it is drawn for the same settings. The
 * browsers' language is pinned: it only picks the units the page starts in.
 */

const LAYERS: { name: string; id: LayerId; title: string }[] = [
	{ name: 'Speed', id: 'speed', title: 'Air speed' },
	{ name: 'Direction', id: 'direction', title: 'Direction of flow' },
	{ name: 'Particulates', id: 'particulates', title: 'Particulates (PM2.5)' },
	{ name: 'Temperature', id: 'temperature', title: 'Temperature' }
];
/** The page's starting settings: the default sensitivity, and the indoor temperature of the scenario it opens on. */
const START = { sensitivity: 0.5, reference: 21 };

const stageOf = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const legendOf = (page: Page) => page.locator('.dock-legend');
const sliderOf = (page: Page, name: string) => page.getByRole('slider', { name });
/** The number beside a slider's label. */
const valueOf = (page: Page, id: string) => page.locator('.field', { has: page.locator(`#${id}`) }).locator('.field-value');

/** How much of a Stage changed between two pictures: the share of pixels where any colour channel moved by more than a little. */
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

/**
 * The Stage once it has stopped changing: paused, nothing moves, so two pictures in a row are the same. A change of setting is drawn
 * once at once and again when the simulation's new reading of it arrives, so the picture right after a change may not be the last one.
 */
async function settle(page: Page, view: Locator, from?: Buffer) {
	let previous = from ?? (await view.screenshot());
	for (let n = 0; n < 30; n++) {
		await page.waitForTimeout(200);
		const next = await view.screenshot();
		const calm = (await changedShare(page, previous, next)) < 0.0005;
		previous = next;
		if (calm) break;
	}
	return previous;
}

/** Opens the page and waits for a live Stage with its picture drawn. Skips in a browser that cannot draw 3D. */
async function liveStage(page: Page) {
	await openAirflow(page);
	const view = stageOf(page);
	await expect(view).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 15_000 });
	test.skip((await view.getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
	await expect(status(page)).toHaveAttribute('data-status', /^(paused|running)$/, { timeout: 30_000 });
	return { view, picture: await settle(page, view) };
}

/** Waits for the Stage to be redrawn by a change of setting, and returns the new, settled picture. */
async function redrawn(page: Page, view: Locator, before: Buffer, atLeast: number, what: string) {
	let latest = before;
	await expect
		.poll(
			async () => {
				latest = await view.screenshot();
				return changedShare(page, before, latest);
			},
			{ message: `${what}: the Stage is redrawn`, timeout: 30_000 }
		)
		.toBeGreaterThan(atLeast);
	return settle(page, view, latest);
}

// A page with a live 3D Stage and a solver in a worker is slow to open on a busy machine, and these tests open it often.
test.describe.configure({ timeout: 120_000 });

test.describe('the View group and the legend', () => {
	test.use({ locale: 'en-US' });
	let errors: string[] = [];

	test.beforeEach(async ({ page }) => {
		errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});
	test.afterEach(() => {
		expect(errors, 'no errors in the console').toEqual([]);
	});
	/**
	 * Opens the page at another width from nothing. The page before is torn down first: a simulation that is still starting when its page
	 * goes may say so in the console, which is not news, so what the console said until then is forgotten.
	 */
	async function reopen(page: Page, width: number) {
		await page.goto('about:blank');
		errors.length = 0;
		await page.setViewportSize({ width, height: 900 });
		await openAirflow(page);
	}

	test('the Layer picker switches among the four Layers: the legend names each one in the unit shown, in words and in numbers, and the Stage is redrawn for it', async ({ page }) => {
		test.setTimeout(180_000);
		const { view, picture } = await liveStage(page);
		const legend = legendOf(page);
		// It opens on Speed, in mph because the browser's language is American English.
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeChecked();
		await expect(legend).toHaveAttribute('data-layer', 'speed');
		await expect(legend.locator('.legend-title')).toHaveText('Air speed');
		await expect(legend.locator('.legend-unit')).toHaveText('mph');
		await expect(legend.getByRole('img')).toHaveAccessibleName('Air speed, 0 to 3.4 miles per hour, from pale to dark blue.');
		await expect(legend.locator('.legend-ticks li')).toHaveText(['0 mph', '1 mph', '2 mph', '3 mph']);

		// Each Layer in turn, round to the start: the Stage's slice changes colour every time (at rest it is one flat colour per Layer: pale blue, grey, pale orange, grey).
		let before = picture;
		for (const layer of [...LAYERS.slice(1), LAYERS[0]]) {
			await page.getByRole('radio', { name: layer.name, exact: true }).check();
			await expect(page.getByRole('radio', { name: layer.name, exact: true })).toBeChecked();
			const expected = dockLegend({ layer: layer.id, units: 'imperial', ...START });
			await expect(legend).toHaveAttribute('data-layer', layer.id);
			await expect(legend.locator('.legend-title')).toHaveText(layer.title);
			await expect(legend.getByRole('img')).toHaveAccessibleName(expected.description);
			await expect(legend.locator('.legend-caption')).toContainText(expected.caption);
			await expect(live(page), `${layer.name}: said once the visitor stops`).toHaveText(describeLayer(expected.description));
			if (layer.id === 'direction') {
				await expect(legend.locator('.wheel-letter [aria-hidden]')).toHaveText(['N', 'E', 'S', 'W']);
				await expect(legend.locator('.wheel-letter .sr-only')).toHaveText(['north', 'east', 'south', 'west']);
				await expect(legend.locator('.legend-rings')).toContainText('Rings, from the centre out: 1 mph, 2 mph, 3 mph.');
				await expect(legend.locator('.legend-bar')).toHaveCount(0);
			} else {
				await expect(legend.locator('.wheel-letter')).toHaveCount(0);
				await expect(legend.locator('.legend-ticks li')).toHaveText(
					[...expected.ticks, ...(expected.midpoint ? [expected.midpoint] : [])]
						.sort((a, b) => a.at - b.at)
						.map((tick) => `${tick.label.value} ${tick.label.unit}${tick.second ? ` ${tick.second.value} ${tick.second.unit}` : ''}`)
				);
			}
			before = await redrawn(page, view, before, 0.05, layer.name);
		}
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeChecked();
	});

	test('the units toggle changes every number: the legend, the slice height, the status line and a probe’s label, and says so', async ({ page }) => {
		test.setTimeout(180_000);
		const { view } = await liveStage(page);
		const legend = legendOf(page);
		const probe = view.locator('.stage-label[data-tone="probe"]');
		// A probe on the Stage, so that its label has a speed to write.
		await view.scrollIntoViewIfNeeded();
		const box = (await view.boundingBox())!;
		for (const [x, y] of [
			[0.5, 0.55],
			[0.42, 0.5],
			[0.58, 0.5],
			[0.4, 0.62],
			[0.6, 0.62],
			[0.5, 0.45]
		]) {
			await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
			await page.waitForTimeout(500);
			if (await probe.count()) break;
		}
		await expect(probe).toHaveCount(1);

		// American English starts in imperial.
		await expect(page.getByRole('radio', { name: 'Imperial' })).toBeChecked();
		await expect(legend).toContainText('mph');
		await expect(legend).not.toContainText('m/s');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^3\sft\s7\sin$/);
		await expect(status(page)).toContainText(/each \d+\sin across/);
		await expect(probe.locator('.stage-label-value')).toHaveText(/^\d+\.\d+\smph$/);

		await page.getByRole('radio', { name: 'Metric' }).check();
		await expect(live(page)).toHaveText('Units: metric.');
		await expect(legend).toContainText('m/s');
		await expect(legend).not.toContainText('mph');
		await expect(legend.locator('.legend-unit')).toHaveText('m/s');
		await expect(legend.locator('.legend-ticks li')).toHaveText(['0 m/s', '0.5 m/s', '1.0 m/s', '1.5 m/s']);
		await expect(legend.getByRole('img')).toHaveAccessibleName('Air speed, 0 to 1.5 metres per second, from pale to dark blue.');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^1\.10\sm$/);
		await expect(status(page)).toContainText(/each 0\.\d\d\sm across/);
		await expect(status(page)).not.toContainText(/\sin across/);
		await expect(probe.locator('.stage-label-value')).toHaveText(/^\d+\.\d+\sm\/s$/);
		// The other Layers' numbers follow too: temperature in °C, then in °F.
		await page.getByRole('radio', { name: 'Temperature', exact: true }).check();
		await expect(legend.locator('.legend-unit')).toHaveText('°C');
		await expect(legend.locator('.legend-ticks li')).toHaveText(['18 °C', '20 °C', '21 °C', '22 °C', '24 °C']);
		await page.getByRole('radio', { name: 'Imperial' }).check();
		await expect(live(page)).toHaveText('Units: imperial.');
		await expect(legend.locator('.legend-unit')).toHaveText('°F');
		await expect(legend.locator('.legend-ticks li')).toHaveText(['66 °F', '68 °F', '69.8 °F', '72 °F', '74 °F']);
		await expect(legend).not.toContainText('°C');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^3\sft\s7\sin$/);
		await expect(probe.locator('.stage-label-value')).toHaveText(/\smph$/);
	});

	test('colour sensitivity rescales the legend, shows its value, and announces once, after the visitor stops moving it', async ({ page }) => {
		await openAirflow(page);
		const slider = sliderOf(page, 'Colour sensitivity');
		const legend = legendOf(page);
		await slider.scrollIntoViewIfNeeded();
		// The default is 0.5, on a log scale from 0.25 to 4.
		await expect(slider).toHaveAttribute('min', String(SENSITIVITY_SLIDER.min));
		await expect(slider).toHaveAttribute('max', String(SENSITIVITY_SLIDER.max));
		await expect(slider).toHaveValue('-1');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.5×');
		await expect(slider).toHaveAttribute('aria-valuetext', '0.5 times');
		// The scale it sets is said beside it too, because the legend may be out of sight, higher in the Dock, while the slider is used.
		const scaleNote = page.locator('.dock-notice', { hasText: 'Scale:' });
		await expect(scaleNote).toContainText('Scale: 0 to 3.4 mph.');
		const ticks = await legend.locator('.legend-ticks').innerText();

		// Three quick presses are one announcement, of where the slider came to rest.
		await page.evaluate(() => {
			const region = document.querySelector('article.airflow p[aria-live="polite"]')!;
			(window as unknown as { __said: string[] }).__said = [];
			new MutationObserver(() => {
				const text = region.textContent?.trim();
				if (text) (window as unknown as { __said: string[] }).__said.push(text);
			}).observe(region, { childList: true, characterData: true, subtree: true });
		});
		await slider.focus();
		for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowLeft');
		const sensitivity = sensitivityFromSlider(-1.75);
		expect(sensitivity).toBe(0.3);
		const wanted = describeSensitivity('speed', sensitivity, dockLegend({ layer: 'speed', sensitivity, units: 'imperial', reference: START.reference }).description);
		await expect(live(page)).toHaveText(wanted, { timeout: 5000 });
		await page.waitForTimeout(1200);
		expect(await page.evaluate(() => (window as unknown as { __said: string[] }).__said), 'said once, not at every press').toEqual([wanted]);
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.3×');
		await expect(slider).toHaveAttribute('aria-valuetext', '0.3 times');
		const scale = (layer: LayerId, sensitivity: number) => dockLegend({ layer, sensitivity, units: 'imperial', reference: START.reference }).description;
		await expect(legend.getByRole('img')).toHaveAccessibleName(scale('speed', 0.3));
		expect(await legend.locator('.legend-ticks').innerText(), 'the ticks moved with it').not.toBe(ticks);

		// The ends are 0.25 and 4: a smaller scale lowers the legend's top (the scale covers less) and a larger one raises it.
		await page.keyboard.press('Home');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.25×');
		await expect(legend.getByRole('img')).toHaveAccessibleName(scale('speed', 0.25));
		await expect(legend.getByRole('img')).toHaveAccessibleName(/^Air speed, 0 to 1\.7 miles per hour/);
		await expect(scaleNote).toContainText('Scale: 0 to 1.7 mph.');
		await page.keyboard.press('End');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('4×');
		await expect(legend.getByRole('img')).toHaveAccessibleName(scale('speed', 4));
		await expect(legend.getByRole('img')).toHaveAccessibleName(/^Air speed, 0 to 27 miles per hour/);
		await expect(scaleNote).toContainText('Scale: 0 to 27 mph.');
		await expect(live(page)).toHaveText(describeSensitivity('speed', 4, scale('speed', 4)));
		await expect(live(page)).toContainText('only stronger flow shows in strong colour');

		// What the sensitivity does depends on the Layer, and the page says so for the Layer on the Slice.
		await page.getByRole('radio', { name: 'Temperature', exact: true }).check();
		await expect(page.locator('.dock-notice', { hasText: 'Lower:' })).toContainText('Lower: smaller temperature differences show in stronger colour.');
		await sliderOf(page, 'Colour sensitivity').fill('-2');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.25×');
		await expect(live(page)).toHaveText(describeSensitivity('temperature', 0.25, scale('temperature', 0.25)));
		await expect(legend.getByRole('img')).toHaveAccessibleName(scale('temperature', 0.25));
		await expect(scaleNote).toContainText(`Scale: ${dockLegend({ layer: 'temperature', sensitivity: 0.25, units: 'imperial', reference: START.reference }).range}.`);
		await expect(scaleNote).toContainText('Scale: 67.1 to 72.5 °F.');
	});

	test('the slice height slider moves the Slice while the simulation is paused, and its reading follows the unit shown', async ({ page }) => {
		test.setTimeout(180_000);
		const { view, picture } = await liveStage(page);
		await expect(status(page)).toHaveAttribute('data-status', 'paused');
		const slider = sliderOf(page, 'Slice height');
		await slider.scrollIntoViewIfNeeded();
		// 1.1 m, a little over three and a half feet: the slider counts whole inches, two at a step.
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^3\sft\s7\sin$/);
		await expect(slider).toHaveAttribute('min', '4');
		await expect(slider).toHaveAttribute('max', '90');
		await expect(slider).toHaveAttribute('step', '2');

		await slider.focus();
		await page.keyboard.press('Home');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^4\sin$/);
		await expect(live(page)).toHaveText('Slice height: 4 inches.');
		// The paused simulation still reads the air at the new height, and the Stage draws it there: the plane has moved.
		const low = await redrawn(page, view, picture, 0.03, 'the Slice at the floor');
		await expect(status(page), 'it is still paused').toHaveAttribute('data-status', 'paused');
		await page.keyboard.press('End');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^7\sft\s6\sin$/);
		await expect(live(page)).toHaveText('Slice height: 7 feet 6 inches.');
		await redrawn(page, view, low, 0.03, 'the Slice at the ceiling');
		await page.keyboard.press('ArrowLeft');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^7\sft\s4\sin$/);

		// In metres it is the same height, to the step of 0.05 m.
		await page.getByRole('radio', { name: 'Metric' }).check();
		await expect(slider).toHaveAttribute('min', '0.1');
		await expect(slider).toHaveAttribute('max', '2.3');
		await expect(slider).toHaveAttribute('step', '0.05');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^2\.\d\d\sm$/);
		await slider.fill('1.1');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^1\.10\sm$/);
		await expect(live(page)).toHaveText(describeSliceHeight(1.1, 'metric'));
	});

	test('Top-down view and Tracers redraw the Stage, say so, and can be switched back', async ({ page }) => {
		test.setTimeout(180_000);
		const { view, picture } = await liveStage(page);
		const topDown = page.getByRole('checkbox', { name: 'Top-down view' });
		const tracers = page.getByRole('checkbox', { name: 'Tracers' });
		await expect(topDown).not.toBeChecked();
		await expect(tracers).toBeChecked();

		await tracers.uncheck();
		await expect(live(page)).toHaveText('Tracers off.');
		const noTracers = await redrawn(page, view, picture, 0.01, 'Tracers off');
		await tracers.check();
		await expect(live(page)).toHaveText('Tracers on.');
		const withTracers = await redrawn(page, view, noTracers, 0.01, 'Tracers on');
		// With the Tracers back the picture is the one it was, not the one without them (a little may differ: the dots are small and many).
		expect(await changedShare(page, picture, withTracers), 'with the Tracers back it is the same picture').toBeLessThan((await changedShare(page, picture, noTracers)) / 2);

		await topDown.check();
		await expect(live(page)).toHaveText('Top-down view on.');
		const plan = await redrawn(page, view, withTracers, 0.2, 'Top-down view on');
		await topDown.uncheck();
		await expect(live(page)).toHaveText('Top-down view off.');
		await redrawn(page, view, plan, 0.2, 'Top-down view off');
	});

	test('every control works by keyboard, in order, with a name and a visible focus ring', async ({ page, browserName }) => {
		// Safari's default settings move between buttons and links with Option+Tab; plain Tab skips them.
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		const summary = page.locator('#dock-view > summary');
		await summary.scrollIntoViewIfNeeded();
		await summary.focus();
		expect(await focusRing(page), 'the group title shows where it is').toBe(true);
		const legend = legendOf(page);

		// Layer: one stop, and the arrow keys choose.
		await page.keyboard.press(next);
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeFocused();
		expect(await focusRing(page), 'Layer shows where it is').toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(page.getByRole('radio', { name: 'Direction', exact: true })).toBeChecked();
		await expect(legend.locator('.legend-title')).toHaveText('Direction of flow');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await expect(page.getByRole('radio', { name: 'Temperature', exact: true })).toBeChecked();
		await expect(legend.locator('.legend-title')).toHaveText('Temperature');
		// And back to the first: the other way, since browsers differ on whether the arrow keys wrap around the end of a group.
		for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowLeft');
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeChecked();
		await expect(legend.locator('.legend-title')).toHaveText('Air speed');

		// The two sliders: the arrows, Home and End.
		await page.keyboard.press(next);
		await expect(sliderOf(page, 'Colour sensitivity')).toBeFocused();
		expect(await focusRing(page), 'sensitivity shows where it is').toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.59×');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(valueOf(page, 'airflow-sensitivity')).toHaveText('0.42×');
		await page.keyboard.press(next);
		await expect(sliderOf(page, 'Slice height')).toBeFocused();
		expect(await focusRing(page), 'slice height shows where it is').toBe(true);
		// The slider counts inches two at a time, and 1.1 m (43.3 in) sits on the stop of 44.
		await page.keyboard.press('ArrowRight');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^3\sft\s10\sin$/);
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(valueOf(page, 'airflow-slice-height')).toHaveText(/^3\sft\s6\sin$/);

		// The switches: Space.
		await page.keyboard.press(next);
		await expect(page.getByRole('checkbox', { name: 'Top-down view' })).toBeFocused();
		expect(await focusRing(page), 'Top-down view shows where it is').toBe(true);
		await page.keyboard.press('Space');
		await expect(page.getByRole('checkbox', { name: 'Top-down view' })).toBeChecked();
		await expect(live(page)).toHaveText('Top-down view on.');
		await page.keyboard.press(next);
		await expect(page.getByRole('checkbox', { name: 'Tracers' })).toBeFocused();
		expect(await focusRing(page), 'Tracers shows where it is').toBe(true);
		await page.keyboard.press('Space');
		await expect(page.getByRole('checkbox', { name: 'Tracers' })).not.toBeChecked();
		await expect(live(page)).toHaveText('Tracers off.');

		// Units: one stop, and the arrow keys choose.
		await page.keyboard.press(next);
		await expect(page.getByRole('radio', { name: 'Imperial' })).toBeFocused();
		expect(await focusRing(page), 'Units shows where it is').toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(page.getByRole('radio', { name: 'Metric' })).toBeChecked();
		await expect(live(page)).toHaveText('Units: metric.');
		await expect(legend).toContainText('m/s');

		// And back, to be sure nothing was a one-way trip.
		await page.keyboard.press('Shift+' + (browserName === 'webkit' ? 'Alt+Tab' : 'Tab'));
		await expect(page.getByRole('checkbox', { name: 'Tracers' })).toBeFocused();
	});

	test('the group is a disclosure that a keyboard closes and opens, and the legend stays in view when it is closed', async ({ page }) => {
		await openAirflow(page);
		const group = page.locator('#dock-view');
		const summary = group.locator('> summary');
		await expect(group).toHaveAttribute('open', '');
		await expect(summary).toContainText('View');
		await summary.scrollIntoViewIfNeeded();
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(group).not.toHaveAttribute('open', '');
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeHidden();
		await expect(legendOf(page), 'the legend is not inside the group').toBeVisible();
		await page.keyboard.press('Space');
		await expect(group).toHaveAttribute('open', '');
		await expect(page.getByRole('radio', { name: 'Speed', exact: true })).toBeVisible();
	});

	test('every control is at least 44 px tall and wide, and a switch or slider is as large to touch as its label', async ({ page }) => {
		for (const width of [1280, 390]) {
			await reopen(page, width);
			const small = await page.evaluate(() => {
				const found: string[] = [];
				const group = document.querySelector('#dock-view')!;
				// What a finger meets: the visible face of a segment (its input is invisible, laid over it), a switch with its label, and the whole slider.
				for (const el of [...group.querySelectorAll('.segment span'), ...group.querySelectorAll('label.switch'), ...group.querySelectorAll('input[type="range"]')]) {
					const box = el.getBoundingClientRect();
					if (box.width < 43.5 || box.height < 43.5) found.push(`${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().slice(0, 24)} ${Math.round(box.width)}x${Math.round(box.height)}`);
				}
				return found;
			});
			expect(small, `${width}px wide`).toEqual([]);
		}
	});

	test('the legend fits its Dock and none of its labels overlap, for every Layer, sensitivity and unit system, from a phone to the widest screen', async ({ page }) => {
		test.setTimeout(180_000);
		for (const width of [320, 390, 1280]) {
			await reopen(page, width);
			for (const units of ['Imperial', 'Metric']) {
				await page.getByRole('radio', { name: units }).check();
				for (const layer of LAYERS) {
					await page.getByRole('radio', { name: layer.name, exact: true }).check();
					// Every stop of the sensitivity slider (-2 to 2 in quarters) is set in the page, each drawn before it is measured.
					const problems = await page.evaluate(async () => {
						const found: string[] = [];
						const slider = document.querySelector<HTMLInputElement>('#airflow-sensitivity')!;
						const drawn = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
						for (let position = -2; position <= 2; position += 0.25) {
							slider.value = String(position);
							slider.dispatchEvent(new Event('input', { bubbles: true }));
							await drawn();
							const where = `sensitivity ${position}`;
							const legend = document.querySelector('.dock-legend')!.getBoundingClientRect();
							const inside = (box: DOMRect, what: string) => {
								if (box.left < legend.left - 2 || box.right > legend.right + 2) found.push(`${where}: ${what} sticks out of the legend (${Math.round(box.left - legend.left)} to ${Math.round(box.right - legend.left)} of ${Math.round(legend.width)})`);
							};
							// Each row of tick labels on its own: the numbers, and under them the second unit's.
							for (const row of ['.tick-number', '.tick-second']) {
								const boxes = [...document.querySelectorAll(`.legend-ticks li ${row}`)]
									.map((el) => ({ text: el.textContent ?? '', box: el.getBoundingClientRect() }))
									.sort((a, b) => a.box.left - b.box.left);
								for (const { text, box } of boxes) inside(box, `"${text}"`);
								for (let i = 1; i < boxes.length; i++) if (boxes[i].box.left < boxes[i - 1].box.right + 2) found.push(`${where}: "${boxes[i - 1].text}" and "${boxes[i].text}" overlap or touch`);
							}
							for (const el of document.querySelectorAll('.legend-grid *')) {
								const box = el.getBoundingClientRect();
								if (box.width > 0) inside(box, `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
							}
							if (document.documentElement.scrollWidth > innerWidth) found.push(`${where}: the page scrolls sideways`);
						}
						return found;
					});
					expect(problems, `${width}px, ${units}, ${layer.name}`).toEqual([]);
				}
			}
		}
	});

	test('has no WCAG 2.1 A/AA violations that axe can detect in the group or in the legend of any Layer, at desktop and phone widths', async ({ page }) => {
		test.setTimeout(180_000);
		for (const width of [1440, 390]) {
			await reopen(page, width);
			for (const layer of LAYERS) {
				await page.getByRole('radio', { name: layer.name, exact: true }).check();
				await expect(legendOf(page)).toHaveAttribute('data-layer', layer.id);
				const { violations } = await new AxeBuilder({ page }).include('#dock-view').include('.dock-legend').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
				expect(
					violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
					`${width}px wide, ${layer.name}`
				).toEqual([]);
			}
		}
	});

	test('every control has an accessible name, and the legend’s bar and wheel are named images whose numbers are text', async ({ page }) => {
		await openAirflow(page);
		const group = page.locator('#dock-view');
		for (const [role, names] of [
			['radio', ['Speed', 'Direction', 'Particulates', 'Temperature', 'Imperial', 'Metric']],
			['slider', ['Colour sensitivity', 'Slice height']],
			['checkbox', ['Top-down view', 'Tracers']]
		] as const) {
			for (const name of names) await expect(group.getByRole(role, { name, exact: true }), `${role} ${name}`).toHaveCount(1);
		}
		// Each radio group has a legend, so that "Speed" is announced as a Layer and "Metric" as a unit.
		await expect(group.getByRole('group', { name: 'Layer' })).toHaveCount(1);
		await expect(group.getByRole('group', { name: 'Units' })).toHaveCount(1);
		await expect(page.getByRole('group', { name: 'Air speed' }), 'the legend is a group named by its title').toHaveCount(1);
		// A bar is a picture with a name; its tick labels are text a reader can reach, with their unit.
		const bar = legendOf(page).getByRole('img');
		await expect(bar).toHaveCount(1);
		await expect(legendOf(page).locator('.legend-ticks li').first()).toHaveText('0 mph');
		// The wheel is a picture too, and its compass letters and rings are text.
		await page.getByRole('radio', { name: 'Direction', exact: true }).check();
		await expect(legendOf(page).getByRole('img')).toHaveCount(1);
		await expect(legendOf(page).getByRole('img')).toHaveAccessibleName(/^Direction of flow, a colour wheel with north at the top\./);
		await expect(legendOf(page).getByText('north', { exact: true })).toHaveCount(1);
	});
});

test.describe('the units the page starts in', () => {
	for (const [locale, units] of [
		['en-US', 'Imperial'],
		['en-GB', 'Metric'],
		['de-DE', 'Metric']
	] as [string, string][]) {
		test.describe(locale, () => {
			test.use({ locale });
			test(`a browser in ${locale} starts in ${units.toLowerCase()} units, and the legend and the slice height read in them`, async ({ page }) => {
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await openAirflow(page);
				await expect(page.getByRole('radio', { name: units })).toBeChecked();
				const unit = units === 'Imperial' ? 'mph' : 'm/s';
				await expect(legendOf(page).locator('.legend-unit')).toHaveText(unit);
				await expect(valueOf(page, 'airflow-slice-height')).toHaveText(units === 'Imperial' ? /^3\sft\s7\sin$/ : /^1\.10\sm$/);
			});
		});
	}
});
