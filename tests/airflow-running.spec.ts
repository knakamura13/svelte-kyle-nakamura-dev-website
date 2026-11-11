import { expect, test, type Page } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { planById, plans } from '../src/lib/experiments/airflow/homes/plans';
import type { PlanId } from '../src/lib/experiments/airflow/homes/types';
import { decodeSetup, linkCatalog, setupToHash } from '../src/lib/experiments/airflow/link';
import { blankSetup, type Setup } from '../src/lib/experiments/airflow/state';
import {
	PAGE,
	closeInspector,
	closePhysics,
	hud,
	inspect,
	live,
	newRun,
	openPhysics,
	openRunning,
	readUntil,
	requireSimRate,
	simTime,
	status,
	untilSim,
	view,
	type Readings
} from './airflow-sim';

/**
 * The running simulation through the HUD's controls (#61): a fan from the Build catalog changes the Room averages (#53's last criterion),
 * Probes pin, read and go, released Smoke shows in the books and then leaves, the clock pauses and keeps its speed, Restart and Reset
 * start over as they say, another Home is a new world with its own Rooms, and a Share link carries Devices, Openings and the weather,
 * Gusty included, to a new page in every Home. The real simulation runs, on whichever backend the browser picked; every wait is on the
 * simulated time or on what the page reads out.
 */
test.use({ locale: 'en-GB', viewport: { width: 1440, height: 900 } });

const boxFan = DEVICE_MODELS.find((model) => model.kind === 'box-fan')!;
const catalog = linkCatalog(plans, DEVICE_MODELS);
/** The coarsest grid, without the two-bedroom's camera, for the specs that never point at the world. */
const PLAIN = '/experiments/airflow?cell=0.3';

const cards = (page: Page) => page.getByRole('list', { name: 'Probes' }).getByRole('listitem');
const releasing = (page: Page) => page.locator('.hud [role="status"][data-releasing]');

/** Places a box fan from the Build catalog at the best free spot, as Enter on its card does, and returns its id. */
async function placeFan(page: Page, placed = 1) {
	await page.keyboard.press('2');
	const build = page.getByRole('region', { name: 'Build' });
	await expect(build).toBeVisible();
	await page.locator(`.card[data-model="${boxFan.id}"]`).focus();
	await page.keyboard.press('Enter');
	await expect(build).toContainText(`${placed} of 6 placed`);
	await expect(live(page)).toHaveText(`${boxFan.name} added.`);
	const selection = (await hud(page).getAttribute('data-selection')) ?? '';
	expect(selection).toMatch(/^device:/);
	await page.keyboard.press('1');
	return selection.slice('device:'.length);
}

/** Points of the two-bedroom's own view, as shares of the Stage, that are over the air of a room. */
const SPOTS = [
	[0.5, 0.55],
	[0.42, 0.5],
	[0.58, 0.5],
	[0.45, 0.62],
	[0.55, 0.62],
	[0.5, 0.45],
	[0.4, 0.58],
	[0.6, 0.58],
	[0.36, 0.5],
	[0.64, 0.5]
];

/** The two-bedroom's Rooms the cross-ventilation wind blows through, by name. */
const WINDWARD = ['living', 'hall', 'bedroom-1', 'bedroom-2'].map((id) => planById('two-bedroom')!.rooms.find((room) => room.id === id)!.name);

/**
 * Pins a Probe with the Probe tool: clicks spots of the world, far from `away`, until a new card shows, in one of `rooms` when they are
 * given, and where the air moves at `fast` m/s or more when that is given (a probe that lands elsewhere is removed again). A click on
 * furniture or the lawn pins nothing. Returns where it pinned.
 */
