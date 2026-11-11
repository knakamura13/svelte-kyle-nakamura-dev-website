import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { requireWebGL2 } from './webgl';

/**
 * The accessibility sweep of the Airflow page (#98): axe with the WCAG 2.1 A and AA rules runs in each main state, one after another in
 * one page: loading, running, paused, an overlay with its legend, Build, the Inspector on a fan and on the home, a window's menu, the
 * Probe tool, a probe pinned and its menu, smoke releasing, the weather open, the Home and Scenario pickers, Advanced, About, a fan carried,
 * and a runaway notice (#59, which has no state of its own in #62's first part). Chromium runs it at 1440, 768 and 390 px; Firefox and WebKit
 * at 1440 px. The grid is pinned at the coarsest cell and the camera is on the Home's default view, as the HUD specs pin them.
 *
 * A violation fails the spec with the state it is in, its rule and its element. Nothing is allowed through. Each scan first waits for the
 * page's animations to finish, so that a panel still fading in is not measured at half its opacity.
 */

/** Each wait and each action fails in 30 s and names its step, so a control a visitor could not reach fails the spec in seconds, not at the test's own timeout. */
const STEP_MS = 30_000;
const expect = baseExpect.configure({ timeout: STEP_MS });

const HUD = '/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10';
const twoBedroom = plans.find((plan) => plan.id === 'two-bedroom')!;
const boxFan = DEVICE_MODELS.find((model) => model.kind === 'box-fan')!;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const WIDTHS = [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 390, height: 844 }
] as const;

interface Scan {
	state: string;
	ms: number;
	violations: string[];
	/** The lowest colour-contrast ratio axe measured among the elements that passed, with the element and its colours. */
	lowestContrast?: string;
}

/** The test hook the watched worker exposes; typed here, not globally, so it does not clash with tests/airflow-runaway.spec.ts. */
type RunawayHook = { workers: number; inject(): Promise<void> };
const runawayHook = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as { airflowRunaway: RunawayHook }).airflowRunaway.inject()
	);

const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const phoneWidth = (width: number) => width < 700;

/**
 * The page's worker, as the runaway spec wraps it: `navigator.gpu` is taken away so the CPU solver runs in its Web Worker, and the worker is
 * handed 50 m/s air, which is past the 40 m/s the guard allows. Copied from tests/airflow-runaway.spec.ts, which runs the same protocol.
 */
async function watchWorkers(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
		type Message = { type?: string; id?: number; fields?: { u: Float32Array } };
		const Native = window.Worker;
		const send = Native.prototype.postMessage as (
			this: Worker,
			message: unknown,
			transfer?: Transferable[] | StructuredSerializeOptions
		) => void;
		const all: Watched[] = [];
		class Watched extends Native {
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
			async inject() {
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
				fields.u.fill(50);
				send.call(worker, { type: 'writeFields', fields });
				worker.written = true;
			}
		};
	});
}

/**
 * Waits until no animation or transition on the page is running. The HUD fades its panels in (`hud-in`, 360 ms), and axe reads the colour
 * under the text at the instant it looks, so a scan in the middle of a fade measures a ratio no visitor sees once the panel has settled.
 */
async function settle(page: Page) {
	await page.evaluate(async () => {
		const deadline = performance.now() + 5000;
		// Looping animations (a pulse) never finish and a paused one waits for a play: only a finite, running animation is waited for.
		const pending = () =>
			document
				.getAnimations()
				.filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
		while (pending().length > 0 && performance.now() < deadline)
			await new Promise((resolve) => setTimeout(resolve, 50));
	});
}

/** Runs axe in the current state and records it. Its time is kept for the report. */
async function scan(page: Page, state: string, found: Scan[]) {
	await settle(page);
	const started = Date.now();
	const { violations, passes } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	// A colour-contrast finding is logged with axe's measured ratio, for notes/98.md.
	for (const v of violations)
		if (v.id === 'color-contrast')
			for (const n of v.nodes)
				console.log(
					`contrast | ${state} | ${n.target.join(' ')} | ${n.any.map((c) => `${c.data?.contrastRatio}:1 expected ${c.data?.expectedContrastRatio} ${c.data?.fgColor ?? ''} on ${c.data?.bgColor ?? ''}`).join('; ')}`
				);
	const ratios = (passes.find((p) => p.id === 'color-contrast')?.nodes ?? []).flatMap((n) =>
		n.any
			.filter((c) => typeof c.data?.contrastRatio === 'number')
			.map((c) => ({
				ratio: c.data.contrastRatio as number,
				target: n.target.join(' '),
				fg: c.data.fgColor,
				bg: c.data.bgColor
			}))
	);
	const lowest = ratios.sort((a, b) => a.ratio - b.ratio)[0];
	found.push({
		state,
		ms: Date.now() - started,
		lowestContrast: lowest
			? `${lowest.ratio}:1 at ${lowest.target} (${lowest.fg} on ${lowest.bg})`
			: undefined,
		violations: violations.flatMap((v) => v.nodes.map((n) => `${v.id} at ${n.target.join(' ')}`))
	});
}

