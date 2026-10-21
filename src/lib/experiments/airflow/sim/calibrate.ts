import type { BackendKind } from './tuner';

/**
 * The warm-up that picks the grid while the loading screen shows. The page's first world is built at the finest grid its backend
 * allows and stepped as fast as the backend goes for half a second; how long a step took says how many cells the device holds, and the
 * world runs on the finest grid that fits from its first visible frame. Nothing here touches the solver or keeps a clock of its own: the
 * session hands `measureSteps` the backend, and the tuner turns what it measured into a budget of cells (`budgetFor`).
 */

/** What a warm-up measured: a step of a grid of `cells` cells took `ms` milliseconds, with the backend kept busy, over `steps` steps. */
export interface StepCost {
	cells: number;
	ms: number;
	steps: number;
}

/** What the measurement needs of a backend: the part of `FlowBackend` that steps it and counts what it has not finished. */
export interface Steppable {
	step(dt: number): void;
	readonly stepsInFlight?: number;
	readonly maxInFlight?: number;
}

export interface MeasureOptions {
	/** The step to send, s. */
	dt: number;
	/** Seconds at the start that are not counted: the first steps run with the most substeps (no speed has been read back yet), and a GPU raises its clocks. */
	discard?: number;
	/** Seconds that are counted, and the fewest finished steps they must hold. */
	seconds?: number;
	steps?: number;
	/** Gives up after this many seconds with whatever was counted, or throws if nothing finished. */
	limit?: number;
	/** Called before each step is sent (an oscillating fan's aim). */
	before?: () => void;
	/** Hears the share of the measurement done, 0 to 1. */
	progress?: (share: number) => void;
	/** False once the measurement is no longer wanted (the page left, another world was asked for): it stops with an error. */
	alive?: () => boolean;
	/** The clock, ms, and how to wait for the backend between looks. Tests pass their own. */
	now?: () => number;
	pause?: () => Promise<void>;
}

/** What `measureSteps` found: a step's cost, ms, over `steps` steps, and every step it sent (each `dt` long). */
export interface Measured {
	ms: number;
	steps: number;
	sent: number;
}

/** The parts of the measurement, s: about half a second on a device that keeps up, so the warm-up adds little to the loading screen. */
export const MEASURE = { discard: 0.15, seconds: 0.4, steps: 12, limit: 4 } as const;

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 2));

/**
 * Steps `backend` as fast as it goes and says what a step costs. A backend that works in the background (the GPU, whose steps queue,
 * and the worker) is kept at its limit of unfinished steps, so it never waits on the page, and a step's cost is the time over the steps
 * it finished; one that steps in the page (the CPU in tests) is timed step by step.
 */
export async function measureSteps(backend: Steppable, options: MeasureOptions): Promise<Measured> {
	const { dt, discard = MEASURE.discard, seconds = MEASURE.seconds, steps: fewest = MEASURE.steps, limit = MEASURE.limit } = options;
	const now = options.now ?? (() => performance.now());
	const pause = options.pause ?? wait;
	const alive = options.alive ?? (() => true);
	const background = backend.stepsInFlight !== undefined;
	const room = Math.max(1, backend.maxInFlight ?? 2);
	const start = now();
	let sent = 0;
	// In the page, each step is timed by itself; in the background, the clock runs from the moment the discard ends.
	let spent = 0;
	let timed = 0;
	let mark: { at: number; done: number } | null = null;
	const send = () => {
		options.before?.();
		backend.step(dt);
		sent++;
	};
	for (;;) {
		if (!alive()) throw new Error('The warm-up was stopped.');
		const before = now();
		if (background) while ((backend.stepsInFlight ?? 0) < room) send();
		else {
			send();
			if ((before - start) / 1000 >= discard) {
				spent += now() - before;
				timed++;
			}
		}
		await pause();
		const at = now();
		const elapsed = (at - start) / 1000;
		const done = sent - (background ? (backend.stepsInFlight ?? 0) : 0);
		if (background && !mark && elapsed >= discard && done > 0) mark = { at, done };
		const counted = background ? (mark ? { seconds: (at - mark.at) / 1000, steps: done - mark.done } : { seconds: 0, steps: 0 }) : { seconds: spent / 1000, steps: timed };
		options.progress?.(Math.min(1, elapsed / (discard + seconds)));
		const enough = counted.steps >= fewest && (background ? counted.seconds >= seconds : elapsed >= discard + seconds);
		if (!enough && elapsed < limit) continue;
		let ms: number;
		let steps: number;
		if (counted.steps > 0) {
			ms = (counted.seconds * 1000) / counted.steps;
			steps = counted.steps;
		} else {
			// A backend too slow to finish a step after the discard is measured by what it finished from the start.
			ms = done > 0 ? (at - start) / done : NaN;
			steps = done;
		}
		if (!(ms > 0)) throw new Error('The warm-up finished no step.');
		options.progress?.(1);
		return { ms, steps, sent };
	}
}

/**
 * What a step may cost on each backend, and the part of it that costs the same whatever the grid.
 *
 * The GPU draws the world as well as running the solver, so the solver gets a share of its time: at the Scenarios' 5 times real time a
 * second asks for 100 steps of 0.05 s, and 40% of the GPU's time is 4 ms a step. On the M3 Max the two-bedroom at 7.5 cm takes 3.7 ms a
 * step and the page draws at 60 fps on it; a step there is about 0.4 ms of fixed overhead (the kernels' dispatches) and 6 ns a cell.
 *
 * The worker runs on a thread of its own and only has to keep up with real time (it cannot reach 5 times on any grid worth having): 20
 * steps of 0.05 s a second, and 80% of its thread is 40 ms a step.
 */
export const STEP_BUDGET = {
	webgpu: { share: 0.4, speed: 5, fixedMs: 0.4 },
	cpu: { share: 0.8, speed: 1, fixedMs: 0 }
} as const;

/** The step the warm-up sends, s: the stable step the session sends a world whose air has no speed yet. */
export const WARMUP_STEP = 0.05;

/**
 * How many cells a device holds, from one measured step: the cost is taken as a fixed part (`fixedMs`, never more than half of what
 * was measured) and a part that grows with the cells, and the budget is the cells whose step fits the backend's share of real time at
 * its speed.
 */
export function budgetFor(kind: BackendKind, cost: Pick<StepCost, 'cells' | 'ms'>): number {
	const { share, speed, fixedMs } = STEP_BUDGET[kind];
	const allowed = (share * 1000 * WARMUP_STEP) / speed;
	const fixed = Math.min(fixedMs, 0.5 * cost.ms);
	const perCell = Math.max(1e-12, (cost.ms - fixed) / Math.max(1, cost.cells));
	return Math.max(0, Math.floor((allowed - fixed) / perCell));
}
