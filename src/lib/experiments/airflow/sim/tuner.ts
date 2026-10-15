import type { HomePlan } from '../homes/types';

/**
 * The auto-tuner: which cell size a device runs a Home at. Nothing here touches the solver, the page or a clock: the session feeds
 * it one sample for every drawn frame and does what it answers, so the whole decision runs in Node with made-up frames.
 *
 * What a device can hold is a number of cells, nearly whatever the Home is (a step costs about as much as it has cells), so the
 * tuner learns a cell budget and every Home gets the finest grid that fits it. It starts from a guess for the kind of backend and
 * measures, a window of a few seconds at a time, whether the page still draws at 30 frames per second or better and the solver
 * still keeps up with real time. A good window lets it try the next finer grid; a bad one steps down by the size of the shortfall
 * and ends the climb for good, and cells that failed are never tried again, so it cannot go up and down. A phone or a small tablet
 * is never measured: it gets the coarsest grid and a note.
 */

/** Cell sizes, m, coarse to fine. Every one divides 0.6 (`PLAN_MODULE`), so a Home's solver box is its footprint. 0.075 is the finest the random-setup stress sweeps have passed at. */
export const CELL_SIZES = [0.3, 0.2, 0.15, 0.1, 0.075] as const;

/** The most cells a world may have, whatever was measured: the GPU's memory and the stable step, and the worker's patience. */
export const MAX_CELLS = { webgpu: 800_000, cpu: 60_000 } as const;

/**
 * Where the climb starts, in cells. The GPU's is what 0.15 m cells give the house and about what 0.1 m cells give the studio; the
 * worker's is what 0.2 m cells give the house, which a fast processor runs at about real time (41 ms a step, 20 steps a second).
 */
export const START_BUDGET = { webgpu: 110_000, cpu: 42_000 } as const;

/** Seconds of drawn, unpaused frames to ignore after a world starts (the kernels compile, the first reads come back), and the seconds one verdict is judged over. */
export const WARMUP = 2;
export const WINDOW = 3;

/** Frames per second at or above which a window is good, and below which it is bad. In between the grid stays as it is. */
export const GOOD_FPS = 40;
export const BAD_FPS = 28;
/** How much of real time the solver must have kept up with (at most 1×, whatever the clock asks for) for a window to be good, and below which it is bad. */
export const GOOD_KEEP = 0.95;
export const BAD_KEEP = 0.8;

/** A frame longer than this is the tab having been hidden or the machine asleep: it is not measured. */
const GAP = 0.5;
/** A step down aims at this fraction of the cells that would just have held, so the next window is good and not marginal. */
const MARGIN = 0.8;

export type BackendKind = 'webgpu' | 'cpu';

export interface TunerOptions {
	kind: BackendKind;
	/** A phone or small tablet: the coarsest grid, and no measuring. */
	small?: boolean;
	/** The cells of a plan's solver box at a cell size. Defaults to the footprint at that size. */
	cells?: (plan: Footprint, h: number) => number;
	/** Cells the first world may have; defaults to `START_BUDGET[kind]`. */
	budget?: number;
}

type Footprint = Pick<HomePlan, 'width' | 'depth' | 'ceiling'>;

/** One drawn frame, as the session sees it. */
export interface FrameSample {
	/** Real seconds since the previous frame. */
	dt: number;
	/** Simulated seconds per real second the solver is achieving right now, or null before it knows. */
	rate: number | null;
	/** Whether the clock is paused: nothing is being stepped, so nothing can be measured. */
	paused: boolean;
}

/** What the session should do about the cell size. */
export interface Retune {
	/** The cell size to rebuild the world at, m. */
	size: number;
	direction: 'finer' | 'coarser';
	/** One sentence for the Dock: what happened and why, for the status line and a screen reader. */
	message: string;
}

export const cellsOf = (plan: Footprint, h: number) => Math.round(plan.width / h) * Math.round(plan.depth / h) * Math.round(plan.ceiling / h);

interface Measured {
	plan: Footprint;
	h: number;
	cells: number;
}

const centimetres = (h: number) => `${+(h * 100).toFixed(1)} cm`;

export class Tuner {
	readonly kind: BackendKind;
	readonly small: boolean;
	private readonly cellsAt: (plan: Footprint, h: number) => number;
	/** The cells the device is believed to hold; the next world is the finest that fits. */
	private budget: number;
	/** The most cells a window has been good at, and the fewest it has been bad at. */
	private best = 0;
	private worst = Infinity;
	private settled = false;
	/** Seconds of drawn frames since the world started, and the current window's tallies. */
	private age = 0;
	private frames = 0;
	private elapsed = 0;
	private kept = 0;
	private rated = 0;
	private skipped = 0;
	/** The world being measured. */
	private current: Measured | null = null;
	/** Words about the choice for the Dock, when there is something to say about why a device runs the grid it does. */
	note: string | null = null;

