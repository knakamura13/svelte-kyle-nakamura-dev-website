import type { HomePlan } from '../homes/types';
import { budgetFor, type StepCost } from './calibrate';

/**
 * The auto-tuner: which cell size a device runs a Home at. Nothing here touches the solver, the page or a clock: the session tells it
 * what the warm-up measured and then one sample for every drawn frame, and does what it answers, so the whole decision runs in Node.
 *
 * What a device can hold is a number of cells, nearly whatever the Home is (a step costs about as much as it has cells), so the tuner
 * keeps a cell budget and every Home gets the finest grid that fits it. The budget is measured while the loading screen shows: the
 * first world is built at the finest grid the backend allows (`probe`) and stepped as fast as it goes for half a second, and what a
 * step cost sets the budget (`calibrate`, calibrate.ts). So the grid the visitor first sees is the one it keeps: nothing climbs once
 * the world is on show.
 *
 * Then the tuner watches, a window of a few seconds at a time, whether the page still draws at 28 frames a second or better and the
 * solver keeps up with at least 80% of real time. A device that falls behind steps down by the size of the shortfall, but never in the
 * first minute after the warm-up and never twice in a minute (`HOLD`), and cells that failed are never tried again, so it cannot go up
 * and down. A phone or a small tablet is never measured: it gets the coarsest grid and a note.
 */

/** Cell sizes, m, coarse to fine. Every one divides 0.6 (`PLAN_MODULE`), so a Home's solver box is its footprint. 0.075 is the finest the random-setup stress sweeps have passed at. */
export const CELL_SIZES = [0.3, 0.2, 0.15, 0.1, 0.075] as const;

/** The most cells a world may have, whatever was measured: the GPU's memory and the stable step, and the worker's patience. */
export const MAX_CELLS = { webgpu: 800_000, cpu: 60_000 } as const;

/**
 * What a device is taken to hold when its warm-up could not be measured. The GPU's is what 0.15 m cells give the house and about what
 * 0.1 m cells give the studio; the worker's is what 0.2 m cells give the house, which a fast processor runs at about real time.
 */
export const START_BUDGET = { webgpu: 110_000, cpu: 42_000 } as const;

/** Seconds of drawn, unpaused frames of a new world that are not judged (the first reads come back, the air settles), and the seconds one verdict is judged over. */
export const WARMUP = 2;
export const WINDOW = 3;

/**
 * Seconds of drawn, unpaused frames after the warm-up picked the grid, or after the grid last changed, before it may change again: no
 * change in the visitor's first minute, and at most one a minute after it.
 */
export const HOLD = 60;

/** Frames per second below which a window is bad, and at which a step down aims. */
export const GOOD_FPS = 40;
export const BAD_FPS = 28;
/** How much of real time the solver must keep up with (at most 1×, whatever the clock asks for): below `BAD_KEEP` a window is bad, and a step down aims at `GOOD_KEEP`. */
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
	/** Cells a world may have before the device is measured; defaults to `START_BUDGET[kind]`. */
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
	/**
	 * One short sentence: what happened and why, for the status line and a screen reader. It does not say the new cell size, which the
	 * status line gives in the units the visitor reads, and it is short because on a phone it shares two lines with the cell size.
	 */
	message: string;
}

/**
 * What the session asks of the tuner of the device it runs on: the size to warm a Home's first world up at and what that warm-up
 * measured, then the frames of the world it runs, and what it has to say about the grid. The choice of backend (backends.ts) owns one
 * tuner for each kind of backend and answers for the one the world is on.
 */
export interface Tuning {
	/**
	 * One drawn frame of the world that runs on `kind`, and a new cell size when the window it completes calls for one. The session
	 * calls it once for every frame it draws while the clock runs, and moves the world's air onto that size.
	 */
	observe(kind: BackendKind, sample: FrameSample): Retune | null;
	/** Words about why this device runs the grid it does (a phone's coarsest grid, a processor that cannot keep up), or '' when there is nothing to say. */
	note(kind: BackendKind): string;
	/**
	 * The cell size to build `plan`'s world at for the warm-up, on the backend the next world runs on, or null when nothing needs
	 * measuring (the device was measured already, a phone, a size the address asks for). The session then steps that world as fast as
	 * it goes, tells `calibrate` what a step cost, and asks the cell size again. Absent: nothing is ever measured.
	 */
	probe?(plan: HomePlan): Promise<number | null>;
	/** What the warm-up on `kind` measured, or null when it could not be measured (the budget then stays the starting guess). */
	calibrate?(kind: BackendKind, cost: StepCost | null): void;
}

export const cellsOf = (plan: Footprint, h: number) => Math.round(plan.width / h) * Math.round(plan.depth / h) * Math.round(plan.ceiling / h);

interface Measured {
	plan: Footprint;
	h: number;
	cells: number;
}

