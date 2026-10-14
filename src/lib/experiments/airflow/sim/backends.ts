import type { HomePlan } from '../homes/types';
import { BackendUnavailable } from '../solver/backend';
import { WorkerBackend, portOfWorker, type WorkerPort } from '../solver/cpu/proxy';
import { GpuBackend } from '../solver/gpu/backend';
import { GpuContext } from '../solver/gpu/context';
import { isGpuSolverError } from '../solver/gpu/errors';
import type { BackendFactory } from './world';

/** How the page gets a backend for a plan: which solver, and how fine a grid. */
export interface BackendChoice {
	make: BackendFactory;
	/**
	 * The cell size to run `plan` at, m: a divisor of 0.6, so the solver's box is the footprint. It resolves once it is known
	 * whether the next world runs on WebGPU or on the worker, because that decides it.
	 */
	cellSize(plan: HomePlan): Promise<number>;
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
 * Cell size on the CPU worker, m: a step of the house takes 41 ms here at this size and the studio 14 ms, so every plan
 * runs at about real time on a fast processor, and a slow one runs the simulation slower than real time (the page shows
 * the rate). The tuner picks it from the measured step time instead.
 */
export const CPU_CELL = 0.2;

export interface ChoiceOptions {
	/** Opens the WebGPU device with the solver's kernels compiled. It rejects where the browser has no WebGPU or the machine no adapter. */
	openGpu?: () => Promise<GpuContext>;
	/** Starts the Web Worker that runs the CPU solver. It throws `BackendUnavailable` where the browser has none. */
	spawn?: () => WorkerPort;
}

/** The worker is a separate file the bundler builds on its own, so the page's own JavaScript holds none of the solver. */
function spawnSolverWorker(): WorkerPort {
	if (typeof Worker === 'undefined') throw new BackendUnavailable('This browser cannot start a Web Worker.');
	try {
		return portOfWorker(new Worker(new URL('../solver/cpu/worker.ts', import.meta.url), { type: 'module', name: 'airflow solver' }));
	} catch (error) {
		throw new BackendUnavailable('This browser would not start a Web Worker.', String(error));
	}
}

/**
 * WebGPU where the browser has it and the machine offers an adapter, and the CPU solver in a Web Worker, at a coarser grid,
 * everywhere else. The WebGPU solver runs on one device shared by every world the page builds, so a new plan or a restart does
 * not compile the kernels again.
 *
 * Whether WebGPU works is settled once for the page. If it cannot start, or its device is lost while a world runs on it, the
 * page stays on the worker from then on: a lost device is not asked for again, since whatever took it may take the next one,
 * and a world that was running on it starts over (the session does that when the backend reports the loss).
 */
export function chooseBackend({ openGpu = () => GpuContext.create(), spawn = spawnSolverWorker }: ChoiceOptions = {}): BackendChoice {
	let opened: GpuContext | null = null;
	let gpu: Promise<GpuContext | null> | null = null;
	let disposed = false;

	/** The shared device, or null once WebGPU is known not to work. */
	const open = async () => {
		try {
			const context = await openGpu();
			if (disposed) {
				context.dispose();
				return null;
			}
			opened = context;
			context.onLost(({ message }) => {
				console.warn(`The graphics device was lost, so the simulation moves to the processor at reduced detail. ${message}`);
				gpu = Promise.resolve(null);
			});
			return context;
		} catch (error) {
			// No WebGPU, or no adapter, is how many browsers and machines are: a warning, not a fault.
			if (isGpuSolverError(error) && (error.reason === 'no-webgpu' || error.reason === 'no-adapter')) console.warn(`WebGPU is not available (${error.message}), so the simulation runs on the processor at reduced detail.`);
			else console.error('WebGPU could not start, so the simulation runs on the processor at reduced detail.', error);
			return null;
		}
	};
	const device = () => (disposed ? Promise.resolve(null) : (gpu ??= open()));

	return {
		make: async (config, initial) => {
			const context = await device();
			if (context) {
				try {
					return await GpuBackend.create(config, initial, context);
				} catch (error) {
					if (!isGpuSolverError(error)) throw error;
					console.error('WebGPU could not build the solver, so the simulation runs on the processor at reduced detail.', error);
					// The grid was sized for the GPU, so this world is slower than it should be; the next one is built for the worker.
					gpu = Promise.resolve(null);
				}
			}
			return WorkerBackend.create(spawn(), config, initial);
		},
		cellSize: async () => ((await device()) ? GPU_CELL : CPU_CELL),
		dispose() {
			disposed = true;
			opened?.dispose();
			opened = null;
		}
	};
}
