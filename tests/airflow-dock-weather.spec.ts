import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { dockGroup, focusRing, live, openAirflow } from './dock';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { openingsByRoom } from '../src/lib/experiments/airflow/homes/rooms';
import { linkCatalog, setupFromHash } from '../src/lib/experiments/airflow/link';
import { SCENARIOS } from '../src/lib/experiments/airflow/scenarios';
import type { Setup } from '../src/lib/experiments/airflow/state';
import { UNIT_SPACE } from '../src/lib/experiments/airflow/units';
import { openingLabel } from '../src/lib/experiments/airflow/ui/openings';

/**
 * Time and the world outside the Home, driven the way a visitor does: the transport bar (Pause, the speeds and the simulated time),
 * the Weather group (the wind, the temperatures and the outdoor PM2.5), and the Openings and furniture group (every door and
 * window under its Room, and the furniture). What each control changes is read back through the Share link, which is the setup as
 * the page holds it, and the words a screen reader is told through the page's polite live region.
 *
 * A page that prefers reduced motion starts paused and needs nothing from the processor, so most tests ask for it. The ones that
 * need the simulation to run take WebGPU away, so every browser runs the same solver, on the worker.
 */
const catalog = linkCatalog(plans, DEVICE_MODELS);
const n = (text: string) => text.replaceAll('_', UNIT_SPACE);

// Each test loads the page and uses many controls, and the three browsers run side by side on a busy machine: more than the default half minute.
test.describe.configure({ timeout: 90_000 });

/** The setup in the link the Copy link button just wrote. */
async function copiedLink(page: Page, writes: () => Promise<string[]>) {
	const before = (await writes()).length;
	await page.getByRole('button', { name: /^(Copy link|Link copied)$/ }).click();
	await expect.poll(async () => (await writes()).length, { message: 'the link was copied' }).toBeGreaterThan(before);
	const url = new URL((await writes()).at(-1)!);
	const setup = setupFromHash(url.hash, catalog);
	expect(setup, 'the link decodes').not.toBeNull();
	return { url, setup: setup as Setup };
}

const slider = (scope: Page | Locator, name: string) => scope.getByRole('slider', { name, exact: true });

/** Moves a slider the way a visitor's pointer or keys do: the page hears an `input` and then a `change`. */
async function setSlider(page: Page, name: string, value: number | string) {
	const control = slider(page, name);
	await control.scrollIntoViewIfNeeded();
	await control.fill(String(value));
}

/** The big number beside a slider's label. */
const shown = (page: Page, id: string) => page.locator('.field', { has: page.locator(`#${id}`) }).locator('.field-value');

/** Every slider of the two groups, with what it holds, what it says and what it shows; and the furniture. Whatever the page shows of the setup these two groups carry. */
async function readControls(page: Page) {
	return page.evaluate(() => {
		const inputs = [...document.querySelectorAll<HTMLInputElement>('#dock-weather input[type="range"], #dock-openings input[type="range"]')];
		return {
			sliders: Object.fromEntries(
				inputs.map((el) => [el.id, { value: el.value, text: el.getAttribute('aria-valuetext'), shown: el.closest('.field')?.querySelector('.field-value')?.textContent ?? '' }])
			),
			furniture: document.querySelector<HTMLInputElement>('#dock-openings .switch input')!.checked,
			weather: document.querySelector('#dock-weather .dock-group-hint')?.textContent ?? '',
			openings: document.querySelector('#dock-openings .dock-group-hint')?.textContent ?? ''
		};
	});
}

/** The simulated time on the clock, in seconds. */
const clockSeconds = async (page: Page) => (await page.locator('.transport .clock .field-value').innerText()).split(':').map(Number).reduce((total, part) => total * 60 + part, 0);

/**
 * Records what the polite live region is made to say from now on, so that "once" can be tested. Copying a link says "Link copied.",
 * which a test that copies the link to read the setup has no interest in, so it is left out.
 */
async function watchAnnouncements(page: Page) {
	await page.evaluate(() => {
		const region = document.querySelector('article.airflow p[aria-live="polite"]')!;
		const said: string[] = [];
		Object.defineProperty(window, '__said', { value: said, configurable: true });
		new MutationObserver(() => said.push(region.textContent ?? '')).observe(region, { childList: true, characterData: true, subtree: true });
	});
	return async () => (await page.evaluate(() => [...((window as unknown as { __said: string[] }).__said ?? [])])).filter((text) => text.trim() !== 'Link copied.');
}

/** Takes WebGPU away, so the page runs the simulation on the worker in every browser, as the processor-only visitor sees it. */
const withoutWebGpu = (page: Page) => page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));

/** Workers the page starts, one for each world that is built on the worker: a restart of the air shows as one more. */
function countWorkers(page: Page) {
	const urls: string[] = [];
	page.on('worker', (worker) => urls.push(worker.url()));
	return urls;
}

/** The share of a picture's pixels that changed between two, as in the page's own spec. */
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

/** The Stage's picture once it has stopped changing by itself, so that a change after it is the visitor's. */
async function settledStage(page: Page) {
	const stage = page.getByRole('application', { name: /^The air in the/ });
	let previous = await stage.screenshot();
	for (let attempt = 0; attempt < 20; attempt++) {
		await page.waitForTimeout(400);
		const next = await stage.screenshot();
		if ((await changedShare(page, previous, next)) < 0.00001) return next;
		previous = next;
	}
	throw new Error('The Stage never settled.');
}

/** What the focused element is called: the label of a form control, or its text. */
const focusedLabel = (page: Page) =>
	page.evaluate(() => {
		const active = document.activeElement as HTMLInputElement | null;
		return (active?.labels?.[0]?.textContent ?? active?.textContent ?? '').trim();
	});

