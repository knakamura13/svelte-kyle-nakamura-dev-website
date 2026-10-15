import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dockGroup, focusRing, live, openAirflow, status } from './dock';
import { OPENING_LIMITS } from '../src/lib/experiments/airflow/homes/types';
import { planById } from '../src/lib/experiments/airflow/homes/plans';

/**
 * The Physics group of the Dock and the explainer under it. The panel is read the way a visitor reads it: opened by keyboard, then
 * watched while the simulation runs on the processor in a worker (the page with `navigator.gpu` removed, so every browser runs the same
 * path and the numbers can be waited for), with smoke released by holding the pointer on the Stage. Which numbers it shows is decided,
 * and tested, in tests/solver/physics-panel.spec.ts; what is checked here is that the page shows them, in the visitor's unit system, in
 * a form that can be read at every width.
 */

const panel = (page: Page) => page.locator('#dock-physics');
const reading = (page: Page, key: string) => panel(page).locator(`[data-reading="${key}"] dd`);
const verdict = (page: Page) => panel(page).locator('[data-verdict]');
const table = (page: Page) => page.getByRole('table', { name: 'Room averages' });

/** The simulation on the processor, as Firefox and many phones run it, whichever browser this is. */
const withoutWebGpu = (page: Page) => page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));

/** Errors the page throws or logs. A browser with no WebGPU says so as a warning, so an error of any kind is a fault. */
function collectErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

/** Seconds in a clock reading such as "0:07", "12:03" or "1:02:03". */
const seconds = (clock: string) => clock.split(':').reduce((total, part) => total * 60 + Number(part), 0);

/** Opens the page with the simulation running, and the Physics group open and in view. */
async function openPhysics(page: Page) {
	await openAirflow(page);
	await expect(status(page)).toHaveAttribute('data-status', 'running', { timeout: 60_000 });
	const group = await dockGroup(page, 'Physics');
	await group.locator('summary').scrollIntoViewIfNeeded();
	return group;
}

/** Holds the pointer still on the home until smoke is released into it (a hold releases smoke where it is), trying a few places in case one is furniture. */
async function releaseSmoke(page: Page) {
	const box = (await page.getByRole('application', { name: /^The air in the/ }).boundingBox())!;
	for (const [x, y] of [
		[0.5, 0.55],
		[0.42, 0.5],
		[0.58, 0.5],
		[0.4, 0.62],
		[0.6, 0.62],
		[0.5, 0.45]
	]) {
		await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
		await page.mouse.down();
		await page.waitForTimeout(1600);
		await page.mouse.up();
		const released = await expect
			.poll(async () => (await reading(page, 'emitted').innerText()) !== '0 mg', { timeout: 2500 })
			.toBe(true)
			.then(() => true, () => false);
		if (released) return;
	}
	throw new Error('No place on the home took smoke.');
}

