import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { emptyReadout } from '../../src/lib/experiments/airflow/readouts';
import { RUNAWAY_SPEED, runawayOf } from '../../src/lib/experiments/airflow/sim/runaway';
import { SimulationSession, type SessionParams } from '../../src/lib/experiments/airflow/sim/session';
import type { BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import type { Diagnostics } from '../../src/lib/experiments/airflow/solver/types';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker } from './channel';

/** The runaway guard (#59): a non-finite number or air past 40 m/s in a snapshot stops the run, hides the air and says so, and Reset recovers. */

const FRAME = 1 / 60;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const calm = (): Diagnostics => ({
	time: 12,
	steps: 240,
	maxSpeed: 1.8,
	divergence: 2e-4,
	cfl: 0.5,
	mass: { initial: 1, emitted: 2, inflow: 0.5, outflow: 0.4, removed: 0.1, deposited: 0.01, inAir: 2.99 }
});

test.describe('the runaway check', () => {
	test('passes calm air and catches a non-finite number anywhere in the diagnostics, or air past 40 m/s', () => {
		expect(runawayOf(calm())).toBeNull();
		expect(runawayOf({ ...calm(), maxSpeed: RUNAWAY_SPEED - 0.1 })).toBeNull();
		expect(runawayOf({ ...calm(), maxSpeed: 50 })).toEqual({ kind: 'too-fast', speed: 50 });
		expect(runawayOf({ ...calm(), maxSpeed: NaN })?.kind).toBe('non-finite');
		expect(runawayOf({ ...calm(), maxSpeed: Infinity })?.kind).toBe('non-finite');
		// A GPU's max may pass over a NaN, so a NaN that shows only in a sum is still caught.
		expect(runawayOf({ ...calm(), divergence: NaN })?.kind).toBe('non-finite');
		expect(runawayOf({ ...calm(), mass: { ...calm().mass, inAir: NaN } })?.kind).toBe('non-finite');
		expect(runawayOf({ ...calm(), mass: { ...calm().mass, outflow: -Infinity } })?.kind).toBe('non-finite');
	});

	test('costs nothing measurable: a million checks take well under a frame', () => {
		const d = calm();
		let caught = 0;
		const started = performance.now();
		for (let n = 0; n < 1_000_000; n++) if (runawayOf(d)) caught++;
		const ms = performance.now() - started;
		console.log(`a million runaway checks: ${ms.toFixed(1)} ms, ${((1000 * ms) / 1_000_000).toFixed(3)} µs each`);
		expect(caught).toBe(0);
		// The session checks one snapshot in twenty milliseconds at most.
		expect(ms / 1_000_000).toBeLessThan(0.01);
	});
});

const backends: Record<string, BackendFactory> = {
	'the CPU in the page': (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial),
	'the worker': (config, initial) => WorkerBackend.create(inMemoryWorker().port, config, initial)
};

/** What is injected into the running world's air: a NaN in one face, or 50 m/s through a block of faces. */
const injections: Record<string, (u: Float32Array, fluid: (n: number) => boolean) => void> = {
	'a non-finite value': (u, fluid) => {
		for (let n = 0; n < u.length; n++)
			if (fluid(n)) {
				u[n] = NaN;
				return;
			}
	},
	'a 50 m/s velocity': (u, fluid) => {
		let block = 0;
		for (let n = 0; n < u.length && block < 40; n++)
			if (fluid(n)) {
				u[n] = 50;
				block++;
			}
	}
};

for (const [backendName, make] of Object.entries(backends))
	for (const [injectionName, inject] of Object.entries(injections))
		test(`${injectionName} in the air on ${backendName} stops the run, hides the air, says why once, and a reset starts it again`, async () => {
			const params: SessionParams = {
				setup: blankSetup('studio'),
				view: { ...DEFAULT_VIEW, units: 'metric' },
				clock: { ...DEFAULT_CLOCK },
				probes: [],
				emission: { strength: 0.5, active: false },
				restarts: 0,
				startingSmoke: 0
			};
			const readout = emptyReadout();
			const announced: string[] = [];
			const session = new SimulationSession({ params, plans, models: [], make, cellSize: () => 0.2, readout, invalidate: () => {}, reducedMotion: () => false, announce: (m) => announced.push(m), volume: true });
			const draw = async (frames: number) => {
				for (let n = 0; n < frames; n++) {
					session.update(FRAME);
					for (let k = 0; k < 4; k++) await pause(5);
				}
			};
			try {
				while (!session.world) await draw(1);
				await draw(12);
				expect(readout.status).toBe('running');
				expect(session.latest.volume, 'the air has a picture').not.toBeNull();
				// The clock stops, so no step comes between the injection and the read that finds it.
				params.clock = { ...params.clock, paused: true };
				await draw(2);
				const world = session.world!;
				const fields = await world.backend.readFields();
				const geometry = world.raster.geometry;
				inject(fields.u, (n) => geometry.fluid[n] === 1);
				world.backend.writeFields(fields);
				await draw(8);
				expect(readout.status, 'the runaway is caught').toBe('runaway');
				expect(readout.note).toContain('Reset');
				expect(session.world, 'the broken world is dropped').toBeNull();
				expect(session.latest.volume, 'nothing is left to draw').toBeNull();
				expect(readout.probes).toEqual([]);
				expect(announced.filter((m) => m.includes('ran away')), 'said once').toHaveLength(1);
				// Nothing is built again until the visitor asks.
				await draw(6);
				expect(session.world).toBeNull();
				expect(readout.status).toBe('runaway');
				// Reset, as the HUD's button does it: the run's key changes.
				params.restarts++;
				params.clock = { ...params.clock, paused: false };
				while (!session.world) await draw(1);
				await draw(12);
				expect(readout.status, 'running again').toBe('running');
				expect(session.latest.volume).not.toBeNull();
			} finally {
				session.dispose();
			}
		});
