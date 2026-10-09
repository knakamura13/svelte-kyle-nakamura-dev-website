/*
 * Browser side of parity.gpu.ts: runs a stage of the WebGPU solver and the same stage of the CPU solver on the same
 * input, in the page, and reports how far apart the results are.
 */
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { GpuSolver, packVelocity, unpackVelocity } from '$lib/experiments/airflow/solver/gpu/solver';
import { CpuSolver } from '$lib/experiments/airflow/solver/cpu/solver';
import { diffuseVelocity } from '$lib/experiments/airflow/solver/cpu/diffuse';
import { advectVelocity, type Velocity } from '$lib/experiments/airflow/solver/cpu/advect';
import { boxGeometry } from '$lib/experiments/airflow/solver/geometry';
import { Grid } from '$lib/experiments/airflow/solver/grid';
import { AIR, sideConditions, type SideCondition, type SolverConfig } from '$lib/experiments/airflow/solver/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Comparison {
	/** Largest |gpu − cpu| over the compared arrays. */
	maxAbs: number;
	/** Largest |cpu| over the compared arrays. */
	scale: number;
	/** maxAbs / scale. */
	rel: number;
	/** Where the largest difference is, for debugging. */
	worst: string;
}

function compare(named: Record<string, [Float32Array, Float32Array]>, mask?: (n: number) => boolean): Comparison {
	let maxAbs = 0;
	let scale = 0;
	let worst = '';
	for (const [name, [gpu, cpu]] of Object.entries(named))
		for (let n = 0; n < cpu.length; n++) {
			if (mask && !mask(n)) continue;
			scale = Math.max(scale, Math.abs(cpu[n]));
			const d = Math.abs(gpu[n] - cpu[n]);
			if (!(d <= maxAbs)) {
				maxAbs = d;
				worst = `${name}[${n}] gpu ${gpu[n]} cpu ${cpu[n]}`;
			}
		}
	return { maxAbs, scale, rel: maxAbs / Math.max(scale, 1e-30), worst };
}