async function pinProbe(page: Page, { away, rooms, fast }: { away?: { x: number; y: number }; rooms?: string[]; fast?: number } = {}) {
	await closePhysics(page);
	await page.keyboard.press('3');
	await expect(hud(page)).toHaveAttribute('data-tool', 'probe');
	const ids = () => page.locator('.hud li[data-probe]').evaluateAll((items) => items.map((item) => item.getAttribute('data-probe')!));
	const box = (await view(page).boundingBox())!;
	for (const [fx, fy] of SPOTS) {
		const at = { x: box.x + box.width * fx, y: box.y + box.height * fy };
		if (away && Math.hypot(at.x - away.x, at.y - away.y) < 80) continue;
		const before = await ids();
		await page.mouse.click(at.x, at.y);
		// The pin is made as the button comes up; a frame drawn in software can hold the card back for a second or two.
		for (let wait = 0; wait < 12 && (await ids()).length === before.length; wait++) await page.waitForTimeout(250);
		const added = (await ids()).find((id) => !before.includes(id));
		if (!added) continue;
		const card = page.locator(`.hud li[data-probe="${added}"]`);
		const inRoom = !rooms || rooms.includes(((await card.locator('.room').textContent()) ?? '').trim());
		// Where the air moves at `fast` m/s or more, read once the card has a speed.
		const speed = async () => parseFloat((await card.locator('.speed').textContent().catch(() => '')) ?? '');
		if (inRoom && fast) await expect(card.locator('.speed')).toHaveText(/\d/, { timeout: 30_000 });
		if (inRoom && (!fast || (await speed()) >= fast)) return at;
		await card.getByRole('button', { name: /^Remove/ }).click();
		await expect(card).toHaveCount(0);
		// Past the double click's half second, so the next click is one of its own.
		await page.waitForTimeout(600);
	}
	throw new Error(`No spot of the world took a probe${rooms ? ` in ${rooms.join(', ')}` : ''}.`);
}

/**
 * Holds the mouse down on the air at `at` with the Smoke tool, at its strongest source (a cooking burst, 10 mg a minute), until `seconds`
 * of simulated time have gone by, then lets go.
 */
async function releaseSmoke(page: Page, at: { x: number; y: number }, seconds: number) {
	await closePhysics(page);
	await page.keyboard.press('4');
	await expect(hud(page)).toHaveAttribute('data-tool', 'smoke');
	const burst = page.locator('.hud [data-mark="burst"]');
	await burst.click();
	await expect(burst).toHaveAttribute('aria-pressed', 'true');
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await expect(releasing(page), 'a held press releases smoke').toBeVisible({ timeout: 30_000 });
	await untilSim(page, (await simTime(page)) + seconds);
	await page.mouse.up();
	await expect(releasing(page)).toHaveCount(0);
	await page.keyboard.press('1');
}

/** Closes the weather's details: Escape, or the button again where a click left the focus elsewhere (WebKit does not focus a clicked button). */
async function closeWeather(page: Page) {
	await page.keyboard.press('Escape');
	if (await page.locator('#hud-weather-details').isVisible()) await page.getByRole('button', { name: 'Weather details' }).click();
	await expect(page.locator('#hud-weather-details')).toHaveCount(0);
}

const fastest = (reading: Readings) => Math.max(...Object.values(reading.rooms).map((room) => room.speed));

