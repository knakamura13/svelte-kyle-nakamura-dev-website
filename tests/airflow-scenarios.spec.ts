import { expect, test, type Page } from '@playwright/test';
import { planById } from '../src/lib/experiments/airflow/homes/plans';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { SCENARIOS } from '../src/lib/experiments/airflow/scenarios';
import { OPENING_END, openingFor } from '../src/lib/experiments/airflow/scene/camera/opening';
import { blankSetup } from '../src/lib/experiments/airflow/state';
import { PAGE, closePhysics, hud, inspect, notice, openPhysics, openRunning, pickScenario, readAt, readUntil, readings, view, type Readings } from './airflow-sim';

/**
 * Each Scenario, loaded from the picker, does what its notice says, read off the page: the Room averages in the Physics panel and the
 * simulated time (#61). The solver's own check of each claim, on the grid the page's processor runs, is tests/solver/scenario-presets.spec.ts;
 * this is the same claim through the running page, in every browser, on whichever backend it picked. Each check says its tolerance.
 *
 * The page is read in a metric locale, so the panel's numbers are m/s and °C.
 */
test.use({ locale: 'en-GB', viewport: { width: 1440, height: 900 } });

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

/** Opens the page, picks the Scenario, checks the picker shows its notice word for word, and opens the Physics panel. */
async function load(page: Page, id: string, path = PAGE) {
	const { name, notice: words } = scenario(id);
	await openRunning(page, path);
	await pickScenario(page, name);
	expect(await notice(page), 'the notice the checks below hold the page to').toBe(words);
	await openPhysics(page);
}

/** Points near the middle of the Stage, as shares of it, where the camera looks. */
const MIDDLE = [
	[0.5, 0.5],
	[0.5, 0.56],
	[0.46, 0.5],
	[0.54, 0.5],
	[0.5, 0.44],
	[0.45, 0.58],
	[0.55, 0.58],
	[0.42, 0.45],
	[0.58, 0.45]
];

const cardIds = (page: Page) => page.locator('.hud li[data-probe]').evaluateAll((items) => items.map((item) => item.getAttribute('data-probe')!));

/**
 * Sets the probe height to its lowest (`Home`) or highest (`End`) in Advanced, then pins a Probe with the Probe tool in the room named
 * `room`: a spot near the middle of the Stage at a time, giving back a probe that landed in another room. Returns the probe's id.
 */
async function pinAtHeight(page: Page, key: 'Home' | 'End', room: string) {
	await openPhysics(page);
	const height = page.getByRole('dialog', { name: 'Advanced' }).getByRole('slider', { name: /^Probe and smoke height/ });
	await height.focus();
	await page.keyboard.press(key);
	await expect(height).toHaveValue((await height.getAttribute(key === 'Home' ? 'min' : 'max'))!);
	await closePhysics(page);
	await page.keyboard.press('3');
	await expect(hud(page)).toHaveAttribute('data-tool', 'probe');
	const box = (await view(page).boundingBox())!;
	for (const [fx, fy] of MIDDLE) {
		const before = await cardIds(page);
		await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
		// The pin is made as the button comes up; a frame drawn in software can hold the card back for a second or two.
		for (let wait = 0; wait < 12 && (await cardIds(page)).length === before.length; wait++) await page.waitForTimeout(250);
		const added = (await cardIds(page)).find((id) => !before.includes(id));
		if (!added) continue;
		const card = page.locator(`.hud li[data-probe="${added}"]`);
		if ((await card.locator('.room').textContent())?.trim() === room) {
			await page.keyboard.press('1');
			return added;
		}
		await card.getByRole('button', { name: /^Remove/ }).click();
		await expect(card).toHaveCount(0);
		// Past the double click's half second, so the next click is one of its own.
		await page.waitForTimeout(600);
	}
	throw new Error(`No spot near the middle of the Stage took a probe in the ${room}.`);
}

/** A Probe's temperature, °C, as its card shows it, once it reads. */
async function probeTemperature(page: Page, id: string) {
	const facts = page.locator(`.hud li[data-probe="${id}"] .facts`);
	await expect(facts).toContainText('°C', { timeout: 30_000 });
	return Number((await facts.textContent())!.replace(/−/g, '-').match(/(-?[\d.]+)\s*°C/)![1]);
}

const show = (reading: Readings, key: 'speed' | 'temperature' | 'changes' | 'ppm') =>
	Object.entries(reading.rooms)
		.map(([id, room]) => `${id} ${room[key]}`)
		.join(', ');

