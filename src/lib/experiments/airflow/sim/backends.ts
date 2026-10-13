import type { HomePlan } from '../homes/types';
import { GpuBackend } from '../solver/gpu/backend';
import { GpuContext } from '../solver/gpu/context';
import type { BackendFactory } from './world';

/** How the page gets a backend for a plan: which solver, and how fine a grid. */
export interface BackendChoice {
	make: BackendFactory;
	/** The cell size to run `plan` at, m: a divisor of 0.6, so the solver's box is the footprint. */
	cellSize(plan: HomePlan): number;
	/** Releases what the choice holds from one world to the next (the shared WebGPU device). */
	dispose(): void;
}

/**
 * Cell size on the GPU, m, for every plan until the auto-tuner exists: fine enough that a fan's disk is a few cells
 * across, coarse enough for a modest graphics chip (the house costs 0.9 ms a step here, and every plan has passed the
 * random-setup stress at this size). The tuner picks it from the measured step time instead.
 */
export const GPU_CELL = 0.15;

/**
 * The WebGPU solver, on one device shared by every world the page builds, so a new plan or a restart does not compile the
 * kernels again. Where the browser has no WebGPU or the machine offers no adapter, `make` rejects with a `GpuSolverError`
 * and the session reports the simulation as unavailable: the CPU worker that fills that gap is the next step of the plan
 * (docs/plans/2026-10-07-airflow-status.md).
 */
export function webgpuChoice(): BackendChoice {
	let context: Promise<GpuContext> | null = null;

	const acquire = async () => {
		if (context) {
			const existing = await context.catch(() => null);
			if (existing && !existing.lost) return existing;
			// A lost device is replaced, and a failed start is tried again (the page may have been given the adapter since).
			context = null;
		}
		const made = GpuContext.create();
		context = made;
		made.catch(() => {
			if (context === made) context = null;
		});
		return made;
	};

	return {
		make: async (config, initial) => GpuBackend.create(config, initial, await acquire()),
		cellSize: () => GPU_CELL,
		dispose() {
			const held = context;
			context = null;
			void held?.then((c) => c.dispose(), () => {});
		}
	};
}
