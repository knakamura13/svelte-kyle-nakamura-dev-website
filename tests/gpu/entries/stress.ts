/*
 * Browser side of stress.gpu.ts: the random setups of tests/solver/robustness.spec.ts (the shared generators in
 * tests/solver/randomSetups.ts, so a seed gives the same setup in both places), run through World on GpuBackend or, to
 * check a failure, on CpuBackend.
 */
import { plans } from '$lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import { CpuBackend } from '$lib/experiments/airflow/solver/cpu/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { blankSetup, type Setup } from '$lib/experiments/airflow/state';
import { deviceMap, devicesFor, openingsFor, random, setupFor } from '../../solver/randomSetups';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DT = 1 / 20;

const finite = (array: Float32Array) => {
	for (let n = 0; n < array.length; n++) if (!Number.isFinite(array[n])) return false;
	return true;
};

let shared: GpuContext | null = null;
const makers: Record<'gpu' | 'cpu', BackendFactory> = {
	gpu: async (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, (shared ??= await GpuContext.create())),
	cpu: (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial)
};

const planOf = (id: string) => plans.find((p) => p.id === id)!;

/**
 * Steps `world`, and on the CPU (`watch`) checks the diagnostics after every step and stops at the first step past the
 * thresholds: the CPU's scalar substep count is uncapped, so once the flow blows up a step can take minutes. Returns
 * the step that failed, or 0.
 */
async function stepAll(world: World, steps: number, watch: boolean, each: (n: number) => void = () => {}) {
	for (let n = 0; n < steps; n++) {
		each(n);
		world.backend.step(DT);
		if (!watch) continue;
		const { diagnostics: d } = await world.backend.snapshot({});
		if (!(d.maxSpeed < 40) || !(d.divergence < 0.05)) return n + 1;
	}
	return 0;
}

async function verdict(world: World, names: readonly string[]) {
	const { diagnostics } = await world.backend.snapshot({});
	const fields = (await world.backend.readFields()) as any;
	const bad = names.filter((name) => !finite(fields[name]));
	const g = world.backend.grid;
	return { maxSpeed: diagnostics.maxSpeed, divergence: diagnostics.divergence, nonFinite: bad, cells: `${g.nx}x${g.ny}x${g.nz}` };
}

/** robustness.spec.ts, first test: random openings and weather, openings changed after 40 steps, 60 more. */
async function randomOpenings(planId: string, seed: number, h: number, backend: 'gpu' | 'cpu') {
	const plan = planOf(planId);
	const rand = random(seed);
	const setup = setupFor(plan, rand);
	const world = await World.create(setup, { plans: [plan], models: new Map(), make: makers[backend], h });
	const watch = backend === 'cpu';
	let stoppedAt = await stepAll(world, 40, watch);
	const changed = { ...setup, openings: openingsFor(plan, rand) };
	if (!stoppedAt) {
		world.apply(changed, 40 * DT);
		const later = await stepAll(world, 60, watch);
		stoppedAt = later ? 40 + later : 0;
	}
	const result = { ...(await verdict(world, ['u', 'v', 'w', 'p', 'theta'])), stoppedAt };
	world.dispose();
	const c = setup.conditions;
	const open = (o: Record<string, number>) => Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ');
	return { ...result, where: `${planId}, seed ${seed}, h ${h} m, wind ${c.windSpeed} m/s from ${c.windFrom}°, ${c.outdoorTemp} °C out / ${c.indoorTemp} °C in, furniture ${setup.furniture}, open [${open(setup.openings)}] then [${open(changed.openings)}]` };
}

