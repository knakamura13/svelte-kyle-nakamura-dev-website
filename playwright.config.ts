import { defineConfig, devices } from '@playwright/test';

// The preview process loads the GitHub stub through this variable. A server that is already
// listening does not inherit it; webServer.url below is how the suite tells those apart.
const nodeOptions = [process.env.NODE_OPTIONS, '--require ./tests/stub-github-fetch.cjs']
	.filter((value) => value)
	.join(' ');

function webServerEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
	env.NODE_OPTIONS = nodeOptions;
	return env;
}

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: { baseURL: 'http://127.0.0.1:4173' },
	webServer: {
		command: 'node tests/ensure-stubbed-preview.mjs',
		// 200 only when tests/stub-github-fetch.cjs is loaded. Local reuse keeps a listener
		// only in that case. The command replaces a preview from this repo that does not answer.
		url: 'http://127.0.0.1:4173/__github_stub_ready__',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: webServerEnv()
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
