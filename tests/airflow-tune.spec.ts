import { expect, test, type Page } from '@playwright/test';
import { planById } from '../src/lib/experiments/airflow/homes/plans';
import { setupToHash } from '../src/lib/experiments/airflow/link';
import { blankSetup } from '../src/lib/experiments/airflow/state';
import { live, openAirflow, status } from './dock';

/**
 * The page picks the grid for the device and says so. Where the browser has WebGPU the simulation runs on it, and where it has not
 * (Firefox, Chromium's headless shell) on a worker, and everything here holds for both. The grid is the auto-tuner's, except on a phone
 * or a small tablet, which runs the coarsest and says it is best on a laptop, and where the address asks for one (`?cell=0.2`).
 * The page is read in a metric locale, so cell sizes are in centimetres. Each browser's emulation of a touch screen has to make
 * `(pointer: coarse)` match for a phone to be seen as one; that is the first thing the phone tests show.
 */
test.use({ locale: 'en-GB' });

const NOTE = 'Coarsest grid here: best on a laptop.';
const COARSEST = /cells, each 0\.30\s*m across/;

/** Waits until the simulation is running and the status line has a grid in it. */
async function started(page: Page, grid: RegExp = /cells, each [\d.]+\s*m across/) {
	await expect(status(page)).toHaveAttribute('data-status', /^(running|paused)$/, { timeout: 60_000 });
	await expect(status(page)).toContainText(grid);
}

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the browser reports a touch screen of a phone’s size, which is what makes the page treat it as one', async ({ page }) => {
		await openAirflow(page);
		const facts = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, short: Math.min(screen.width, screen.height) }));
		expect(facts.coarse, 'the primary pointer is a finger').toBe(true);
		expect(facts.short, 'on a screen no wider than a small tablet').toBeLessThanOrEqual(820);
	});

	test('every Home runs the coarsest grid, the status line says so, and a screen reader is told once', async ({ page }) => {
		test.setTimeout(120_000);
		await openAirflow(page);
		await started(page, COARSEST);
		await expect(status(page)).toContainText(NOTE);
		// The status line is a live region that is read whenever its text changes, so the note sits outside what it reads: the session announces it.
		await expect(status(page).locator('[data-tuning]')).toHaveAttribute('aria-hidden', 'true');
		await expect(live(page)).toHaveText(NOTE);

		// Another Home, and the biggest: the same grid and the same note, and nothing new said.
		const before = (await status(page).textContent())!.match(/([\d,]+) cells/)![1];
		await page.evaluate((hash) => (location.hash = hash), setupToHash(blankSetup('house')));
		await expect(page.locator('.airflow-figure figcaption')).toContainText(planById('house')!.name);
		await expect(status(page), 'the house is a new world, with its own count of cells').not.toContainText(`${before} cells`, { timeout: 30_000 });
		await started(page, COARSEST);
		await expect(status(page)).toContainText(NOTE);
		// Seven seconds is longer than the tuner needs to decide on another device (two of warm-up and three of window), and this one is never measured.
		await page.waitForTimeout(7000);
		await expect(status(page)).toContainText(COARSEST);
		await expect(status(page)).not.toContainText(/Restarted/);
		// Said twice, the same words would end in a no-break space (so that a screen reader reads them again): they are exactly the note.
		expect(await live(page).evaluate((el) => el.textContent), 'the note was said once, and not again for the second Home').toBe(NOTE);
	});

	test('a grid asked for in the address overrules the phone: 20 cm, and no note', async ({ page }) => {
		await openAirflow(page, '/experiments/airflow?cell=0.2');
		await started(page, /cells, each 0\.20\s*m across/);
		await expect(status(page)).not.toContainText(NOTE);
		await expect(status(page).locator('[data-tuning]')).toHaveCount(0);
	});
});

/**
 * The status line shares the pinned figure with the Stage, and the Dock is under the figure on a narrow screen, so a note that made the line taller
 * would move the Dock. The figure keeps room for it. Each width has its own context, because Firefox cannot resize a mobile one.
 */
for (const width of [360, 390]) {
	test.describe(`on a phone ${width} wide`, () => {
		test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });

		test('the note makes the figure no taller, so the Dock under it does not move when the note appears', async ({ page }) => {
			test.setTimeout(120_000);
			const measure = async () =>
				page.evaluate(() => ({
					figure: Math.round(document.querySelector('.airflow-figure')!.getBoundingClientRect().height),
					dock: Math.round(document.querySelector('.airflow-dock')!.getBoundingClientRect().top + scrollY),
					lines: Math.round((document.querySelector('.sim-status')!.getBoundingClientRect().height - 14) / 19.2)
				}));
			// With the grid asked for there is no note: the line holds the cell size and, on a processor, how far behind the clock it runs.
			await openAirflow(page, '/experiments/airflow?cell=0.3');
			await started(page, COARSEST);
			await expect(status(page)).not.toContainText(NOTE);
			const plain = await measure();
			await openAirflow(page);
			await started(page, COARSEST);
			await expect(status(page)).toContainText(NOTE);
			const noted = await measure();
			expect(noted.figure, `the figure is as tall with the note (${noted.lines} lines of status) as without (${plain.lines})`).toBe(plain.figure);
			expect(noted.dock, 'and the Dock starts in the same place').toBe(plain.dock);
		});
	});
}

test.describe('on a small tablet, 820 wide like the iPads up to the tenth generation', () => {
	test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

	test('the coarsest grid and the note, as on a phone', async ({ page }) => {
		await openAirflow(page);
		await started(page, COARSEST);
		await expect(status(page)).toContainText(NOTE);
	});
});

test.describe('on a larger tablet, 834 wide like an iPad Pro', () => {
	test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

	test('the tuner’s grid, and no note', async ({ page }) => {
		await openAirflow(page);
		await started(page);
		await expect(status(page)).not.toContainText(/best on a laptop/i);
	});
});

test.describe('on a laptop or a desktop', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('the page does not say what a phone is told, and shows the grid it has', async ({ page }) => {
		await openAirflow(page);
		await started(page);
		await expect(status(page)).not.toContainText(/best on a laptop/i);
		await expect(live(page)).not.toContainText(/best on a laptop/i);
	});

	test('a narrow window is not a small device: a mouse is not a finger', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openAirflow(page);
		await started(page);
		await expect(status(page)).not.toContainText(/best on a laptop/i);
	});

	test('a grid asked for in the address is the grid, for every Home, for as long as it runs: the tuner is not asked', async ({ page }) => {
		test.setTimeout(120_000);
		await openAirflow(page, '/experiments/airflow?cell=0.2');
		await started(page, /cells, each 0\.20\s*m across/);
		await expect(status(page).locator('[data-tuning]')).toHaveCount(0);
		await page.evaluate((hash) => (location.hash = hash), setupToHash(blankSetup('studio')));
		await expect(page.locator('.airflow-figure figcaption')).toContainText(planById('studio')!.name);
		await started(page, /cells, each 0\.20\s*m across/);
		// The tuner needs two seconds of warm-up and three of window to give a verdict. Eight seconds is enough for it to have moved a size or two, if it were asked.
		await page.waitForTimeout(8000);
		await expect(status(page)).toContainText(/cells, each 0\.20\s*m across/);
		await expect(status(page).locator('[data-tuning]')).toHaveCount(0);
	});

	test('an address that asks for a size the simulation does not run at is ignored', async ({ page }) => {
		await openAirflow(page, '/experiments/airflow?cell=0.12');
		await started(page);
		await expect(status(page)).not.toContainText(/each 0\.12\s*m/);
	});
});
