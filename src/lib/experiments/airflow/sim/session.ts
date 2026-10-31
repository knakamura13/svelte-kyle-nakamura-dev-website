import type { DeviceModel } from '../devices/types';
import type { HomePlan } from '../homes/types';
import { emissionRate } from '../emission';
import type { AirflowReadout, HoverReading, ProbeReading, RoomReading } from '../readouts';
import { BackendUnavailable, type BackendFailure, type Snapshot } from '../solver/backend';
import { POINT_FIELDS, type MassBalance, type Slice } from '../solver/types';
import type { Volume } from '../solver/volume';
import type { Clock, Pin, Setup, View } from '../state';
import { WARMUP_STEP, measureSteps, type Measured } from './calibrate';
import { RollingMean, SliceHistory } from './history';
import { resampleFields, type GridAir } from './resample';
import type { Tuning } from './tuner';
import { World, type BackendFactory } from './world';

/** The part of the page's state the session reads. The experience implements it; tests can pass a plain object. */
export interface SessionParams {
	setup: Setup;
	view: View;
	clock: Clock;
	probes: Pin[];
	emission: { strength: number; active: boolean };
	restarts: number;
	startingSmoke: number;
}

export interface SessionOptions {
	params: SessionParams;
	plans: readonly HomePlan[];
	models: readonly DeviceModel[];
	make: BackendFactory;
	/** Picks the cell size for a plan, m. Called whenever a world is built; it may take a moment, while the choice of backend is made. */
	cellSize: (plan: HomePlan) => number | Promise<number>;
	readout: AirflowReadout;
	/** Asks the Stage for another frame. */
	invalidate: () => void;
	reducedMotion: () => boolean;
	/** Says something to a screen reader, politely: what the session does on its own (a simulation that starts again after the graphics device was lost, or on another grid). */
	announce?: (message: string) => void;
	/**
	 * The auto-tuner. When it has a size to measure the device at (`probe`), the first world is built there and stepped as fast as it goes
	 * before it is shown (the warm-up), and the tuner is told what a step cost (`calibrate`); the world is then the size `cellSize` gives,
	 * with the air the warm-up stepped moved onto it. After that the session tells it how each drawn frame of the running world went; when
	 * it asks for another cell size the world is built again at that size, from the same setup (so the Probes and Devices stay), with the
	 * running world's air moved onto it, and `readout.tuning` says so and the screen reader is told. `cellSize` is how a size is asked
	 * for, so it must be the choice that this tuner belongs to. Absent, the grid stays as `cellSize` gave it.
	 */
	tuning?: Tuning;
	/**
	 * Read the whole box at a coarser grid (`latest.volume`) for renderers that fill the rooms: up to ten times a second while the
	 * clock runs, and once more for the moment it stopped at. Off unless asked for, because it is a pass over the grid and a read of up to 1.5 MB.
	 */
	volume?: boolean;
	/** Keep the backend's own tracers and smoke particles and read them back with each snapshot (`latest.tracers`, `latest.smoke`). On unless turned off. */
	particles?: boolean;
}

/** Longest real time one frame's steps may take before the session lets the simulation run slower than real time, s. */
const FRAME_BUDGET = 0.012;
/** Most steps a backend that works in the background may have unfinished, when it does not say (`FlowBackend.maxInFlight`): what the worker needs. */
const MAX_IN_FLIGHT = 2;
/** Real seconds over which the rate readout averages, so it does not jump between frames that sent a step and frames that did not. */
const RATE_WINDOW = 0.5;
/** Largest time step, s, and the cell-crossing count a step may have: semi-Lagrangian advection stays accurate to a few cells per step. */
const MAX_STEP = 1 / 20;
const MAX_CELLS_PER_STEP = 3;
/** Real seconds between snapshot reads, and between per-room reads (which cost a pass over the grid). */
const SNAPSHOT_INTERVAL = 1 / 20;
const ROOM_INTERVAL = 0.5;
/** Real seconds between volume reads while the clock runs: the renderers that draw it blend from one to the next, and ten a second is as often as they need. */
export const VOLUME_INTERVAL = 0.1;
/** Real seconds between writes of the numbers the Dock shows, so a reactive page is not rewritten every frame. */
const READOUT_INTERVAL = 0.12;

/** Particles the backend keeps: tracers that drift with the air, and smoke puffs that carry the particulate concentration. */
export const TRACERS = 12_000;
export const SMOKE = 6_000;
/**
 * Particulate concentration, ppm by mass, that counts as dense smoke: the backend seeds puffs toward it and the scene's
 * smoke fades up to it from 2.5 decades below. At 0.3 the smoke shows down to 0.001 ppm, where the particulates layer's
 * scale begins, so a cloud thinning out in a draught stays visible for as long as the layer would show it.
 */
