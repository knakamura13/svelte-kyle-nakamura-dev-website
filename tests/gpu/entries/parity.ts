/*
 * Browser side of parity.gpu.ts: runs a stage of the WebGPU solver and the same stage of the CPU solver on the same
 * input, in the page, and reports how far apart the results are.
 */
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { GpuSolver, packGeometry, packPair, packVelocity, unpackPair, unpackVelocity } from '$lib/experiments/airflow/solver/gpu/solver';
import { CpuSolver, emptyExterior } from '$lib/experiments/airflow/solver/cpu/solver';
import { PressureSolver } from '$lib/experiments/airflow/solver/cpu/pressure';
import { eddyViscosity } from '$lib/experiments/airflow/solver/cpu/turbulence';
import { extractSlice, samplePoints } from '$lib/experiments/airflow/solver/cpu/readouts';
import { diffuseVelocity } from '$lib/experiments/airflow/solver/cpu/diffuse';
import { advectVelocity, type Velocity } from '$lib/experiments/airflow/solver/cpu/advect';
import { boxGeometry } from '$lib/experiments/airflow/solver/geometry';
import { rasterizeFan } from '$lib/experiments/airflow/solver/fan';
import { Grid } from '$lib/experiments/airflow/solver/grid';
import { AIR, DEFAULT_PRESSURE, sideConditions, type SideCondition, type SolverConfig } from '$lib/experiments/airflow/solver/types';

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

/** The eddy viscosity of a random field (the shear-length closure). */
async function turbulenceParity(seed: number) {
	const config: SolverConfig = { ...boxConfig(12, 10, 8, 0.1, 1.5e-5), turbulence: 'shear-length' };
	const grid = new Grid(config.grid);
	const input = randomVelocity(grid, config, seed);
	const nut = new Float32Array(grid.size);
	const scratch = () => new Float32Array(grid.size);
	eddyViscosity(grid, config.geometry, input, { coefficient: config.fluid.shearCoefficient, maxLength: config.fluid.maxLength }, 0.05, nut, scratch(), scratch(), scratch());
	const solver = await GpuSolver.create(await context(), config);
	solver.device.queue.writeBuffer(solver.vel, 0, packVelocity(input.u, input.v, input.w));
	await runPass(solver, (pass) => solver.turbulence(pass));
	const gpu = await readBack(solver.device, solver.nut, 4 * grid.size);
	solver.dispose();
	return compare({ nut: [gpu, nut] });
}

