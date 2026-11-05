import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { chooseBackend, type ChoiceOptions } from '../../src/lib/experiments/airflow/sim/backends';
import { CELL_SIZES, HOLD, MAX_CELLS, START_BUDGET, WARMUP, WINDOW, cellsOf, type BackendKind, type FrameSample } from '../../src/lib/experiments/airflow/sim/tuner';
import { fluidFor } from '../../src/lib/experiments/airflow/sim/world';
import { BackendUnavailable } from '../../src/lib/experiments/airflow/solver/backend';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import type { GpuContext } from '../../src/lib/experiments/airflow/solver/gpu/context';
import { GpuSolverError } from '../../src/lib/experiments/airflow/solver/gpu/errors';
import type { SolverConfig } from '../../src/lib/experiments/airflow/solver/types';
import { blankSetup } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker } from './channel';

/**
 * Which solver the page runs on, decided without a graphics card: Node has no WebGPU, so these drive the choice with a
 * device that fails, and with a stand-in for one that works and is then lost. The real device is tested in the GPU suite
 * (tests/gpu/choice.gpu.ts).
 */

const studio = planById('studio')!;
const initial = { theta: 0, particulates: 0 };
/** The grid of the solver these tests build: a coarse one, so the worker's setup is quick. */
const H = 0.2;

function makeConfig(): SolverConfig {
	const setup = blankSetup('studio');
	const raster = rasterizePlan(studio, H, { furniture: setup.furniture });
	return { grid: raster.spec, fluid: fluidFor(setup), geometry: raster.geometry };
}

/**
 * What the tuners start from, written out: the finest size whose box has at most `START_BUDGET` cells. 42,000 on the worker is what
 * 0.2 m cells give the house, so the studio, which is small, gets 0.15 m; 110,000 on the GPU is what 0.15 m gives the house, and the studio gets 0.1 m.
 */
const FIRST_ON_WORKER: Record<string, number> = { studio: 0.15, 'one-bedroom': 0.2, 'two-bedroom': 0.2, house: 0.2 };
const FIRST_ON_GPU: Record<string, number> = { studio: 0.1, 'one-bedroom': 0.15, 'two-bedroom': 0.15, house: 0.15 };

/** A device with the same frames to give for every world: `fps` and `rate` as the tuner is told them, for `seconds` of drawn time. Returns what the tuner said, if it said anything. */
function frames(choice: ReturnType<typeof chooseBackend>, kind: BackendKind, seconds: number, perf: Partial<FrameSample> = {}) {
	const dt = 1 / 60;
	for (let t = 0; t < seconds; t += dt) {
		const retune = choice.observe(kind, { dt, rate: 1, paused: false, ...perf });
		if (retune) return retune;
	}
	return null;
}

/** Collects what is said to the console while `run` runs. */
async function said(run: () => Promise<void>) {
	const log = { warnings: [] as string[], errors: [] as string[] };
	const [warn, error] = [console.warn, console.error];
	console.warn = (...args: unknown[]) => log.warnings.push(args.join(' '));
	console.error = (...args: unknown[]) => log.errors.push(args.join(' '));
	try {
		await run();
	} finally {
		console.warn = warn;
		console.error = error;
	}
	return log;
}