test.describe('the transport bar', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('is the first thing on the Dock, outside every group, and names its controls', async ({ page }) => {
		await openAirflow(page);
		const bar = page.getByRole('group', { name: 'Time', exact: true });
		await expect(bar).toBeVisible();
		expect(await page.evaluate(() => document.querySelector('.airflow-dock')!.firstElementChild!.classList.contains('transport-frame')), 'first in the Dock').toBe(true);
		await expect(page.locator('details .transport'), 'not inside a group that can be closed').toHaveCount(0);
		await expect(bar.getByRole('button')).toHaveCount(1);
		// A page that prefers reduced motion starts paused, and the button says what it does next.
		await expect(bar.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
		const speed = bar.getByRole('group', { name: 'Speed', exact: true });
		await expect(speed.getByRole('radio')).toHaveCount(3);
		for (const label of ['1×', '5×', '20×']) await expect(speed.getByRole('radio', { name: label, exact: true })).toBeVisible();
		// The Scenario the page starts with runs at five times real time.
		await expect(speed.getByRole('radio', { name: '5×', exact: true })).toBeChecked();
		const clock = page.locator('.transport .clock');
		await expect(clock.getByText('Simulated time')).toBeVisible();
		await expect(clock.locator('.field-value')).toHaveText('0:00');
		// The clock is read where it stands and is not announced every second: it is not a live region, and nothing inside it is.
		expect(await clock.evaluate((el) => el.closest('[aria-live], [role="status"], [role="timer"], output') === null && el.querySelector('[aria-live], [role="status"], [role="timer"], output') === null)).toBe(true);
	});

	test('Resume and Pause: the button is named for what it does, one state is announced once, and the status line follows', async ({ page }) => {
		await openAirflow(page);
		const said = await watchAnnouncements(page);
		const status = page.locator('.sim-status');
		await expect(status).toHaveAttribute('data-status', 'paused', { timeout: 30_000 });
		await page.getByRole('button', { name: 'Resume', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Resume', exact: true }), 'one name at a time').toHaveCount(0);
		await expect(live(page)).toHaveText('Running.');
		await expect(status).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
		await expect(live(page)).toHaveText('Paused.');
		await expect(status).toHaveAttribute('data-status', 'paused');
		await page.waitForTimeout(1000);
		expect(await said(), 'each press said once').toEqual(['Running.', 'Paused.']);
		// The state is in the name, so no second state (pressed or not) is announced beside it.
		await expect(page.getByRole('button', { name: 'Resume', exact: true })).not.toHaveAttribute('aria-pressed', /.*/);
	});

	test('the Resume and Pause button keeps its width, so the speeds beside it never move', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		const button = page.locator('.transport button');
		const speeds = page.locator('.transport .segmented');
		const paused = [(await button.boundingBox())!, (await speeds.boundingBox())!];
		await button.click();
		await expect(button).toHaveText('Pause');
		const running = [(await button.boundingBox())!, (await speeds.boundingBox())!];
		expect(running[0].width, 'the button').toBe(paused[0].width);
		expect(running[1].x, 'the speeds').toBe(paused[1].x);
		expect(running[1].width, 'the speeds').toBe(paused[1].width);
	});

	test('the three speeds are one group of radio buttons that the arrow keys move along, and each says what it did', async ({ page, browserName }) => {
		await openAirflow(page);
		const speed = page.getByRole('group', { name: 'Speed', exact: true });
		for (const [label, said] of [
			['20×', '20 times real time.'],
			['1×', 'Real time.'],
			['5×', '5 times real time.']
		]) {
			const radio = speed.getByRole('radio', { name: label, exact: true });
			await radio.check();
			await expect(radio).toBeChecked();
			await expect(live(page)).toHaveText(said);
			for (const other of ['1×', '5×', '20×'].filter((l) => l !== label)) await expect(speed.getByRole('radio', { name: other, exact: true })).not.toBeChecked();
		}
		// By keyboard: a Tab from the Pause button lands on the speed that is chosen, and the arrow keys choose the next and the choice is announced, as for every radio group.
		await page.locator('.transport button').focus();
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
		await expect(speed.getByRole('radio', { name: '5×', exact: true })).toBeFocused();
		expect(await focusRing(page), 'the chosen speed shows where it is').toBe(true);
		await page.keyboard.press('ArrowRight');
		await expect(speed.getByRole('radio', { name: '20×', exact: true })).toBeChecked();
		await expect(live(page)).toHaveText('20 times real time.');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(speed.getByRole('radio', { name: '1×', exact: true })).toBeChecked();
		await expect(live(page)).toHaveText('Real time.');
	});

	test('a Scenario sets the speed the bar shows', async ({ page }) => {
		await openAirflow(page);
		await page.getByRole('radio', { name: '1×', exact: true }).check();
		await page.getByRole('button', { name: SCENARIOS[1].name, exact: true }).click();
		await expect(page.getByRole('radio', { name: '5×', exact: true })).toBeChecked();
	});

	test.describe('while the simulation runs', () => {
		test.beforeEach(async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await withoutWebGpu(page);
		});

		test('the clock counts simulated time, stops while the simulation is paused and carries on when it is resumed', async ({ page }) => {
			test.setTimeout(120_000);
			await openAirflow(page);
			await page.getByRole('radio', { name: '1×', exact: true }).check();
			const status = page.locator('.sim-status');
			await expect(status).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
			await expect.poll(() => clockSeconds(page), { message: 'the clock counts', timeout: 60_000 }).toBeGreaterThanOrEqual(2);
			await page.getByRole('button', { name: 'Pause', exact: true }).click();
			await expect(status).toHaveAttribute('data-status', 'paused');
			await expect(live(page)).toHaveText('Paused.');
			// Steps that were already on their way finish, and then nothing moves.
			await page.waitForTimeout(1500);
			const frozen = await clockSeconds(page);
			await page.waitForTimeout(2500);
			expect(await clockSeconds(page), 'the clock does not move while paused').toBe(frozen);
			await page.getByRole('button', { name: 'Resume', exact: true }).click();
			await expect(status).toHaveAttribute('data-status', 'running');
			await expect(live(page)).toHaveText('Running.');
			await expect.poll(() => clockSeconds(page), { message: 'the clock carries on', timeout: 60_000 }).toBeGreaterThan(frozen);
		});

		test('at 20× the processor cannot keep up, and the clock says how fast it does run in the words the status line uses', async ({ page }) => {
			test.setTimeout(120_000);
			await openAirflow(page);
			await page.getByRole('radio', { name: '20×', exact: true }).check();
			await expect(live(page)).toHaveText('20 times real time.');
			await expect(page.locator('.sim-status')).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
			// Both are drawn from the same number in the same pass, so one read of the page sees them agree.
			const same = () =>
				page.evaluate(() => {
					const bar = document.querySelector('.transport [data-behind]')?.textContent?.trim() ?? '';
					const line = document.querySelector('.sim-status [data-behind]')?.textContent?.trim() ?? '';
					return bar !== '' && bar === line ? bar : '';
				});
			await expect.poll(same, { message: 'the bar and the status line both say it', timeout: 60_000 }).toMatch(/^Running at (under )?\d+(\.\d)?× real time\.$/);
			// It is a sentence beside the clock, and not a number the screen reader is told every few seconds.
			expect(await page.locator('.transport [data-behind]').evaluate((el) => el.closest('[aria-live], [role="status"]') === null)).toBe(true);
			await expect(page.locator('.transport .clock')).toContainText('Simulated time');
			// And it does run, as fast as it can: the first steps take a moment to come back.
			await expect.poll(() => clockSeconds(page), { message: 'the time runs', timeout: 60_000 }).toBeGreaterThan(0);
		});
	});
});