export const SMOKE_DENSE = 0.3;

/** How far the first world is from being ready to show, for the loading screen. */
export interface WarmUp {
	/** 0 to 1: the device measured, the world built at its size, and the air's first picture read back. */
	share: number;
	/** True while the warm-up measures the device: anything else that runs on the GPU now (drawing the world) would be measured with it. */
	measuring: boolean;
}

/** What a world carries from the worlds before it that handed it their air: their simulated seconds, and their smoke's books. */
interface Carried {
	time: number;
	books: MassBalance | null;
}

const FRESH: Carried = { time: 0, books: null };

/** The books of a run that went on in another world: what came in and went out is added up, the starting smoke is the first world's, and the smoke in the air is the newest world's. */
function combineBooks(before: MassBalance, now: MassBalance): MassBalance {
	return {
		initial: before.initial,
		emitted: before.emitted + now.emitted,
		inflow: before.inflow + now.inflow,
		outflow: before.outflow + now.outflow,
		removed: before.removed + now.removed,
		deposited: before.deposited + now.deposited,
		inAir: now.inAir
	};
}

const airOf = (world: World): GridAir => ({ spec: world.raster.spec, ...world.raster.geometry });

/** The newest reads of the running world, for the scene to draw. */
export interface Latest {
	slice: Slice | null;
	tracers: Float32Array | null;
	smoke: Float32Array | null;
	/** The whole box on a coarser grid, when the session reads it (`SessionOptions.volume`). */
	volume: Volume | null;
	/** The simulated second `volume` shows. */
	volumeAt: number;
	version: number;
}

/**
 * Owns the running simulation for the page: builds a world for the setup, keeps it in step with changes, steps it
 * each drawn frame, reads back snapshots and turns them into the readouts the page shows. The scene draws from
 * `latest` and asks for hover readings; nothing here touches three.js.
 */
export class SimulationSession {
	/**
	 * What the scene draws: the newest slice, particles and volume, all of the running world (they are cleared when another world takes
	 * over). `version` bumps when any of them changes; `volumeAt` is the simulated second the volume shows.
	 */
	latest: Latest = { slice: null, tracers: null, smoke: null, volume: null, volumeAt: 0, version: 0 };
	world: World | null = null;
	/** Simulated seconds since the world was built. */
	simTime = 0;

	private building: Promise<void> | null = null;
	private worldKey = '';
	/** The key of a build that failed: it is not tried again until the key changes (a restart, another home), or every frame would retry it. */
	private failedKey = '';
	/** Set when no solver can run in this browser (no WebGPU and no Web Worker): nothing changes that while the page is open, so no later start is tried. */
	private unavailable = false;
	/** Stops listening for the running world's backend to fail. */
	private unwatch: (() => void) | null = null;
	/** Simulated time the clock has asked for that no step has covered yet, s: what a backend that is behind could not take, carried to the next frame. */
	private owed = 0;
	private wasPaused = true;
	private lastSpeed = 0;
	/** What the last snapshot request was made for (the slice height and the probes), so a change asks for another at once. */
	private requestKey = '';
	private appliedSignature = '';
	private generation = 0;
	private pending = false;
	private sinceSnapshot = 1;
	private sinceRooms = 1;
	private sinceVolume = 1;
	/** The simulated moment the last volume read was asked for, as text; empty when none has been, or the last one came back without a volume. */
	private volumeKey = '';
	private sinceReadout = 1;
	private stepCost = 0.002;
	private rate = 0;
	private lastEmission = '';
	private emitPoint: { x: number; y: number; z: number } | null = null;
	private readonly history = new SliceHistory();
	private readonly probeHistory = new Map<string, RollingMean>();
	private roomsDue = false;
	private disposed = false;
	/** How many times the tuner has asked for another cell size. Part of a world's key, so the next frame builds a world and asks `cellSize` again. */
	private retunes = 0;
	/** What the tuner said about the retune whose world is being built, until that world is on show and can say so. */
	private retuning = '';
	/** What it said about the retune that made the running world, which that world shows as long as it runs. */
	private retuned = '';
	/** What the tuner says about the grid on this device apart from a retune, as last shown and told. */
	private note = '';
	/** How far the warm-up's measurement of the device has got, 0 to 1, or null when none is running; and the furthest `warmUp` has said. */
	private measuring: number | null = null;
	private warmed = 0;
	/** What the running world carries from the worlds that handed it their air (its own time and books start from zero). */
	private carried: Carried = FRESH;