export class Tuner {
	readonly kind: BackendKind;
	readonly small: boolean;
	private readonly cellsAt: (plan: Footprint, h: number) => number;
	/** The cells the device is believed to hold; the next world is the finest that fits. */
	private budget: number;
	/** The most cells a window has been good at, and the fewest it has been bad at. */
	private best = 0;
	private worst = Infinity;
	private calibrated = false;
	/** Seconds of drawn frames since the world started, and since the grid was picked or last changed; the current window's tallies. */
	private age = 0;
	private calm = 0;
	private frames = 0;
	private elapsed = 0;
	private kept = 0;
	private rated = 0;
	private skipped = 0;
	/** The world being watched. */
	private current: Measured | null = null;
	/** Words about the choice for the status line, when there is something to say about why a device runs the grid it does. */
	note: string | null = null;

	constructor(options: TunerOptions) {
		this.kind = options.kind;
		this.small = options.small ?? false;
		this.cellsAt = options.cells ?? cellsOf;
		this.budget = options.budget ?? START_BUDGET[options.kind];
		if (this.small) this.note = 'Coarsest grid here: best on a laptop.';
	}

	/** How many cells the tuner believes the device holds. For the Physics panel and for tests. */
	get cellBudget() {
		return this.budget;
	}

	/** Whether the device has been measured: from then on the grid changes only if the device falls behind. */
	get isCalibrated() {
		return this.calibrated;
	}

	/** Whether the choice has stopped changing on its own: a phone's never moves, and a measured device's moves only to step down. */
	get isSettled() {
		return this.small || this.calibrated;
	}

	/** The finest size whose box for `plan` has no more than `cells`, never beyond the backend's maximum nor into cells that failed. */
	private fit(plan: Footprint, cells: number) {
		const limit = Math.min(cells, MAX_CELLS[this.kind], this.worst - 1);
		let best: number = CELL_SIZES[0];
		for (const h of CELL_SIZES) if (this.cellsAt(plan, h) <= limit) best = h;
		return best;
	}

	/** The size to warm `plan`'s first world up at: the finest the backend allows, or null when the device needs no measuring (a phone, or measured already). */
	probe(plan: Footprint): number | null {
		return this.small || this.calibrated ? null : this.fit(plan, MAX_CELLS[this.kind]);
	}

	/**
	 * What the warm-up measured: the device holds the cells a step fits in at the backend's share of real time (`budgetFor`). Null keeps the
	 * starting guess. Either way the grid is settled: the next world is the finest that fits, and nothing changes for a minute.
	 */
	calibrate(cost: StepCost | null) {
		if (this.small) return;
		this.calibrated = true;
		this.calm = 0;
		if (cost && cost.ms > 0 && cost.cells > 0) this.budget = Math.max(1, Math.min(MAX_CELLS[this.kind], budgetFor(this.kind, cost)));
	}

	/**
	 * The cell size for the next world of `plan`. Call it whenever a world is built: a new Home, a restart and a step down all do. What the
	 * tuner has to say is said afresh for this Home: a device too slow for even the coarsest grid of a big Home may hold a small one's.
	 */
	pick(plan: Footprint): number {
		const h = this.small ? CELL_SIZES[0] : this.fit(plan, this.budget);
		this.current = { plan, h, cells: this.cellsAt(plan, h) };
		if (!this.small) this.note = this.calibrated && this.cellsAt(plan, CELL_SIZES[0]) > this.budget ? 'Even the coarsest grid is too slow for this device.' : null;
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
	 * One drawn frame of the world that `pick` last sized. Returns a coarser size when the window it completes is bad and the grid has
	 * held for `HOLD`, and the session moves the world's air onto it (calling `pick` again, which returns that size).
	 */
	observe(sample: FrameSample): Retune | null {
		const world = this.current;
		if (this.small || !world || sample.paused) return null;
		if (sample.dt > GAP) {
			this.skipped++;
			return null;
		}
		this.age += sample.dt;
		this.calm += sample.dt;
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
		if (fps < BAD_FPS || keep < BAD_KEEP) return this.calm >= HOLD ? this.stepDown(world, fps, keep) : null;
		if (fps >= GOOD_FPS && keep >= GOOD_KEEP) this.best = Math.max(this.best, world.cells);
		return null;
	}

	private stepDown(world: Measured, fps: number, keep: number): Retune | null {
		this.worst = Math.min(this.worst, world.cells);
		// The cells that would just have held, with a margin, and never more than a window has already been good at.
		const holds = world.cells * Math.min(keep / GOOD_KEEP, fps / GOOD_FPS, 1) * MARGIN;
		this.budget = Math.max(1, Math.min(this.budget, holds, this.best > 0 && this.best < world.cells ? this.best : Infinity));
		let next = this.fit(world.plan, this.budget);
		if (!(next > world.h + 1e-9)) {
			// At least one size coarser, unless this is already the coarsest there is.
			const coarser = CELL_SIZES[CELL_SIZES.indexOf(world.h as (typeof CELL_SIZES)[number]) - 1];
			if (coarser === undefined) {
				this.note = 'Even the coarsest grid is too slow for this device.';
				return null;
			}
			next = coarser;
			this.budget = Math.min(this.budget, this.cellsAt(world.plan, next));
		}
		this.calm = 0;
		const why = fps < BAD_FPS ? `the page ran at ${Math.round(fps)} frames a second` : `it ran at ${Math.round(keep * 100)}% of real time`;
		return { size: next, direction: 'coarser', message: `Switched to a coarser grid: ${why}.` };
	}
}
