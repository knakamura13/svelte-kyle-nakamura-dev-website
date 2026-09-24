import type { Page } from '@playwright/test';

/**
 * Replaces navigator.clipboard.writeText before any page script runs, so copy behavior is
 * testable in every browser without clipboard permissions. Returns the texts written.
 */
export async function stubClipboard(page: Page, outcome: 'succeed' | 'fail') {
	await page.addInitScript((fail) => {
		const written: string[] = [];
		Object.defineProperty(window, '__clipboardWrites', { value: written });
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: (text: string) => {
					if (fail) return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
					written.push(text);
					return Promise.resolve();
				}
			}
		});
	}, outcome === 'fail');
	return async () => {
		const written: unknown = await page.evaluate(() => Reflect.get(window, '__clipboardWrites'));
		return Array.isArray(written) ? written.filter((text) => typeof text === 'string') : [];
	};
}