test.describe('the choice of backend', () => {
	test('the first grid of every Home on either backend is one of the sizes the plans divide into, and the worker starts coarser than the GPU', () => {
		for (const [name, first] of [
			['worker', FIRST_ON_WORKER],
			['GPU', FIRST_ON_GPU]
		] as const)
			for (const plan of plans) {
				const h = first[plan.id];
				expect(CELL_SIZES, `${name} ${plan.id}`).toContain(h);
				for (const length of [plan.width, plan.depth, plan.ceiling]) expect(Math.abs(length / h - Math.round(length / h)), `${plan.id} at ${h}`).toBeLessThan(1e-9);
			}
		for (const plan of plans) expect(FIRST_ON_WORKER[plan.id], plan.id).toBeGreaterThanOrEqual(FIRST_ON_GPU[plan.id]);
	});

	test('with no WebGPU every home runs on the worker, on the grid the worker’s tuner starts from, and the page is told once, as a warning', async () => {
		let opened = 0;
		const choice = chooseBackend({
			openGpu: async () => {
				opened++;
				throw new GpuSolverError('no-webgpu', 'This browser does not support WebGPU.');
			},
			spawn: () => inMemoryWorker().port
		});
		const log = await said(async () => {
			for (const plan of plans) expect(await choice.cellSize(plan), plan.id).toBe(FIRST_ON_WORKER[plan.id]);
			const backend = await choice.make(makeConfig(), initial);
			expect(backend).toBeInstanceOf(WorkerBackend);
			expect(backend.kind).toBe('cpu');
			expect(backend.fluidCells).toBeGreaterThan(500);
			backend.dispose();
		});
		choice.dispose();
		expect(opened, 'WebGPU is tried once for the page').toBe(1);
		expect(log.errors, 'not a fault').toEqual([]);
		expect(log.warnings).toHaveLength(1);
		expect(log.warnings[0]).toContain('WebGPU');
		expect(log.warnings[0]).toContain('reduced detail');
	});

	test('a machine with WebGPU but no adapter is the same', async () => {
		const choice = chooseBackend({ openGpu: async () => Promise.reject(new GpuSolverError('no-adapter', 'WebGPU is present but offers no graphics adapter.')), spawn: () => inMemoryWorker().port });
		const log = await said(async () => {
			expect(await choice.cellSize(studio)).toBe(FIRST_ON_WORKER.studio);
			(await choice.make(makeConfig(), initial)).dispose();
		});
		choice.dispose();
		expect(log.errors).toEqual([]);
		expect(log.warnings).toHaveLength(1);
	});

	test('a graphics device that fails some other way is a fault, logged as one, and the simulation still runs on the worker', async () => {
		const choice = chooseBackend({ openGpu: async () => Promise.reject(new GpuSolverError('shader', 'A solver kernel did not compile.')), spawn: () => inMemoryWorker().port });
		const log = await said(async () => {
			expect(await choice.cellSize(studio)).toBe(FIRST_ON_WORKER.studio);
			const backend = await choice.make(makeConfig(), initial);
			expect(backend.kind).toBe('cpu');
			backend.dispose();
		});
		choice.dispose();
		expect(log.errors).toHaveLength(1);
		expect(log.errors[0]).toContain('WebGPU could not start');
	});

	test('with neither WebGPU nor a worker the choice says no solver can run, which is what the page reports as unsupported', async () => {
		const choice = chooseBackend({
			openGpu: async () => Promise.reject(new GpuSolverError('no-webgpu', 'no')),
			spawn: () => {
				throw new BackendUnavailable('This browser cannot start a Web Worker.');
			}
		});
		await said(async () => {
			await expect(choice.make(makeConfig(), initial)).rejects.toBeInstanceOf(BackendUnavailable);
		});
		choice.dispose();
	});

	test('where WebGPU works the grid is the GPU tuner’s, and when its device is lost the page moves to the worker’s tuner for good', async () => {
		const listeners: ((info: { reason: string; message: string }) => void)[] = [];
		let disposed = 0;
		let opened = 0;
		// What the choice asks of a device: to be told of its loss, and to be let go. It never builds a solver on this one here.
		const device = {
			lost: false,
			onLost: (listener: (info: { reason: string; message: string }) => void) => {
				listeners.push(listener);
				return () => true;
			},
			dispose: () => {
				disposed++;
			}
		} as unknown as GpuContext;
		const choice = chooseBackend({
			openGpu: async () => {
				opened++;
				return device;
			},
			spawn: () => inMemoryWorker().port
		});
		const log = await said(async () => {
			expect(await choice.cellSize(studio)).toBe(FIRST_ON_GPU.studio);
			expect(await choice.cellSize(studio)).toBe(FIRST_ON_GPU.studio);
			expect(opened, 'one device for every world').toBe(1);

			listeners[0]({ reason: 'unknown', message: 'The GPU process crashed.' });
			expect(await choice.cellSize(studio), 'the next world is built for the worker').toBe(FIRST_ON_WORKER.studio);
			const backend = await choice.make(makeConfig(), initial);
			expect(backend).toBeInstanceOf(WorkerBackend);
			backend.dispose();
			expect(opened, 'and the lost device is not asked for again').toBe(1);
		});
		expect(log.warnings).toHaveLength(1);
		expect(log.warnings[0]).toContain('lost');
		expect(log.warnings[0]).toContain('The GPU process crashed.');
		choice.dispose();
		expect(disposed, 'the device is let go when the page leaves').toBe(1);
	});

	test('leaving the page while the device is still starting lets it go once it has started', async () => {
		let release: (device: GpuContext) => void = () => {};
		let disposed = 0;
		const device = { lost: false, onLost: () => () => true, dispose: () => disposed++ } as unknown as GpuContext;
		const choice = chooseBackend({ openGpu: () => new Promise<GpuContext>((resolve) => (release = resolve)), spawn: () => inMemoryWorker().port });
		const waiting = choice.cellSize(studio);
		choice.dispose();
		release(device);
		expect(await waiting, 'a choice that has been let go runs nothing on the GPU').toBe(FIRST_ON_WORKER.studio);
		expect(disposed).toBe(1);
	});
});


