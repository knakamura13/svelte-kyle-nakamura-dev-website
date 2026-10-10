/*
 * Browser side of stress.gpu.ts: the random setups of tests/solver/robustness.spec.ts (the generators are copied here
 * verbatim, so a seed gives the same setup in both places), run through World on GpuBackend or, to check a failure,
 * on CpuBackend.
 */
import { FAN_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { isFree, newDevice } from '$lib/experiments/airflow/devices/placement';
import { CFM, type DeviceModel } from '$lib/experiments/airflow/devices/types';
import { plans } from '$lib/experiments/airflow/homes/plans';
import type { HomePlan } from '$lib/experiments/airflow/homes/types';
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import { CpuBackend } from '$lib/experiments/airflow/solver/cpu/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { blankSetup, LIMITS, type DeviceState, type Setup } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

const deviceModels: DeviceModel[] = [
	...FAN_MODELS,
	{
		id: 'purifier',
		name: 'Purifier',
		kind: 'air-purifier',
		size: 'medium',
		body: { width: 0.3, depth: 0.3, height: 0.6 },
		source: 'test',
		cadr: { sleep: 40 * CFM, low: 80 * CFM, medium: 160 * CFM, high: 240 * CFM },
		inlet: { from: 0.1, to: 0.35 },
		outletDiameter: 0.2
	}
];
const deviceMap = new Map(deviceModels.map((m) => [m.id, m]));
const DT = 1 / 20;

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

const between = (rand: () => number, { min, max, step }: { min: number; max: number; step: number }) => min + Math.floor((rand() * (max - min)) / step + 0.5) * step;

const openingsFor = (plan: HomePlan, rand: () => number) => {
	const openings: Record<string, number> = {};
	for (const opening of plan.openings) {
		const r = rand();
		openings[opening.id] = r < 0.5 ? 0 : r < 0.75 ? 0.5 : 1;
	}
	return openings;
};

const setupFor = (plan: HomePlan, rand: () => number): Setup => ({
	...blankSetup(plan.id),
	furniture: rand() < 0.7,
	openings: openingsFor(plan, rand),
	conditions: {
		windFrom: Math.floor(rand() * 24) * 15,
		windSpeed: between(rand, LIMITS.windSpeed),
		outdoorTemp: between(rand, LIMITS.outdoorTemp),
		indoorTemp: between(rand, LIMITS.indoorTemp),
		outdoorPm25: between(rand, LIMITS.outdoorPm25)
	}
});

const uniform = (rand: () => number, { min, max }: { min: number; max: number }) => min + rand() * (max - min);

const devicesFor = (plan: HomePlan, rand: () => number): DeviceState[] => {
	const devices: DeviceState[] = [];
	const count = 1 + Math.floor(rand() * 5);
	for (let n = 0; n < count; n++) {
		const made = newDevice(plan, deviceModels[Math.floor(rand() * deviceModels.length)], devices);
		if (!('device' in made)) continue;
		const device = made.device;
		device.power = [0, 1 / 3, 2 / 3, 1, rand()][Math.floor(rand() * 5)];
		if (device.opening) {
			device.intake = rand() < 0.5;
		} else {
			device.yaw = Math.floor(rand() * 360);
			device.tilt = Math.round(uniform(rand, LIMITS.tilt));
			for (let attempt = 0; attempt < 40; attempt++) {
				const x = 0.5 + rand() * (plan.width - 1);
				const z = 0.5 + rand() * (plan.depth - 1);
				if (!isFree(plan, x, z) || devices.some((d) => Math.hypot(d.x - x, d.z - z) < 0.9)) continue;
				device.x = x;
				device.z = z;
				break;
			}
			device.oscillation = { on: rand() < 0.5, sweep: Math.round(uniform(rand, LIMITS.oscillationSweep)), period: Math.round(uniform(rand, LIMITS.oscillationPeriod)) };
		}
		devices.push(device);
	}
	return devices;
};

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
	for (let step = 0; step < 40; step++) world.backend.step(DT);
	const changed = { ...setup, openings: openingsFor(plan, rand) };
	world.apply(changed, 40 * DT);
	for (let step = 0; step < 60; step++) world.backend.step(DT);
	const result = await verdict(world, ['u', 'v', 'w', 'p', 'theta']);
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
	const advance = (steps: number) => {
		for (let n = 0; n < steps; n++) {
			world.updateOscillation(time);
			world.backend.step(DT);
			time += DT;
		}
	};
	advance(40);
	const changed: Setup = {
		...setup,
		openings: openingsFor(plan, rand),
		devices: setup.devices.map((d) => ({ ...d, power: rand(), yaw: d.opening || rand() < 0.5 ? d.yaw : Math.floor(rand() * 360) }))
	};
	world.apply(changed, time);
	advance(60);
	const result = await verdict(world, ['u', 'v', 'w', 'p', 'theta', 'particulates']);
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

(window as any).stress = { randomOpenings, randomDevices, longRun, planIndex: (id: string) => plans.findIndex((p) => p.id === id) };
(window as any).harnessReady = true;
