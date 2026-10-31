import { build } from 'esbuild';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../..');
/** Any port: requests never leave the browser, they are answered by `page.route`. */
const ORIGIN = 'http://127.0.0.1:4999';

/** Bundles a browser entry (a file in tests/gpu/entries, or any file of the repo given by its path from the root) with `$lib` resolved, as one ES module. */
export async function bundle(entry: string) {
	const result = await build({
		entryPoints: [entry.includes('/') ? resolve(ROOT, entry) : resolve(ROOT, 'tests/gpu/entries', entry)],
		bundle: true,
		format: 'esm',
		write: false,
		target: 'es2022',
		alias: { $lib: resolve(ROOT, 'src/lib') },
		logLevel: 'silent'
	});
	return result.outputFiles[0].text;
}

/**
 * Opens a blank page at a 127.0.0.1 origin (a secure context, so WebGPU is exposed) with the bundled entry loaded,
 * and fails unless a real adapter is present. `scripts` are more bundled files the entry loads by path (a Web Worker's script),
 * keyed by the path they are served at: `{ '/worker.js': await bundle('src/.../worker.ts') }`.
 */
export async function openHarness(page: Page, entry: string, scripts: Record<string, string> = {}) {
	const script = await bundle(entry);
	await page.route(`${ORIGIN}/**`, (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/entry.js') return route.fulfill({ contentType: 'text/javascript', body: script });
		if (url.pathname in scripts) return route.fulfill({ contentType: 'text/javascript', body: scripts[url.pathname] });
		return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>gpu</title><script type="module" src="/entry.js"></script>' });
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${ORIGIN}/`);
	await page.waitForFunction(() => (window as unknown as { harnessReady?: boolean }).harnessReady === true, undefined, { timeout: 30_000 });
	const adapter = await page.evaluate(async () => {
		const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
		if (!gpu) return 'no navigator.gpu';
		const found = await gpu.requestAdapter();
		return found ? 'ok' : 'requestAdapter() returned null';
	});
	if (adapter !== 'ok') throw new Error(`WebGPU adapter unavailable: ${adapter}`);
	return errors;
}