/** robustness.spec.ts, second test: random fans and purifiers, power, aim and openings changed after 40 steps, 60 more. */
async function randomDevices(planId: string, seed: number, h: number, backend: 'gpu' | 'cpu') {
	const plan = planOf(planId);
	const rand = random(seed);
	const setup: Setup = { ...setupFor(plan, rand), devices: devicesFor(plan, rand) };
	const world = await World.create(setup, { plans: [plan], models: deviceMap, make: makers[backend], h });
	let time = 0;
	const watch = backend === 'cpu';
	const oscillate = () => {
		world.updateOscillation(time);
		time += DT;
	};
	let stoppedAt = await stepAll(world, 40, watch, oscillate);
	const changed: Setup = {
		...setup,
		openings: openingsFor(plan, rand),
		devices: setup.devices.map((d) => ({ ...d, power: rand(), yaw: d.opening || rand() < 0.5 ? d.yaw : Math.floor(rand() * 360) }))
	};
	if (!stoppedAt) {
		world.apply(changed, time);
		const later = await stepAll(world, 60, watch, oscillate);
		stoppedAt = later ? 40 + later : 0;
	}
	const result = { ...(await verdict(world, ['u', 'v', 'w', 'p', 'theta', 'particulates'])), stoppedAt };
	world.dispose();
	const list = setup.devices.map((d) => `${d.model}${d.opening ? ` in ${d.opening}` : ` at ${d.x.toFixed(1)},${d.z.toFixed(1)}`} power ${d.power.toFixed(2)}`).join('; ');
	return { ...result, where: `${planId}, seed ${seed}, h ${h} m, wind ${setup.conditions.windSpeed} m/s from ${setup.conditions.windFrom}°, ${setup.conditions.outdoorTemp} °C out, devices: ${list}` };
}

/**
 * 600 steps of 0.05 s. `wind`: 3 m/s from the west, the first three openings that are not doors fully open. `cold`: no
 * wind, −5 °C outside, the same openings. The fastest air and the divergence every 100 steps.
 */
async function longRun(planId: string, h: number, kind: 'wind' | 'cold', backend: 'gpu' | 'cpu') {
	const plan = planOf(planId);
	const setup = blankSetup(plan.id);
	const windows = plan.openings.filter((o) => !o.kind.includes('door')).slice(0, 3);
	setup.openings = Object.fromEntries(windows.map((o) => [o.id, 1]));
	setup.conditions = kind === 'wind' ? { ...setup.conditions, windFrom: 270, windSpeed: 3 } : { ...setup.conditions, windSpeed: 0, outdoorTemp: -5 };
	const world = await World.create(setup, { plans: [plan], models: new Map(), make: makers[backend], h });
	const series: { step: number; maxSpeed: number; divergence: number }[] = [];
	for (let step = 1; step <= 600; step++) {
		world.backend.step(DT);
		if (step % 100 === 0) {
			const { diagnostics } = await world.backend.snapshot({});
			series.push({ step, maxSpeed: diagnostics.maxSpeed, divergence: diagnostics.divergence });
		}
	}
	const result = await verdict(world, ['u', 'v', 'w', 'p', 'theta']);
	world.dispose();
	const c = setup.conditions;
	return { ...result, series, where: `${planId}, h ${h} m, ${kind}: wind ${c.windSpeed} m/s from ${c.windFrom}°, ${c.outdoorTemp} °C out / ${c.indoorTemp} °C in, open [${windows.map((o) => o.id).join(' ')}]` };
}

/** randomDevices step by step on one backend: the diagnostics after every step until something is not finite. For debugging a failure. */
async function traceDevices(planId: string, seed: number, h: number, backend: 'gpu' | 'cpu', limit = 100) {
	const plan = planOf(planId);
	const rand = random(seed);
	const setup: Setup = { ...setupFor(plan, rand), devices: devicesFor(plan, rand) };
	const world = await World.create(setup, { plans: [plan], models: deviceMap, make: makers[backend], h });
	const trace: string[] = [];
	let time = 0;
	const changed: Setup = {
		...setup,
		openings: openingsFor(plan, rand),
		devices: setup.devices.map((d) => ({ ...d, power: rand(), yaw: d.opening || rand() < 0.5 ? d.yaw : Math.floor(rand() * 360) }))
	};
	for (let n = 0; n < limit; n++) {
		if (n === 40) world.apply(changed, time);
		world.updateOscillation(time);
		world.backend.step(DT);
		time += DT;
		const snap = await world.backend.snapshot({});
		const d = snap.diagnostics;
		trace.push(`${n + 1}: ${d.maxSpeed.toFixed(3)} m/s div ${d.divergence.toExponential(1)} cfl ${d.cfl.toFixed(2)} fans [${Array.from(snap.fanFlow).map((q) => q.toFixed(3)).join(' ')}]`);
		if (!Number.isFinite(d.maxSpeed) || !Number.isFinite(d.divergence)) break;
	}
	world.dispose();
	return trace;
}

(window as any).stress = { traceDevices, randomOpenings, randomDevices, longRun, planIndex: (id: string) => plans.findIndex((p) => p.id === id) };
(window as any).harnessReady = true;