/**
 * How fine the grid is: the choice owns one auto-tuner for each kind of backend (the tuner's own decisions are tested in
 * tuner.spec.ts, with made-up devices; these are about what the choice does with them), and a phone or an address can overrule it.
 */
test.describe('the cell size the choice gives', () => {
	const house = planById('house')!;
	/** A choice on a device that has WebGPU (a stand-in, never built on) or has none. */
	const withGpu = (options: ChoiceOptions = {}) => {
		const device = { lost: false, onLost: () => () => true, dispose: () => {} } as unknown as GpuContext;
		return chooseBackend({ openGpu: async () => device, spawn: () => inMemoryWorker().port, ...options });
	};
	const withoutGpu = (options: ChoiceOptions = {}) => chooseBackend({ openGpu: async () => Promise.reject(new GpuSolverError('no-webgpu', 'no')), spawn: () => inMemoryWorker().port, ...options });
	/** Drawn time enough for the tuner to step a grid down: the minute it holds, a new world's first seconds, a window and a frame to finish it. */
	const STEP_DOWN = HOLD + WARMUP + WINDOW + 0.1;
	/** What a warm-up measures on a GPU like this M3 Max: 0.4 ms a step and 6 ns a cell. */
	const gpuStep = (cells: number) => ({ cells, ms: 0.4 + 6e-6 * cells, steps: 100 });

	test('there is one tuner for each kind of backend, and what the warm-up measured is told to the tuner of its own kind', async () => {
		const choice = withGpu();
		await said(async () => {
			expect(choice.tuners.webgpu.kind).toBe('webgpu');
			expect(choice.tuners.cpu.kind).toBe('cpu');
			expect(choice.tuners.webgpu).not.toBe(choice.tuners.cpu);
			expect(await choice.probe(house), 'the warm-up is on the GPU, at the finest grid it allows').toBe(0.075);
			choice.calibrate('webgpu', gpuStep(cellsOf(house, 0.075)));
			expect(choice.tuners.webgpu.cellBudget).toBeGreaterThan(START_BUDGET.webgpu);
			expect(choice.tuners.cpu.cellBudget, 'and the worker’s tuner was not told').toBe(START_BUDGET.cpu);
			expect(choice.tuners.cpu.isCalibrated).toBe(false);
			expect(await choice.cellSize(house), 'the house at 7.5 cm is past the GPU’s share: 10 cm').toBe(0.1);
			expect(await choice.probe(house), 'and nothing more is measured').toBeNull();
			// A world that runs on the worker was never sized by the worker's tuner here, so its frames teach nothing.
			expect(frames(choice, 'cpu', STEP_DOWN, { rate: 0.1 })).toBeNull();
		});
		choice.dispose();
	});

	test('what the device is found to hold is settled once for the page: every Home and every restart start from it, and another visit measures again', async () => {
		const choice = withGpu();
		await said(async () => {
			expect(await choice.cellSize(house), 'before the warm-up, the starting guess').toBe(FIRST_ON_GPU.house);
			choice.calibrate('webgpu', gpuStep(cellsOf(house, 0.075)));
			expect(await choice.cellSize(house)).toBe(0.1);
			expect(await choice.cellSize(studio), 'the studio, smaller, at the finest grid').toBe(0.075);
			expect(await choice.probe(studio)).toBeNull();
			// Ten minutes of good frames: nothing climbs, nothing moves.
			expect(frames(choice, 'webgpu', 600)).toBeNull();
			expect(await choice.cellSize(house), 'a restart or a rebuilt world gets the same size').toBe(0.1);
		});
		const another = withGpu();
		await said(async () => {
			expect(await another.probe(studio), 'a new page visit has measured nothing').toBe(0.075);
			expect(await another.cellSize(studio)).toBe(FIRST_ON_GPU.studio);
		});
		choice.dispose();
		another.dispose();
	});

	test('a device that falls behind steps down, not in its first minute, and the next world of any Home starts from what it now holds', async () => {
		const choice = withGpu();
		await said(async () => {
			choice.calibrate('webgpu', gpuStep(cellsOf(house, 0.075)));
			expect(await choice.cellSize(house)).toBe(0.1);
			expect(frames(choice, 'webgpu', HOLD - 1, { rate: 0.5 }), 'nothing in the first minute').toBeNull();
			const down = frames(choice, 'webgpu', WARMUP + WINDOW + 1, { rate: 0.5 });
			expect(down?.direction).toBe('coarser');
			expect(await choice.cellSize(house)).toBe(down!.size);
			expect(await choice.cellSize(studio), 'the studio at 7.5 cm has more cells than the device was found to hold').toBeGreaterThan(0.075);
		});
		choice.dispose();
	});

	test('a processor that cannot keep up even on the coarsest grid says so, through the choice, for its own kind', async () => {
		const choice = withoutGpu();
		await said(async () => {
			expect(choice.note('cpu')).toBe('');
			expect(await choice.probe(house), 'the worker warms the house up at 20 cm').toBe(0.2);
			choice.calibrate('cpu', { cells: cellsOf(house, 0.2), ms: 30, steps: 20 });
			expect(await choice.cellSize(house)).toBe(0.2);
			expect(frames(choice, 'cpu', STEP_DOWN, { rate: 0.3 })?.direction).toBe('coarser');
			expect(await choice.cellSize(house)).toBe(0.3);
			expect(frames(choice, 'cpu', STEP_DOWN, { rate: 0.3 }), 'there is no coarser grid to go to').toBeNull();
			expect(choice.note('cpu')).toBe('Even the coarsest grid is too slow for this device.');
			expect(choice.note('webgpu')).toBe('');
		});
		choice.dispose();
	});

	test('what the choice says about a change is the tuner’s one short sentence, which gives no cell size: the status line gives it, in the units the visitor reads', async () => {
		const choice = withGpu();
		await said(async () => {
			choice.calibrate('webgpu', gpuStep(cellsOf(house, 0.075)));
			await choice.cellSize(house);
			expect(frames(choice, 'webgpu', STEP_DOWN, { rate: 0.5 })?.message).toBe('Switched to a coarser grid: it ran at 50% of real time.');
		});
		choice.dispose();
	});

	test('a phone or a small tablet gets the coarsest grid for every Home on either backend, with the note, and is never measured', async () => {
		for (const kind of ['webgpu', 'cpu'] as const) {
			const choice = kind === 'webgpu' ? withGpu({ small: true }) : withoutGpu({ small: true });
			await said(async () => {
				for (const plan of plans) {
					expect(await choice.probe(plan), `no warm-up for ${plan.id}`).toBeNull();
					expect(await choice.cellSize(plan), `${kind} ${plan.id}`).toBe(0.3);
				}
				expect(choice.note(kind)).toBe('Coarsest grid here: best on a laptop.');
				// Ten minutes of frames that would be good or bad on any other device: it does not move.
				expect(frames(choice, kind, 600), 'good frames').toBeNull();
				expect(frames(choice, kind, 600, { rate: 0.01 }), 'and slow ones').toBeNull();
				expect(choice.tuners[kind].isSettled).toBe(true);
			});
			choice.dispose();
		}
	});

	test('a cell size the address asks for is exactly the size of every Home on either backend: no tuner is asked, nothing is measured, and a phone’s note does not apply', async () => {
		for (const [kind, choice] of [
			['webgpu', withGpu({ fixedCell: 0.075 })],
			['cpu', withoutGpu({ fixedCell: 0.075 })],
			['webgpu', withGpu({ fixedCell: 0.075, small: true })]
		] as const)
			await said(async () => {
				for (const plan of plans) {
					expect(await choice.probe(plan), 'no warm-up').toBeNull();
					expect(await choice.cellSize(plan), `${kind} ${plan.id}`).toBe(0.075);
				}
				choice.calibrate(kind, { cells: 1000, ms: 1000, steps: 1 });
				expect(frames(choice, kind, 600), 'good frames').toBeNull();
				expect(frames(choice, kind, 600, { rate: 0.01 }), 'and slow ones').toBeNull();
				expect(choice.note(kind), 'there is nothing to say about a grid that was asked for').toBe('');
				expect(choice.tuners[kind].cellBudget, 'the tuner was never asked').toBe(START_BUDGET[kind]);
				choice.dispose();
			});
	});

	test('the warm-up is at the finest grid the backend allows, and never past it', async () => {
		const gpu = withGpu();
		const cpu = withoutGpu();
		await said(async () => {
			for (const plan of plans) {
				const h = (await gpu.probe(plan))!;
				expect(cellsOf(plan, h), `${plan.id} on the GPU`).toBeLessThanOrEqual(MAX_CELLS.webgpu);
				const finer = CELL_SIZES[CELL_SIZES.indexOf(h as (typeof CELL_SIZES)[number]) + 1];
				if (finer !== undefined) expect(cellsOf(plan, finer)).toBeGreaterThan(MAX_CELLS.webgpu);
				const w = (await cpu.probe(plan))!;
				expect(cellsOf(plan, w), `${plan.id} on the worker`).toBeLessThanOrEqual(MAX_CELLS.cpu);
				const finerOnWorker = CELL_SIZES[CELL_SIZES.indexOf(w as (typeof CELL_SIZES)[number]) + 1];
				if (finerOnWorker !== undefined) expect(cellsOf(plan, finerOnWorker)).toBeGreaterThan(MAX_CELLS.cpu);
			}
		});
		gpu.dispose();
		cpu.dispose();
	});
});
