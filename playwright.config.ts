import { defineConfig, devices } from '@playwright/test';

// Checkouts that run side by side (git worktrees) each set their own PW_PORT, so one never reuses another's build.
const port = Number(process.env.PW_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: { baseURL: origin },
	webServer: {
		command: `yarn build && yarn preview --port ${port} --strictPort --host 127.0.0.1`,
		url: origin,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