	constructor(private readonly options: SessionOptions) {
		this.options.readout.status = 'loading';
	}

	private get params() {
		return this.options.params;
	}

	/** What makes a world a new run: a restart, another Home, the furniture, the starting indoor temperature. */
	private runKey(params: SessionParams) {
		return `${params.restarts}|${params.setup.plan}|${params.setup.furniture}|${params.setup.conditions.indoorTemp}`;
	}

	/** A world's key: its run, and the tuner's changes of size, which carry the run on on another grid. */
	private keyFor(params: SessionParams) {
		return `${this.runKey(params)}|${this.retunes}`;
	}

	/**
	 * How far the first world is from ready to show, for the loading screen: the device being measured, the world being built at the
	 * size the measurement gives, and the air's first picture. A session that cannot run any solver, or failed to start, is as ready as
	 * it will get.
	 */
	warmUp(): WarmUp {
		const { status } = this.options.readout;
		const measuring = this.measuring !== null;
		let share: number;
		if (status === 'unsupported' || status === 'error') share = 1;
		else if (measuring) share = 0.1 + 0.7 * this.measuring!;
		else if (!this.world) share = this.building ? 0.05 : 0;
		else share = (this.options.volume ? this.latest.volume !== null : this.latest.slice !== null || this.latest.tracers !== null) ? 1 : 0.9;
		// Between the measurement and the world it picks, the warm-up is where the measurement left it, not back at the start.
		this.warmed = Math.max(this.warmed, share);
		return { share: this.warmed, measuring };
	}

	/**
	 * Builds a world for the current setup in the background; the old one keeps running until the new one is ready. The first world on
	 * a device the tuner has not measured is warmed up first (`warm`); a world that a retune asked for takes the running world's air.
	 */
	private build() {
		const key = this.keyFor(this.params);
		const generation = ++this.generation;
		const setup = JSON.parse(JSON.stringify(this.params.setup)) as Setup;
		const smoke = this.params.startingSmoke;
		const plan = this.options.plans.find((p) => p.id === setup.plan);
		if (!plan) return;
		// The same run on another grid: the tuner changed the size, so the air carries on where it was.
		const from = this.world && this.worldKey.startsWith(`${this.runKey(this.params)}|`) ? this.world : null;
		const before = this.carried;
		this.options.readout.status = this.world ? this.options.readout.status : 'loading';
		// Choosing the backend takes a moment, and the page may have left, or the world it was for failed, before it is done.
		const stale = () => this.disposed || generation !== this.generation;
		const create = (h: number) =>
			World.create(setup, {
				plans: this.options.plans,
				models: new Map(this.options.models.map((m) => [m.id, m])),
				make: (config, initial) => this.options.make(config, { ...initial, particulates: smoke }),
				h
			});
		this.building = (async () => {
			const { tuning } = this.options;
			const probe = tuning?.probe ? await tuning.probe(plan) : null;
			if (stale()) return;
			let shown: { world: World; carried: Carried; simTime: number } | null;
			if (probe !== null) {
				let trial = await create(probe);
				// A GPU that failed while the world was built on it leaves it on the worker, which is measured at its own finest size, not the GPU's.
				const again = stale() ? probe : await tuning!.probe!(plan);
				if (again !== null && Math.abs(again - probe) > 1e-9 && !stale()) {
					trial.dispose();
					trial = await create(again);
				}
				shown = await this.warm(trial, stale);
			} else {
				const h = await this.options.cellSize(plan);
				if (stale()) return;
				const world = await create(h);
				shown = { world, carried: FRESH, simTime: 0 };
				if (from && !stale()) {
					try {
						const carried = await this.carry(from, world, before);
						shown = { world, carried, simTime: carried.time };
					} catch (error) {
						world.dispose();
						throw error;
					}
				}
			}
			if (!shown) return;
			if (stale()) {
				shown.world.dispose();
				return;
			}
			this.adopt(shown.world, key, setup, shown.carried, shown.simTime);
		})()
			.catch((error) => {
				// A start that fails because the page is already leaving (the device goes with it) is not news, and nor is one that
				// was overtaken: the world it was for failed or was replaced while it ran, and the next frame builds again.
				if (this.disposed || generation !== this.generation) return;
				this.failedKey = key;
				this.retuning = '';
				// A browser that can run no solver at all is not a fault: it just cannot, so it is a warning, said once.
				const unavailable = error instanceof BackendUnavailable;
				if (unavailable) {
					this.unavailable = true;
					console.warn(`The simulation cannot run in this browser: ${error.message}`);
				} else console.error('The simulation could not start.', error);
				this.options.readout.status = unavailable ? 'unsupported' : 'error';
				this.options.readout.note = unavailable
					? 'This browser has neither WebGPU nor Web Workers, so it cannot run the simulation. The home is still shown.'
					: 'The simulation could not start. The controls and numbers still work.';
			})
			.finally(() => {
				this.building = null;
				if (!this.disposed) this.options.invalidate();
			});
	}

