import { expect, type Locator } from '@playwright/test';

/**
 * Focuses a Project or Payment Stack card until the card reports that it is active. The stack's focus listener is attached when the
 * page hydrates, a moment after `load`, and a focus that lands before then is lost. WebKit does this on a slow run: a probe of the
 * home page focused a card at `commit`, and `data-active` stayed null after 2.5 s, while a focus after `load` took. So the card is
 * blurred and focused again until the listener takes the focus. The test keeps its own assertions.
 */
export async function focusUntilActive(card: Locator) {
	await expect
		.poll(async () => {
			await card.evaluate((el) => {
				(el as HTMLElement).blur();
				(el as HTMLElement).focus();
			});
			return card.getAttribute('data-active');
		})
		.toBe('true');
}