test.describe('the running simulation', { tag: '@slow' }, () => {
	// Minutes: Chromium's headless shell steps the air on the processor at about real time here, and a runner drawing in software slower.
	test.beforeEach(() => test.setTimeout(480_000));

	test('a fan placed from the Build catalog stirs the still air of its room, and the Room averages fall back once it is off', async ({ page, browserName }) => {
		// The two-bedroom closed up, on a still day: nothing moves the air.
		await openRunning(page, `${PAGE}${setupToHash(blankSetup('two-bedroom'))}`);
		// At 20×: a frame asks for at most a tenth of a second times the clock's speed, and a runner drawing in software makes a few a second.
		await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: /^20×/ }).click();
		// About 85 simulated seconds and a quarter more, within its quarter of an hour (two minutes kept for the page and the catalog).
		test.setTimeout(900_000);
		await requireSimRate(page, 106, 780_000);
		await openPhysics(page);
		const still = await readUntil(page, (r) => r.time >= 5 && Object.values(r.rooms).every((room) => Number.isFinite(room.speed)), 'the Rooms read');
		console.log(`${browserName}: still air at ${still.time} s, m/s: ${JSON.stringify(Object.fromEntries(Object.entries(still.rooms).map(([id, r]) => [id, r.speed])))}`);
		expect(fastest(still), 'the closed home’s air is still').toBeLessThan(0.02);

		await closePhysics(page);
		const fan = await placeFan(page);
		await openPhysics(page);
		const stirred = await readUntil(page, (r) => r.time >= still.time + 20, '20 simulated seconds go by');
		const room = Object.entries(stirred.rooms).sort((a, b) => b[1].speed - a[1].speed)[0][0];
		console.log(`${browserName}: with the fan, at ${stirred.time} s, ${room} is at ${stirred.rooms[room].speed} m/s, from ${still.rooms[room].speed}`);
		// The fan's room: well over the still air, at 10 cm/s or more.
		expect(stirred.rooms[room].speed).toBeGreaterThan(0.1);
		expect(stirred.rooms[room].speed).toBeGreaterThan(5 * Math.max(still.rooms[room].speed, 0.005));

		// Off, from the Inspector: a minute later that room is under half its speed.
		await inspect(page, `device:${fan}`);
		await page.locator('#hud-inspector [data-preset="off"]').click();
		await expect(page.locator('#hud-inspector [data-preset="off"]')).toHaveAttribute('aria-pressed', 'true');
		await closeInspector(page);
		await openPhysics(page);
		const resting = await readUntil(page, (r) => r.time >= stirred.time + 60, 'a simulated minute goes by');
		console.log(`${browserName}: a minute after the fan went off, ${room} is at ${resting.rooms[room].speed} m/s`);
		expect(resting.rooms[room].speed).toBeLessThan(0.5 * stirred.rooms[room].speed);
	});

	test('a Probe pins where the Probe tool clicks, reads the air there as it moves, and goes when it is removed', async ({ page, browserName }) => {
		// Cross-ventilation, the first Scenario: a Probe in a Room the wind blows through, where the air moves at 10 cm/s or more.
		await openRunning(page);
		await untilSim(page, 3);
		const first = await pinProbe(page, { rooms: WINDWARD, fast: 0.1 });
		await expect(cards(page)).toHaveCount(1);
		await expect(live(page)).toHaveText('Probe 1 pinned.');
		const card = page.locator('.hud li[data-probe="p1"]');
		await expect(card.locator('.name-text')).toHaveText('Probe 1');
		await expect(card.locator('.room'), 'it names its room').toHaveText(/\w/);
		// What it reads: a speed, a temperature between the 18 °C outdoors and the 21 °C indoors it started at, and the PM2.5.
		await expect(card.locator('.speed')).toHaveText(/\d/, { timeout: 30_000 });
		const temperature = Number((await card.locator('.facts').textContent())!.match(/(-?[\d.]+)\s*°C/)![1]);
		expect(temperature).toBeGreaterThanOrEqual(17.5);
		expect(temperature).toBeLessThanOrEqual(21.5);
		await expect(card.locator('.facts')).toContainText('PM2.5');
		// It keeps reading the air there: over ten simulated seconds of the wind its speed or direction changes.
		const seen = new Set<string>();
		const until = (await simTime(page)) + 10;
		while ((await simTime(page)) < until) {
			seen.add(`${await card.locator('.speed').textContent()} ${await card.locator('.direction').textContent()}`);
			await page.waitForTimeout(250);
		}
		console.log(`${browserName}: probe 1, in the ${await card.locator('.room').textContent()}, read ${[...seen].join(', ')}`);
		expect(seen.size, 'the reading moves with the air').toBeGreaterThan(1);
		// Pinned where it was clicked: its label is on the Stage near that point.
		const label = (await view(page).locator('.stage-label[data-tone="probe"]').first().boundingBox())!;
		expect(Math.hypot(label.x + label.width / 2 - first.x, label.y + label.height - first.y), 'the label stands over the click').toBeLessThan(150);

		await pinProbe(page, { away: first });
		await expect(cards(page)).toHaveCount(2);
		await expect(live(page)).toHaveText('Probe 2 pinned.');
		await page.getByRole('button', { name: 'Remove Probe 1' }).click();
		await expect(cards(page)).toHaveCount(1);
		await expect(page.locator('.hud li[data-probe]')).toHaveAttribute('data-probe', 'p2');
		await expect(live(page)).toHaveText('Probe 1 removed.');
		await expect(view(page).locator('.stage-label[data-tone="probe"]')).toHaveCount(1);
	});

	test('Smoke released into the moving air shows in the books and the Rooms, then leaves by the open windows', async ({ page, browserName }) => {
		// Under half the smoke is left at about 130 simulated seconds. CI's runners step the air at about a quarter of real time even at 20×
		// (0.26× in WebKit in run 43026931941), so that takes some 8 minutes there, and the 8 minutes the other tests get ran out in both
		// Chromium and WebKit.
		test.setTimeout(900_000);
		await openRunning(page);
		await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: /^20×/ }).click();
		await untilSim(page, 3);
		// About 130 simulated seconds and a quarter more, within the 12-minute wait for the smoke to leave.
		await requireSimRate(page, 163, 720_000);
		// A spot over the air, found with the Probe tool, which then gives its probe back.
		const at = await pinProbe(page);
		await page.getByRole('button', { name: 'Remove Probe 1' }).click();
		await releaseSmoke(page, at, 10);
		await openPhysics(page);
		const released = await readUntil(page, (r) => r.smoke.emitted > 0 && r.smoke.inAir > 0, 'the books show the smoke');
		console.log(`${browserName}: at ${released.time} s, released ${released.smoke.emitted} mg, ${released.smoke.inAir} mg in the air`);
		// It appears: it is in the air, nearly all of it, and in a Room's PM2.5.
		expect(released.smoke.initial, 'none at the start').toBe(0);
		expect(released.smoke.inAir).toBeGreaterThan(0.5 * released.smoke.emitted);
		expect(Math.max(...Object.values(released.rooms).map((room) => room.ppm)), 'a Room holds it').toBeGreaterThan(0);
		// It decays: the wind takes it out through the windows until under half of it is left in the home.
		const later = await readUntil(page, (r) => r.smoke.inAir < 0.5 * released.smoke.emitted, 'the smoke leaves', 720_000);
		console.log(`${browserName}: at ${later.time} s, ${later.smoke.inAir} mg in the air, ${later.smoke.outflow} mg left through openings`);
		expect(later.smoke.outflow, 'by the openings').toBeGreaterThan(0.3 * released.smoke.emitted);
	});

	test('Pause holds the simulated clock, Resume runs it on, and the clock keeps to 1× or says how far behind 20× it runs', async ({ page, browserName }) => {
		await openRunning(page, `${PAGE}${setupToHash(blankSetup('two-bedroom'))}`);
		await untilSim(page, 1);
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		await expect(status(page)).toHaveAttribute('data-status', 'paused');
		await expect(status(page)).toContainText(/Paused on/);
		await expect(page.locator('.clock')).toHaveAttribute('data-paused', '');
		// A step already asked for may still come back, and a frame drawn in software can take a while to show it: then nothing more.
		await expect
			.poll(
				async () => {
					const before = await simTime(page);
					await page.waitForTimeout(1000);
					return (await simTime(page)) === before;
				},
				{ message: 'the clock settles', timeout: 20_000 }
			)
			.toBe(true);
		const held = await simTime(page);
		await page.waitForTimeout(3000);
		expect(await simTime(page), 'paused, the simulated time holds').toBe(held);
		await openPhysics(page);
		await expect(page.locator('.physics [data-reading="speed"] dd')).toHaveText('Paused');
		await closePhysics(page);
		await page.getByRole('button', { name: 'Resume', exact: true }).click();
		await expect(status(page)).toHaveAttribute('data-status', 'running');
		await untilSim(page, held + 1);

		/** Simulated seconds per second of the wall clock, over six seconds. */
		const rate = async () => {
			const [t0, w0] = [await simTime(page), Date.now()];
			await page.waitForTimeout(6000);
			return ((await simTime(page)) - t0) / ((Date.now() - w0) / 1000);
		};
		const speed = page.getByRole('group', { name: 'Speed' });
		await speed.getByRole('button', { name: /^1×/ }).click();
		await expect(speed.getByRole('button', { name: /^1×/ })).toHaveAttribute('aria-pressed', 'true');
		await expect(live(page)).toHaveText('Real time.');
		// The steps the 5× clock already asked for come back first.
		await page.waitForTimeout(2000);
		const real = await rate();
		// Never faster than the clock asks: what a reading every eighth of a second can add, and no more.
		expect(real, 'at 1× the simulation runs no faster than real time').toBeLessThan(1.25);

		await speed.getByRole('button', { name: /^20×/ }).click();
		await expect(live(page)).toHaveText('20 times real time.');
		await page.waitForTimeout(1000);
		const fast = await rate();
		const behind = (await page.locator('.clock-behind').count()) ? await page.locator('.clock-behind').textContent() : null;
		console.log(`${browserName}: ${real.toFixed(2)}× at 1×, ${fast.toFixed(2)}× at 20×${behind ? `, and the clock says "${behind}"` : ''}`);
		// It keeps up with 20×, or the clock says how fast it does run. (The page averages its rate, so between 12× and 17× it may say either.)
		if (fast < 12) await expect(page.locator('.clock-behind')).toHaveText(/^Running at (under )?[\d.]+× real time\.$/, { timeout: 15_000 });
		expect(fast, 'at 20× faster than at 1×, or no slower').toBeGreaterThan(0.8 * Math.min(real, 1));
	});

	test('Restart clears the air and the smoke and keeps the setup and the Probes; Reset puts the Scenario back as it began', async ({ page }) => {
		await openRunning(page);
		await expect(page.getByRole('button', { name: /^Scenario:/ })).toHaveAttribute('aria-label', 'Scenario: Cross-ventilation');
		await untilSim(page, 3);
		await placeFan(page);
		await expect(page.getByRole('button', { name: /^Scenario:/ }), 'a fan of the visitor’s own makes it their setup').toHaveAttribute('aria-label', 'Scenario: your own setup');
		const at = await pinProbe(page);
		await releaseSmoke(page, at, 3);
		await openPhysics(page);
		await readUntil(page, (r) => r.smoke.emitted > 0 && r.time >= 10, 'smoke released, ten seconds in');

		await newRun(page, () => page.getByRole('dialog', { name: 'Advanced' }).getByRole('button', { name: 'Restart' }).click());
		await expect(live(page)).toHaveText('Restarted. The air is still and the smoke is gone.');
		// The clock started again (`newRun`), and the books with it.
		await readUntil(page, (r) => r.smoke.emitted === 0 && r.smoke.inAir === 0, 'the smoke is gone, and nothing is released in this run', 60_000);
		await expect(cards(page), 'the probe stays').toHaveCount(1);
		await expect(page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Build' }), 'the fan stays').toContainText('1');

		await newRun(page, () => page.getByRole('dialog', { name: 'Advanced' }).getByRole('button', { name: 'Reset' }).click());
		await expect(live(page)).toHaveText('Back to the start.');
		await expect(page.getByRole('button', { name: /^Scenario:/ })).toHaveAttribute('aria-label', 'Scenario: Cross-ventilation');
		await expect(cards(page), 'the probes go').toHaveCount(0);
		await closePhysics(page);
		await page.keyboard.press('2');
		await expect(page.getByRole('region', { name: 'Build' }), 'the fan goes').toContainText('0 of 6 placed');
		await openPhysics(page);
		const reset = await readUntil(page, (r) => r.time > 2 && Object.values(r.rooms).every((room) => Number.isFinite(room.speed)), 'the Scenario runs again');
		expect(reset.smoke.emitted).toBe(0);
		expect(reset.rooms['bedroom-1'].changes, 'the wind blows through the bedrooms again').toBeGreaterThan(0);
	});

	test('another Home is a new world: its own Rooms in the Physics panel, closed up and empty, in the weather the visitor had', async ({ page }) => {
		await openRunning(page);
		const wind = await page.locator('.summary .speed-chip').getAttribute('aria-label');
		for (const id of ['studio', 'one-bedroom', 'house', 'two-bedroom'] as PlanId[]) {
			const plan = planById(id)!;
			await closePhysics(page);
			await newRun(page, async () => {
				await page.getByRole('button', { name: /^Home:/ }).click();
				await page.locator('#hud-homes .home', { hasText: plan.name }).click();
			});
			await expect(page.getByRole('button', { name: /^Home:/ })).toHaveAttribute('aria-label', `Home: ${plan.name}`);
			await expect(page.locator('.airflow-figure figcaption')).toContainText(plan.name);
			await expect(page.getByRole('button', { name: /^Scenario:/ })).toHaveAttribute('aria-label', 'Scenario: your own setup');
			await expect(page.locator('.summary .speed-chip'), 'the weather the visitor had').toHaveAttribute('aria-label', wind!);
			await openPhysics(page);
			await expect(page.locator('table.rooms tr[data-room]')).toHaveCount(plan.rooms.length);
			const reading = await readUntil(page, (r) => r.time > 1 && Object.values(r.rooms).every((room) => Number.isFinite(room.speed) && Number.isFinite(room.temperature)), `${plan.name} reads`);
			expect(Object.keys(reading.rooms), `${plan.name}'s own Rooms`).toEqual(plan.rooms.map((room) => room.id));
			// Closed up: no air through any Room from outdoors, whatever the wind.
			for (const [room, { changes }] of Object.entries(reading.rooms)) expect(changes, `${plan.name}: ${room}`).toBeLessThan(1);
		}
	});
});