test.describe('the Physics group of the Dock', () => {
	test.use({ locale: 'en-GB' });

	test.describe('as a disclosure', () => {
		test.beforeEach(async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
		});

		test('is closed to begin with, opens and closes with Enter and Space on its title, and shows a focus ring there', async ({ page, browserName }) => {
			await openAirflow(page);
			const group = panel(page);
			const summary = group.locator('summary');
			await expect(group).not.toHaveAttribute('open', '');
			await expect(table(page), 'closed, the panel is not on the page').toBeHidden();
			await expect(summary).toContainText('Physics');
			await summary.scrollIntoViewIfNeeded();
			await summary.focus();
			expect(await focusRing(page), 'the group title shows where it is').toBe(true);
			await page.keyboard.press('Enter');
			await expect(group).toHaveAttribute('open', '');
			await expect(table(page)).toBeVisible();
			await page.keyboard.press('Space');
			await expect(group).not.toHaveAttribute('open', '');
			await expect(table(page)).toBeHidden();
			await page.keyboard.press('Enter');
			await expect(group).toHaveAttribute('open', '');
			// The panel is text, so a keyboard has nothing in it to stop at: the next stop after the group's title is past the panel.
			await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
			expect(await page.evaluate(() => !!document.activeElement?.closest('#dock-physics')), 'nothing inside the panel takes focus').toBe(false);
		});

		test('exposes whether it is open to assistive technology (the browser’s own accessibility tree)', async ({ page, browserName }) => {
			test.skip(browserName !== 'chromium', 'Only Chromium lets a test read its accessibility tree.');
			await openAirflow(page);
			const client = await page.context().newCDPSession(page);
			await client.send('Accessibility.enable');
			const expanded = async () => {
				const { nodes } = (await client.send('Accessibility.getFullAXTree')) as { nodes: { role?: { value: string }; name?: { value: string }; properties?: { name: string; value: { value: unknown } }[] }[] };
				const summary = nodes.find((node) => node.role?.value === 'DisclosureTriangle' && /^Physics/.test(node.name?.value ?? ''));
				expect(summary, 'the group title is a disclosure in the accessibility tree').toBeTruthy();
				return summary!.properties?.find((property) => property.name === 'expanded')?.value.value;
			};
			expect(await expanded(), 'closed').toBe(false);
			await panel(page).locator('summary').focus();
			await page.keyboard.press('Enter');
			await expect(panel(page)).toHaveAttribute('open', '');
			expect(await expanded(), 'open').toBe(true);
		});
	});

	test.describe('while the simulation runs on the processor', () => {
		test.beforeEach(async ({ page }) => {
			test.setTimeout(150_000);
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await withoutWebGpu(page);
			await page.setViewportSize({ width: 1280, height: 900 });
		});

		test('shows the solver: simulated time moving on, the speed, the grid and its cell size, the backend and the fastest air', async ({ page }) => {
			const errors = collectErrors(page);
			await openPhysics(page);
			await expect(reading(page, 'time')).toHaveText(/^\d+:\d\d$/);
			const first = seconds(await reading(page, 'time').innerText());
			await expect(reading(page, 'backend')).toHaveText('Processor reduced detail');
			await expect(reading(page, 'speed')).toHaveText(/^\d+(\.\d+)?× real time$/);
			await expect(reading(page, 'cells')).toHaveText(/^[\d,]{5,} cells$/);
			await expect(reading(page, 'size'), 'the processor’s grid is 0.2 m').toHaveText('0.20 m');
			await expect(reading(page, 'fastest')).toHaveText(/^\d+(\.\d+)?\sm\/s$/);
			await expect(reading(page, 'divergence')).toHaveText(/^(<\s)?[\d.]+\s%$/);
			// The same grid the line under the Stage names.
			const cells = (await reading(page, 'cells').innerText()).replace(' cells', '');
			await expect(status(page)).toContainText(`${cells} cells, each 0.20 m across`);
			// It updates while it runs: the clock is ahead a few seconds on.
			await expect.poll(async () => seconds(await reading(page, 'time').innerText()), { timeout: 20_000 }).toBeGreaterThanOrEqual(first + 3);
			expect(errors).toEqual([]);
		});

		test('has a Room averages table with a row for each Room of the Home, named in the plan, with a value in every cell once the first averages arrive', async ({ page }) => {
			await openPhysics(page);
			const rooms = planById('two-bedroom')!.rooms;
			const rows = table(page).getByRole('row');
			await expect(rows, 'a header row and a row for each Room').toHaveCount(rooms.length + 1);
			await expect(table(page).getByRole('columnheader')).toHaveText(['Room', 'Volume', 'Speed', 'Temperature', 'PM2.5', 'Air changes per hour']);
			await expect(table(page).getByRole('rowheader')).toHaveText(rooms.map((room) => room.name));
			// Metric: m³, m/s, °C and a smoke figure in both units, and air changes per hour.
			for (const room of rooms) {
				const row = table(page).getByRole('row', { name: new RegExp(`^${room.name}`) });
				await expect(row.getByRole('cell')).toHaveText([/^\d+\sm³$/, /^\d+(\.\d+)?\sm\/s$/, /^−?\d+\.\d\s°C$/, /^(<\s)?[\d.]+\sppm\s\((<\s)?[\d.]+\sµg\/m³\)$/, /^[\d.]+\sACH$/], { timeout: 30_000 });
			}
			// Another Home, another set of Rooms.
			await page.getByRole('radio', { name: 'Studio' }).check();
			const studio = planById('studio')!.rooms;
			await expect(rows).toHaveCount(studio.length + 1);
			await expect(table(page).getByRole('rowheader')).toHaveText(studio.map((room) => room.name));
			await expect(table(page).getByRole('row', { name: /^Kitchen/ }).getByRole('cell').first()).toHaveText(/^\d+\sm³$/, { timeout: 30_000 });
		});

		test('says there is no smoke yet, then that the books balance once smoke is released, with the terms of the books beside it; Restart starts the books again', async ({ page }) => {
			const errors = collectErrors(page);
			await openPhysics(page);
			await expect(verdict(page)).toHaveAttribute('data-state', 'waiting');
			await expect(verdict(page)).toHaveText('No smoke yet, so there is nothing to balance.');
			for (const key of ['initial', 'emitted', 'inflow', 'inAir', 'outflow', 'removed', 'deposited']) await expect(reading(page, key), key).toHaveText('0 mg');

			await releaseSmoke(page);
			await expect(verdict(page)).toHaveAttribute('data-state', 'balanced', { timeout: 15_000 });
			await expect(verdict(page)).toHaveText(/^\s*The books balance to (better than )?[\d.]+\s%\.\s*$/);
			await expect(reading(page, 'emitted')).toHaveText(/^0\.0\d+ mg$/);
			await expect(reading(page, 'inAir'), 'the smoke is in the air').toHaveText(/^0\.0\d+ mg$/);
			// What the books say is the number: the error they report is well inside the tolerance, 0.1 %.
			const said = (await verdict(page).innerText()).match(/([\d.]+)\s%/);
			if (said) expect(Number(said[1])).toBeLessThan(0.1);

			// Starting over starts the books over, and says only that.
			await page.getByRole('button', { name: 'Restart' }).scrollIntoViewIfNeeded();
			await page.getByRole('button', { name: 'Restart' }).click();
			await expect(verdict(page)).toHaveAttribute('data-state', 'waiting', { timeout: 15_000 });
			await expect(reading(page, 'emitted')).toHaveText('0 mg');
			await expect(live(page)).toHaveText(/^Restarted\./);
			expect(errors).toEqual([]);
		});

		test('does not make its numbers a live region, so a screen reader is not told them as they change, and says nothing on its own while the books balance', async ({ page }) => {
			await openPhysics(page);
			expect(await panel(page).evaluate((el) => !el.closest('[aria-live]') && !el.querySelector('[aria-live]') && !el.closest('[role="status"], [role="alert"]')), 'no live region in or around the panel').toBe(true);
			const before = await live(page).innerText();
			const clock = await reading(page, 'time').innerText();
			await page.waitForTimeout(4000);
			expect(await reading(page, 'time').innerText(), 'the numbers did change').not.toBe(clock);
			expect(await live(page).innerText(), 'and nothing was announced').toBe(before);
		});

	});

	test.describe('while it is paused', () => {
		test.beforeEach(async ({ page }) => {
			test.setTimeout(90_000);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await withoutWebGpu(page);
			await page.setViewportSize({ width: 1280, height: 900 });
		});

		test('shows the first reading of the Home and holds it: the clock at nothing, the speed paused, every Room measured once', async ({ page }) => {
			await openAirflow(page);
			await expect(status(page)).toHaveAttribute('data-status', 'paused', { timeout: 60_000 });
			const group = await dockGroup(page, 'Physics');
			await group.locator('summary').scrollIntoViewIfNeeded();
			await expect(reading(page, 'time')).toHaveText('0:00');
			await expect(reading(page, 'speed')).toHaveText('Paused');
			await expect(reading(page, 'backend')).toHaveText('Processor reduced detail');
			await expect(reading(page, 'fastest'), 'nothing has moved, so there is no fastest air to give').toHaveText('—');
			await expect(verdict(page)).toHaveAttribute('data-state', 'waiting');
			const living = table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell');
			await expect(living.first()).toHaveText(/^\d+\sm³$/, { timeout: 30_000 });
			// A paused page reads the Rooms once. It does not go on reading them.
			const held = await table(page).innerText();
			await page.waitForTimeout(2500);
			expect(await table(page).innerText()).toBe(held);
			expect(await reading(page, 'time').innerText()).toBe('0:00');
		});

		test('lays the Room averages out as a table where there is room for one and as a card for each Room in a narrow Dock, with no sideways scroll or overflow at any width', async ({ page }) => {
			test.setTimeout(150_000);
			await openAirflow(page);
			await expect(status(page)).toHaveAttribute('data-status', 'paused', { timeout: 60_000 });
			const group = await dockGroup(page, 'Physics');
			await group.locator('summary').scrollIntoViewIfNeeded();
			await expect(table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell').first()).toHaveText(/^\d+\sm³$/, { timeout: 30_000 });
			const measure = () =>
				page.evaluate(() => {
					const card = document.querySelector('.airflow-card')!.getBoundingClientRect();
					const outside = [...document.querySelectorAll('#dock-physics *')]
						.filter((el) => {
							const box = el.getBoundingClientRect();
							return box.width > 0 && (box.left < card.left - 1 || box.right > card.right + 1);
						})
						.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
					return {
						pageFits: document.documentElement.scrollWidth <= innerWidth,
						outside,
						display: getComputedStyle(document.querySelector('#dock-physics table')!).display,
						panel: Math.round(document.querySelector('#dock-physics .physics')!.getBoundingClientRect().width)
					};
				});
			for (const width of [320, 360, 390, 700, 1000, 1159, 1160, 1280, 1600]) {
				await page.setViewportSize({ width, height: 900 });
				await expect(table(page)).toBeVisible();
				const now = await measure();
				expect(now.pageFits, `${width}px wide: the page does not scroll sideways`).toBe(true);
				expect(now.outside, `${width}px wide: nothing in the panel sticks out of its card`).toEqual([]);
				// A Dock column beside the Stage, or a phone, is narrow; under the Stage on a tablet or a small laptop it is wide.
				expect(now.display, `${width}px wide, ${now.panel}px of panel`).toBe(now.panel >= 460 ? 'table' : 'block');
			}
			// Whatever the layout, every Room is named and every value is there to read: the cards read as text the same as the table does.
			await page.setViewportSize({ width: 390, height: 900 });
			const rooms = planById('two-bedroom')!.rooms.map((room) => room.name);
			await expect(table(page).getByRole('rowheader')).toHaveText(rooms);
			await expect(table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell')).toHaveCount(5);
			for (const room of rooms) await expect(table(page).getByRole('rowheader', { name: room, exact: true })).toBeVisible();
		});
	});

	test.describe('in a browser that cannot run the simulation', () => {
		test('says so, shows no number it does not have, and still names every Room', async ({ page }) => {
			test.setTimeout(90_000);
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await withoutWebGpu(page);
			// Neither WebGPU nor a Web Worker: the page keeps showing the Home and says that it cannot run.
			await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }));
			const errors = collectErrors(page);
			await openAirflow(page);
			await expect(status(page)).toHaveAttribute('data-status', 'unsupported', { timeout: 30_000 });
			const group = await dockGroup(page, 'Physics');
			await group.locator('summary').scrollIntoViewIfNeeded();
			await expect(group).toContainText('cannot run the simulation');
			for (const key of ['time', 'speed', 'cells', 'size', 'backend', 'fastest', 'divergence']) await expect(reading(page, key), key).toHaveText('—');
			await expect(verdict(page)).toHaveAttribute('data-state', 'waiting');
			await expect(table(page).getByRole('rowheader')).toHaveText(planById('two-bedroom')!.rooms.map((room) => room.name));
			await expect(table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell')).toHaveText(['—', '—', '—', '—', '—']);
			expect(errors, 'a browser that cannot run it is not a fault').toEqual([]);
		});
	});

	test.describe('in the visitor’s own units', () => {
		test.beforeEach(async ({ page }) => {
			test.setTimeout(90_000);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await withoutWebGpu(page);
			await page.setViewportSize({ width: 1280, height: 900 });
		});

		test.describe('a British locale reads metric', () => {
			test.use({ locale: 'en-GB' });
			test('the cell size in metres, the Rooms in cubic metres, metres a second and degrees Celsius', async ({ page }) => {
				await openAirflow(page);
				const group = await dockGroup(page, 'Physics');
				await group.locator('summary').scrollIntoViewIfNeeded();
				await expect(reading(page, 'size')).toHaveText('0.20 m');
				const cells = table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell');
				await expect(cells).toHaveText([/\sm³$/, /m\/s$/, /°C$/, /ppm\s\(.*\sµg\/m³\)$/, /ACH$/], { timeout: 30_000 });
			});
		});

		test.describe('an American locale reads imperial', () => {
			test.use({ locale: 'en-US' });
			test('the cell size in inches, the Rooms in cubic feet, miles an hour and degrees Fahrenheit, and the smoke and the air changes as they were', async ({ page }) => {
				await openAirflow(page);
				const group = await dockGroup(page, 'Physics');
				await group.locator('summary').scrollIntoViewIfNeeded();
				await expect(reading(page, 'size')).toHaveText('8 in');
				const cells = table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell');
				await expect(cells).toHaveText([/\scu\sft$/, /mph$/, /°F$/, /ppm\s\(.*\sµg\/m³\)$/, /ACH$/], { timeout: 30_000 });
				await expect(status(page)).toContainText('each 8 in across');
			});
		});
	});

	test.describe('for assistive technology and the eye', () => {
		test.beforeEach(async ({ page }) => {
			test.setTimeout(120_000);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await withoutWebGpu(page);
		});

		test('has no WCAG 2.1 A/AA violations that axe can detect, at desktop and phone widths and where the Rooms are a table', async ({ page }) => {
			for (const width of [1440, 1000, 390]) {
				await page.setViewportSize({ width, height: 900 });
				await openAirflow(page);
				await expect(status(page)).toHaveAttribute('data-status', /^(paused|running)$/, { timeout: 60_000 });
				const group = await dockGroup(page, 'Physics');
				await group.locator('summary').scrollIntoViewIfNeeded();
				await expect(table(page).getByRole('row', { name: /^Living room/ }).getByRole('cell').first()).toHaveText(/m³$/, { timeout: 30_000 });
				const { violations } = await new AxeBuilder({ page }).include('#dock-physics').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
				expect(
					violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
					`${width}px wide`
				).toEqual([]);
			}
		});
	});
});

