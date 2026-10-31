import { expect } from '@playwright/test';
import { MASS_BALANCE_TOLERANCE, massAccounted, massGained } from '../../src/lib/experiments/airflow/massBalance';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { RELEASE_RATE, RELEASE_SECONDS, STARTING_SMOKE, describeMass, type BalanceRun } from './massBalanceScenario';

/**
 * What every backend must show for a run in massBalanceScenario.ts. The tolerance is `MASS_BALANCE_TOLERANCE` (the Physics
 * panel's verdict reads the same constant); `where` names the backend in a failure message.
 */

/** The balance closes at the start, at every snapshot on the way, and at the end. */
export function expectCloses(run: BalanceRun, where: string) {
	const { samples } = run;
	const worst = Math.max(...samples.map((s) => s.error ?? 0));
	const at = samples.find((s) => s.error === worst)?.time ?? 0;
	console.log(`${where}: ${run.kind}, ${run.cells} cells of ${run.h} m, ${run.steps} steps, ${samples.length} snapshots; worst error ${worst.toExponential(2)} at ${at.toFixed(1)} s (tolerance ${MASS_BALANCE_TOLERANCE})`);
	console.log(`${where} at the end: ${describeMass(run.final)}`);
	for (const sample of samples) expect(sample.error, `the balance at ${sample.time.toFixed(1)} s: ${describeMass(sample.mass)}`).not.toBeNull();
	for (const sample of samples) expect(sample.error!, `the balance at ${sample.time.toFixed(1)} s: ${describeMass(sample.mass)}`).toBeLessThan(MASS_BALANCE_TOLERANCE);
}

/**
 * The run of the Studio with flow through it closes, and every term of the books is there. The balance closing says the solver loses
 * no smoke between its fields and its tally. It cannot say that the tally counts the right amount, because a release that is the wrong
 * size is still released into the fields and counted. So the terms that can be worked out without running the solver are checked
 * against that: the smoke in the air at the start, and the smoke released.
 */
export function expectBalance(run: BalanceRun, where: string) {
	const { samples, final } = run;
	expectCloses(run, where);

	// Every term is there, and none is a rounding error beside the others: a term at 1 % of what came in is 10 times the tolerance.
	const gained = massGained(final);
	const share = (term: number) => term / gained;
	expect(share(final.initial), 'the smoke in the air at the start').toBeGreaterThan(0.01);
	expect(share(final.emitted), 'the smoke released').toBeGreaterThan(0.01);
	expect(share(final.inflow), 'the smoke the wind carried in').toBeGreaterThan(0.01);
	expect(share(final.inAir), 'the smoke still in the air').toBeGreaterThan(0.01);
	expect(share(final.outflow), 'the smoke that left through Openings').toBeGreaterThan(0.01);
	expect(share(final.removed), 'the smoke the purifier took out').toBeGreaterThan(0.01);
	expect(share(final.deposited), 'the smoke that settled or stuck to a surface').toBeGreaterThan(0.005);
	expect(massAccounted(final)).toBeGreaterThan(0);

	// Every total only grows: a tally that read back a stale or wrapped slot would fall.
	for (const term of ['emitted', 'inflow', 'outflow', 'removed', 'deposited'] as const)
		samples.reduce((before, sample) => {
			expect(sample.mass[term], `${term} at ${sample.time.toFixed(1)} s never falls`).toBeGreaterThanOrEqual(before);
			return sample.mass[term];
		}, 0);

	// The two terms that do not depend on the solver's answer. The starting smoke is its concentration times the mass of the air in the fluid cells.
	const air = run.cells * run.h ** 3 * AIR.rho;
	expect(samples[0].mass.initial / (STARTING_SMOKE * air), 'smoke at the start: concentration times the mass of the air').toBeCloseTo(1, 4);
	expect(samples[0].mass.inAir / samples[0].mass.initial, 'the first snapshot reads back what was put in').toBeCloseTo(1, 4);
	// The release is a rate for a time, and nothing else adds to it.
	expect(final.emitted / (RELEASE_RATE * RELEASE_SECONDS), 'smoke released: the rate times the time').toBeCloseTo(1, 3);
}