test.describe('a Share link', { tag: '@slow' }, () => {
	test.beforeEach(() => test.setTimeout(300_000));

	/** The setup a copied link carries. */
	const linked = (link: string): Setup | null => {
		const hash = new URL(link).hash;
		return decodeSetup(decodeURIComponent(hash.slice(hash.indexOf('s=') + 2)), catalog);
	};

	/** Copies the page's link from Advanced and returns it. */
	async function copyLink(page: Page, written: () => Promise<string[]>) {
		const count = (await written()).length;
		await openPhysics(page);
		await page.getByRole('dialog', { name: 'Advanced' }).getByRole('button', { name: 'Copy link' }).click();
		await expect(live(page)).toHaveText('Link copied.');
		await expect.poll(async () => (await written()).length).toBe(count + 1);
		return (await written()).at(-1)!;
	}

	for (const plan of plans) {
		test(`carries the ${plan.name}'s fan, an open window and the weather, Gusty included, to a new page, which links back to the same setup`, async ({ page, browserName }) => {
			const window = plan.openings.find((o) => o.kind === 'double-hung' || o.kind === 'casement')!;
			const written = await stubClipboard(page, 'succeed');
			await openRunning(page, `${PLAIN}${setupToHash(blankSetup(plan.id))}`);

			// A fan from the catalog, a window opened halfway, and the weather: a fresh breeze, gusty, a degree warmer, hazy outdoor air.
			await placeFan(page);
			await inspect(page, `opening:${window.id}`);
			await page.locator('#hud-inspector [data-preset="half"]').click();
			await expect(page.locator('#hud-inspector [data-preset="half"]')).toHaveAttribute('aria-pressed', 'true');
			await closeInspector(page);
			await page.getByRole('button', { name: 'Weather details' }).click();
			await page.locator('#hud-weather-details .chip', { hasText: 'Fresh' }).click();
			await page.getByRole('switch', { name: 'Gusty' }).click();
			await expect(page.getByRole('switch', { name: 'Gusty' })).toHaveAttribute('aria-checked', 'true');
			await page.getByRole('button', { name: 'Raise the outdoor temperature' }).click();
			await page.locator('#hud-weather-details .chip[data-air="hazy"]').click();
			await expect(page.locator('#hud-weather-details .chip[data-air="hazy"]')).toHaveAttribute('aria-pressed', 'true');
			await closeWeather(page);

			const link = await copyLink(page, written);
			const setup = linked(link)!;
			expect(setup, `${browserName}: the link reads`).not.toBeNull();
			expect(setup.plan).toBe(plan.id);
			expect(setup.devices.map((d) => d.model)).toEqual([boxFan.id]);
			expect(setup.openings[window.id]).toBeCloseTo(0.5, 6);
			expect(setup.conditions.gusty).toBe(true);
			expect(setup.conditions.windSpeed).toBeGreaterThan(5);
			expect(setup.conditions.outdoorTemp).toBeGreaterThan(blankSetup(plan.id).conditions.outdoorTemp);
			expect(setup.conditions.outdoorPm25).toBeGreaterThan(0);

			// A visitor who opens it: a page of its own, as a new tab would be. Its world runs the setup, and its controls say so.
			const visitor = await page.context().newPage();
			const copied = await stubClipboard(visitor, 'succeed');
			await openRunning(visitor, `${PLAIN}${new URL(link).hash}`);
			await untilSim(visitor, 2);
			await expect(visitor.getByRole('button', { name: /^Home:/ })).toHaveAttribute('aria-label', `Home: ${plan.name}`);
			await visitor.keyboard.press('2');
			await expect(visitor.getByRole('region', { name: 'Build' })).toContainText('1 of 6 placed');
			await visitor.keyboard.press('1');
			await inspect(visitor, `opening:${window.id}`);
			await expect(visitor.locator('#hud-inspector [data-preset="half"]')).toHaveAttribute('aria-pressed', 'true');
			await closeInspector(visitor);
			await visitor.getByRole('button', { name: 'Weather details' }).click();
			await expect(visitor.getByRole('switch', { name: 'Gusty' })).toHaveAttribute('aria-checked', 'true');
			await expect(visitor.locator('#hud-weather-details .chip[data-air="hazy"]')).toHaveAttribute('aria-pressed', 'true');
			await closeWeather(visitor);
			// Its own link is the same setup: the round trip loses nothing.
			expect(linked(await copyLink(visitor, copied))).toEqual(setup);
			await visitor.close();
		});
	}
});
