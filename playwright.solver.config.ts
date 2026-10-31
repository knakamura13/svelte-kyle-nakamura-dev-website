import { defineConfig } from '@playwright/test';

/**
 * The airflow solver's benchmarks and invariants. They run the solver in Node, so there is no web server and no
 * browser, and a benchmark may take a minute. `yarn test:solver` runs them; `yarn test:e2e` skips them.
 */
export default defineConfig({
	testDir: 'tests/solver',
	fullyParallel: true,
	timeout: 300_000,
	reporter: 'list'
});