	/**
	 * The warm-up: `trial` is the first world of a device the tuner has not measured, at the finest size the backend allows. It is
	 * stepped as fast as the backend goes for about half a second, and the tuner is told what a step cost. If the size the tuner then
	 * gives is the trial's, the trial is the world, with the air it stepped; otherwise a world is built at that size and the trial's
	 * air is moved onto it. Resolves to the world to show, or null when the page has left or another world was asked for meanwhile.
	 */
	private async warm(trial: World, stale: () => boolean): Promise<{ world: World; carried: Carried; simTime: number } | null> {
		let measured: Measured | null = null;
		let time = 0;
		this.measuring = 0;
		this.options.invalidate();
		// The load is timed in performance marks (`airflow:*`, engine.ts): the warm-up's world is built, then the device is measured.
		performance.mark('airflow:warm-up');
		try {
			measured = await measureSteps(trial.backend, {
				dt: WARMUP_STEP,
				before: () => {
					trial.updateOscillation(time);
					time += WARMUP_STEP;
				},
				progress: (share) => (this.measuring = share),
				alive: () => !stale()
			});
		} catch (error) {
			if (!stale()) console.warn('The warm-up could not measure this device, so the grid is the starting guess.', error);
		} finally {
			this.measuring = null;
		}
		performance.mark('airflow:measured', { detail: { kind: trial.backend.kind, cells: trial.backend.grid.cells, ...measured } });
		if (stale()) {
			trial.dispose();
			return null;
		}
		this.options.tuning?.calibrate?.(trial.backend.kind, measured && { cells: trial.backend.grid.cells, ms: measured.ms, steps: measured.steps });
		let keep = false;
		try {
			const h = await this.options.cellSize(trial.raster.plan);
			if (stale()) return null;
			if (Math.abs(h - trial.raster.spec.h) < 1e-9) {
				keep = true;
				return { world: trial, carried: FRESH, simTime: time };
			}
			const world = await World.create(trial.current, { ...trial.options, h });
			if (stale()) {
				world.dispose();
				return null;
			}
			try {
				const carried = await this.carry(trial, world, FRESH);
				return { world, carried, simTime: carried.time };
			} catch (error) {
				// The warm-up's world cannot be read (its GPU device was lost while it was measured): the new world starts from still air.
				if (stale()) {
					world.dispose();
					return null;
				}
				console.warn('The warm-up’s air could not be moved to the grid it picked, so the air starts from rest.', error);
				return { world, carried: FRESH, simTime: 0 };
			}
		} finally {
			if (!keep) trial.dispose();
		}
	}

	/**
	 * Moves the air of `from` onto `to`, a world of the same Home on another grid: the fields are read back, resampled and written in
	 * (resample.ts), with the simulated time and the smoke's books `from` had, so the run carries on where it was. The fields and the
	 * books are asked for together, so nothing is stepped between the two reads.
	 */
	private async carry(from: World, to: World, before: Carried): Promise<Carried> {
		const [shot, fields] = await Promise.all([from.backend.snapshot({}), from.backend.readFields()]);
		to.backend.writeFields(resampleFields(airOf(from), fields, airOf(to)));
		to.carriedFrom = from.id;
		const { time, mass } = shot.diagnostics;
		return { time: before.time + time, books: before.books ? combineBooks(before.books, mass) : mass };
	}

