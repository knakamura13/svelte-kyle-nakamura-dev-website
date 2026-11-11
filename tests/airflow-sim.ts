import { expect, type Page } from '@playwright/test';
import { requireWebGL2 } from './webgl';

/**
 * What the end-to-end specs of the running simulation share (#61): opening the page on a running world, the simulated time, waiting for a
 * new run, and reading the Room averages and the smoke's books from the Physics panel as the page shows them. A helper module, not a spec.
 *
 * Everything waits on simulated time or on what the readouts say, never on a count of frames or seconds of the wall clock: on GitHub's
 * runners every browser draws in software at a few frames a second and steps the air on the processor, many times slower than here.
 */

/** The coarsest grid, pinned, so no auto-tuner warm-up loads a busy machine or restarts a run, and the camera on the two-bedroom's own view. */
export const PAGE = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';

/**
 * How long one wait on the simulation may take. A CI runner draws in software at a few frames a second, and its worker steps the air on
 * the processor at about real time at 1× and a few times real time at 5× and 20× (#105): the longest wait here, 100 simulated seconds,
 * takes well under the 8 minutes even at 1×.
 */
export const SIM_WAIT = 480_000;

export const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
export const hud = (page: Page) => page.locator('.hud');
export const live = (page: Page) => page.locator('.hud p[aria-live="polite"]');
export const status = (page: Page) => page.locator('.sim-status');

/**
 * Opens the page and waits until its air runs (or waits, paused). Firefox on GitHub's runners has no WebGL 2, so there is no world and
 * nothing to test: the spec skips (`requireWebGL2`). Software WebGL compiles the world's shaders for many seconds, hence 90 s.
 */
export async function openRunning(page: Page, path = PAGE) {
	await requireWebGL2(page);
	await page.goto(path);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 90_000 });
	await expect(status(page)).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 90_000 });
}

/** The simulated time, seconds: the HUD's `data-sim-time`, which the clock shows to the whole second. */
export const simTime = async (page: Page) => Number(await hud(page).getAttribute('data-sim-time'));

/** Waits until the simulated time is at least `seconds`. */
export async function untilSim(page: Page, seconds: number, timeout = SIM_WAIT) {
	await expect.poll(() => simTime(page), { message: `the simulated time reaches ${seconds} s`, timeout, intervals: [250] }).toBeGreaterThanOrEqual(seconds);
}

/**
 * Does `act` and waits until a new run has started: a Scenario, a Home, Restart or Reset builds a new world in the background while the
 * old one keeps running, and the new one starts its clock at zero. A watcher in the page notes any step back of the simulated time, so a
 * fast backend that runs past the old time between two looks is still seen. Returns once the new run's air is stepping.
 */
export async function newRun(page: Page, act: () => Promise<void>) {
	// The old run must be far enough on that the new one's first reading, a frame of up to two simulated seconds at 20×, is behind it.
	if ((await status(page).getAttribute('data-status')) === 'running') await untilSim(page, 3);
	await page.evaluate(() => {
		const element = document.querySelector('.hud')!;
		const state = { restarted: false, last: Number(element.getAttribute('data-sim-time')) };
		Reflect.set(window, '__airflowRun', state);
		new MutationObserver(() => {
			const now = Number(element.getAttribute('data-sim-time'));
			if (now < state.last) state.restarted = true;
			state.last = now;
		}).observe(element, { attributes: true, attributeFilter: ['data-sim-time'] });
	});
	await act();
	await expect.poll(() => page.evaluate(() => (Reflect.get(window, '__airflowRun') as { restarted: boolean }).restarted), { message: 'a new run started', timeout: 120_000 }).toBe(true);
	await expect(status(page)).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
}

/** Picks a Scenario from the picker and waits until its run has started. */
export async function pickScenario(page: Page, name: string) {
	await newRun(page, async () => {
		await page.getByRole('button', { name: /^Scenario:/ }).click();
		await page.locator('#hud-scenarios').getByRole('button', { name: new RegExp(`^${name}`) }).click();
	});
	await expect(page.getByRole('button', { name: /^Scenario:/ })).toHaveAttribute('aria-label', `Scenario: ${name}`);
}

/** The Scenario's notice, as the picker shows it once it is chosen. */
export async function notice(page: Page) {
	await page.getByRole('button', { name: /^Scenario:/ }).click();
	const text = (await page.locator('#hud-scenarios .panel-note').textContent()) ?? '';
	await page.keyboard.press('Escape');
	await expect(page.locator('#hud-scenarios')).toHaveCount(0);
	return text;
}

