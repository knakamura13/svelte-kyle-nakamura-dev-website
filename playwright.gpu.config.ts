import { defineConfig } from '@playwright/test';

/**
 * The WebGPU solver's compile and parity checks. They run in Chromium with a real GPU adapter: `channel: 'chromium'`
 * is the new headless mode, which exposes the machine's WebGPU adapter (the default headless shell has none). The
 * page is served from http://127.0.0.1 through request routing, so it is a secure context without a web server.
 * Files are named `*.gpu.ts` so neither the e2e config (`tests/**`) nor the solver config picks them up.
 * `yarn playwright test -c playwright.gpu.config.ts` runs them.
 */
export default defineConfig({
	testDir: 'tests/gpu',
	testMatch: '**/*.gpu.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	reporter: 'list',
	use: { channel: 'chromium', headless: true }
});