	/** Puts a built world on show in place of the running one. `carried` is what it took from the world whose air was moved onto it, if any. */
	private adopt(world: World, key: string, setup: Setup, carried: Carried, simTime: number) {
		const old = this.world;
		const handed = carried !== FRESH;
		this.unwatch?.();
		this.world = world;
		this.worldKey = key;
		this.failedKey = '';
		// A new world has no picture yet: ask for one at once, paused or not.
		this.requestKey = '';
		this.volumeKey = '';
		this.appliedSignature = JSON.stringify(setup);
		this.simTime = simTime;
		this.carried = carried;
		this.owed = 0;
		this.rate = this.params.clock.speed;
		this.lastEmission = '';
		if (handed) {
			// The run goes on: the probes' means and the last picture stay (the air's renderers wait for a picture of the new grid).
			this.latest = { ...this.latest, version: this.latest.version + 1 };
		} else {
			this.history.clear();
			this.probeHistory.clear();
			this.latest = { slice: null, tracers: null, smoke: null, volume: null, volumeAt: 0, version: this.latest.version + 1 };
		}
		const { readout } = this.options;
		readout.physics = {
			...readout.physics,
			backend: world.backend.kind,
			cellSize: world.raster.spec.h,
			cells: world.backend.fluidCells,
			time: simTime,
			mass: carried.books,
			reducedDetail: world.backend.kind === 'cpu'
		};
		readout.status = this.params.clock.paused ? 'paused' : 'running';
		// A world that a retune asked for says so for as long as it runs; any other (a restart, another Home) says only what the tuner notes about the device.
		this.retuned = this.retuning;
		this.retuning = '';
		this.sayTuning(this.options.tuning?.note(world.backend.kind) ?? '');
		if (this.options.particles !== false) world.backend.configureParticles({ tracers: TRACERS, smoke: SMOKE, scale: SMOKE_DENSE, seed: 1 });
		this.unwatch = world.backend.onFailure?.((failure) => this.lose(world, failure)) ?? null;
		old?.dispose();
		this.pending = false;
		this.options.invalidate();
	}

	/**
	 * The running world's backend can no longer run: the GPU device was lost, or the worker crashed. The world is dropped at
	 * once, so a dead backend is never stepped or read again, and what was still on its way back is ignored. A lost device
	 * is answered by building the world again, now on the worker (the choice of backend has already moved on); the air starts
	 * from rest, because nothing can be read back from a device that is gone. A worker that crashed is not retried until the
	 * visitor restarts, or it would crash again every time.
	 */
	private lose(world: World, failure: BackendFailure) {
		if (this.disposed || world !== this.world) return;
		const { readout } = this.options;
		this.generation++;
		this.unwatch?.();
		this.unwatch = null;
		this.world = null;
		this.pending = false;
		// A grid that was asked for on a backend that is gone is not asked of the next one: it is sized afresh, and says nothing of the old retune.
		this.retuning = '';
		this.retuned = '';
		this.carried = FRESH;
		world.dispose();
		readout.physics = { ...readout.physics, backend: null, rate: null };
		if (failure.reason === 'lost') {
			console.warn(`The simulation's backend was lost: ${failure.message}`);
			readout.status = 'loading';
			this.options.announce?.('The graphics device was lost, so the simulation is starting again.');
		} else {
			console.error(`The simulation's backend failed: ${failure.message}`);
			this.failedKey = this.worldKey;
			readout.status = 'error';
			readout.note = 'The simulation stopped because its worker failed. Restart it to try again.';
			this.options.announce?.('The simulation stopped.');
		}
		this.options.invalidate();
	}

	/** The point on the Slice where smoke is being released, or null. Set by the scene from the pointer. */
	setEmitPoint(point: { x: number; y: number; z: number } | null) {
		this.emitPoint = point;
	}

	/** Advances the simulation for one drawn frame of `dtReal` real seconds. Returns true while it needs more frames. */
	update(dtReal: number): boolean {
		const { params } = this;
		const wanted = this.keyFor(params);
		if (!this.building && !this.unavailable && this.failedKey !== wanted && (!this.world || this.worldKey !== wanted)) this.build();
		const world = this.world;
		// With no world yet, more frames are wanted only while one is being built; after a failure nothing changes until the setup does.
		if (!world) return this.building !== null;
		const { readout } = this.options;

		// Changes the solver can take while it runs.
		const signature = JSON.stringify(params.setup);
		if (signature !== this.appliedSignature && world.canApply(params.setup)) {
			world.apply(JSON.parse(signature) as Setup, this.simTime);
			this.appliedSignature = signature;
		}
		this.syncEmission(world);

		const paused = params.clock.paused;
		readout.status = paused ? 'paused' : 'running';
		if (!paused) {
			// The average of the rate starts from what the clock asks when the clock starts again or its speed changes: a backend is
			// taken to keep up until the numbers say it does not, so the page does not call a pause or a new speed "slower than real time".
			if (this.wasPaused || params.clock.speed !== this.lastSpeed) {
				this.rate = params.clock.speed;
				readout.physics = { ...readout.physics, rate: this.rate };
			}
			this.advance(world, Math.min(dtReal, 0.1) * params.clock.speed, Math.min(dtReal, 0.1));
		}
		this.wasPaused = paused;
		this.lastSpeed = params.clock.speed;
		this.requestSnapshot(world, dtReal);
		this.tune(world, wanted, dtReal);
		// A paused simulation still wants frames while its picture is catching up.
		return !paused || this.pending || this.building !== null;
	}