/**
 * Picks the Build tool with the key 2. On a phone the View sheet, opened for the overlays, is closed first by choosing Select on the toolbar,
 * as tests/airflow-phone.spec.ts does before it opens another sheet.
 */
async function pickBuild(page: Page, phone: boolean) {
	if (phone) {
		const tools = page.getByRole('toolbar', { name: 'Tools' });
		await tools.locator('[data-tool="select"]').click();
		await tools.locator('[data-tool="build"]').click();
	} else await page.keyboard.press('2');
}

/** On a phone the walls, the Inspector, About and Advanced are in the View sheet's full height: the toolbar's View opens it, and its grip shows all of it. */
async function openViewInFull(page: Page) {
	await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'View' }).click();
	await page.getByRole('button', { name: 'Show all of View' }).click();
}

/** Moves the mouse over the world until the HUD says a window is under it, and returns that point. */
async function pointAtWindow(page: Page) {
	const box = (await view(page).boundingBox())!;
	for (let fy = 0.2; fy <= 0.86; fy += 0.03)
		for (let fx = 0.15; fx <= 0.9; fx += 0.025) {
			const x = box.x + box.width * fx;
			const y = box.y + box.height * fy;
			await page.mouse.move(x, y);
			const hovered = (await page.locator('.hud').getAttribute('data-hovered')) ?? '';
			if (hovered.startsWith('opening:') && /window/.test(hovered)) return { x, y };
		}
	throw new Error('No window under the pointer anywhere on the Stage.');
}

/**
 * One visit through the states, in one page. Each state is scanned where the visitor would see it, and the order keeps every state reachable
 * from the one before: the overlay is turned off before Build, the fan placed before the Inspector opens on it, and the menus closed before the next.
 */