function random(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const WALL: SideCondition = { slip: 'no-slip' };

function boxConfig(nx: number, ny: number, nz: number, h: number, nu: number): SolverConfig {
	return {
		grid: { nx, ny, nz, h },
		fluid: { ...AIR, nu, beta: 0, mixing: 0 },
		geometry: boxGeometry({ nx, ny, nz, h }),
		sides: [WALL, WALL, WALL, WALL, WALL, WALL],
		turbulence: 'none',
		scalarSubsteps: 1
	};
}

/** A random velocity in [−1, 1] on open faces, zero on closed ones. */
function randomVelocity(grid: Grid, config: SolverConfig, seed: number): Velocity {
	const next = random(seed);
	const { au, av, aw } = config.geometry;
	const field = (open: Float32Array) => Float32Array.from({ length: grid.size }, (_, n) => (open[n] > 0 ? 2 * next() - 1 : 0));
	return { u: field(au), v: field(av), w: field(aw) };
}

const copy = (v: Velocity): Velocity => ({ u: v.u.slice(), v: v.v.slice(), w: v.w.slice() });

async function readBack(device: any, buffer: any, bytes: number) {
	const staging = device.createBuffer({ size: bytes, usage: 0x0001 | 0x0008 });
	const encoder = device.createCommandEncoder();
	encoder.copyBufferToBuffer(buffer, 0, staging, 0, bytes);
	device.queue.submit([encoder.finish()]);
	await staging.mapAsync(0x0001);
	const out = new Float32Array(staging.getMappedRange().slice(0));
	staging.unmap();
	staging.destroy();
	return out;
}

let shared: GpuContext | null = null;
async function context() {
	shared ??= await GpuContext.create();
	return shared;
}

async function gpuVelocity(solver: GpuSolver) {
	return unpackVelocity(await readBack(solver.device, solver.vel, 16 * solver.grid.size));
}

/** Runs `encode` in one compute pass and fails on any validation error. */
async function runPass(solver: GpuSolver, encode: (pass: any) => void) {
	const device = solver.device;
	device.pushErrorScope('validation');
	const encoder = device.createCommandEncoder();
	const pass = encoder.beginComputePass();
	encode(pass);
	pass.end();
	device.queue.submit([encoder.finish()]);
	const error = await device.popErrorScope();
	if (error) throw new Error(`validation: ${error.message}`);
}

/** One explicit diffusion substep of a random field. */
async function diffuseParity(seed: number) {
	const config = boxConfig(12, 10, 8, 0.1, 0.1);
	const grid = new Grid(config.grid);
	const dt = 0.05;
	const input = randomVelocity(grid, config, seed);
	const cpuOut = copy(input);
	diffuseVelocity(grid, config.geometry, sideConditions(config.sides), config.fluid.nu, new Float32Array(grid.size), dt, input, cpuOut);
	const solver = await GpuSolver.create(await context(), config);
	const packed = packVelocity(input.u, input.v, input.w);
	solver.device.queue.writeBuffer(solver.vel, 0, packed);
	solver.device.queue.writeBuffer(solver.next, 0, packed);
	solver.writeStep(dt, 1, 1);
	await runPass(solver, (pass) => solver.diffuse(pass, 1));
	const gpu = await gpuVelocity(solver);
	solver.dispose();
	return compare({ u: [gpu.u, cpuOut.u], v: [gpu.v, cpuOut.v], w: [gpu.w, cpuOut.w] });
}

/** Semi-Lagrangian advection with the MacCormack correction, of a random field by itself. */
async function advectParity(seed: number, maccormack: boolean) {
	const config = { ...boxConfig(12, 10, 8, 0.1, 1e-5), advection: maccormack ? 'maccormack' : 'semi-lagrangian' } as SolverConfig;
	const grid = new Grid(config.grid);
	const dt = 0.05;
	const input = randomVelocity(grid, config, seed);
	const cpuOut = copy(input);
	const pred = copy(input);
	advectVelocity(grid, dt, input, copy(input), pred, cpuOut, config.geometry, maccormack);
	const solver = await GpuSolver.create(await context(), config);
	const packed = packVelocity(input.u, input.v, input.w);
	for (const buffer of [solver.vel, solver.next, solver.quantity, solver.pred]) solver.device.queue.writeBuffer(buffer, 0, packed);
	solver.writeStep(dt, 1, 1);
	await runPass(solver, (pass) => solver.advect(pass));
	const gpu = await gpuVelocity(solver);
	solver.dispose();
	return compare({ u: [gpu.u, cpuOut.u], v: [gpu.v, cpuOut.v], w: [gpu.w, cpuOut.w] });
}

/** The lid-driven cavity of tests/solver/scenarios.ts: `steps` whole steps on both solvers. */
function cavityConfig(n: number): SolverConfig {
	const h = 1 / n;
	return {
		grid: { nx: n, ny: n, nz: 1, h },
		fluid: { ...AIR, rho: 1, nu: 1e-3, beta: 0, mixing: 0 },
		geometry: boxGeometry({ nx: n, ny: n, nz: 1, h }),
		sides: [WALL, WALL, WALL, { slip: 'no-slip', velocity: [1, 0, 0] }, { slip: 'free-slip' }, { slip: 'free-slip' }],
		turbulence: 'none',
		pressure: { cycles: 4, pre: 2, post: 2, coarse: 30 },
		scalarSubsteps: 1
	};
}

async function cavityParity(n: number, steps: number) {
	const dt = 0.5 / n;
	const cpu = new CpuSolver(cavityConfig(n));
	cpu.fill(0);
	for (let s = 0; s < steps; s++) cpu.step(dt);
	const solver = await GpuSolver.create(await context(), cavityConfig(n));
	solver.fill(0, 0);
	const device = solver.device;
	device.pushErrorScope('validation');
	for (let s = 0; s < steps; s++) {
		solver.writeStep(dt, 1, solver.diffusionSubsteps(dt), s);
		const encoder = device.createCommandEncoder();
		solver.encodeStep(encoder, dt, 1, s);
		device.queue.submit([encoder.finish()]);
	}
	const error = await device.popErrorScope();
	if (error) throw new Error(`validation: ${error.message}`);
	const gpu = await gpuVelocity(solver);
	const p = await readBack(device, solver.levels[0].p, 4 * solver.grid.size);
	solver.dispose();
	const cells = cpu.grid;
	const inside = (c: number) => {
		const k = Math.floor(c / cells.sxy);
		const j = Math.floor((c - k * cells.sxy) / cells.sx);
		const i = c - k * cells.sxy - j * cells.sx;
		return i < cells.nx && j < cells.ny && k < cells.nz;
	};
	return {
		velocity: compare({ u: [gpu.u, cpu.vel.u], v: [gpu.v, cpu.vel.v] }),
		pressure: compare({ p: [p, cpu.pressure.pressure as Float32Array] }, inside)
	};
}

/** Wall-clock time per whole step on a grid, averaged over `steps` after a warm-up. */
async function stepTime(nx: number, ny: number, nz: number, steps: number) {
	const config = boxConfig(nx, ny, nz, 0.1, 1.5e-5);
	config.sides = [WALL, WALL, WALL, { slip: 'no-slip', velocity: [1, 0, 0] }, WALL, WALL];
	const solver = await GpuSolver.create(await context(), config);
	solver.fill(0, 0);
	const device = solver.device;
	const dt = 0.05;
	const run = async (count: number, first: number) => {
		for (let s = 0; s < count; s++) {
			solver.writeStep(dt, 1, solver.diffusionSubsteps(dt), (first + s) % 8192);
			const encoder = device.createCommandEncoder();
			solver.encodeStep(encoder, dt, 1, (first + s) % 8192);
			device.queue.submit([encoder.finish()]);
		}
		await device.queue.onSubmittedWorkDone();
	};
	await run(5, 0);
	const start = performance.now();
	await run(steps, 5);
	const ms = (performance.now() - start) / steps;
	solver.dispose();
	return { cells: nx * ny * nz, ms };
}

(window as any).parity = { diffuseParity, advectParity, cavityParity, stepTime };
(window as any).harnessReady = true;