	/**
	 * Tells the tuner how this frame went, and sees to it that the world is built again at the size it asks for. Only frames of the
	 * world the tuner sized are told. Not while the clock is paused: nothing is stepping, so nothing can be measured. And not while
	 * another world is being built, or the key says the running one is no longer wanted: that world is still on show, but the tuner
	 * has already started counting the next one (`cellSize` resets it), and the old world's frames must not count toward it.
	 *
	 * A new size is part of the world's key (`retunes`), so the next frame builds a world for it from the same setup, which is where
	 * the Probes and Devices live: they are untouched. The old world runs until the new one is ready, and then the readout and the screen
	 * reader say that the simulation restarted.
	 */
	private tune(world: World, wanted: string, real: number) {
		const { tuning } = this.options;
		if (!tuning || this.params.clock.paused || this.building || wanted !== this.worldKey) return;
		const kind = world.backend.kind;
		const retune = tuning.observe(kind, { dt: real, rate: this.rate, paused: false });
		if (retune) {
			this.retuning = retune.message;
			this.retunes++;
			return;
		}
		// The tuner may have found something to say without a new size (a processor that cannot keep up even on the coarsest grid).
		const note = tuning.note(kind);
		if (note !== this.note) this.sayTuning(note);
	}

	/**
	 * Puts what the tuner has to say into the readout, for the status line, and tells a screen reader what in it is new. The status
	 * line shows it outside its live region, as it does the rate, so it is announced here, once: a retune, and a note the first time it is seen.
	 */
	private sayTuning(note: string) {
		const fresh = note !== this.note ? note : '';
		this.note = note;
		this.options.readout.tuning = [this.retuned, note].filter(Boolean).join(' ');
		const words = [this.retuned, fresh].filter(Boolean).join(' ');
		if (words) this.options.announce?.(words);
	}

	private syncEmission(world: World) {
		const { emission } = this.params;
		const point = emission.active ? this.emitPoint : null;
		const rate = point ? emissionRate(emission.strength) / 60 : 0;
		const key = point ? `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)},${rate.toFixed(5)}` : '';
		if (key === this.lastEmission) return;
		this.lastEmission = key;
		world.emit(point, rate);
	}

	/**
	 * Steps the backend for the `budget` simulated seconds the clock asks of this frame, as many steps as the backend can take,
	 * and records how fast it went. How many that is depends on the backend. One that does its work inside `step` (the CPU in
	 * the page) is timed: a frame may spend `FRAME_BUDGET` on steps. One that works in the background (the worker, and the GPU,
	 * whose steps only queue) says how many steps it has not finished (`stepsInFlight`), and gets no more than its `maxInFlight`
	 * unfinished, so a backend that cannot keep up is not buried.
	 *
	 * Time the backend could not take stays owed to the next frame, which then sends a longer step, up to the stable one: a
	 * worker that needs 30 ms a step is sent a step about every 30 ms that covers that long, not one of 17 ms every frame that it
	 * cannot finish. Owed time beyond one stable step is dropped, so a backend that is too slow runs the simulation slower than
	 * real time (`rate` says by how much) and does not fall further behind. That is what makes `rate` the throughput a backend
	 * really achieved, on the GPU too, and so what the auto-tuner can judge by.
	 */
	private advance(world: World, budget: number, real: number) {
		const { backend } = world;
		const { h } = world.raster.spec;
		const maxSpeed = Math.max(this.options.readout.physics.maxSpeed, 0.5);
		const stable = Math.min(MAX_STEP, (MAX_CELLS_PER_STEP * h) / maxSpeed);
		const background = backend.stepsInFlight !== undefined;
		this.owed += budget;
		const wanted = Math.max(1, Math.ceil(this.owed / stable));
		const room = background ? (backend.maxInFlight ?? MAX_IN_FLIGHT) - backend.stepsInFlight! : Math.max(1, Math.floor(FRAME_BUDGET / Math.max(this.stepCost, 1e-4)));
		const steps = Math.max(0, Math.min(wanted, room));
		const dt = steps > 0 ? Math.min(stable, this.owed / steps) : 0;
		const started = performance.now();
		for (let n = 0; n < steps; n++) {
			world.updateOscillation(this.simTime);
			backend.step(dt);
			this.simTime += dt;
		}
		if (!background && steps > 0) {
			const spent = (performance.now() - started) / 1000;
			this.stepCost = 0.8 * this.stepCost + 0.2 * (spent / steps);
		}
		this.owed = Math.min(Math.max(0, this.owed - steps * dt), stable);
		if (this.options.particles !== false) backend.stepParticles(Math.min(real, 0.05));
		// Simulated seconds sent per real second, averaged over `RATE_WINDOW`: what the Physics panel and the clock show.
		if (real > 0) this.rate += (1 - Math.exp(-real / RATE_WINDOW)) * ((steps * dt) / real - this.rate);
	}

