import { expect, test, type Page } from '@playwright/test';
import { RUNAWAY_ANNOUNCEMENT } from '../src/lib/experiments/airflow/sim/runaway';
import { focusRing, live, status } from './dock';

/**
 * The runaway guard end to end (#59), in every browser: air the solver would never make is written into the running world, the page stops
 * the run, a notice says why with Reset and Restart, a screen reader is told once, and either button starts the run again.
 *
 * `navigator.gpu` is taken away, so every browser runs the CPU solver in its Web Worker, and `Worker` is wrapped so the test can speak the
 * worker's own protocol: it reads the fields with an id the page never uses (the page ignores the reply), changes them, and writes them
 * back. While it does, the page's `step` messages are held back until the page's next `snapshot` request has gone through, so that read
 * sees the injected air and not air a pressure solve has already corrected.
 */

/** The coarsest grid, pinned, so no auto-tuner warm-up loads a busy machine, and the camera on the Home's default view. */
const PAGE = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';
const SHOTS = process.env.RUNAWAY_SHOTS;

test.use({ locale: 'en-US' });

type Injection = 'non-finite' | 'too-fast';

declare global {
	interface Window {
		airflowRunaway: { workers: number; inject(kind: Injection): Promise<void> };
	}
}

async function watchWorkers(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
		type Message = { type?: string; id?: number; fields?: { u: Float32Array } };
		const Native = window.Worker;
		const send = Native.prototype.postMessage as (this: Worker, message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => void;
		const all: Watched[] = [];
		class Watched extends Native {
			/** Holding: `step` messages wait. `written`: the injected fields were sent, so the page's next snapshot releases them. */
			holding = false;
			written = false;
			held: Message[] = [];
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				all.push(this);
			}
			postMessage(message: Message, transfer?: Transferable[] | StructuredSerializeOptions) {
				if (this.holding && message?.type === 'step') {
					this.held.push(message);
					return;
				}
				send.call(this, message, transfer);
				if (this.holding && this.written && message?.type === 'snapshot') {
					this.holding = false;
					for (const step of this.held.splice(0)) send.call(this, step);
				}
			}
		}
		Object.defineProperty(window, 'Worker', { value: Watched, configurable: true, writable: true });
		window.airflowRunaway = {
			get workers() {
				return all.length;
			},
			async inject(kind) {
				const worker = all[all.length - 1];
				worker.holding = true;
				worker.written = false;
				const id = 1_000_000_000 + all.length;
				const fields = await new Promise<NonNullable<Message['fields']>>((resolve) => {
					const reply = (event: MessageEvent<Message>) => {
						if (event.data?.id !== id || !event.data.fields) return;
						worker.removeEventListener('message', reply);
						resolve(event.data.fields);
					};
					worker.addEventListener('message', reply);
					send.call(worker, { type: 'readFields', id });
				});
				// Every face of the air: a NaN, or 50 m/s, past the 40 m/s the guard allows.
				fields.u.fill(kind === 'non-finite' ? NaN : 50);
				send.call(worker, { type: 'writeFields', fields });
				worker.written = true;
			}
		};
	});
}

const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const notice = (page: Page) => page.getByRole('group', { name: 'The simulation ran away' });

/** Opens the page on the worker and waits until its air runs (or waits, paused). */
async function openOnWorker(page: Page) {
	await watchWorkers(page);
	await page.goto(PAGE);
	await expect(view(page)).toHaveAttribute('data-state', /^(live|unsupported)$/, { timeout: 60_000 });
	test.skip((await view(page).getAttribute('data-state')) === 'unsupported', 'This browser has no WebGL.');
	await expect(status(page)).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
	await expect(status(page)).toContainText('the processor');
	expect(await page.evaluate(() => window.airflowRunaway.workers)).toBe(1);
}

/** Injects, and checks that the run stopped, the notice shows why, and a screen reader heard it once. */
async function runAway(page: Page, kind: Injection) {
	await page.evaluate((kind) => window.airflowRunaway.inject(kind), kind);
	await expect(status(page), 'the runaway is caught').toHaveAttribute('data-status', 'runaway', { timeout: 15_000 });
	await expect(page.locator('.airflow-figure'), 'the Stage knows its air is gone').toHaveAttribute('data-sim', 'runaway');
	await expect(notice(page)).toBeVisible();
	await expect(notice(page)).toContainText(kind === 'too-fast' ? 'its air reached 50 m/s' : 'its numbers stopped being numbers');
	await expect(notice(page)).toContainText('Reset puts the home back the way it began.');
	// Said once: by the HUD's announcement. The status line, a live region of its own, is hidden while the notice stands in its place, and
	// the notice is not a live region.
	await expect(live(page)).toHaveText(RUNAWAY_ANNOUNCEMENT);
	await expect(status(page)).toBeHidden();
	const speaking = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')]
			.filter((region) => !region.closest('[hidden], [aria-hidden="true"]') && getComputedStyle(region).display !== 'none')
			.filter((region) => /ran away|broke down/.test(region.textContent ?? ''))
			.map((region) => region.outerHTML.slice(0, 80))
	);
	expect(speaking, 'one live region says it').toHaveLength(1);
	expect(await notice(page).evaluate((element) => element.closest('[aria-live], [role="status"], [role="alert"]')), 'the notice is not a live region').toBeNull();
	// Nothing runs again until the visitor asks.
	await page.waitForTimeout(1500);
	await expect(status(page)).toHaveAttribute('data-status', 'runaway');
	expect(await page.evaluate(() => window.airflowRunaway.workers), 'no new world was started').toBe(1);
}

