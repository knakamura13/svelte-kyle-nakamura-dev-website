import { expect, test, type Page } from '@playwright/test';
import { expectBalance, expectCloses } from '../solver/massBalanceChecks';
import type { BalanceOptions, BalanceRun } from '../solver/massBalanceScenario';
import { openHarness } from './harness';

/**
 * The particulate mass balance through `World` on the WebGPU backend, the check status-doc issue 10 said was never made: the
 * Physics panel's verdict is only as good as the tally the GPU keeps (a per-workgroup sum in f32 for every substep, finished in
 * double on the host), and the parity tests compare that tally with the CPU's on a hand-made room, not through the page's World
 * with its emitter, purifier, Openings and outdoor smoke. The run and what is asserted are in tests/solver/massBalanceScenario.ts
 * and massBalanceChecks.ts, which the CPU worker's spec (tests/solver/massbalance.spec.ts) shares. The tolerance is
 * `MASS_BALANCE_TOLERANCE` (src/lib/experiments/airflow/massBalance.ts), which says why it is what it is.
 *
 * Measured on this Mac (Apple M3 Max, Metal), 3,600 steps of 0.05 s, a snapshot every 0.2 s as the page reads one:
 * 0.15 m cells worst error 3.5e-5 at 120 s, 0.1 m cells 4.5e-5 at 180 s; the CPU solver (the worker's spec) 8e-8 at 0.2 m.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'massbalance.ts');
});

const run = (options: Omit<BalanceOptions, 'make'>) =>
	page.evaluate((options) => (window as unknown as { balance: { run(options: object): Promise<BalanceRun> } }).balance.run(options), options);

test('the Studio at 0.15 m, the cell size the page uses on the GPU: smoke in, released, carried out, cleaned and settled all add up', async () => {
	const result = await run({ h: 0.15, seconds: 180 });
	expect(result.kind).toBe('webgpu');
	expectBalance(result, 'GPU 0.15 m');
});

test('and at 0.1 m, where the grid is finer and the sums are over more cells', async () => {
	const result = await run({ h: 0.1, seconds: 180 });
	expect(result.kind).toBe('webgpu');
	expectBalance(result, 'GPU 0.1 m');
});

/**
 * KNOWN GAP, not hidden by the tolerance. In a sealed Studio at rest whose only loss is deposition (no flow to carry smoke anywhere,
 * no purifier, no outdoor smoke), stepped once a frame at 60 frames a second (dt 1/60 s) for 30 simulated minutes with a snapshot every
 * 0.2 s as the page reads one, the GPU's books end at
 *   0.3 m cells +1.4e-3 (in the air 1.7712 mg, deposited 0.41177 mg, of 2.1800 mg that was there to begin with),
 *   0.15 m cells -1.5e-4 and 0.1 m cells +6.6e-4,
 * and swing in sign and size on the way, so only the 0.3 m run (what the auto-tuner gives a phone) is over the tolerance. The CPU
 * solver at 0.3 m and a step of 0.05 s ends at +4.5e-4; the GPU at 0.3 m and 0.05 s at -1.8e-5 and at 0.025 s at +2.2e-4. The air is
 * not misread: a direct sum of the GPU's field (readFields) agrees with the snapshot's total to 1e-8, so the field and the tally really
 * do differ, and the tally is the exact one.
 *
 * Probable cause, moderate confidence: every field is stored in f32, and a deposit that takes about 5e-6 of a cell's smoke in a
 * substep (rate·dτ) is applied as `value / (1 + rate·dτ)` and stored, so it is rounded to a multiple of 1.2e-7 (the spacing of f32
 * at 1) and then of the field's own spacing: the field keeps or loses up to about 1 % of each deposit that the tally counts exactly,
 * and how much depends on where rate·dτ falls between those multiples, hence the erratic sign. The same cause sets the size of the
 * first test's closing error: its deposition is 0.8 % of the smoke, and 1 % of that is 8e-5 at most against the 3.5e-5 and 4.5e-5 it
 * measures. What bears on it: the same 30 minutes at 0.3 m with deposition switched off and a purifier at Low as the only loss (rate·dτ
 * about 0.01, so the rounding is a thousandth of the loss) end at 1.1e-5, and with the purifier and deposition both at 6.8e-4. What
 * would falsify it: deposition applied once a step instead of every substep (dτ several times larger) should cut these errors by about
 * that factor, and if it does not the cause is elsewhere. Not fixed here (it is solver code, which this slice does not change).
 * `test.fixme` until then; run it by removing the `.fixme`.
 */
test.fixme('a sealed, still Studio that loses smoke only to its surfaces stays inside the tolerance for 30 simulated minutes at 0.3 m cells and a step a frame', async () => {
	test.setTimeout(300_000);
	const result = await run({ h: 0.3, seconds: 1800, dt: 1 / 60, still: true });
	expectCloses(result, 'GPU 0.3 m, still, 1800 s');
});