test.describe('the Weather group, in metric units', () => {
	test.use({ locale: 'de-DE' });
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('is closed until it is opened, and says the weather in a few words', async ({ page }) => {
		await openAirflow(page);
		const group = page.locator('#dock-weather');
		await expect(group).not.toHaveAttribute('open', '');
		// The Scenario the page starts with: a west wind of 4 m/s and 18 °C outside.
		await expect(group.locator('.dock-group-hint')).toHaveText(n('4.0_m/s from the west, 18_°C'));
		await dockGroup(page, 'Weather');
		for (const name of ['Wind from', 'Wind speed', 'Outdoor temperature', 'Indoor starting temperature', 'Outdoor PM2.5']) await expect(slider(group, name)).toBeVisible();
		await expect(group.getByRole('slider')).toHaveCount(5);
	});

	test('each control changes its own part of the weather, shows it in metric units, and says it once', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		const group = await dockGroup(page, 'Weather');
		const said = await watchAnnouncements(page);
		const start = (await copiedLink(page, writes)).setup.conditions;
		expect(start).toEqual({ windFrom: 270, windSpeed: 4, outdoorTemp: 18, indoorTemp: 21, outdoorPm25: 0 });

		const cases: { name: string; id: string; value: number; key: keyof typeof start; shown: string; spoken: string; announced: string; described: string }[] = [
			{
				name: 'Wind from',
				id: 'airflow-wind-from',
				value: 225,
				key: 'windFrom',
				shown: 'SW 225°',
				spoken: 'southwest, 225 degrees',
				announced: 'Wind from the southwest, 225 degrees.',
				described: 'The wind blows from the southwest, toward the northeast.'
			},
			{
				name: 'Wind speed',
				id: 'airflow-wind-speed',
				value: 6.5,
				key: 'windSpeed',
				shown: n('6.5_m/s'),
				spoken: '6.5 metres per second',
				announced: 'Wind speed 6.5 metres per second.',
				described: 'As a weather report gives it, in the open and well above the ground. About half of it reaches the Home.'
			},
			{
				name: 'Outdoor temperature',
				id: 'airflow-outdoor-temp',
				value: -3,
				key: 'outdoorTemp',
				shown: n('−3_°C'),
				spoken: 'minus 3 degrees Celsius',
				announced: 'Outdoor temperature minus 3 degrees Celsius.',
				described: 'The bigger the difference from the indoor temperature, the harder warm air rises out of high Openings and cold air sinks in through low ones.'
			},
			{
				name: 'Indoor starting temperature',
				id: 'airflow-indoor-temp',
				value: 24.5,
				key: 'indoorTemp',
				shown: n('24.5_°C'),
				spoken: '24.5 degrees Celsius',
				announced: 'Indoor starting temperature 24.5 degrees Celsius. The air starts over at that temperature.',
				described: 'The temperature the air indoors starts at. Changing it starts the air over at that temperature.'
			},
			{
				name: 'Outdoor PM2.5',
				id: 'airflow-outdoor-pm25',
				value: 150,
				key: 'outdoorPm25',
				shown: n('150_µg/m³'),
				spoken: '150 micrograms per cubic metre',
				announced: 'Outdoor PM2.5 150 micrograms per cubic metre.',
				described: 'Fine particles in the outdoor air, which come in through open Openings. Zero is clean air.'
			}
		];
		let expected = { ...start };
		for (const c of cases) {
			const before = (await said()).length;
			await setSlider(page, c.name, c.value);
			await expect(shown(page, c.id)).toHaveText(c.shown);
			await expect(slider(group, c.name)).toHaveAttribute('aria-valuetext', c.spoken);
			// The sentence under the slider is its description, read after its name and value.
			await expect(slider(group, c.name)).toHaveAccessibleDescription(c.described);
			await expect(live(page)).toHaveText(c.announced);
			// Polite, and once: nothing else was said for this move.
			await page.waitForTimeout(800);
			expect((await said()).slice(before), c.name).toEqual([c.announced]);
			// The air outside or inside changed in the setup, this part and no other.
			expected = { ...expected, [c.key]: c.value };
			expect((await copiedLink(page, writes)).setup.conditions, c.name).toEqual(expected);
		}
		await expect(group.locator('.dock-group-hint')).toHaveText(n('6.5_m/s from the southwest, −3_°C, 150_µg/m³ PM2.5'));
	});

	test('the direction of the wind says it blows from that compass point and where to, and that it means nothing in calm air', async ({ page }) => {
		await openAirflow(page);
		const group = await dockGroup(page, 'Weather');
		const note = group.locator('.weather-field', { has: page.locator('#airflow-wind-from') }).locator('.dock-notice');
		await expect(note).toHaveText('The wind blows from the west, toward the east.');
		await setSlider(page, 'Wind from', 290);
		await expect(shown(page, 'airflow-wind-from')).toHaveText('WNW 290°');
		await expect(note).toHaveText('The wind blows from the west-northwest, toward the east-southeast.');
		await setSlider(page, 'Wind from', 0);
		await expect(shown(page, 'airflow-wind-from')).toHaveText('N 0°');
		await expect(group.locator('.dock-group-hint')).toHaveText(n('4.0_m/s from the north, 18_°C'));
		// With no wind the direction does nothing, and the group says so rather than leaving a visitor to wonder.
		await setSlider(page, 'Wind speed', 0);
		await expect(group.locator('.dock-group-hint')).toHaveText(n('Calm, 18_°C'));
		await expect(note).toHaveText('The wind is calm, so its direction changes nothing yet.');
		await setSlider(page, 'Wind from', 180);
		await expect(live(page)).toHaveText('Wind from the south, 180 degrees. The wind is calm, so this changes nothing yet.');
	});

	test('the sliders hold their ends: the most and the least of each is allowed by the setup', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		const ends = [
			['Wind speed', 0, 15, 'windSpeed'],
			['Outdoor temperature', -30, 45, 'outdoorTemp'],
			['Indoor starting temperature', 10, 32, 'indoorTemp'],
			['Outdoor PM2.5', 0, 500, 'outdoorPm25']
		] as const;
		for (const [name, low, high, key] of ends) {
			await setSlider(page, name, low);
			expect((await copiedLink(page, writes)).setup.conditions[key], `${name} at its least`).toBe(low);
			await setSlider(page, name, high);
			expect((await copiedLink(page, writes)).setup.conditions[key], `${name} at its most`).toBe(high);
		}
		await setSlider(page, 'Wind from', 360);
		// 360 degrees is north, and a link says north as 0.
		expect((await copiedLink(page, writes)).setup.conditions.windFrom).toBe(0);
		await expect(shown(page, 'airflow-wind-from')).toHaveText('N 0°');
	});

	test('a new starting temperature starts the air over, once, when the slider is let go and not at every step of a drag', async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1280, height: 900 });
		await withoutWebGpu(page);
		const workers = countWorkers(page);
		await openAirflow(page);
		await expect.poll(() => workers.length, { message: 'the first world', timeout: 30_000 }).toBe(1);
		const group = await dockGroup(page, 'Weather');
		const indoor = slider(group, 'Indoor starting temperature');
		await indoor.scrollIntoViewIfNeeded();
		await expect(shown(page, 'airflow-indoor-temp')).toHaveText(n('21.0_°C'));

		// One press of a key is one change, and the air starts over.
		await indoor.focus();
		await page.keyboard.press('ArrowRight');
		await expect(shown(page, 'airflow-indoor-temp')).toHaveText(n('21.5_°C'));
		await expect.poll(() => workers.length, { message: 'a world for the new temperature' }).toBe(2);

		// A drag across the slider, with the pointer held, shows the temperature at every step and starts nothing until it is let go.
		const box = (await indoor.boundingBox())!;
		const y = box.y + box.height / 2;
		await page.mouse.move(box.x + box.width * 0.3, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.9, y, { steps: 15 });
		await expect(shown(page, 'airflow-indoor-temp')).not.toHaveText(n('21.5_°C'));
		const held = await shown(page, 'airflow-indoor-temp').innerText();
		await page.waitForTimeout(1500);
		expect(workers.length, 'nothing starts over while the slider is held').toBe(2);
		await page.mouse.up();
		await expect.poll(() => workers.length, { message: 'the air starts over when it is let go' }).toBe(3);
		await page.waitForTimeout(1500);
		expect(workers.length, 'once').toBe(3);
		await expect(shown(page, 'airflow-indoor-temp')).toHaveText(held);
	});

	test('a new starting temperature sets the clock back to the start of the new air', async ({ page }) => {
		test.setTimeout(120_000);
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await withoutWebGpu(page);
		await openAirflow(page);
		await page.getByRole('radio', { name: '1×', exact: true }).check();
		await expect.poll(() => clockSeconds(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(4);
		const before = await clockSeconds(page);
		await dockGroup(page, 'Weather');
		await setSlider(page, 'Indoor starting temperature', 25);
		await expect.poll(() => clockSeconds(page), { message: 'the new air starts at zero', timeout: 30_000 }).toBeLessThan(before);
	});
});

