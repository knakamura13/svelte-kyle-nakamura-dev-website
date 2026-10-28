import { deviceInputs, type DeviceInputs } from '../devices/solver';
import type { DeviceModel } from '../devices/types';
import { rasterizePlan, type Raster } from '../homes/rasterize';
import { exteriorState } from '../homes/weather';
import type { PlanId, HomePlan } from '../homes/types';
import type { BackendUpdate, FlowBackend, FaceUpdate } from '../solver/backend';
import { AIR, type Emitter, type FluidProperties, type SolverConfig } from '../solver/types';
import type { Setup } from '../state';

/**
 * Particulate properties of PM2.5 indoors: the speed it drifts down in still air and the speed at which it sticks to every
 * surface, m/s, for the one lumped mass the solver carries. docs/research/airflow/devices-and-particulates.md, section 6,
 * has the sources, the working and the uncertainty. Settling is the mass-weighted Stokes speed of a published PM2.5 size
 * distribution (a factor of 3 either way, and less for fresh smoke). Deposition is what makes a room's total loss about
 * 0.4 per hour, as measured in occupied homes (a factor of 2.5 either way), once settling's share is taken out: measured rates
 * contain settling, so the two are not set apart. tests/solver/particle-constants.spec.ts holds both to the note.
 */
export const PARTICLE = { settling: 3e-5, deposition: 5e-5 } as const;

/** Makes a backend for a solver configuration, with the starting temperature (kelvin above the reference) and particulates of the air. The page passes WebGPU-or-worker selection; tests pass the CPU. */
export type BackendFactory = (config: SolverConfig, initial: { theta: number; particulates: number }) => FlowBackend | Promise<FlowBackend>;

export interface WorldOptions {
	plans: readonly HomePlan[];
	models: ReadonlyMap<string, DeviceModel>;
	make: BackendFactory;
	/** Cell size, m. A divisor of 0.6 so the box equals the footprint. */
	h: number;
	/** Turbulence closure and pressure cycles are the solver's defaults unless overridden. */
	config?: Partial<SolverConfig>;
}

/** The fluid for a setup: air with buoyancy referenced to the indoor starting temperature, and PM2.5's settling and deposition. */
export function fluidFor(setup: Setup): FluidProperties {
	return { ...AIR, beta: 1 / (setup.conditions.indoorTemp + 273.15), ...PARTICLE };
}

/**
 * How far open each opening of `plan` is, 0 to 1 of its travel, by id: what the visitor set, or the plan's own position.
 * A window fan fills its window, so the window is open as far as it goes while the fan runs and shut by the fan when it
 * is off. The solver and the dollhouse both draw from this, so they never disagree about a window.
 */
export function effectiveOpenings(plan: Pick<HomePlan, 'openings'>, setup: Setup, models: ReadonlyMap<string, DeviceModel>): Map<string, number> {
	const amounts = new Map<string, number>();
	for (const spec of plan.openings) amounts.set(spec.id, setup.openings[spec.id] ?? spec.open ?? 0);
	for (const device of setup.devices) {
		const model = models.get(device.model);
		if (model?.kind === 'window-fan' && device.opening && amounts.has(device.opening)) amounts.set(device.opening, device.power > 0.005 ? 1 : 0);
	}
	return amounts;
}

/** How many worlds have been built, for each one's `id`. */
let worlds = 0;

/**
 * A plan, a grid and a running backend, kept in step with the visitor's setup. Changes that the solver can take
 * while it runs (opening a window, moving a fan, new weather) are applied in place; changes to what the box is (the
 * plan, the furniture, the starting indoor temperature, which resets the air) need a new world: `apply` says so.
 */
export class World {
	readonly raster: Raster;
	readonly fluid: FluidProperties;
	/** Which world this is, so another can name it without holding on to it once it is gone. */
	readonly id = ++worlds;
	/**
	 * The world whose air this one took (the session's `carry`: the same Home on another grid), or null for air of its own. What draws the
	 * air goes on from the picture it had of that one, rather than starting again.
	 */
	carriedFrom: number | null = null;
	/** Bumps whenever the setup is applied, which may open or close faces of `raster.geometry`: what draws from the geometry knows to look again. */
	revision = 0;
	private setup: Setup;
	private inputs: DeviceInputs | null = null;
	private emitterCells: number | null = null;

	private constructor(
		readonly backend: FlowBackend,
		readonly options: WorldOptions,
		setup: Setup,
		raster: Raster,
		fluid: FluidProperties
	) {
		this.setup = setup;
		this.raster = raster;
		this.fluid = fluid;
	}