	private requestSnapshot(world: World, dtReal: number) {
		this.sinceSnapshot += dtReal;
		this.sinceRooms += dtReal;
		this.sinceVolume += dtReal;
		const { params } = this;
		const paused = params.clock.paused;
		// The volume, like the slice, is keyed by what it would show: here the simulated moment. While the clock runs it is read ten
		// times a second; once the clock stops it is read once more, at once, for the moment it stopped at, and not again until the
		// air moves (a new world's key is empty, so its first picture includes one).
		const moment = String(this.simTime);
		const volume = this.options.volume === true && moment !== this.volumeKey && (paused || this.volumeKey === '' || this.sinceVolume >= VOLUME_INTERVAL);
		// What the visitor has just asked to see (a probe pinned, the slice moved, a new world's first picture, the air where it stopped) is
		// read at once. The throttle below counts drawn frames, and a paused page draws none, so it would never get there.
		const wants = `${params.view.sliceHeight}|${params.probes.map((p) => `${p.id}@${p.x},${p.y},${p.z}`).join(';')}`;
		const asked = wants !== this.requestKey || (paused && volume);
		if (this.pending || (!asked && this.sinceSnapshot < SNAPSHOT_INTERVAL)) return;
		this.requestKey = wants;
		this.sinceSnapshot = 0;
		const wantRooms = this.sinceRooms >= ROOM_INTERVAL;
		if (wantRooms) this.sinceRooms = 0;
		if (volume) {
			this.volumeKey = moment;
			this.sinceVolume = 0;
		}
		const generation = this.generation;
		const probes = params.probes.map((p) => ({ ...p }));
		const points = new Float32Array(probes.flatMap((p) => [p.x, p.y, p.z]));
		const at = this.simTime;
		const revision = world.revision;
		this.pending = true;
		const snapshot = world.backend.snapshot({ sliceY: params.view.sliceHeight, particles: this.options.particles !== false, rooms: wantRooms, volume });
		const sampled = probes.length ? world.backend.samplePoints(points) : Promise.resolve(new Float32Array(0));
		void Promise.all([snapshot, sampled])
			.then(([shot, values]) => {
				if (this.disposed || generation !== this.generation || world !== this.world) return;
				// A backend still reading the last volume back leaves this one out: ask again with the next snapshot.
				if (volume && !shot.volume && this.volumeKey === moment) this.volumeKey = '';
				// Readouts are throttled while frames come; a paused page asks for few reads, so each one is shown. The fan flows are in the
				// order of the fans the world had when the read was asked for, so they are only matched to devices if the setup is still that one.
				this.take(world, shot, probes, values, asked || params.clock.paused, at, revision === world.revision);
				// A paused page draws a frame only when told something changed, and a new reading is a change.
				this.options.invalidate();
			})
			.catch((error) => {
				// A read that fails because the page is leaving (a buffer unmapped under it) is not news, and nor is one of a world that was
				// replaced: it is disposed, and a worker rejects what it was still asked. Only the running world's reads count.
				if (!this.disposed && generation === this.generation && world === this.world) console.error('Reading the simulation failed.', error);
			})
			.finally(() => {
				this.pending = false;
			});
	}

