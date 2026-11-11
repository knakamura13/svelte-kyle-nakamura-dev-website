import { expect, test, type Page } from '@playwright/test';
import { worldShot } from './dock';
import { countFrames, framesSince, pageNow, requireWebGL2, webglRenderer } from './webgl';

// TEMPORARY (#95): measures what CI's browsers draw. Not for merging.

const view = (page: Page) => page.getByRole('application', { name: /^The air in the/ });
const note = (type: string, description: string) => {
	test.info().annotations.push({ type, description });
	console.log(`[diag ${test.info().project.name}] ${type}: ${description}`);
};

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

test.beforeEach(async ({ page }) => {
	test.setTimeout(240_000);
	await requireWebGL2(page);
	await countFrames(page);
});

test('the renderer and the opening', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	note('renderer', `${await webglRenderer(page)}; cores ${await page.evaluate(() => navigator.hardwareConcurrency)}`);
	const t0 = Date.now();
	await page.goto('/experiments/airflow');
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 120_000 });
	note('live', `${((Date.now() - t0) / 1000).toFixed(1)} s after goto; quality ${await view(page).getAttribute('data-quality')}`);
	const start = await pageNow(page);
	const rows: string[] = [];
	for (let n = 0; n < 16; n++) {
		const f = await framesSince(page, start);
		const zoom = await view(page).getAttribute('data-zoom');
		const status = await page.locator('.sim-status').textContent();
		rows.push(`${f?.seconds.toFixed(1)}s frames ${f?.frames} longest ${f?.longest.toFixed(2)}s zoom ${zoom} | ${status?.trim()}`);
		await page.waitForTimeout(1000);
	}
	note('opening', rows.join('\n'));
	const t1 = Date.now();
	await page.evaluate(() => 1);
	note('evaluate', `${Date.now() - t1} ms for a trivial evaluate`);
});

test('the HUD, paused: what a wall mode draws', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/experiments/airflow?cell=0.3&camera=6,3.9,32,0.9,-10');
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 120_000 });
	note('quality', `${await view(page).getAttribute('data-quality')}`);
	const stage = view(page);
	if (await page.getByRole('button', { name: 'Pause' }).count()) await page.keyboard.press('p');
	await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
	await page.waitForTimeout(3000);
	const idle = await pageNow(page);
	await page.waitForTimeout(3000);
	note('idle', JSON.stringify(await framesSince(page, idle)));
	const t = Date.now();
	const before = await worldShot(page, stage);
	note('shot', `${Date.now() - t} ms for a world shot`);
	const clicked = await pageNow(page);
	await page.getByRole('group', { name: 'Walls' }).getByRole('button', { name: 'Walls up' }).click();
	const rows: string[] = [];
	for (let n = 0; n < 10; n++) {
		const t2 = Date.now();
		const shot = await worldShot(page, stage);
		const share = await changedShare(page, before, shot);
		rows.push(`${JSON.stringify(await framesSince(page, clicked))} share ${share.toFixed(4)} (${Date.now() - t2} ms to shoot and compare)`);
		await page.waitForTimeout(500);
	}
	note('walls up', rows.join('\n'));
	await test.info().attach('before.png', { body: before, contentType: 'image/png' });
	await test.info().attach('after.png', { body: await worldShot(page, stage), contentType: 'image/png' });
});

test('a phone, the low tier: the simulation rate', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: browser.browserType().name() !== 'firefox', hasTouch: true, locale: 'en-US' });
	const page = await context.newPage();
	await countFrames(page);
	await page.goto('/experiments/airflow?cell=0.3&quality=low');
	await expect(view(page)).toHaveAttribute('data-state', 'live', { timeout: 120_000 });
	const start = await pageNow(page);
	const rows: string[] = [];
	for (let n = 0; n < 10; n++) {
		await page.waitForTimeout(2000);
		rows.push(`${JSON.stringify(await framesSince(page, start))} | ${(await page.locator('.sim-status').textContent())?.trim()} | clock ${(await page.locator('.hud').getByText(/^Simulated time/).first().textContent().catch(() => ''))}`);
	}
	note('phone', rows.join('\n'));
	await context.close();
});