	static async create(setup: Setup, options: WorldOptions) {
		const plan = options.plans.find((p) => p.id === setup.plan);
		if (!plan) throw new Error(`There is no plan called ${setup.plan}.`);
		const raster = rasterizePlan(plan, options.h, { furniture: setup.furniture });
		const fluid = fluidFor(setup);
		const config: SolverConfig = { grid: raster.spec, fluid, geometry: raster.geometry, ...options.config };
		const backend = await options.make(config, { theta: 0, particulates: 0 });
		const world = new World(backend, options, setup, raster, fluid);
		world.applyAll(0);
		return world;
	}

	get current() {
		return this.setup;
	}

	/** True if `next` can be applied in place; false if the box itself changed and a new world is needed. */
	canApply(next: Setup) {
		return next.plan === this.setup.plan && next.furniture === this.setup.furniture && next.conditions.indoorTemp === this.setup.conditions.indoorTemp;
	}

	/** Applies a setup that differs only in what the solver can take while running. `time` is the page's simulated seconds, for oscillating fans. */
	apply(next: Setup, time: number) {
		if (!this.canApply(next)) throw new Error('This change needs a new world.');
		this.setup = next;
		this.applyAll(time);
	}

	private applyAll(time: number) {
		const amounts = effectiveOpenings(this.raster.plan, this.setup, this.options.models);
		const faces: FaceUpdate[] = this.raster.openings.map((o) => o.update(amounts.get(o.spec.id) ?? 0));
		// A fan is placed against how far each opening is open, which it reads from the page's own face arrays (the ones the solver
		// was built from). A backend in this thread writes them as a side effect of `update`, one update late, and a worker, which
		// has a copy, never does, so they are brought up to date here, before the fans are rasterized.
		const { au, av, aw } = this.raster.geometry;
		for (const { axis, indices, values } of faces) {
			const open = axis === 0 ? au : axis === 1 ? av : aw;
			for (let n = 0; n < indices.length; n++) open[indices[n]] = values[n];
		}
		this.revision++;
		const exterior = exteriorState(this.raster, this.setup.conditions, this.setup.conditions.indoorTemp, this.fluid);
		this.inputs = deviceInputs({ devices: this.setup.devices, models: this.options.models, raster: this.raster, fluid: this.fluid, time });
		for (const fan of this.inputs.windowFans)
			for (const slot of fan.slots) {
				exterior.sides[fan.side][3 * slot + 1] = fan.speed;
				exterior.sides[fan.side][3 * slot + 2] = fan.shutoff;
			}
		const change: BackendUpdate = { faces, exterior, fans: this.inputs.fans, sinks: this.inputs.sinks };
		this.backend.update(change);
	}

	/** Pushes oscillating fans' new aim to the solver; call each drawn frame while any fan oscillates. */
	updateOscillation(time: number) {
		if (!this.setup.devices.some((d) => d.oscillation.on && d.power > 0.005)) return;
		this.inputs = deviceInputs({ devices: this.setup.devices, models: this.options.models, raster: this.raster, fluid: this.fluid, time });
		this.backend.update({ fans: this.inputs.fans });
	}

	/** Index of a device's fan disk in the backend's fan flows (for the delivered-flow readout), or undefined for a device without one. */
	fanIndexOf(deviceId: string) {
		return this.inputs?.fanIndex.get(deviceId);
	}

	/**
	 * Releases smoke at a point (x, y, z in metres) at `rate` mg of particles per second, spread over the 27 cells
	 * around it so it does not depend on the grid; null stops it.
	 */
	emit(point: { x: number; y: number; z: number } | null, rate: number) {
		if (!point || rate <= 0) {
			if (this.emitterCells !== null) this.backend.update({ emitters: [] });
			this.emitterCells = null;
			return;
		}
		const { nx, ny, nz, h } = this.raster.spec;
		const sx = nx + 1;
		const sxy = (nx + 1) * (ny + 1);
		const ci = Math.min(nx - 1, Math.max(0, Math.floor(point.x / h)));
		const cj = Math.min(ny - 1, Math.max(0, Math.floor(point.y / h)));
		const ck = Math.min(nz - 1, Math.max(0, Math.floor(point.z / h)));
		const cells: number[] = [];
		for (let dk = -1; dk <= 1; dk++)
			for (let dj = -1; dj <= 1; dj++)
				for (let di = -1; di <= 1; di++) {
					const i = ci + di;
					const j = cj + dj;
					const k = ck + dk;
					if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
					const cell = i + sx * j + sxy * k;
					if (this.raster.geometry.fluid[cell]) cells.push(cell);
				}
		if (!cells.length) return;
		const emitter: Emitter = { cells: Uint32Array.from(cells), share: new Float32Array(cells.length).fill(1 / cells.length), rate };
		this.emitterCells = cells.length;
		this.backend.update({ emitters: [emitter] });
	}

	dispose() {
		this.backend.dispose();
	}
}

export type { PlanId };