test.describe('the Weather group, in imperial units', () => {
	test.use({ locale: 'en-US' });
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('is labelled in miles per hour and degrees Fahrenheit, and the setup it changes stays in metric', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		const group = await dockGroup(page, 'Weather');
		await expect(group.locator('.dock-group-hint')).toHaveText(n('9_mph from the west, 64_°F'));
		await expect(shown(page, 'airflow-wind-speed')).toHaveText(n('9_mph'));
		await expect(shown(page, 'airflow-outdoor-temp')).toHaveText(n('64_°F'));
		await expect(shown(page, 'airflow-indoor-temp')).toHaveText(n('70_°F'));
		await expect(shown(page, 'airflow-outdoor-pm25')).toHaveText(n('0_µg/m³'));

		await setSlider(page, 'Wind speed', 15);
		await expect(shown(page, 'airflow-wind-speed')).toHaveText(n('15_mph'));
		await expect(slider(group, 'Wind speed')).toHaveAttribute('aria-valuetext', '15 miles per hour');
		await expect(live(page)).toHaveText('Wind speed 15 miles per hour.');
		await setSlider(page, 'Outdoor temperature', 50);
		await expect(live(page)).toHaveText('Outdoor temperature 50 degrees Fahrenheit.');
		await setSlider(page, 'Indoor starting temperature', 72);
		await expect(live(page)).toHaveText('Indoor starting temperature 72 degrees Fahrenheit. The air starts over at that temperature.');
		await setSlider(page, 'Outdoor PM2.5', 35);
		await expect(shown(page, 'airflow-outdoor-pm25')).toHaveText(n('35_µg/m³'));

		// The setup holds SI, to the link's precision: 15 mph is 6.7 m/s, 50 °F is 10 °C, and 72 °F is 22 °C to the half degree.
		const { conditions } = (await copiedLink(page, writes)).setup;
		expect(conditions).toEqual({ windFrom: 270, windSpeed: 6.7, outdoorTemp: 10, indoorTemp: 22, outdoorPm25: 35 });
		await expect(group.locator('.dock-group-hint')).toHaveText(n('15_mph from the west, 50_°F, 35_µg/m³ PM2.5'));
	});
});

