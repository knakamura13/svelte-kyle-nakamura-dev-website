import { expect, test, type Locator } from '@playwright/test';
import { stubClipboard } from './clipboard';

/** Whether the left edge, middle, and right edge of `target`'s text are painted by `card`, not covered by another card. */
async function paintsOnTop(card: Locator, target: Locator) {
	const cardHandle = await card.elementHandle();
	return target.evaluate((el, owner) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const lines = [...range.getClientRects()].filter((r) => r.width > 0);
		return lines.length > 0 && lines.every((line) => {
			const y = line.top + line.height / 2;
			return [line.left + 2, line.left + line.width / 2, line.right - 2].every((x) => !!owner && owner.contains(document.elementFromPoint(x, y)));
		});
	}, cardHandle);
}

const lifted = (card: Locator) =>
	expect.poll(() => card.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).f), { timeout: 3000 }).toBe(-8);

test.describe('Project Stack on home', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('hover brings a card forward, and leaving puts it back', async ({ page }) => {
		await page.goto('/');
		const card = page.locator('.stack-mlrose');
		await card.hover();
		await expect(card).toHaveAttribute('data-active', 'true');
		await lifted(card);
		expect(Number(await card.evaluate((el) => el.style.zIndex))).toBeGreaterThan(3);
		await page.mouse.move(5, 890);
		await expect(card).not.toHaveAttribute('data-active');
		await expect
			.poll(() => card.evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI); }))
			.toBe(-5);
	});

	test('keyboard focus brings a card forward like hover', async ({ page }) => {
		await page.goto('/');
		const card = page.locator('.stack-foods');
		await card.focus();
		await expect(card).toHaveAttribute('data-active', 'true');
		await lifted(card);
	});

	test('with reduced motion the card is marked active without moving', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const card = page.locator('.stack-mlrose');
		await card.hover();
		await expect(card).toHaveAttribute('data-active', 'true');
		expect(await card.evaluate((el) => el.style.transform)).toBe('');
	});
});

test.describe('Payment Stack on send-money', () => {
	test.use({ viewport: { width: 1440, height: 900 } });
	const cards = ['venmo', 'cash', 'paypal', 'zelle'];

	// Between 701 and 1440px the cards overlap with fixed tops and heights, so check the whole range.
	for (const width of [1440, 1000, 768, 720]) {
		test(`every card shows its name and handle at rest at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/send-money');
			await page.mouse.move(1, 899);
			for (const id of cards) {
				const card = page.locator(`.pay-${id}`);
				expect(await paintsOnTop(card, card.locator('.stack-title')), `${id} name`).toBe(true);
				expect(await paintsOnTop(card, card.locator('.pay-handle')), `${id} handle`).toBe(true);
			}
		});
	}

	test('links go to each payment app', async ({ page }) => {
		await page.goto('/send-money');
		await expect(page.locator('.pay-venmo')).toHaveAttribute('href', 'https://venmo.com/u/pileofkyle');
		await expect(page.locator('.pay-cash')).toHaveAttribute('href', 'https://cash.app/$KyleKyle');
		await expect(page.locator('.pay-paypal')).toHaveAttribute('href', 'https://paypal.me/kylenakamura12');
		for (const id of ['venmo', 'cash', 'paypal']) await expect(page.locator(`.pay-${id}`)).toHaveAttribute('target', '_blank');
	});

	test('keyboard focus brings each card forward in order, and leaving releases it', async ({ page, browserName }) => {
		// Safari's default settings move between links with Option+Tab; plain Tab skips them.
		const next = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
		await page.goto('/send-money');
		await page.locator('.pay-venmo').focus();
		for (const [index, id] of cards.entries()) {
			if (index > 0) await page.keyboard.press(next);
			const card = page.locator(`.pay-${id}`);
			await expect(card).toBeFocused();
			await expect(card).toHaveAttribute('data-active', 'true');
			await lifted(card);
		}
		await page.keyboard.press(next);
		await expect(page.locator('.stack-card[data-active]')).toHaveCount(0);
	});

	test('Zelle copies the number and says so', async ({ page }) => {
		const writes = await stubClipboard(page, 'succeed');
		await page.goto('/send-money');
		await page.locator('.pay-zelle').click();
		await expect(page.locator('.pay-zelle .stack-caption')).toHaveText('Number copied.');
		await expect(page.locator('[aria-live="polite"]')).toHaveText('Zelle number copied');
		expect(await writes()).toEqual(['6263885416']);
	});

	test('Zelle reports a failed copy and shows the number', async ({ page }) => {
		await stubClipboard(page, 'fail');
		await page.goto('/send-money');
		await page.locator('.pay-zelle').click();
		await expect(page.locator('.pay-zelle .stack-caption')).toHaveText('Couldn’t copy. The number is (626) 388-5416.');
		await expect(page.locator('[aria-live="polite"]')).toHaveText('Could not copy. The Zelle number is (626) 388-5416.');
	});
});

test.describe('Payment Stack on phones', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

	test('cards become full-width rows that do not overlap', async ({ page }) => {
		await page.goto('/send-money');
		const boxes = await page.locator('.stack-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
		expect(boxes).toHaveLength(4);
		for (let i = 1; i < boxes.length; i++) {
			expect(boxes[i].top, `row ${i} starts below row ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
			expect(Math.round(boxes[i].width)).toBe(Math.round(boxes[0].width));
		}
	});
});