/** Assembly, the V-cycles, the mean removal and the projection, on a random (divergent) field in a closed box. */
async function pressureParity(seed: number, nx: number, ny: number, nz: number) {
	const config = boxConfig(nx, ny, nz, 0.1, 1.5e-5);
	const grid = new Grid(config.grid);
	const dt = 0.05;
	const half = dt / 2;
	const input = randomVelocity(grid, config, seed);
	const cpuVel = copy(input);
	const pressure = new PressureSolver(grid, { ...DEFAULT_PRESSURE });
	pressure.assemble(half, config.fluid.rho, config.fluid.cd, config.geometry, emptyExterior(grid), cpuVel);
	pressure.solve();
	pressure.project(half, config.fluid.rho, config.geometry, cpuVel);
	const solver = await GpuSolver.create(await context(), config);
	solver.device.queue.writeBuffer(solver.vel, 0, packVelocity(input.u, input.v, input.w));
	solver.writeStep(dt, 1, 1);
	await runPass(solver, (pass) => {
		solver.assemble(pass);
		solver.solve(pass);
		solver.project(pass);
	});
	const gpu = await gpuVelocity(solver);
	const p = await readBack(solver.device, solver.levels[0].p, 4 * grid.size);
	const levels = solver.levels.map((l) => `${l.nx}x${l.ny}x${l.nz}`).join(' > ');
	solver.dispose();
	const inside = (c: number) => {
		const k = Math.floor(c / grid.sxy);
		const j = Math.floor((c - k * grid.sxy) / grid.sx);
		return c - k * grid.sxy - j * grid.sx < grid.nx && j < grid.ny && k < grid.nz;
	};
	return {
		levels,
		velocity: compare({ u: [gpu.u, cpuVel.u], v: [gpu.v, cpuVel.v], w: [gpu.w, cpuVel.w] }),
		pressure: compare({ p: [p, pressure.pressure as Float32Array] }, inside)
	};
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

/**
 * The differentially heated cavity of tests/solver/scenarios.ts (Ra 1e5), which brings in buoyancy and the scalar
 * transport, with particulates that settle and deposit; `nz` > 1 with the turbulence closure on makes it 3D.
 */
async function heatedParity(n: number, nz: number, steps: number, turbulent: boolean) {
	const h = 1 / n;
	const prandtl = 0.71;
	const alpha = 1 / Math.sqrt(1e5 * prandtl);
	const SLIP: SideCondition = { slip: 'free-slip' };
	const config = (): SolverConfig => ({
		grid: { nx: n, ny: n, nz, h },
		fluid: { ...AIR, rho: 1, nu: prandtl * alpha, alpha, beta: 1, g: 1, mixing: 0 },
		geometry: boxGeometry({ nx: n, ny: n, nz, h }),
		sides: [{ slip: 'no-slip', theta: 0.5 }, { slip: 'no-slip', theta: -0.5 }, WALL, WALL, nz > 1 ? WALL : SLIP, nz > 1 ? WALL : SLIP],
		turbulence: turbulent ? 'shear-length' : 'none',
		pressure: { cycles: 4, pre: 2, post: 2, coarse: 30 },
		scalarSubsteps: 2
	});
	const dt = 0.5 * h;
	const cpu = new CpuSolver(config());
	cpu.fill(0, 0);
	// Patchy particulates, so their advection, diffusion, settling and deposition all move them.
	const next = random(7);
	for (let n = 0; n < cpu.c.length; n++) if (cpu.geometry.fluid[n]) cpu.c[n] = 100 * next();
	const initialC = cpu.c.slice();
	for (let s = 0; s < steps; s++) cpu.step(dt);
	const solver = await GpuSolver.create(await context(), config());
	solver.device.queue.writeBuffer(solver.scal, 0, packPair(new Float32Array(solver.grid.size), initialC));
	const device = solver.device;
	device.pushErrorScope('validation');
	for (let s = 0; s < steps; s++) {
		solver.writeStep(dt, 2, solver.diffusionSubsteps(dt), s);
		const encoder = device.createCommandEncoder();
		solver.encodeStep(encoder, dt, 2, s);
		device.queue.submit([encoder.finish()]);
	}
	const error = await device.popErrorScope();
	if (error) throw new Error(`validation: ${error.message}`);
	const gpu = await gpuVelocity(solver);
	const [theta, c] = unpackPair(await readBack(device, solver.scal, 8 * solver.grid.size));
	const nut = await readBack(device, solver.nut, 4 * solver.grid.size);
	solver.dispose();
	const grid = cpu.grid;
	const inside = (n: number) => {
		const k = Math.floor(n / grid.sxy);
		const j = Math.floor((n - k * grid.sxy) / grid.sx);
		return n - k * grid.sxy - j * grid.sx < grid.nx && j < grid.ny && k < grid.nz;
	};
	return {
		velocity: compare({ u: [gpu.u, cpu.vel.u], v: [gpu.v, cpu.vel.v], w: [gpu.w, cpu.vel.w] }),
		theta: compare({ theta: [theta, cpu.theta] }, inside),
		particulates: compare({ c: [c, cpu.c] }, inside),
		nut: compare({ nut: [nut, cpu.nut] }, inside)
	};
}

/**
 * A 3D room with everything the scenes use: two windows with a pressure difference across them (so the box has an
 * outlet and the mean is not removed) and a window fan in one, warmer and dirtier outdoor air, a fan disk in the
 * room, a particulate source and a purifier, buoyancy and the turbulence closure.
 */
async function devicesParity(steps: number, off: string[] = []) {
	const [nx, ny, nz, h] = [20, 16, 18, 0.15];
	const dt = 0.04;
	const build = () => {
		const geometry = boxGeometry({ nx, ny, nz, h });
		const grid = new Grid({ nx, ny, nz, h });
		const exterior = emptyExterior(grid);
		for (let k = 7; k < 11; k++)
			for (let j = 6; j < 10; j++) {
				geometry.au[0 + grid.sx * j + grid.sxy * k] = 1;
				geometry.au[nx + grid.sx * j + grid.sxy * k] = 1;
				const slot = j + ny * k;
				exterior.sides[0][3 * slot] = 2;
				exterior.sides[1][3 * slot] = -2;
				// A window fan blowing in through one face of the west window.
				if (j === 6 && k === 7 && !off.includes('windowFan')) {
					exterior.sides[0][3 * slot + 1] = 1.5;
					exterior.sides[0][3 * slot + 2] = 30;
				}
			}
		exterior.theta = off.includes('outdoors') ? 0 : 2;
		exterior.particulates = off.includes('outdoors') ? 0 : 10;
		const config: SolverConfig = {
			grid: { nx, ny, nz, h },
			fluid: { ...AIR, cd: 0.62 },
			geometry,
			sides: [WALL, WALL, WALL, WALL, WALL, WALL],
			turbulence: 'shear-length',
			scalarSubsteps: 3
		};
		const fan = rasterizeFan(grid, geometry, { center: [1.5, 1.2, 1.35], normal: [0, 0, 1], radius: 0.3, thickness: 0.1, qMax: 0.3, dpMax: 20 });
		const source = [grid.index(4, 1, 4), grid.index(5, 1, 4)];
		const inlet = [grid.index(14, 3, 12), grid.index(15, 3, 12), grid.index(14, 4, 12), grid.index(15, 4, 12)];
		return {
			config,
			exterior,
			fans: off.includes('fan') ? [] : [fan],
			emitters: off.includes('emitter') ? [] : [{ cells: Uint32Array.from(source), share: new Float32Array([0.5, 0.5]), rate: 1 }],
			sinks: off.includes('sink') ? [] : [{ cells: Uint32Array.from(inlet), share: new Float32Array(4).fill(0.25), cadr: 0.05 }]
		};
	};
	const a = build();
	const cpu = new CpuSolver(a.config);
	cpu.exterior = a.exterior;
	cpu.setFans(a.fans);
	cpu.setEmitters(a.emitters);
	cpu.setSinks(a.sinks);
	cpu.fill(0, 20);
	for (let s = 0; s < steps; s++) cpu.step(dt);
	const b = build();
	const solver = await GpuSolver.create(await context(), b.config);
	const device = solver.device;
	device.pushErrorScope('validation');
	solver.setExterior(b.exterior);
	solver.setFans(b.fans);
	solver.setEmitters(b.emitters);
	solver.setSinks(b.sinks);
	solver.fill(0, 20);
	for (let s = 0; s < steps; s++) {
		solver.writeStep(dt, 3, solver.diffusionSubsteps(dt), s);
		const encoder = device.createCommandEncoder();
		solver.encodeStep(encoder, dt, 3, s);
		device.queue.submit([encoder.finish()]);
	}
	const error = await device.popErrorScope();
	if (error) throw new Error(`validation: ${error.message}`);
	const gpu = await gpuVelocity(solver);
	const [theta, c] = unpackPair(await readBack(device, solver.scal, 8 * solver.grid.size));
	const nut = await readBack(device, solver.nut, 4 * solver.grid.size);
	const p = await readBack(device, solver.levels[0].p, 4 * solver.grid.size);
	const outlet = solver.outlet;
	solver.dispose();
	const grid = cpu.grid;
	const inside = (n: number) => {
		const k = Math.floor(n / grid.sxy);
		const j = Math.floor((n - k * grid.sxy) / grid.sx);
		return n - k * grid.sxy - j * grid.sx < grid.nx && j < grid.ny && k < grid.nz;
	};
	return {
		outlet,
		velocity: compare({ u: [gpu.u, cpu.vel.u], v: [gpu.v, cpu.vel.v], w: [gpu.w, cpu.vel.w] }),
		pressure: compare({ p: [p, cpu.pressure.pressure as Float32Array] }, inside),
		theta: compare({ theta: [theta, cpu.theta] }, inside),
		particulates: compare({ c: [c, cpu.c] }, inside),
		nut: compare({ nut: [nut, cpu.nut] }, inside)
	};
}

/** The point sampler and the horizontal slice, on the same random state uploaded to the GPU. */
async function readoutParity(seed: number) {
	const [nx, ny, nz, h] = [14, 10, 12, 0.1];
	const config = boxConfig(nx, ny, nz, h, 1.5e-5);
	const grid = new Grid(config.grid);
	const vel = randomVelocity(grid, config, seed);
	const next = random(seed + 100);
	const theta = Float32Array.from({ length: grid.size }, (_, n) => (config.geometry.fluid[n] ? 4 * next() - 2 : 0));
	const c = Float32Array.from({ length: grid.size }, (_, n) => (config.geometry.fluid[n] ? 100 * next() : 0));
	const count = 64;
	const points = new Float32Array(3 * count);
	for (let n = 0; n < count; n++) {
		points[3 * n] = next() * nx * h;
		points[3 * n + 1] = next() * ny * h;
		points[3 * n + 2] = next() * nz * h;
	}
	// The corners of the box and a point outside it, where the samplers clamp.
	points.set([0, 0, 0, nx * h, ny * h, nz * h, -0.3, 2, 5], 0);
	const layer = 4;
	const cpuSample = samplePoints(grid, vel, theta, c, points);
	const cpuSlice = extractSlice(grid, config.geometry, vel, theta, c, (layer + 0.5) * h);
	const solver = await GpuSolver.create(await context(), config);
	solver.device.queue.writeBuffer(solver.vel, 0, packVelocity(vel.u, vel.v, vel.w));
	solver.device.queue.writeBuffer(solver.scal, 0, packPair(theta, c));
	let out: any;
	await runPass(solver, (pass) => {
		out = solver.sample(pass, points);
		solver.slice(pass, layer);
	});
	const gpuSample = await readBack(solver.device, out, 20 * count);
	const raw = await readBack(solver.device, (solver as any).sliceOut, 32 * nx * nz);
	solver.dispose();
	const lane = (n: number) => Float32Array.from({ length: nx * nz }, (_, id) => raw[8 * id + n]);
	return {
		sample: compare({ sample: [gpuSample, cpuSample] }),
		slice: compare({
			u: [lane(0), cpuSlice.u],
			v: [lane(1), cpuSlice.v],
			w: [lane(2), cpuSlice.w],
			speed: [lane(3), cpuSlice.speed],
			theta: [lane(4), cpuSlice.theta],
			particulates: [lane(5), cpuSlice.particulates],
			fluid: [lane(6), Float32Array.from(cpuSlice.fluid)]
		})
	};
}

/** Face updates (a door swings): the geometry scatter must leave `geo` equal to a fresh pack of the changed geometry. */
async function faceUpdateParity(seed: number) {
	const config = boxConfig(12, 10, 8, 0.1, 1.5e-5);
	const grid = new Grid(config.grid);
	const solver = await GpuSolver.create(await context(), config);
	const next = random(seed);
	const updates = ([0, 1, 2] as const).map((axis) => {
		// Overlapping index ranges, so some indices change on two or three axes in one update.
		const indices = Uint32Array.from({ length: 40 }, (_, n) => grid.index(1 + (n % 8), 1 + ((n >> 3) % 6), 2 + axis));
		return { axis, indices, values: Float32Array.from(indices, () => Math.round(4 * next()) / 4) };
	});
	solver.updateFaces(updates);
	const expected = { ...config.geometry, au: config.geometry.au.slice(), av: config.geometry.av.slice(), aw: config.geometry.aw.slice() };
	const arrays = [expected.au, expected.av, expected.aw];
	for (const update of updates) update.indices.forEach((index, n) => (arrays[update.axis][index] = update.values[n]));
	const gpu = await readBack(solver.device, solver.geo, 16 * grid.size);
	solver.dispose();
	return compare({ geo: [gpu, packGeometry(grid, expected)] });
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

(window as any).parity = { diffuseParity, advectParity, turbulenceParity, pressureParity, cavityParity, heatedParity, devicesParity, readoutParity, faceUpdateParity, stepTime };
(window as any).harnessReady = true;