test.describe('the Openings and furniture group', () => {
	test.use({ locale: 'de-DE' });
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('is closed until it is opened, and says how many Openings are open and whether the furniture is in', async ({ page }) => {
		await openAirflow(page);
		const group = page.locator('#dock-openings');
		await expect(group).not.toHaveAttribute('open', '');
		// The default Scenario has six of the two-bedroom's eleven Openings open.
		await expect(group.locator('.dock-group-hint')).toHaveText('6 of 11 open, furniture on');
		await dockGroup(page, 'Openings and furniture');
		await setSlider(page, 'Kitchen window', 40);
		await expect(group.locator('.dock-group-hint')).toHaveText('7 of 11 open, furniture on');
		await setSlider(page, 'Kitchen window', 0);
		await expect(group.locator('.dock-group-hint')).toHaveText('6 of 11 open, furniture on');
	});

	for (const plan of plans) {
		test(`${plan.name}: every Opening has a slider, once, under its Room, in the order the plan gives them`, async ({ page }) => {
			await openAirflow(page);
			await page.getByRole('radio', { name: plan.name, exact: true }).check();
			const group = await dockGroup(page, 'Openings and furniture');
			const expected = openingsByRoom(plan).map((entry) => ({ room: entry.room.name, labels: entry.openings.map(openingLabel) }));
			await expect(group.getByRole('slider')).toHaveCount(plan.openings.length);
			const listed = () =>
				page.evaluate(() =>
					[...document.querySelectorAll('#dock-openings [role="group"][aria-labelledby]')].map((room) => ({
						room: document.getElementById(room.getAttribute('aria-labelledby')!)?.textContent?.trim() ?? '',
						labels: [...room.querySelectorAll<HTMLInputElement>('input[type="range"]')].map((input) => input.labels?.[0]?.textContent?.trim() ?? '')
					}))
				);
			await expect.poll(listed).toEqual(expected);
			// By role and name, as an assistive technology finds them: the Room is a named group and the Opening a named slider in it.
			for (const entry of openingsByRoom(plan))
				for (const opening of entry.openings) await expect(slider(group.getByRole('group', { name: entry.room.name, exact: true }), openingLabel(opening))).toHaveCount(1);
		});
	}

	test('shows each Opening’s travel, how much of its frame that opens and the most it opens, and moves the Opening with the slider', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		const group = await dockGroup(page, 'Openings and furniture');
		const said = await watchAnnouncements(page);
		const row = (name: string) => group.locator('.opening-row', { has: slider(page, name) });

		// A double-hung window opens at most half its frame: at 60% of its travel, 30% of it is open.
		await expect(shown(page, 'airflow-opening-living-window-1')).toHaveText('100%');
		await setSlider(page, 'Living room window 1', 60);
		await expect(shown(page, 'airflow-opening-living-window-1')).toHaveText('60%');
		await expect(row('Living room window 1').locator('.dock-notice')).toHaveText('60% of travel opens 30% of the frame. It opens at most 50% of its frame.');
		await expect(slider(group, 'Living room window 1')).toHaveAttribute('aria-valuetext', '60 percent of travel, 30 percent of the frame open');
		// The line under the slider is its description, so a screen reader reads the limit after the name and the value.
		await expect(slider(group, 'Living room window 1')).toHaveAccessibleDescription('60% of travel opens 30% of the frame. It opens at most 50% of its frame.');
		await expect(live(page)).toHaveText('Living room window 1, 60 percent of travel, 30 percent of the frame open. It opens at most 50 percent of its frame.');
		await page.waitForTimeout(800);
		expect(await said(), 'said once').toEqual(['Living room window 1, 60 percent of travel, 30 percent of the frame open. It opens at most 50 percent of its frame.']);

		// A casement passes 80% of its frame at the end of its travel; a door the whole of it, and shut says so.
		await setSlider(page, 'Kitchen window', 100);
		await expect(row('Kitchen window').locator('.dock-notice')).toHaveText('100% of travel opens 80% of the frame. It opens at most 80% of its frame.');
		await setSlider(page, 'Bedroom 1 door, to Hall', 25);
		await expect(row('Bedroom 1 door, to Hall').locator('.dock-notice')).toHaveText('25% of travel opens 25% of the frame. It opens its whole frame.');
		await setSlider(page, 'Bedroom 1 door, to Hall', 0);
		await expect(row('Bedroom 1 door, to Hall').locator('.dock-notice')).toHaveText('Shut. It opens its whole frame.');
		await expect(slider(group, 'Bedroom 1 door, to Hall')).toHaveAttribute('aria-valuetext', 'shut');

		// The setup has what was set, and only that: the link holds it to the percent.
		const { setup } = await copiedLink(page, writes);
		expect(setup.openings['living-window-1']).toBe(0.6);
		expect(setup.openings['kitchen-window']).toBe(1);
		expect(setup.openings['bedroom-1-door']).toBe(0);
		// An Opening nobody touched keeps the position the Scenario gave it.
		expect(setup.openings['bedroom-2-door']).toBe(1);
	});

	test('a key moves an Opening a percent at a time and is announced once, after the last press', async ({ page, browserName }) => {
		await openAirflow(page);
		const group = await dockGroup(page, 'Openings and furniture');
		// Reached the way a keyboard does: from the Furniture switch, a Tab to the first Opening of the first Room.
		await group.getByRole('checkbox', { name: 'Furniture' }).focus();
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
		const control = slider(group, 'Living room window 1');
		await expect(control).toBeFocused();
		expect(await focusRing(page), 'a slider shows where it is').toBe(true);
		await expect(control).toHaveValue('100');
		const said = await watchAnnouncements(page);
		for (let press = 0; press < 3; press++) await page.keyboard.press('ArrowLeft');
		await expect(control).toHaveValue('97');
		await expect(shown(page, 'airflow-opening-living-window-1')).toHaveText('97%');
		await expect(live(page)).toHaveText('Living room window 1, 97 percent of travel, 49 percent of the frame open. It opens at most 50 percent of its frame.');
		await page.waitForTimeout(800);
		expect(await said(), 'three presses, one announcement').toHaveLength(1);
		await page.keyboard.press('Home');
		await expect(control).toHaveValue('0');
		await expect(live(page)).toHaveText('Living room window 1, shut. It opens at most 50 percent of its frame.');
		await page.keyboard.press('End');
		await expect(control).toHaveValue('100');
	});

	test('the Stage shows the Openings the sliders set: the home is drawn again when a door or window moves', async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		await dockGroup(page, 'Openings and furniture');
		const stage = page.getByRole('application', { name: /^The air in the/ });
		const before = await settledStage(page);
		expect(await changedShare(page, before, await stage.screenshot()), 'nothing moves by itself while the simulation is paused').toBeLessThan(0.0002);
		// Shut the six Openings the Scenario opens, and open three more.
		for (const name of ['Living room window 1', 'Living room window 2', 'Bedroom 1 door, to Hall', 'Bedroom 2 door, to Hall', 'Bedroom 1 window', 'Bedroom 2 window']) await setSlider(page, name, 0);
		for (const name of ['Kitchen window', 'Dining room window', 'Bathroom window']) await setSlider(page, name, 100);
		const after = await settledStage(page);
		expect(await changedShare(page, before, after), 'the windows and doors are drawn where the sliders put them').toBeGreaterThan(0.001);
	});

	test('the Furniture switch shows or hides the furniture, builds the air again, leaves the Scenario behind, and says so once', async ({ page, browserName }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: 1280, height: 900 });
		await withoutWebGpu(page);
		const writes = await stubClipboard(page, 'succeed');
		const workers = countWorkers(page);
		await openAirflow(page);
		await expect.poll(() => workers.length, { timeout: 30_000 }).toBe(1);
		const group = await dockGroup(page, 'Openings and furniture');
		const furniture = group.getByRole('checkbox', { name: 'Furniture' });
		await expect(furniture).toBeChecked();
		await expect(furniture).toHaveAccessibleDescription('Furniture blocks the air and slows it, and the Stage shows it. Changing it starts the air over.');
		await expect(page.getByRole('button', { name: SCENARIOS[0].name, exact: true })).toHaveAttribute('aria-pressed', 'true');
		expect((await copiedLink(page, writes)).setup.furniture).toBe(true);
		const withFurniture = await settledStage(page);
		const said = await watchAnnouncements(page);

		await furniture.uncheck();
		await expect(furniture).not.toBeChecked();
		await expect(live(page)).toHaveText('Furniture off. The air starts over.');
		await expect(group.locator('.dock-group-hint')).toHaveText('6 of 11 open, furniture off');
		expect((await copiedLink(page, writes)).setup.furniture).toBe(false);
		// The solver sees other obstacles, so it is a new world, on a new worker.
		await expect.poll(() => workers.length, { message: 'a new world without the furniture' }).toBe(2);
		await expect(page.getByRole('button', { name: SCENARIOS[0].name, exact: true }), 'a setup of your own is not a Scenario').toHaveAttribute('aria-pressed', 'false');
		expect(await changedShare(page, withFurniture, await settledStage(page)), 'and the Stage no longer draws it').toBeGreaterThan(0.01);

		// By keyboard, from the group's title: a Tab to the switch and a Space.
		await page.locator('#dock-openings > summary').focus();
		await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
		await expect(furniture).toBeFocused();
		expect(await focusRing(page), 'the switch shows where it is').toBe(true);
		await page.keyboard.press('Space');
		await expect(furniture).toBeChecked();
		await expect(live(page)).toHaveText('Furniture on. The air starts over.');
		expect((await copiedLink(page, writes)).setup.furniture).toBe(true);
		await expect.poll(() => workers.length).toBe(3);
		await page.waitForTimeout(800);
		expect(await said(), 'once for each change').toEqual(['Furniture off. The air starts over.', 'Furniture on. The air starts over.']);
		expect(await changedShare(page, withFurniture, await settledStage(page)), 'the same furniture comes back').toBeLessThan(0.002);
	});

	test('changing the Home keeps the weather and the furniture, and lists the new Home’s Openings, all shut', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		const group = await dockGroup(page, 'Openings and furniture');
		await setSlider(page, 'Wind speed', 9);
		await group.getByRole('checkbox', { name: 'Furniture' }).uncheck();
		await page.getByRole('radio', { name: 'House', exact: true }).check();
		await expect(group.getByRole('slider')).toHaveCount(20);
		await expect(slider(group, 'Clerestory window')).toHaveValue('0');
		await expect(group.locator('.dock-group-hint')).toHaveText('0 of 20 open, furniture off');
		await expect(shown(page, 'airflow-wind-speed')).toHaveText(n('9.0_m/s'));
		const { setup } = await copiedLink(page, writes);
		expect(setup.plan).toBe('house');
		expect(setup.furniture).toBe(false);
		expect(setup.conditions.windSpeed).toBe(9);
		expect(setup.openings).toEqual({});
	});

	test('a Scenario sets every control the group shows, and Reset puts them back', async ({ page }) => {
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		const group = await dockGroup(page, 'Openings and furniture');
		await page.getByRole('button', { name: 'Stack effect', exact: true }).click();
		// The house, in still cold air, with the two low windows and the clerestory open.
		await expect(slider(group, 'Clerestory window')).toHaveValue('100');
		await expect(slider(group, 'Living room north window 1')).toHaveValue('100');
		await expect(slider(group, 'Patio door')).toHaveValue('0');
		await expect(shown(page, 'airflow-wind-speed')).toHaveText(n('0.0_m/s'));
		await expect(shown(page, 'airflow-outdoor-temp')).toHaveText(n('−5_°C'));
		await expect(page.locator('#dock-weather .dock-group-hint')).toHaveText(n('Calm, −5_°C'));
		await expect(group.locator('.dock-group-hint')).toHaveText('3 of 20 open, furniture on');
		// Moving a control leaves the Scenario, and Reset brings it back as it was.
		await setSlider(page, 'Clerestory window', 20);
		await setSlider(page, 'Wind speed', 7);
		await expect(page.getByRole('button', { name: 'Stack effect', exact: true })).toHaveAttribute('aria-pressed', 'false');
		await page.getByRole('button', { name: 'Reset', exact: true }).click();
		await expect(slider(group, 'Clerestory window')).toHaveValue('100');
		await expect(shown(page, 'airflow-wind-speed')).toHaveText(n('0.0_m/s'));
		await expect(page.getByRole('button', { name: 'Stack effect', exact: true })).toHaveAttribute('aria-pressed', 'true');
	});

	test('a window fan in a window holds it, and the row says so', async ({ page }) => {
		await openAirflow(page);
		const group = await dockGroup(page, 'Openings and furniture');
		await page.getByRole('button', { name: 'A fan in the window', exact: true }).click();
		// The Scenario puts the window fan in the first window of the two-bedroom that can hold one.
		const held = group.locator('.opening-row', { hasText: 'A window fan is in this window' });
		await expect(held).toHaveCount(1);
		await expect(held.locator('.dock-notice').last()).toContainText('the fan sets how far it is open');
		// A screen reader reads it with the slider: the limit, and then that the fan decides.
		await expect(held.getByRole('slider')).toHaveAccessibleDescription(/It opens at most 50% of its frame\. A window fan is in this window, so the fan sets how far it is open\./);
		// And the other rows say nothing of a fan.
		await expect(group.getByText('A window fan is in this window')).toHaveCount(1);
		// Take the fan's Scenario away and the note goes with it.
		await page.getByRole('button', { name: 'Cross-ventilation', exact: true }).click();
		await expect(group.getByText('A window fan is in this window')).toHaveCount(0);
	});

	test('the Openings are reached by keyboard in the order of the list: down one Room, then the next', async ({ page, browserName }) => {
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		await page.getByRole('radio', { name: 'House', exact: true }).check();
		const group = await dockGroup(page, 'Openings and furniture');
		const order = openingsByRoom(plans.find((p) => p.id === 'house')!).flatMap((entry) => entry.openings.map(openingLabel));
		expect(order).toHaveLength(20);
		await group.getByRole('checkbox', { name: 'Furniture' }).focus();
		for (const label of order) {
			await page.keyboard.press(next);
			expect(await focusedLabel(page), 'the next stop').toBe(label);
			expect(await focusRing(page), `${label} shows where it is`).toBe(true);
		}
	});

	for (const width of [1000, 1440]) {
		test(`${width}px wide: the list reads down each column and then along, which is the order the keyboard takes`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			await page.getByRole('radio', { name: 'House', exact: true }).check();
			await dockGroup(page, 'Openings and furniture');
			const boxes = await page.evaluate(() => [...document.querySelectorAll('#dock-openings input[type="range"]')].map((el) => el.getBoundingClientRect()).map(({ left, top }) => ({ left, top })));
			expect(boxes).toHaveLength(20);
			const columns = new Set(boxes.map((box) => Math.round(box.left / 20)));
			// Under the Stage the list has columns, and in the Dock's column beside it, one.
			if (width >= 1160) expect(columns.size, 'one column in the Dock beside the Stage').toBe(1);
			else expect(columns.size, 'columns under the Stage').toBeGreaterThanOrEqual(2);
			const wrong = boxes.flatMap((box, i) => {
				const previous = boxes[i - 1];
				if (!previous) return [];
				const further = box.left > previous.left + 50;
				const lower = Math.abs(box.left - previous.left) <= 50 && box.top >= previous.top;
				return further || lower ? [] : [i];
			});
			expect(wrong, 'a slider that comes after one in the page but is before it on the screen').toEqual([]);
		});
	}
});

