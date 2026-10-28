import { defineConfig, devices } from '@playwright/test';

// Checkouts that run side by side (git worktrees) each set their own PW_PORT, so one never reuses another's build.
const port = Number(process.env.PW_PORT ?? 4173);
const origin = `http://127.0.0.1:${port}`;

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
	// The solver benchmarks run in Node with their own config (playwright.solver.config.ts).
	testIgnore: 'solver/**',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: { baseURL: origin },
	webServer: {
		command: `yarn build && yarn preview --port ${port} --strictPort --host 127.0.0.1`,
		url: origin,
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
