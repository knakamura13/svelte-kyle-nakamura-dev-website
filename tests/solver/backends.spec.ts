import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { CPU_CELL, GPU_CELL, chooseBackend } from '../../src/lib/experiments/airflow/sim/backends';
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

function makeConfig(): SolverConfig {
	const setup = blankSetup('studio');
	const raster = rasterizePlan(studio, CPU_CELL, { furniture: setup.furniture });
	return { grid: raster.spec, fluid: fluidFor(setup), geometry: raster.geometry };
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
	test('the grids are cell sizes the plans divide into', () => {
		for (const h of [GPU_CELL, CPU_CELL]) for (const plan of plans) for (const length of [plan.width, plan.depth]) expect(Math.abs(length / h - Math.round(length / h)), `${plan.id} at ${h}`).toBeLessThan(1e-9);
		expect(CPU_CELL).toBeGreaterThan(GPU_CELL);
	});

	test('with no WebGPU every home runs on the worker at 0.2 m cells, and the page is told once, as a warning', async () => {
		let opened = 0;
		const choice = chooseBackend({
			openGpu: async () => {
				opened++;
				throw new GpuSolverError('no-webgpu', 'This browser does not support WebGPU.');
			},
			spawn: () => inMemoryWorker().port
		});
		const log = await said(async () => {
			for (const plan of plans) expect(await choice.cellSize(plan), plan.id).toBe(CPU_CELL);
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
			expect(await choice.cellSize(studio)).toBe(CPU_CELL);
			(await choice.make(makeConfig(), initial)).dispose();
		});
		choice.dispose();
		expect(log.errors).toEqual([]);
		expect(log.warnings).toHaveLength(1);
	});

	test('a graphics device that fails some other way is a fault, logged as one, and the simulation still runs on the worker', async () => {
		const choice = chooseBackend({ openGpu: async () => Promise.reject(new GpuSolverError('shader', 'A solver kernel did not compile.')), spawn: () => inMemoryWorker().port });
		const log = await said(async () => {
			expect(await choice.cellSize(studio)).toBe(CPU_CELL);
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

	test('where WebGPU works the grid is the GPU one, and when its device is lost the page moves to the worker for good', async () => {
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
			expect(await choice.cellSize(studio)).toBe(GPU_CELL);
			expect(await choice.cellSize(studio)).toBe(GPU_CELL);
			expect(opened, 'one device for every world').toBe(1);

			listeners[0]({ reason: 'unknown', message: 'The GPU process crashed.' });
			expect(await choice.cellSize(studio), 'the next world is built for the worker').toBe(CPU_CELL);
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
		expect(await waiting, 'a choice that has been let go runs nothing on the GPU').toBe(CPU_CELL);
		expect(disposed).toBe(1);
	});
});
