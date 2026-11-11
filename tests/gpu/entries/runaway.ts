/* Browser side of runaway.gpu.ts: the page's session on the real WebGPU device, with air it would never make written into a running world. */
import { plans } from '$lib/experiments/airflow/homes/plans';
import { emptyReadout } from '$lib/experiments/airflow/readouts';
import { RUNAWAY_ANNOUNCEMENT, runawayOf } from '$lib/experiments/airflow/sim/runaway';
import { SimulationSession, type SessionParams } from '$lib/experiments/airflow/sim/session';
import type { BackendFactory } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

let shared: GpuContext | null = null;
const gpu: BackendFactory = async (config, initial) => GpuBackend.create(config, initial, (shared ??= await GpuContext.create()));

const FRAME = 1 / 60;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the studio on the GPU until its air runs, stops the clock so no step comes between the write and the read, reads the fields,
 * writes `kind` into every face of the x velocity (a NaN, or 50 m/s), and lets the session find it. Then resets, as the HUD's button does.
 * Returns what was seen at each point, for the spec to check.
 */
async function runAway(kind: 'non-finite' | 'too-fast') {
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
	const session = new SimulationSession({ params, plans, models: [], make: gpu, cellSize: () => 0.2, readout, invalidate: () => {}, reducedMotion: () => false, announce: (m) => announced.push(m), volume: true });
	const draw = async (frames: number) => {
		for (let n = 0; n < frames; n++) {
			session.update(FRAME);
			for (let k = 0; k < 4; k++) await pause(5);
		}
	};
	const until = async (done: () => boolean, frames = 600) => {
		for (let n = 0; n < frames && !done(); n++) await draw(1);
		return done();
	};
	try {
		await until(() => session.world !== null);
		await draw(20);
		const before = { status: readout.status, backend: session.world?.backend.kind ?? null, volume: session.latest.volume !== null };

		params.clock = { ...params.clock, paused: true };
		await draw(3);
		const world = session.world!;
		const fields = await world.backend.readFields();
		fields.u.fill(kind === 'non-finite' ? NaN : 50);
		world.backend.writeFields(fields);
		// What the device itself reports for the written air: a GPU's max may pass over a NaN, so the other numbers must carry it.
		const { diagnostics } = await world.backend.snapshot({});
		const direct = {
			runaway: runawayOf(diagnostics)?.kind ?? null,
			maxSpeed: String(diagnostics.maxSpeed),
			divergence: String(diagnostics.divergence),
			cfl: String(diagnostics.cfl)
		};

		const caught = await until(() => readout.status === 'runaway', 120);
		const stopped = {
			caught,
			status: readout.status,
			note: readout.note,
			worldDropped: session.world === null,
			volume: session.latest.volume !== null,
			probes: readout.probes.length,
			rooms: readout.rooms.length,
			said: announced.filter((m) => m === RUNAWAY_ANNOUNCEMENT).length
		};
		await draw(10);
		const waiting = { status: readout.status, world: session.world !== null };

		// Reset, as the HUD's button does it: the run's key changes. And the clock runs again.
		params.restarts++;
		params.clock = { ...params.clock, paused: false };
		await until(() => session.world !== null && readout.status === 'running');
		await draw(20);
		const after = { status: readout.status, volume: session.latest.volume !== null, backend: session.world?.backend.kind ?? null };
		return { before, direct, stopped, waiting, after };
	} finally {
		session.dispose();
	}
}

(window as any).runaway = { runAway };
(window as any).harnessReady = true;