async function sweep(page: Page, width: number, found: Scan[]) {
	const phone = phoneWidth(width);
	const status = page.locator('.sim-status');
	const closeWith = (key = 'Escape') => page.keyboard.press(key);

	// Loading: the page's first frame, before the engine has taken the Stage.
	await page.goto(HUD, { waitUntil: 'domcontentloaded' });
	await scan(
		page,
		`loading (${
			(await view(page)
				.getAttribute('data-state')
				.catch(() => null)) ?? 'no stage yet'
		})`,
		found
	);
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 90_000 });
	await expect(status).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 90_000 });
	if ((await status.getAttribute('data-status')) === 'paused') await page.keyboard.press('p');
	await expect(status).toHaveAttribute('data-status', 'running');
	await scan(page, 'running', found);

	// Paused, then running again.
	await page.keyboard.press('p');
	await expect(status).toHaveAttribute('data-status', 'paused');
	await scan(page, 'paused', found);
	await page.keyboard.press('p');
	await expect(status).toHaveAttribute('data-status', 'running');

	// Build: the catalog open.
	await pickBuild(page, phone);
	await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
	await scan(page, 'Build', found);

	// The Inspector on a fan: the fan is placed from its card (Enter), which selects it, and the Inspector opens on it.
	await page.locator(`.card[data-model="${boxFan.id}"]`).focus();
	await page.keyboard.press('Enter');
	// The count is "1 of 6 placed" on a desktop and "1/of6placed" in a phone's text, where a separator stands between the words.
	await expect(page.getByRole('region', { name: 'Build' })).toContainText(/1\W*of\W*6\W*placed/);
	// On a phone the Inspector's button is in the View sheet, below the fold of its peek: Select comes first (as in tests/airflow-phone.spec.ts,
	// so the Build sheet gives way), the toolbar's View opens the sheet, and its grip shows all of it.
	if (phone) {
		await page.getByRole('toolbar', { name: 'Tools' }).locator('[data-tool="select"]').click();
		await openViewInFull(page);
	}
	await page
		.getByRole('button', { name: 'Inspector', exact: true })
		.first()
		.click({ timeout: 10_000 });
	await expect(page.getByRole('region', { name: boxFan.name })).toBeVisible();
	await scan(page, 'Inspector on a fan', found);

	// The Inspector on the home: its list of everything in the home.
	await page.getByRole('button', { name: 'Back to everything in the home' }).click();
	await expect(page.getByRole('region', { name: twoBedroom.name })).toBeVisible();
	await scan(page, 'Inspector on the home', found);
	// On a phone the Inspector is a sheet that covers the probe cards and the window menu, so the visitor closes it with its button.
	if (phone) await page.getByRole('button', { name: 'Close the Inspector' }).click();

	// A window's menu, opened by a click on the window in the world.
	const at = await pointAtWindow(page);
	await page.mouse.click(at.x, at.y);
	await expect(page.getByRole('dialog').first()).toBeVisible();
	await scan(page, "a window's menu", found);
	await closeWith('Escape');

	// The Probe tool, then a probe pinned from the keyboard, then its menu.
	await page.keyboard.press('3');
	await expect(page.locator('.hud')).toHaveAttribute('data-tool', 'probe');
	await scan(page, 'the Probe tool', found);
	if (phone) {
		// The panel's "Pin from the keyboard" button is not in a phone's peek, so the 3D view is focused directly and Enter pins at its cursor.
		await view(page).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByText('Probe 1 pinned.')).toHaveCount(1);
		// The Probe tool's sheet covers the probe cards on a phone, so the visitor goes back to Select to read and open them.
		await page.getByRole('toolbar', { name: 'Tools' }).locator('[data-tool="select"]').click();
	} else {
		await page.locator('.panel .btn').first().focus();
		await page.keyboard.press('Enter');
		await expect(view(page)).toBeFocused();
		await page.keyboard.press('Enter');
	}
	await expect(page.getByRole('list', { name: 'Probes' }).getByRole('listitem')).toHaveCount(1);
	await scan(page, 'a probe pinned', found);
	await page.getByRole('button', { name: /: open its menu$/ }).click();
	await scan(page, 'a probe pinned and its menu', found);
	await closeWith('Escape');

	// Smoke releasing from the Smoke tool: Enter starts it and Enter stops it.
	await view(page).focus();
	await page.keyboard.press('4');
	await page.keyboard.press('Enter');
	const releasing = page.locator('.hud [role="status"][data-releasing]');
	await expect(releasing).toBeVisible();
	await scan(page, 'smoke releasing', found);
	await page.keyboard.press('Enter');
	await expect(releasing).toHaveCount(0);

	// The weather open: its details, which list the wind and the outdoor air.
	await page.keyboard.press('1');
	if (phone) {
		// On a phone the weather is a pill that opens a sheet, as tests/airflow-phone.spec.ts opens it.
		await page.getByRole('button', { name: /^Weather:/ }).click();
		await expect(page.getByRole('dialog', { name: 'Weather' })).toBeVisible();
	} else {
		await page.getByRole('button', { name: 'Weather details' }).first().click();
		await expect(
			page.locator('#hud-weather-details').or(page.locator('.weather-sheet')).first()
		).toBeVisible();
	}
	await scan(page, 'the weather open', found);
	await closeWith('Escape');

	// The Home picker and the Scenario picker.
	await page.getByRole('button', { name: /^Home:/ }).click();
	await expect(page.locator('#hud-homes')).toBeVisible();
	await scan(page, 'the Home picker', found);
	await closeWith('Escape');
	await page.locator('button[aria-label^="Scenario:"]').click();
	await expect(page.locator('#hud-scenarios')).toBeVisible();
	await scan(page, 'the Scenario picker', found);
	await closeWith('Escape');

	// Advanced, then About. Escape closes Advanced; About closes itself.
	if (phone) await openViewInFull(page);
	await page.getByRole('button', { name: 'Advanced', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Advanced' })).toBeVisible();
	await scan(page, 'Advanced', found);
	await closeWith('Escape');
	if (phone) await openViewInFull(page);
	await page.getByRole('button', { name: 'About this simulation' }).click();
	const about = page.getByRole('dialog', { name: 'Airflow, room by room.' });
	await expect(about).toBeVisible();
	await scan(page, 'About', found);
	await closeWith('Escape');
	await expect(about).toHaveCount(0);

	// A fan carried from its card over the world: it shows while the mouse is held, then Escape puts it back.
	await pickBuild(page, phone);
	await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
	const card = (await page.locator(`.card[data-model="${boxFan.id}"]`).boundingBox())!;
	const stage = (await view(page).boundingBox())!;
	await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
	await page.mouse.down();
	await page.mouse.move(card.x + card.width + 60, card.y + 40, { steps: 5 });
	await page.mouse.move(stage.x + stage.width * 0.52, stage.y + stage.height * 0.55, { steps: 8 });
	await expect(page.locator('.carry')).toBeVisible();
	await scan(page, 'a fan carried', found);
	await page.mouse.up();
	await closeWith('Escape');
	await expect(page.locator('.carry')).toHaveCount(0);

	// An overlay with its legend, last: the View sheet opens for the overlays on a phone, so it comes after the Build states. Air speed, then Off.
	if (phone) await page.getByRole('button', { name: 'View' }).click();
	const overlay = page.getByRole('group', { name: 'Overlay' });
	await overlay.getByRole('button', { name: /Air speed/ }).click();
	await expect(page.getByRole('group', { name: 'Legend: Air speed' })).toBeVisible();
	await scan(page, 'overlay with its legend', found);
	await overlay.getByRole('button', { name: /Off/ }).click();
}

/** The runaway notice (#59): a run is stopped by air past 40 m/s on the CPU worker, and the notice says why. */
async function runawayNotice(page: Page, found: Scan[]) {
	await watchWorkers(page);
	await page.goto(HUD);
	await expect(view(page)).toHaveAttribute('data-state', /^(live|unsupported)$/, {
		timeout: 90_000
	});
	// As tests/airflow-runaway.spec.ts opens it: on the worker, running, before the air is written.
	await expect(page.locator('.sim-status')).toHaveAttribute('data-status', /^(running|paused)$/, {
		timeout: 90_000
	});
	await expect(page.locator('.sim-status')).toContainText('the processor');
	await runawayHook(page);
	await expect(page.getByRole('group', { name: 'The simulation ran away' })).toBeVisible({
		timeout: 30_000
	});
	await scan(page, 'the runaway notice', found);
}

for (const { width, height } of WIDTHS)
	test.describe(`at ${width} by ${height}`, { tag: '@slow' }, () => {
		test.use({ viewport: { width, height }, locale: 'en-US', actionTimeout: STEP_MS });

		test('axe finds no WCAG 2.1 A/AA violation in the states of the Airflow page', async ({
			page,
			browserName
		}) => {
			// Chromium runs every width. Firefox and WebKit run the desktop width, to keep to the time the sweep takes.
			test.skip(
				browserName !== 'chromium' && width !== 1440,
				'Firefox and WebKit are swept at 1440 px.'
			);
			// The sweep takes about 1.5 minutes here. CI runs one worker on software rendering at about 2 fps, which the waits for the stage
			// and the runaway notice feel most, so the test has 12 minutes. Each step has its own 30 s limit, so a hang fails sooner.
			test.setTimeout(720_000);
			// A browser without WebGL 2 (Firefox on CI) has no world to sweep: the stage says it is unsupported.
			await requireWebGL2(page);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			const found: Scan[] = [];
			await sweep(page, width, found);
			const total = found.reduce((sum, s) => sum + s.ms, 0);
			test.info().annotations.push({
				type: 'axe',
				description: `${found.length} states, ${(total / 1000).toFixed(1)} s in axe`
			});
			await test.info().attach('axe-states.json', {
				body: JSON.stringify(found, null, 2),
				contentType: 'application/json'
			});
			const failing = found
				.filter((s) => s.violations.length > 0)
				.map((s) => `${s.state}: ${s.violations.join(' | ')}`);
			expect(failing, 'the states with a violation').toEqual([]);

			// The runaway notice, in a page of its own, on the CPU worker.
			const runaway = await page.context().newPage();
			await runaway.emulateMedia({ reducedMotion: 'no-preference' });
			await runaway.setViewportSize({ width, height });
			await runawayNotice(runaway, found);
			await runaway.close();
			const last = found.at(-1)!;
			expect(last.violations, `${last.state}: the notice's violations`).toEqual([]);
			await test
				.info()
				.attach('axe-runaway.json', {
					body: JSON.stringify(last, null, 2),
					contentType: 'application/json'
				});
			expect(found.length, 'the states swept').toBe(19);
		});
	});
