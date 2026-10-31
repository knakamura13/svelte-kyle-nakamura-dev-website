import { expect, test } from '@playwright/test';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import { inMemoryWorker } from './channel';
import { expectBalance } from './massBalanceChecks';
import { runBalance } from './massBalanceScenario';

/** A cell size the page's tuner settles the larger Homes on when the solver runs in a worker (the Studio gets 0.15 m there). */
const CELL = 0.2;

/**
 * The particulate mass balance through `World` on the CPU solver behind a Web Worker, which is what the page runs where there is no
 * WebGPU. It is driven through a real message channel, so every number the Physics panel reads has crossed a structured clone. The CPU
 * solver in the page's thread is checked at 1e-3 in world.spec.ts, and a world on the worker gives bit-identical diagnostics to it
 * (worker.spec.ts). The GPU's is tests/gpu/massbalance.gpu.ts. The run and what is asserted are in massBalanceScenario.ts and
 * massBalanceChecks.ts, and the tolerance is `MASS_BALANCE_TOLERANCE`, which says why it is what it is.
 *
 * Measured on this Mac: worst error 8e-8 (at 0.2 m, in a minute of processor time).
 */
test.describe('the particulate mass balance through World', () => {
	test.describe.configure({ timeout: 300_000 });

	test(`on the CPU solver behind a worker at ${CELL} m, a cell size the tuner settles the larger Homes on there: smoke in, released, carried out, cleaned and settled all add up`, async () => {
		const worker = inMemoryWorker();
		const run = await runBalance({ make: (config, initial) => WorkerBackend.create(worker.port, config, initial), h: CELL, seconds: 180, every: 1 });
		expect(run.kind).toBe('cpu');
		expectBalance(run, `worker ${CELL} m`);
		expect(worker.terminated, 'the world was disposed, and that stopped the worker').toBe(true);
	});
});
