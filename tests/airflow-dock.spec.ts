import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { stubClipboard } from './clipboard';
import { caption, focusRing, focusedName, live, openAirflow } from './dock';
import { DEVICE_MODELS } from '../src/lib/experiments/airflow/devices/catalog';
import { plans } from '../src/lib/experiments/airflow/homes/plans';
import { linkCatalog, setupFromHash } from '../src/lib/experiments/airflow/link';
import { SCENARIOS } from '../src/lib/experiments/airflow/scenarios';

/**
 * The Dock's controls, driven the way a visitor does: the Home and Scenario pickers, Restart, Reset and Copy link, with the
 * Dock's layout and its keyboard order. The simulation is paused (reduced motion), because none of this needs it moving.
 */
const catalog = linkCatalog(plans, DEVICE_MODELS);

test.describe('the Dock', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('sits beside the Stage on a wide screen and under it on a narrow one, keeps every control inside the card, and never scrolls sideways', async ({ page }) => {
		// Nine page loads: on a busy machine that is more than the default half minute.
		test.setTimeout(120_000);
		for (const width of [320, 360, 390, 700, 1000, 1159, 1160, 1280, 1600]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			const stage = (await page.locator('.airflow-figure .stage-view').boundingBox())!;
			const dock = (await page.locator('.airflow-dock').boundingBox())!;
			const card = (await page.locator('.airflow-card').boundingBox())!;
			if (width >= 1160) {
				expect(dock.x, `${width}px wide: the Dock is beside the Stage`).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
				expect(Math.round(dock.x + dock.width), `${width}px wide: and reaches the card's edge`).toBe(Math.round(card.x + card.width));
				expect(dock.width, `${width}px wide: in a column that is wide enough for its controls and not wider than a third or so of the card`).toBeGreaterThanOrEqual(340);
				expect(dock.width).toBeLessThanOrEqual(card.width * 0.4);
			} else {
				expect(dock.y, `${width}px wide: the Dock is under the Stage`).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
				expect(Math.round(dock.width), `${width}px wide: the Dock fills its card`).toBe(Math.round(card.width));
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px wide: no sideways scroll`).toBe(true);
			const outside = await page.evaluate(() => {
				const card = document.querySelector('.airflow-card')!.getBoundingClientRect();
				return [...document.querySelectorAll('.airflow-dock *')]
					.filter((el) => {
						const box = el.getBoundingClientRect();
						return box.width > 0 && (box.left < card.left - 1 || box.right > card.right + 1);
					})
					.map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
			});
			expect(outside, `${width}px wide: nothing in the Dock sticks out of its card`).toEqual([]);
		}
	});

	test('the Stage stays on screen while the Dock is used, so the air can be watched as a control moves: pinned beside the Dock on a wide screen, and above it on a narrow one', async ({ page }) => {
		for (const [width, height] of [
			[1280, 800],
			[1600, 1000],
			[900, 900],
			[390, 844]
		]) {
			await page.setViewportSize({ width, height });
			await openAirflow(page);
			const figure = page.locator('.airflow-figure');
			expect(await figure.evaluate((el) => getComputedStyle(el).position), `${width}px wide: the Stage's figure is pinned`).toBe('sticky');
			// The Dock will be long, so make it long: a control far down it, scrolled into view as a visitor does. The Stage must still be there, whole, with the control on the same screen.
			await page.evaluate(() => {
				const far = document.createElement('button');
				far.textContent = 'A control far down the Dock';
				far.style.cssText = 'margin-top:1800px;min-height:44px;';
				document.querySelector('.airflow-dock')!.append(far);
			});
			const last = page.locator('.airflow-dock').getByRole('button').last();
			// Scrolled until it is just in view at the bottom of the screen, which is as far as using it takes the visitor (beyond the Dock's end is the page's footer, and the Stage leaves with its card).
			await last.evaluate((el) => el.scrollIntoView({ block: 'end' }));
			await page.waitForTimeout(150);
			const view = await page.evaluate(() => {
				const stage = document.querySelector('.airflow-figure .stage-view')!.getBoundingClientRect();
				const button = [...document.querySelectorAll('.airflow-dock button')].pop()!.getBoundingClientRect();
				return { stage: { top: stage.top, bottom: stage.bottom, height: stage.height }, button: { top: button.top, bottom: button.bottom }, inner: innerHeight };
			});
			const where = `${width}x${height}`;
			expect(view.stage.top, `${where}: the Stage is not above the screen`).toBeGreaterThanOrEqual(-1);
			expect(view.stage.bottom, `${where}: or below it`).toBeLessThanOrEqual(view.inner + 1);
			expect(view.stage.height, `${where}: and is big enough to see the home`).toBeGreaterThanOrEqual(240);
			expect(view.button.bottom, `${where}: the Dock's control is on the same screen`).toBeLessThanOrEqual(view.inner + 1);
			if (width < 1160) expect(view.button.top, `${where}: and not hidden behind the Stage`).toBeGreaterThanOrEqual(view.stage.bottom - 1);
		}
	});

	test('every control is at least 44 px tall and wide, at desktop and phone widths', async ({ page }) => {
		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			await page.getByRole('button', { name: 'Copy link' }).click();
			const small = await page.evaluate(() => {
				const found: string[] = [];
				// What a finger meets: buttons, group headers, the visible face of a segment (its input is invisible, laid over it) and a text box.
				for (const el of document.querySelectorAll('.airflow-dock button, .airflow-dock summary, .airflow-dock .segment span, .airflow-dock input[type="text"]')) {
					const box = el.getBoundingClientRect();
					if (box.width < 43.5 || box.height < 43.5) found.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
				}
				return found;
			});
			expect(small, `${width}px wide`).toEqual([]);
		}
	});

	test('the chosen Home is clearly marked: its fill is at least 3:1 against the others, in the colours the page draws', async ({ page }) => {
		await openAirflow(page);
		const ratio = await page.evaluate(() => {
			const luminance = (css: string) => {
				const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
					const c = v / 255;
					return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			const fill = (el: Element) => getComputedStyle(el).backgroundColor;
			const checked = document.querySelector('.airflow-dock .segment input:checked + span')!;
			const other = document.querySelector('.airflow-dock .segment input:not(:checked) + span')!;
			const [a, b] = [luminance(fill(checked)), luminance(fill(other))];
			const track = luminance(fill(document.querySelector('.airflow-dock .segments')!));
			return { againstOthers: (Math.max(a, track) + 0.05) / (Math.min(a, track) + 0.05), fillIsSet: fill(checked) !== fill(other), other: b };
		});
		expect(ratio.fillIsSet, 'the checked segment has a fill of its own').toBe(true);
		expect(ratio.againstOthers).toBeGreaterThanOrEqual(3);
	});

	test('has no WCAG 2.1 A/AA violations that axe can detect, at desktop and phone widths', async ({ page }) => {
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await openAirflow(page);
			const { violations } = await new AxeBuilder({ page }).include('.airflow-dock').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
			expect(
				violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
				`${width}px wide`
			).toEqual([]);
		}
	});

	test('the Home picker switches among the four Homes, and says what the Home is', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await openAirflow(page);
		await expect(page.getByRole('radio', { name: 'Two-bedroom' })).toBeChecked();
		for (const plan of [...plans].reverse().concat(plans[2])) {
			await page.getByRole('radio', { name: plan.name }).check();
			await expect(page.getByRole('radio', { name: plan.name })).toBeChecked();
			await expect(caption(page)).toContainText(plan.name);
			await expect(page.getByRole('application', { name: new RegExp(`^The air in the ${plan.name}`) })).toBeVisible();
			await expect(live(page)).toHaveText(`${plan.name}. ${plan.blurb}`);
		}
		expect(errors, 'quick changes of Home are not a fault').toEqual([]);
	});

	test('the Scenario picker applies each Scenario, shows its notice, and announces it; a change of your own leaves the Scenarios behind', async ({ page }) => {
		await openAirflow(page);
		for (const scenario of SCENARIOS) {
			const chip = page.getByRole('button', { name: scenario.name, exact: true });
			await chip.click();
			await expect(chip).toHaveAttribute('aria-pressed', 'true');
			for (const other of SCENARIOS.filter((s) => s.id !== scenario.id)) {
				await expect(page.getByRole('button', { name: other.name, exact: true })).toHaveAttribute('aria-pressed', 'false');
			}
			await expect(page.locator('.dock-notice[data-scenario]')).toContainText(scenario.notice);
			const plan = plans.find((p) => p.id === scenario.setup.plan)!;
			await expect(caption(page)).toContainText(plan.name);
			await expect(page.getByRole('radio', { name: plan.name })).toBeChecked();
			await expect(live(page)).toHaveText(`${scenario.name}. ${scenario.notice}`);
			// The picker describes each choice to a screen reader.
			await expect(chip).toHaveAccessibleDescription(scenario.blurb);
		}
		// Picking a Home of your own is not a Scenario any more.
		await page.getByRole('radio', { name: 'Studio' }).check();
		for (const scenario of SCENARIOS) await expect(page.getByRole('button', { name: scenario.name, exact: true })).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator('.dock-notice[data-scenario]')).toContainText('Your own setup');
	});

	test('Restart keeps the Home and the setup and says so; Reset puts the Home back the way it began', async ({ page }) => {
		await openAirflow(page);
		await page.getByRole('radio', { name: 'Studio' }).check();
		await expect(caption(page)).toContainText('Studio');
		await page.getByRole('button', { name: 'Restart' }).click();
		await expect(live(page)).toHaveText(/^Restarted\./);
		await expect(caption(page), 'Restart keeps the Home').toContainText('Studio');
		await page.getByRole('button', { name: 'Reset' }).click();
		await expect(live(page)).toHaveText('Back to the start.');
		await expect(caption(page), 'Reset keeps the Home the visitor picked, in its default setup').toContainText('Studio');
		await expect(page.getByRole('radio', { name: 'Studio' })).toBeChecked();

		// A Scenario that was applied is what Reset returns to, for as long as the Home is the Scenario's.
		await page.getByRole('button', { name: 'Stack effect', exact: true }).click();
		await expect(caption(page)).toContainText('House');
		await page.getByRole('button', { name: 'Reset' }).click();
		await expect(live(page)).toHaveText('Back to the start.');
		await expect(caption(page)).toContainText('House');
		await expect(page.getByRole('button', { name: 'Stack effect', exact: true }), 'the Scenario it was').toHaveAttribute('aria-pressed', 'true');
	});

	test('Copy link copies the link for the setup, confirms it to the eye and to a screen reader, and pasting it into the open page adopts it', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await openAirflow(page);
		await page.getByRole('button', { name: 'Stack effect', exact: true }).click();
		await expect(caption(page)).toContainText('House');
		await page.getByRole('button', { name: 'Copy link' }).click();
		await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
		await expect(live(page)).toHaveText('Link copied.');
		await expect(page.getByRole('button', { name: 'Copy link' }), 'the confirmation fades').toBeVisible({ timeout: 6000 });
		const [link] = await writes();
		const url = new URL(link);
		expect(url.pathname).toBe('/experiments/airflow');
		const setup = setupFromHash(url.hash, catalog);
		expect(setup?.plan).toBe('house');
		expect(setup?.openings).toMatchObject(SCENARIOS.find((s) => s.id === 'stack-effect')!.setup.openings);

		// Elsewhere in the page, then the link is pasted into the address bar: the setup comes back.
		await page.getByRole('radio', { name: 'Studio' }).check();
		await expect(caption(page)).toContainText('Studio');
		await page.evaluate((hash) => (location.hash = hash), url.hash);
		await expect(caption(page)).toContainText('House');
		await expect(page.getByRole('radio', { name: 'House' })).toBeChecked();
	});

	test('when the browser will not copy the link, the Dock shows it to copy by hand', async ({ page }) => {
		await stubClipboard(page, 'fail');
		await openAirflow(page);
		await page.getByRole('radio', { name: 'One-bedroom' }).check();
		await page.getByRole('button', { name: 'Copy link' }).click();
		const field = page.getByRole('textbox', { name: /Copy the link by hand/ });
		await expect(field).toBeVisible();
		const value = await field.inputValue();
		expect(setupFromHash(new URL(value).hash, catalog)?.plan).toBe('one-bedroom');
		await expect(live(page)).toContainText('would not copy the link');
		await expect(page.getByRole('button', { name: 'Link copied' })).toHaveCount(0);
	});

	test('every control works by keyboard, in order, with a visible focus ring and a name', async ({ page, browserName }) => {
		// Safari's default settings move between buttons and links with Option+Tab; plain Tab skips them.
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		const previous = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
		await page.setViewportSize({ width: 1280, height: 900 });
		await openAirflow(page);
		// The Home radios are one stop; the arrow keys move among them.
		const home = page.getByRole('radio', { name: 'Two-bedroom' });
		await home.focus();
		expect(await focusRing(page), 'a Home radio shows where it is').toBe(true);
		await page.keyboard.press('ArrowLeft');
		await expect(page.getByRole('radio', { name: 'One-bedroom' })).toBeChecked();
		await expect(caption(page)).toContainText('One-bedroom');

		const order = [...SCENARIOS.map((s) => s.name), 'Restart', 'Reset', 'Copy link'];
		for (const name of order) {
			await page.keyboard.press(next);
			expect(await focusedName(page), 'the next stop').toBe(name);
			expect(await focusRing(page), `${name} shows where it is`).toBe(true);
		}
		// Enter and Space work the buttons.
		for (let n = 0; n < 3; n++) await page.keyboard.press(previous);
		expect(await focusedName(page)).toBe(SCENARIOS[SCENARIOS.length - 1].name);
		await page.keyboard.press('Enter');
		await expect(page.getByRole('button', { name: SCENARIOS[SCENARIOS.length - 1].name, exact: true })).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press(next);
		await page.keyboard.press('Space');
		await expect(live(page)).toHaveText(/^Restarted\./);
	});

	test('the group is a disclosure that a keyboard opens and closes, and that says whether it is open', async ({ page }) => {
		await openAirflow(page);
		const summary = page.locator('#dock-home > summary');
		const group = page.locator('#dock-home');
		await expect(group).toHaveAttribute('open', '');
		await summary.focus();
		expect(await focusRing(page), 'the group title shows where it is').toBe(true);
		await page.keyboard.press('Enter');
		await expect(group).not.toHaveAttribute('open', '');
		await expect(page.getByRole('button', { name: 'Restart' })).toBeHidden();
		await page.keyboard.press('Space');
		await expect(group).toHaveAttribute('open', '');
		await expect(page.getByRole('button', { name: 'Restart' })).toBeVisible();
	});
});