/** Every control of the notice is 44 px at least, and the whole notice is inside the window. */
async function checkLayout(page: Page) {
	const size = page.viewportSize()!;
	const box = (await notice(page).boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(size.width);
	expect(box.y + box.height).toBeLessThanOrEqual(size.height);
	// To a hundredth of a pixel: the notice is centred, so it can sit at a fractional position, and Firefox then measures 43.99997.
	for (const name of ['Reset', 'Restart']) {
		const button = (await notice(page).getByRole('button', { name }).boundingBox())!;
		expect(button.height, `${name} is 44 px high`).toBeGreaterThanOrEqual(43.99);
		expect(button.width, `${name} is 44 px wide`).toBeGreaterThanOrEqual(43.99);
	}
}

/** Tab from the 3D view (Alt+Tab in WebKit, as Safari's option to press Tab to highlight each item) until the button has the focus. */
async function tabTo(page: Page, browserName: string, name: string) {
	await view(page).focus();
	const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
	for (let n = 0; n < 4; n++) {
		await page.keyboard.press(key);
		if (await notice(page).getByRole('button', { name }).evaluate((button) => button === document.activeElement)) return n + 1;
	}
	return 0;
}

/** The run starts again on a new worker, the notice goes, and the focus is on the 3D view the button left for. */
async function recovers(page: Page) {
	await expect(status(page)).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
	await expect(notice(page)).toHaveCount(0);
	await expect(status(page)).toBeVisible();
	await expect(page.locator('.airflow-figure')).not.toHaveAttribute('data-sim', 'runaway');
	expect(await page.evaluate(() => window.airflowRunaway.workers), 'a new world on a new worker').toBe(2);
}

test.describe('a runaway simulation', () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(180_000);
		await page.emulateMedia({ reducedMotion: 'no-preference' });
	});

	test('a NaN written into the air stops the run, says why once, and Reset from the keyboard puts the home back', async ({ page, browserName }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openOnWorker(page);
		// The visitor's own clock, which a reset keeps.
		const twenty = page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: /^20×/ });
		await twenty.click();
		await expect(twenty).toHaveAttribute('aria-pressed', 'true');
		await runAway(page, 'non-finite');
		await checkLayout(page);
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/runaway-${browserName}-1440.png` });

		expect(await tabTo(page, browserName, 'Reset'), 'Reset is the first stop after the 3D view').toBe(1);
		expect(await focusRing(page)).toBe(true);
		await page.keyboard.press('Enter');
		await expect(live(page)).toHaveText('Back to the start.');
		await recovers(page);
		await expect(view(page), 'the focus is on the 3D view').toBeFocused();
		await expect(twenty, 'Reset keeps the visitor\u2019s clock').toHaveAttribute('aria-pressed', 'true');
	});

	test('50 m/s written into the air stops the run, and Restart from the keyboard runs the same setup again', async ({ page, browserName }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openOnWorker(page);
		await runAway(page, 'too-fast');
		expect(await tabTo(page, browserName, 'Restart'), 'Restart is the second stop').toBe(2);
		await page.keyboard.press('Enter');
		await expect(live(page)).toHaveText('Restarted. The air is still and the smoke is gone.');
		await recovers(page);
		await expect(view(page)).toBeFocused();
	});

	for (const size of [
		{ width: 768, height: 1024 },
		{ width: 390, height: 844 }
	])
		test(`at ${size.width} px the notice fits the window, its buttons are 44 px, and a tap on Reset recovers`, async ({ page, browserName }) => {
			await page.setViewportSize(size);
			await openOnWorker(page);
			await runAway(page, size.width < 700 ? 'too-fast' : 'non-finite');
			await checkLayout(page);
			if (SHOTS) await page.screenshot({ path: `${SHOTS}/runaway-${browserName}-${size.width}.png` });
			await notice(page).getByRole('button', { name: 'Reset' }).click();
			await recovers(page);
		});
});