test.describe('the explainer on the page', () => {
	test.beforeEach(async ({ page }) => {
		// Reduced motion keeps the sections from waiting, faded out, for the visitor to scroll to them.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await withoutWebGpu(page);
	});

	test('is part of the page, after the card with the Stage and before the closing links, with its three sections and the line that it is not advice', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		await expect(page.getByRole('heading', { level: 2, name: /^How it\s*works\.$/ })).toBeAttached();
		await expect(page.getByRole('heading', { level: 2, name: /^What it\s*isn[’']t\.$/ })).toBeAttached();
		await expect(page.getByRole('heading', { level: 2, name: 'Sources.' })).toBeAttached();
		await expect(page.getByText('It is not engineering or health advice.')).toBeAttached();
		const places = await page.evaluate(() => {
			const top = (el: Element) => el.getBoundingClientRect().top + scrollY;
			const sections = [...document.querySelectorAll('article.airflow > section.experiment-close')];
			return { card: top(document.querySelector('.airflow-card')!) + document.querySelector('.airflow-card')!.getBoundingClientRect().height, sections: sections.map(top), end: top(document.querySelector('.case-end')!) };
		});
		expect(places.sections, 'three sections').toHaveLength(3);
		expect(places.sections[0], 'after the card').toBeGreaterThanOrEqual(places.card - 1);
		expect(places.sections[2], 'before the closing links').toBeLessThan(places.end);
	});

	test('says what is true of this page: the processor runs it where there is no WebGPU, the casement opens about 80 %, and the books agree to 0.1 %', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		const text = await page.locator('article.airflow > section.experiment-close').allInnerTexts().then((all) => all.join('\n').replace(/\s+/g, ' '));
		// The fallback that the page really has: this browser has no WebGPU here, and the line under the Stage says where it runs.
		expect(text).toMatch(/otherwise it still runs\. The same algorithm runs on the processor in a worker at a coarser grid, and the page says so when it does/);
		await expect(status(page)).toContainText('on the processor at reduced detail', { timeout: 60_000 });
		// The casement limit, from the limit the Homes are held to.
		expect(text).toMatch(new RegExp(`about ${Math.round(OPENING_LIMITS.casement.maxOpen * 100)} % for a casement`));
		expect(text).toMatch(new RegExp(`a single casement sash at about ${Math.round(OPENING_LIMITS.casement.maxOpen * 100)} %`));
		// The cell size is the Physics panel's to say, so the explainer does not give a number that the page can contradict.
		expect(text).toContain('the Physics panel says the size in use');
		expect(text).not.toMatch(/5 to 10 cm/);
		// The tolerance of the Physics panel's verdict: tests/solver/physics-panel.spec.ts pins it to the constant.
		expect(text).toContain('The two sides agree to within 0.1 %');
	});

	test('has no WCAG 2.1 A/AA violations that axe can detect, at desktop and phone widths', async ({ page }) => {
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			const { violations } = await new AxeBuilder({ page }).include('article.airflow > section.experiment-close').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
			expect(
				violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
				`${width}px wide`
			).toEqual([]);
		}
	});
});