/**
 * How long a room's smoke takes to halve, minutes, from the panel's PM2.5. A purifier in a closed room takes out the same share each
 * minute, so any stretch of the fall gives the halving time. The panel gives two significant digits, so the stretch starts once the room
 * is under 0.1 ppm, where a digit is a hundredth of the level, and ends once it is under 0.065 ppm: each reading is then within half a
 * digit, which moves the answer by 3 % at most. (A stretch of 90 s, a third of a halving in the smoky day, let the rounding move it by 7 %.)
 */
async function halving(page: Page, room: string, browserName: string) {
	// The Scenario's smoke first: for a moment after a new run starts, the rows can still be the last run's air, with none in it.
	await readUntil(page, (r) => r.rooms[room].ppm >= 0.1, `${room} reads the Scenario's smoke`);
	const first = await readUntil(page, (r) => r.rooms[room].ppm < 0.1, `${room} falls under 0.1 ppm`);
	const second = await readUntil(page, (r) => r.rooms[room].ppm < 0.065, `${room} falls under 0.065 ppm`);
	const minutes = (Math.LN2 * (second.time - first.time)) / Math.log(first.rooms[room].ppm / second.rooms[room].ppm) / 60;
	console.log(`${browserName}: ${room} at ${first.rooms[room].ppm} ppm at ${first.time} s and ${second.rooms[room].ppm} ppm at ${second.time} s: halves every ${minutes.toFixed(2)} min`);
	return minutes;
}