test.describe('a Share link carries what these groups set', () => {
	test.use({ locale: 'de-DE' });
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('the furniture, the Openings, the wind, both temperatures and the outdoor PM2.5 come back from the link, into the same controls', async ({ page }) => {
		test.setTimeout(120_000);
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		const openings = await dockGroup(page, 'Openings and furniture');
		await setSlider(page, 'Wind from', 135);
		await setSlider(page, 'Wind speed', 7);
		await setSlider(page, 'Outdoor temperature', -8);
		await setSlider(page, 'Indoor starting temperature', 23.5);
		await setSlider(page, 'Outdoor PM2.5', 80);
		await setSlider(page, 'Living room window 1', 35);
		await setSlider(page, 'Bedroom 1 door, to Hall', 0);
		await setSlider(page, 'Kitchen window', 75);
		await openings.getByRole('checkbox', { name: 'Furniture' }).uncheck();
		const set = await readControls(page);

		const { url, setup } = await copiedLink(page, writes);
		expect(setup.conditions).toEqual({ windFrom: 135, windSpeed: 7, outdoorTemp: -8, indoorTemp: 23.5, outdoorPm25: 80 });
		expect(setup.furniture).toBe(false);
		expect(setup.openings).toMatchObject({ 'living-window-1': 0.35, 'bedroom-1-door': 0, 'kitchen-window': 0.75 });

		// Opened afresh, as someone the link was sent to opens it.
		await page.goto('about:blank');
		await openAirflow(page, `${url.pathname}${url.hash}`);
		await dockGroup(page, 'Weather');
		await dockGroup(page, 'Openings and furniture');
		await expect.poll(() => readControls(page), { message: 'a fresh page shows the same controls' }).toEqual(set);

		// And pasted into the open page, after the controls have been moved somewhere else.
		await page.getByRole('radio', { name: 'Studio', exact: true }).check();
		await page.getByRole('radio', { name: 'Two-bedroom', exact: true }).check();
		await setSlider(page, 'Wind speed', 1);
		await expect.poll(async () => (await readControls(page)).sliders['airflow-wind-speed'].value).toBe('1');
		await page.evaluate((hash) => (location.hash = hash), `${url.hash}&again`);
		await expect.poll(() => readControls(page), { message: 'a link pasted into the open page shows the same controls' }).toEqual(set);
	});

	test('a link made in metric units shows in imperial units to a visitor whose locale reads them', async ({ page, browser, baseURL }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		await setSlider(page, 'Wind speed', 5.5);
		await setSlider(page, 'Outdoor temperature', 12);
		const { url, setup } = await copiedLink(page, writes);
		expect(setup.conditions).toMatchObject({ windSpeed: 5.5, outdoorTemp: 12 });
		// The visitor the link goes to reads miles per hour and degrees Fahrenheit.
		const american = await browser.newContext({ locale: 'en-US', baseURL });
		const other = await american.newPage();
		await other.emulateMedia({ reducedMotion: 'reduce' });
		await openAirflow(other, `${url.pathname}${url.hash}`);
		await dockGroup(other, 'Weather');
		await expect(shown(other, 'airflow-wind-speed')).toHaveText(n('12_mph'));
		await expect(shown(other, 'airflow-outdoor-temp')).toHaveText(n('54_°F'));
		await american.close();
	});
});