	constructor(options: TunerOptions) {
		this.kind = options.kind;
		this.small = options.small ?? false;
		this.cellsAt = options.cells ?? cellsOf;
		this.budget = options.budget ?? START_BUDGET[options.kind];
		if (this.small) this.note = 'This device runs the coarsest grid. The simulation is best on a laptop.';
	}

	/** How many cells the tuner believes the device holds. For the Physics panel and for tests. */
	get cellBudget() {
		return this.budget;
	}

	/** Whether the choice has stopped changing on its own. */
	get isSettled() {
		return this.small || this.settled;
	}

	/** The finest size whose box for `plan` has no more than `cells`, never beyond the backend's maximum nor into cells that failed. */
	private fit(plan: Footprint, cells: number) {
		const limit = Math.min(cells, MAX_CELLS[this.kind], this.worst - 1);
		let best: number = CELL_SIZES[0];
		for (const h of CELL_SIZES) if (this.cellsAt(plan, h) <= limit) best = h;
		return best;
	}

	/** The cell size for the next world of `plan`. Call it whenever a world is built: a new Home, a restart and a retune all do. */
	pick(plan: Footprint): number {
		const h = this.small ? CELL_SIZES[0] : this.fit(plan, this.budget);
		this.current = { plan, h, cells: this.cellsAt(plan, h) };
		this.age = 0;
		this.restartWindow();
		return h;
	}

	private restartWindow() {
		this.frames = 0;
		this.elapsed = 0;
		this.kept = 0;
		this.rated = 0;
		this.skipped = 0;
	}

	/**
	 * One drawn frame of the world that `pick` last sized. Returns a new size when the window it completes calls for one, and the
	 * session rebuilds the world at it (calling `pick` again, which returns that size).
	 */
	observe(sample: FrameSample): Retune | null {
		const world = this.current;
		if (this.small || !world || sample.paused) return null;
		if (sample.dt > GAP) {
			this.skipped++;
			return null;
		}
		this.age += sample.dt;
		if (this.age < WARMUP) return null;
		this.frames++;
		this.elapsed += sample.dt;
		if (sample.rate !== null) {
			this.kept += Math.min(1, sample.rate);
			this.rated++;
		}
		if (this.elapsed < WINDOW) return null;

		// The worker steps off the page's thread, so how fast the page draws says nothing about it (a browser that draws in software is slow whatever the grid is).
		const fps = this.kind === 'cpu' ? Infinity : this.frames / this.elapsed;
		// A solver with no rate yet has told nothing, so it is not held against it.
		const keep = this.rated ? this.kept / this.rated : 1;
		const hidden = this.skipped > 0.3 * (this.frames + this.skipped);
		this.restartWindow();
		if (hidden) return null;
		if (fps < BAD_FPS || keep < BAD_KEEP) return this.stepDown(world, fps, keep);
		if (fps >= GOOD_FPS && keep >= GOOD_KEEP) return this.stepUp(world);
		this.settled = true;
		return null;
	}

	private stepUp(world: Measured): Retune | null {
		this.best = Math.max(this.best, world.cells);
		if (this.settled) return null;
		const next = CELL_SIZES[CELL_SIZES.indexOf(world.h as (typeof CELL_SIZES)[number]) + 1];
		const cells = next === undefined ? Infinity : this.cellsAt(world.plan, next);
		if (cells > MAX_CELLS[this.kind] || cells >= this.worst) {
			this.settled = true;
			return null;
		}
		this.budget = Math.max(this.budget, cells);
		return { size: next, direction: 'finer', message: `The device has room to spare, so the simulation restarted on a finer grid, with cells of ${centimetres(next)}.` };
	}

	private stepDown(world: Measured, fps: number, keep: number): Retune | null {
		this.worst = Math.min(this.worst, world.cells);
		this.settled = true;
		// The cells that would just have held, with a margin, and never more than a window has already been good at.
		const holds = world.cells * Math.min(keep / GOOD_KEEP, fps / GOOD_FPS, 1) * MARGIN;
		this.budget = Math.max(1, Math.min(this.budget, holds, this.best > 0 && this.best < world.cells ? this.best : Infinity));
		let next = this.fit(world.plan, this.budget);
		if (!(next > world.h + 1e-9)) {
			// At least one size coarser, unless this is already the coarsest there is.
			const coarser = CELL_SIZES[CELL_SIZES.indexOf(world.h as (typeof CELL_SIZES)[number]) - 1];
			if (coarser === undefined) {
				this.note = 'This device cannot keep up with real time even on the coarsest grid, so the simulation runs slower than the clock.';
				return null;
			}
			next = coarser;
			this.budget = Math.min(this.budget, this.cellsAt(world.plan, next));
		}
		const why = fps < BAD_FPS ? `The page was drawing ${Math.round(fps)} frames a second` : `The simulation ran at ${Math.round(keep * 100)}% of real time`;
		return { size: next, direction: 'coarser', message: `${why}, so the simulation restarted on a coarser grid, with cells of ${centimetres(next)}.` };
	}
}
