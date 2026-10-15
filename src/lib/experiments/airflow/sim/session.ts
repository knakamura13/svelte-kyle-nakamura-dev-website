import type { DeviceModel } from '../devices/types';
import type { HomePlan } from '../homes/types';
import { emissionRate } from '../emission';
import type { AirflowReadout, HoverReading, ProbeReading, RoomReading } from '../readouts';
import { BackendUnavailable, type BackendFailure, type Snapshot } from '../solver/backend';
import { POINT_FIELDS, type Slice } from '../solver/types';
import type { Clock, Pin, Setup, View } from '../state';
import { RollingMean, SliceHistory } from './history';
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
	 * The auto-tuner. The session tells it how each drawn frame of the running world went; when it asks for another cell size the world
	 * is built again at that size, from the same setup (so the Probes and Devices stay), `readout.tuning` says so and the screen reader is told.
	 * `cellSize` is how that size is asked for, so it must be the choice that this tuner belongs to. Absent, the grid stays as `cellSize` gave it.
	 */
	tuning?: Tuning;
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

/**
 * Owns the running simulation for the page: builds a world for the setup, keeps it in step with changes, steps it
 * each drawn frame, reads back snapshots and turns them into the readouts the page shows. The scene draws from
 * `latest` and asks for hover readings; nothing here touches three.js.
 */
export class SimulationSession {
	/** What the scene draws: the newest slice and particles. `version` bumps when they change. */
	latest: { slice: Slice | null; tracers: Float32Array | null; smoke: Float32Array | null; version: number } = { slice: null, tracers: null, smoke: null, version: 0 };
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

	constructor(private readonly options: SessionOptions) {
		this.options.readout.status = 'loading';
	}

	private get params() {
		return this.options.params;
	}

	private keyFor(params: SessionParams) {
		return `${params.restarts}|${params.setup.plan}|${params.setup.furniture}|${params.setup.conditions.indoorTemp}|${this.retunes}`;
	}

	/** Builds a world for the current setup in the background; the old one keeps running until the new one is ready. */
	private build() {
		const key = this.keyFor(this.params);
		const generation = ++this.generation;
		const setup = JSON.parse(JSON.stringify(this.params.setup)) as Setup;
		const smoke = this.params.startingSmoke;
		const plan = this.options.plans.find((p) => p.id === setup.plan);
		if (!plan) return;
		this.options.readout.status = this.world ? this.options.readout.status : 'loading';
		this.building = Promise.resolve(this.options.cellSize(plan))
			.then((h) =>
				// Choosing the backend takes a moment, and the page may have left, or the world it was for failed, before it is done.
				this.disposed || generation !== this.generation
					? null
					: World.create(setup, {
							plans: this.options.plans,
							models: new Map(this.options.models.map((m) => [m.id, m])),
							make: (config, initial) => this.options.make(config, { ...initial, particulates: smoke }),
							h
						})
			)
			.then((world) => {
				if (!world) return;
				if (this.disposed || generation !== this.generation) {
					world.dispose();
					return;
				}
				const old = this.world;
				this.unwatch?.();
				this.world = world;
				this.worldKey = key;
				this.failedKey = '';
				// A new world has no picture yet: ask for one at once, paused or not.
				this.requestKey = '';
				this.appliedSignature = JSON.stringify(setup);
				this.simTime = 0;
				this.owed = 0;
				this.rate = this.params.clock.speed;
				this.history.clear();
				this.probeHistory.clear();
				this.lastEmission = '';
				this.latest = { slice: null, tracers: null, smoke: null, version: this.latest.version + 1 };
				const { readout } = this.options;
				readout.physics = { ...readout.physics, backend: world.backend.kind, cellSize: world.raster.spec.h, cells: world.backend.fluidCells, time: 0, mass: null, reducedDetail: world.backend.kind === 'cpu' };
				readout.status = this.params.clock.paused ? 'paused' : 'running';
				// A world that a retune asked for says so for as long as it runs; any other (a restart, another Home) says only what the tuner notes about the device.
				this.retuned = this.retuning;
				this.retuning = '';
				this.sayTuning(this.options.tuning?.note(world.backend.kind) ?? '');
				world.backend.configureParticles({ tracers: TRACERS, smoke: SMOKE, scale: SMOKE_DENSE, seed: 1 });
				this.unwatch = world.backend.onFailure?.((failure) => this.lose(world, failure)) ?? null;
				old?.dispose();
				this.pending = false;
				this.options.invalidate();
			})
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
		backend.stepParticles(Math.min(real, 0.05));
		// Simulated seconds sent per real second, averaged over `RATE_WINDOW`: what the Physics panel and the clock show.
		if (real > 0) this.rate += (1 - Math.exp(-real / RATE_WINDOW)) * ((steps * dt) / real - this.rate);
	}

	private requestSnapshot(world: World, dtReal: number) {
		this.sinceSnapshot += dtReal;
		this.sinceRooms += dtReal;
		const { params } = this;
		// What the visitor has just asked to see (a probe pinned, the slice moved, a new world's first picture) is read at
		// once. The throttle below counts drawn frames, and a paused page draws none, so it would never get there.
		const wants = `${params.view.sliceHeight}|${params.probes.map((p) => `${p.id}@${p.x},${p.y},${p.z}`).join(';')}`;
		const asked = wants !== this.requestKey;
		if (this.pending || (!asked && this.sinceSnapshot < SNAPSHOT_INTERVAL)) return;
		this.requestKey = wants;
		this.sinceSnapshot = 0;
		const wantRooms = this.sinceRooms >= ROOM_INTERVAL;
		if (wantRooms) this.sinceRooms = 0;
		const generation = this.generation;
		const probes = params.probes.map((p) => ({ ...p }));
		const points = new Float32Array(probes.flatMap((p) => [p.x, p.y, p.z]));
		this.pending = true;
		const snapshot = world.backend.snapshot({ sliceY: params.view.sliceHeight, particles: true, rooms: wantRooms });
		const sampled = probes.length ? world.backend.samplePoints(points) : Promise.resolve(new Float32Array(0));
		void Promise.all([snapshot, sampled])
			.then(([shot, values]) => {
				if (this.disposed || generation !== this.generation || world !== this.world) return;
				// Readouts are throttled while frames come; a paused page asks for few reads, so each one is shown.
				this.take(world, shot, probes, values, asked || params.clock.paused);
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

	/** Turns a snapshot into what the scene draws and what the page shows. */
	private take(world: World, shot: Snapshot, probes: Pin[], values: Float32Array, show: boolean) {
		const { readout } = this.options;
		const reference = world.current.conditions.indoorTemp;
		if (shot.slice) {
			this.latest = { slice: shot.slice, tracers: shot.tracers ?? this.latest.tracers, smoke: shot.smoke ?? this.latest.smoke, version: this.latest.version + 1 };
			this.history.push(this.simTime, shot.slice);
		} else if (shot.tracers) this.latest = { ...this.latest, tracers: shot.tracers, smoke: shot.smoke ?? null, version: this.latest.version + 1 };

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
		readout.physics = {
			...readout.physics,
			time: d.time,
			maxSpeed: d.maxSpeed,
			divergence: d.divergence,
			mass: d.mass,
			rate: this.params.clock.paused ? 0 : this.rate
		};
		const flows: Record<string, number> = {};
		for (const device of world.current.devices) {
			const index = world.fanIndexOf(device.id);
			if (index !== undefined && shot.fanFlow[index] !== undefined) flows[device.id] = shot.fanFlow[index];
		}
		readout.deviceFlow = flows;
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