test.describe('each Scenario does what its notice says', { tag: '@slow' }, () => {
	// Up to a quarter of an hour: the smoky day needs over three simulated minutes, which a CI runner steps at about real time or slower.
	test.beforeEach(() => test.setTimeout(900_000));

	test('Cross-ventilation: the wind crosses the home from the living room to the bedrooms, and a closed bedroom door all but stops the flow through that bedroom', async ({ page, browserName }) => {
		await load(page, 'cross-ventilation');
		const open = await readAt(page, 30);
		console.log(`${browserName}: cross-ventilation at ${open.time} s, air changes an hour: ${show(open, 'changes')}`);
		// In at the living room, across the hall, out at both bedrooms: each room on the way changes its air at least 20 times an hour
		// (60 to 145 in every browser here).
		for (const room of ['living', 'hall', 'bedroom-1', 'bedroom-2']) expect(open.rooms[room].changes, `${room} has air through it`).toBeGreaterThan(20);
		// The bathroom, its door shut, is off the path.
		expect(open.rooms.bathroom.changes, 'the bathroom is off the path').toBeLessThan(0.2 * open.rooms['bedroom-1'].changes);

		// Bedroom 1's door shut: 15 simulated seconds later its flow is under a fifth of what it was ("almost nothing").
		await inspect(page, 'opening:bedroom-1-door');
		await page.locator('#hud-inspector [data-preset="closed"]').click();
		await expect(page.locator('#hud-inspector [data-preset="closed"]')).toHaveAttribute('aria-pressed', 'true');
		await openPhysics(page);
		const shut = await readAt(page, (await readings(page)).time + 15);
		console.log(`${browserName}: bedroom 1 door shut, at ${shut.time} s: ${show(shut, 'changes')}`);
		expect(shut.rooms['bedroom-1'].changes, 'bedroom 1 with its door shut').toBeLessThan(0.2 * open.rooms['bedroom-1'].changes);
	});

	test('Stack effect: with no wind, cold air comes in, the living room cools from the floor up, and its air changes', async ({ page, browserName }) => {
		// The house, with the camera where the opening's drift ends over its living room, so the middle of the Stage is that room.
		const end = openingFor(planById('house')!, 1440 / 900).to;
		const camera = [end.x, end.z, OPENING_END.heading, OPENING_END.zoom, OPENING_END.tilt].map((n) => n.toFixed(2)).join(',');
		await load(page, 'stack-effect', `/experiments/airflow?cell=0.3&camera=${camera}${setupToHash(blankSetup('house'))}`);
		const { indoorTemp, outdoorTemp, windSpeed } = scenario('stack-effect').setup.conditions;
		expect(windSpeed).toBe(0);

		// Two Probes in the living room: one 10 cm over the floor and one 2.3 m up, the lowest and highest the probe height goes.
		const low = await pinAtHeight(page, 'Home', 'Living room');
		const high = await pinAtHeight(page, 'End', 'Living room');

		await openPhysics(page);
		const later = await readAt(page, 60);
		const [floor, top] = [await probeTemperature(page, low), await probeTemperature(page, high)];
		console.log(`${browserName}: stack effect at ${later.time} s: the living room at ${later.rooms.living.temperature} °C, ${floor} °C at the floor and ${top} °C 2.3 m up; ${show(later, 'changes')}`);
		// A minute in, the living room is at least half a degree under the 21 °C it started at, and above the −5 °C outside.
		expect(later.rooms.living.temperature).toBeLessThan(indoorTemp - 0.5);
		expect(later.rooms.living.temperature).toBeGreaterThan(outdoorTemp);
		// From the floor up: the air at the floor is at least 3 °C colder than the air 2.3 m up (9 °C against 20.3 °C in every browser here).
		expect(floor, 'the floor is colder than the air near the ceiling').toBeLessThan(top - 3);
		// Air flows through the room with no wind to push it: in at the low windows, out at the clerestory.
		expect(later.rooms.living.changes, 'the living room’s air changes').toBeGreaterThan(1);
	});

	test('A fan in the window: the air goes from the dining room to the hall and bedroom 1, the closed rooms see little of it, and with the fan off it slows to a drift within a minute', async ({ page, browserName }) => {
		await load(page, 'window-fan');
		const running = await readAt(page, 30);
		console.log(`${browserName}: window fan at ${running.time} s, m/s: ${show(running, 'speed')}; °C: ${show(running, 'temperature')}`);
		const speed = (reading: Readings, room: string) => reading.rooms[room].speed;
		// The same bounds as the solver's check of this Scenario.
		expect(speed(running, 'dining'), 'the dining room, where the fan is, moves more than the living room').toBeGreaterThan(speed(running, 'living'));
		expect(speed(running, 'hall')).toBeGreaterThan(0.1);
		expect(speed(running, 'bedroom-1')).toBeGreaterThan(0.1);
		expect(speed(running, 'bedroom-2'), 'bedroom 2, its door shut').toBeLessThan(0.02);
		expect(speed(running, 'bathroom'), 'the bathroom, its door shut').toBeLessThan(0.02);
		// It draws the 16 °C air in: the dining room is cooler than the 24 °C it started at.
		expect(running.rooms.dining.temperature).toBeLessThan(23.5);

		await inspect(page, 'device:window-fan');
		await page.locator('#hud-inspector [data-preset="off"]').click();
		await expect(page.locator('#hud-inspector [data-preset="off"]')).toHaveAttribute('aria-pressed', 'true');
		await openPhysics(page);
		const resting = await readAt(page, (await readings(page)).time + 60);
		console.log(`${browserName}: a minute after the fan stopped, at ${resting.time} s, m/s: ${show(resting, 'speed')}`);
		// A drift: no room over 10 cm/s, and the rooms the fan stirred at under 30 % of their running speed.
		for (const [room, { speed }] of Object.entries(resting.rooms)) expect(speed, `${room} a minute after the fan stopped`).toBeLessThan(0.1);
		const stirred = Object.keys(running.rooms).filter((room) => speed(running, room) > 0.1);
		const mean = (reading: Readings) => stirred.reduce((sum, room) => sum + speed(reading, room), 0) / stirred.length;
		expect(mean(resting) / mean(running)).toBeLessThan(0.3);
	});

	test('Clearing the smoke: the purifier on High halves the smoke in bedroom 2 about every three and a half minutes', async ({ page, browserName }) => {
		await load(page, 'clearing-smoke');
		// Within 20 % of three and a half minutes: 3.3 to 3.8 here, on the processor and on WebGPU, which differs from run to run.
		const minutes = await halving(page, 'bedroom-2', browserName);
		expect(minutes).toBeGreaterThan(3.5 * 0.8);
		expect(minutes).toBeLessThan(3.5 * 1.2);
	});

	test('The smoky day: with every window shut, the purifier on High halves the smoke in the main room about every five minutes', async ({ page, browserName }) => {
		await load(page, 'smoky-day');
		// Within 20 % of five minutes (5.2 on the processor and 5.2 to 5.7 on WebGPU here, from run to run).
		const minutes = await halving(page, 'main', browserName);
		expect(minutes).toBeGreaterThan(5 * 0.8);
		expect(minutes).toBeLessThan(5 * 1.2);
	});
});
