import { defineConfig, devices } from '@playwright/test';

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
		command: 'yarn build && yarn preview --port 4173 --strictPort --host 127.0.0.1',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		// The repositories route calls GitHub. Stub that host so the suite does not spend the unauthenticated rate limit.
		env: webServerEnv()
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