/** Opens Advanced, where the Physics panel is, unless it is open. */
export async function openPhysics(page: Page) {
	const advanced = page.getByRole('dialog', { name: 'Advanced' });
	if (!(await advanced.isVisible())) await page.getByRole('button', { name: 'Advanced', exact: true }).click();
	await expect(advanced.locator('table.rooms')).toBeVisible();
}

/** A Room's averages as the Physics panel shows them, in SI: m/s, °C, ppm and µg/m³ of PM2.5, and air changes an hour. NaN for a dash. */
export interface RoomAverages {
	speed: number;
	temperature: number;
	ppm: number;
	ug: number;
	changes: number;
}

/** The Physics panel's numbers, read at one moment so that the time and the readings are of the same step. The panel must be open, in metric. */
export interface Readings {
	time: number;
	rooms: Record<string, RoomAverages>;
	/** The smoke's books, mg, by their key in the panel: initial, emitted, inflow, inAir, outflow, removed, deposited. */
	smoke: Record<string, number>;
}

export async function readings(page: Page): Promise<Readings> {
	return page.evaluate(() => {
		// "0.19 m/s", "−3.2 °C", "1,200 mg", "< 0.001 ppm": a dash is NaN, and under the floor is 0.
		const number = (text: string | null | undefined) => {
			const clean = (text ?? '').replace(/−/g, '-').replace(/,/g, '').trim();
			if (clean.startsWith('<')) return 0;
			const match = clean.match(/-?\d+(\.\d+)?/);
			return match ? Number(match[0]) : NaN;
		};
		const rooms: Record<string, { speed: number; temperature: number; ppm: number; ug: number; changes: number }> = {};
		for (const row of document.querySelectorAll('table.rooms tr[data-room]')) {
			const cell = (label: string) => row.querySelector(`td[data-label="${label}"]`)?.textContent ?? '';
			const pm = cell('PM2.5');
			rooms[row.getAttribute('data-room')!] = {
				speed: number(cell('Speed')),
				temperature: number(cell('Temperature')),
				ppm: number(pm.split('(')[0]),
				ug: number(pm.split('(')[1]),
				changes: number(cell('Air changes per hour'))
			};
		}
		const smoke: Record<string, number> = {};
		for (const item of document.querySelectorAll('.physics [data-reading]')) smoke[item.getAttribute('data-reading')!] = number(item.querySelector('dd')?.textContent);
		return { time: Number(document.querySelector('.hud')!.getAttribute('data-sim-time')), rooms, smoke };
	});
}

/** Waits until the simulated time is at least `seconds`, then reads the panel. */
export async function readAt(page: Page, seconds: number, timeout = SIM_WAIT) {
	await untilSim(page, seconds, timeout);
	return readings(page);
}

/** Polls the panel until `done` holds for a reading, and returns that reading. */
export async function readUntil(page: Page, done: (reading: Readings) => boolean, message: string, timeout = SIM_WAIT) {
	const seen: { last?: Readings } = {};
	await expect
		.poll(
			async () => {
				seen.last = await readings(page);
				return done(seen.last);
			},
			{ message, timeout, intervals: [250] }
		)
		.toBe(true);
	return seen.last!;
}

/** Closes Advanced, if it is open: it stands over the right of the window, where the Inspector and the probe cards are. */
export async function closePhysics(page: Page) {
	const close = page.getByRole('button', { name: 'Close Advanced' });
	if (await close.isVisible()) await close.click();
	await expect(page.getByRole('dialog', { name: 'Advanced' })).toHaveCount(0);
}

/** Opens the Inspector on a thing in the Home (`opening:<id>` or `device:<id>`), from its list of everything, and returns the Inspector. */
export async function inspect(page: Page, target: string) {
	await closePhysics(page);
	const inspector = page.locator('#hud-inspector');
	if (!(await inspector.isVisible())) await page.locator('[aria-controls="hud-inspector"]').click();
	await expect(inspector).toBeVisible();
	const back = inspector.getByRole('button', { name: 'Back to everything in the home' });
	if (await back.isVisible()) await back.click();
	await inspector.locator(`[data-target="${target}"]`).click();
	await expect(inspector.getByRole('button', { name: 'Back to everything in the home' })).toBeVisible();
	return inspector;
}

/** Closes the Inspector, if it is open. */
export async function closeInspector(page: Page) {
	const close = page.getByRole('button', { name: 'Close the Inspector' });
	if (await close.isVisible()) await close.click();
	await expect(page.locator('#hud-inspector')).toHaveCount(0);
}