	/**
	 * Turns a snapshot into what the scene draws and what the page shows. `at` is the simulated second it was asked for, and `sameFans`
	 * whether the world's devices are still the ones it was asked with (otherwise the device flows wait for the next snapshot).
	 */
	private take(world: World, shot: Snapshot, probes: Pin[], values: Float32Array, show: boolean, at: number, sameFans: boolean) {
		const { readout } = this.options;
		const reference = world.current.conditions.indoorTemp;
		if (shot.slice || shot.tracers || shot.volume) {
			const { latest } = this;
			this.latest = {
				slice: shot.slice ?? latest.slice,
				tracers: shot.tracers ?? latest.tracers,
				smoke: shot.smoke ?? latest.smoke,
				volume: shot.volume ?? latest.volume,
				volumeAt: shot.volume ? at : latest.volumeAt,
				version: latest.version + 1
			};
		}
		if (shot.slice) this.history.push(this.simTime, shot.slice);

		// Probes: their readings now and their ten-second means.
		const stride = POINT_FIELDS.length;
		const readings: ProbeReading[] = probes.map((probe, n) => {
			const base = n * stride;
			const u = values[base];
			const v = values[base + 1];
			const w = values[base + 2];
			const speed = Math.hypot(u, v, w);
			let mean = this.probeHistory.get(probe.id);
			if (!mean) this.probeHistory.set(probe.id, (mean = new RollingMean()));
			mean.push(this.simTime, speed);
			return {
				id: probe.id,
				label: `Probe ${probe.id.slice(1)}`,
				x: probe.x,
				y: probe.y,
				z: probe.z,
				u,
				v,
				w,
				speed,
				averageSpeed: mean.mean,
				temperature: reference + values[base + 3],
				particulates: values[base + 4],
				inAir: this.inAirAt(world, probe)
			};
		});
		for (const id of [...this.probeHistory.keys()]) if (!probes.some((p) => p.id === id)) this.probeHistory.delete(id);

		this.sinceReadout += SNAPSHOT_INTERVAL;
		if (!show && this.sinceReadout < READOUT_INTERVAL && !shot.rooms) return;
		this.sinceReadout = 0;
		const d = shot.diagnostics;
		readout.probes = readings;
		const { carried } = this;
		readout.physics = {
			...readout.physics,
			time: carried.time + d.time,
			maxSpeed: d.maxSpeed,
			divergence: d.divergence,
			mass: carried.books ? combineBooks(carried.books, d.mass) : d.mass,
			rate: this.params.clock.paused ? 0 : this.rate
		};
		if (sameFans) {
			const flows: Record<string, number> = {};
			for (const device of world.current.devices) {
				const index = world.fanIndexOf(device.id);
				if (index !== undefined && shot.fanFlow[index] !== undefined) flows[device.id] = shot.fanFlow[index];
			}
			readout.deviceFlow = flows;
		}
		if (shot.rooms) {
			const names = world.raster.plan.rooms;
			readout.rooms = shot.rooms.map(
				(room, n): RoomReading => ({
					id: names[n].id,
					name: names[n].name,
					volume: room.volume,
					speed: room.speed,
					temperature: reference + room.theta,
					particulates: room.particulates,
					inflow: room.inflow,
					changesPerHour: room.changesPerHour
				})
			);
		}
	}

	/** Whether a point is in air (not inside furniture or outside the home), by the world's geometry. */
	private inAirAt(world: World, point: { x: number; y: number; z: number }) {
		const { nx, ny, nz, h } = world.raster.spec;
		const i = Math.floor(point.x / h);
		const j = Math.floor(point.y / h);
		const k = Math.floor(point.z / h);
		if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
		return world.raster.geometry.fluid[i + (nx + 1) * j + (nx + 1) * (ny + 1) * k] === 1;
	}

	/** What the air is doing at a point on the Slice, for the hover readout: from the newest slice, with its ten-second mean. Null before the first slice. */
	hover(x: number, z: number): HoverReading | null {
		const slice = this.latest.slice;
		const world = this.world;
		if (!slice || !world) return null;
		const reference = world.current.conditions.indoorTemp;
		const gx = x / slice.h - 0.5;
		const gz = z / slice.h - 0.5;
		const i0 = Math.max(0, Math.min(slice.nx - 1, Math.floor(gx)));
		const k0 = Math.max(0, Math.min(slice.nz - 1, Math.floor(gz)));
		const i1 = Math.min(slice.nx - 1, i0 + 1);
		const k1 = Math.min(slice.nz - 1, k0 + 1);
		const fx = Math.max(0, Math.min(1, gx - i0));
		const fz = Math.max(0, Math.min(1, gz - k0));
		const at = (array: Float32Array) => {
			const a = array[i0 + slice.nx * k0] * (1 - fx) + array[i1 + slice.nx * k0] * fx;
			const b = array[i0 + slice.nx * k1] * (1 - fx) + array[i1 + slice.nx * k1] * fx;
			return a * (1 - fz) + b * fz;
		};
		const inAir = slice.fluid[Math.max(0, Math.min(slice.nx - 1, Math.floor(x / slice.h))) + slice.nx * Math.max(0, Math.min(slice.nz - 1, Math.floor(z / slice.h)))] === 1;
		const u = at(slice.u);
		const v = at(slice.v);
		const w = at(slice.w);
		return {
			x,
			y: slice.y,
			z,
			u,
			v,
			w,
			speed: Math.hypot(u, v, w),
			averageSpeed: this.history.averageAt(x, z),
			temperature: reference + at(slice.theta),
			particulates: at(slice.particulates),
			inAir
		};
	}

	dispose() {
		this.disposed = true;
		this.generation++;
		this.unwatch?.();
		this.unwatch = null;
		this.world?.dispose();
		this.world = null;
	}
}