test.describe('the controls of time and weather', () => {
	test.use({ locale: 'de-DE' });
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('have no WCAG 2.1 A/AA violations that axe can detect, with every group open, at desktop and phone widths', async ({ page }) => {
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			await page.getByRole('radio', { name: 'House', exact: true }).check();
			await dockGroup(page, 'Weather');
			await dockGroup(page, 'Openings and furniture');
			const { violations } = await new AxeBuilder({ page }).include('.airflow-dock').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
			expect(
				violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`),
				`${width}px wide`
			).toEqual([]);
		}
	});

	test('every control is at least 44 px tall and wide, stays inside the card and never scrolls the page sideways, from 320 to 1600 px', async ({ page }) => {
		test.setTimeout(180_000);
		for (const width of [320, 390, 700, 1000, 1159, 1160, 1440, 1600]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			await page.getByRole('radio', { name: 'House', exact: true }).check();
			await dockGroup(page, 'Weather');
			await dockGroup(page, 'Openings and furniture');
			const found = await page.evaluate(() => {
				const small: string[] = [];
				const card = document.querySelector('.airflow-drawer')!.getBoundingClientRect();
				const outside: string[] = [];
				const targets = '.transport button, .transport .segment span, #dock-weather input[type="range"], #dock-openings input[type="range"], #dock-openings .switch, .dock-group > summary';
				for (const el of document.querySelectorAll(targets)) {
					const box = el.getBoundingClientRect();
					if (box.width < 43.5 || box.height < 43.5) small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
				}
				for (const el of document.querySelectorAll('.transport *, #dock-weather *, #dock-openings *')) {
					const box = el.getBoundingClientRect();
					if (box.width > 0 && (box.left < card.left - 1 || box.right > card.right + 1)) outside.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
				}
				return { small, outside, sideways: document.documentElement.scrollWidth - innerWidth };
			});
			expect(found.small, `${width}px wide: targets under 44 px`).toEqual([]);
			expect(found.outside, `${width}px wide: sticking out of the card`).toEqual([]);
			expect(found.sideways, `${width}px wide: sideways scroll`).toBeLessThanOrEqual(0);
		}
	});

	test('every group opens and closes by keyboard, and its sliders are reached in order with a name and a visible ring', async ({ page, browserName }) => {
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		const previous = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		for (const title of ['Weather', 'Openings and furniture']) {
			const group = page.locator('.dock-group', { has: page.locator('summary', { hasText: title }) });
			const summary = group.locator('summary');
			await summary.scrollIntoViewIfNeeded();
			await summary.focus();
			expect(await focusRing(page), `${title} shows where it is`).toBe(true);
			await page.keyboard.press('Enter');
			await expect(group).toHaveAttribute('open', '');
			await page.keyboard.press('Space');
			await expect(group).not.toHaveAttribute('open', '');
			await page.keyboard.press('Enter');
			await expect(group).toHaveAttribute('open', '');
		}
		// The Weather group: Tab from its title goes down the five sliders in the order they are on the screen.
		await page.locator('#dock-weather summary').focus();
		const names = ['Wind from', 'Wind speed', 'Outdoor temperature', 'Indoor starting temperature', 'Outdoor PM2.5'];
		for (const name of names) {
			await page.keyboard.press(next);
			expect(await focusedLabel(page), 'the next stop').toBe(name);
			expect(await focusRing(page), `${name} shows where it is`).toBe(true);
		}
		await page.keyboard.press(previous);
		expect(await focusedLabel(page)).toBe('Indoor starting temperature');
		// An arrow key moves the slider it is on by one step and says so.
		await page.keyboard.press('ArrowRight');
		await expect(shown(page, 'airflow-indoor-temp')).toHaveText(n('21.5_°C'));
		await expect(live(page)).toHaveText('Indoor starting temperature 21.5 degrees Celsius. The air starts over at that temperature.');
	});

	test('do not raise an error while they are used, and a Home that changes under them is not a fault', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await openAirflow(page);
		await dockGroup(page, 'Weather');
		await dockGroup(page, 'Openings and furniture');
		for (const plan of [...plans].reverse()) {
			await page.getByRole('radio', { name: plan.name, exact: true }).check();
			await setSlider(page, 'Wind speed', 3);
			await page.getByRole('slider', { name: openingsByRoom(plan)[0].openings[0].opening.name }).first().fill('50');
			await page.getByRole('checkbox', { name: 'Furniture' }).click();
		}
		await page.getByRole('button', { name: 'Resume', exact: true }).click();
		await page.getByRole('radio', { name: '20×', exact: true }).check();
		await page.waitForTimeout(1500);
		expect(errors).toEqual([]);
	});
});
