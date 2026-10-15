import type { HomePlan } from '../homes/types';
import { BackendUnavailable } from '../solver/backend';
import { WorkerBackend, portOfWorker, type WorkerPort } from '../solver/cpu/proxy';
import { GpuBackend } from '../solver/gpu/backend';
import { GpuContext } from '../solver/gpu/context';
import { isGpuSolverError } from '../solver/gpu/errors';
import { Tuner, type BackendKind, type Tuning } from './tuner';
import type { BackendFactory } from './world';

/** How the page gets a backend for a plan: which solver, and how fine a grid. */
export interface BackendChoice extends Tuning {
	make: BackendFactory;
	/**
	 * The cell size to run `plan` at, m: a divisor of 0.6, so the solver's box is the footprint. It resolves once it is known
	 * whether the next world runs on WebGPU or on the worker, because that decides which tuner answers. Call it whenever a world
	 * is built: the tuner counts frames from the world it last sized.
	 */
	cellSize(plan: HomePlan): Promise<number>;
	/** The tuner of each kind of backend. The choice owns them, so what a device was found to hold is learned once for the page. For the Physics panel and for tests. */
	readonly tuners: Readonly<Record<BackendKind, Tuner>>;
	/** Releases what the choice holds from one world to the next (the shared WebGPU device). */
	dispose(): void;
}

export interface ChoiceOptions {
	/** Opens the WebGPU device with the solver's kernels compiled. It rejects where the browser has no WebGPU or the machine no adapter. */
	openGpu?: () => Promise<GpuContext>;
	/** Starts the Web Worker that runs the CPU solver. It throws `BackendUnavailable` where the browser has none. */
	spawn?: () => WorkerPort;
	/** A phone or a small tablet: every Home runs the coarsest grid, with a note saying so, and nothing is measured (see `detectSmallDevice`). */
	small?: boolean;
	/** Runs every Home at exactly this cell size, m, and no tuner is asked (`?cell=` in the address: for QA and tests). */
	fixedCell?: number;
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
 *
 * How fine the grid is, is the auto-tuner's to say (tuner.ts), and the choice owns one tuner for each kind of backend, so what
 * the device is found to hold is settled once for the page too: the next Home, a restart and a rebuilt world all start from it.
 * A phone or small tablet (`small`) is given the coarsest grid and a note, and `fixedCell` bypasses the tuners altogether.
 */
export function chooseBackend({ openGpu = () => GpuContext.create(), spawn = spawnSolverWorker, small = false, fixedCell }: ChoiceOptions = {}): BackendChoice {
	let opened: GpuContext | null = null;
	let gpu: Promise<GpuContext | null> | null = null;
	let disposed = false;
	const tuners: Record<BackendKind, Tuner> = { webgpu: new Tuner({ kind: 'webgpu', small }), cpu: new Tuner({ kind: 'cpu', small }) };

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
					// The page leaving destroys the device under a solver that is being built, and nothing is left to run it for.
					if (disposed || !isGpuSolverError(error)) throw error;
					if (error.reason === 'lost') console.warn(`The graphics device was lost while the solver was built, so the simulation runs on the processor at reduced detail. ${error.message}`);
					else console.error('WebGPU could not build the solver, so the simulation runs on the processor at reduced detail.', error);
					// The grid was sized for the GPU, so this world is slower than it should be; the next one is built for the worker.
					gpu = Promise.resolve(null);
				}
			}
			if (disposed) throw new Error('The page has left.');
			return WorkerBackend.create(spawn(), config, initial);
		},
		cellSize: async (plan) => (fixedCell !== undefined ? fixedCell : tuners[(await device()) ? 'webgpu' : 'cpu'].pick(plan)),
		observe: (kind, sample) => (fixedCell !== undefined ? null : tuners[kind].observe(sample)),
		note: (kind) => (fixedCell !== undefined ? '' : (tuners[kind].note ?? '')),
		tuners,
		dispose() {
			disposed = true;
			opened?.dispose();
			opened = null;
		}
	};
}
