import { FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { isFree, newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import { CFM, type DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { blankSetup, LIMITS, type DeviceState, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * Random setups for the stress tests: what a visitor could build with the controls. A seed gives the same setup every
 * time, so a failure is reproduced from its seed. The generators draw from the random stream in a fixed order, so
 * changing one changes every seed's setup (and the GPU stress in `tests/gpu/` copies them).
 */

/** The catalog's fans, and a stand-in purifier: the seeds of the stress tests were drawn with it, so it stays; `robustness.spec.ts` also runs the catalog's own purifiers. */
export const deviceModels: DeviceModel[] = [
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
export const deviceMap = new Map(deviceModels.map((m) => [m.id, m]));

/** A small seeded generator (mulberry32). */
export function random(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const between = (rand: () => number, { min, max, step }: { min: number; max: number; step: number }) => min + Math.floor((rand() * (max - min)) / step + 0.5) * step;

/** Every door and window of the plan: closed, half open or open, in equal parts of the draw. */
export const openingsFor = (plan: HomePlan, rand: () => number) => {
	const openings: Record<string, number> = {};
	for (const opening of plan.openings) {
		const r = rand();
		openings[opening.id] = r < 0.5 ? 0 : r < 0.75 ? 0.5 : 1;
	}
	return openings;
};

export const setupFor = (plan: HomePlan, rand: () => number): Setup => ({
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

/** One to five devices at random places, aims, powers and oscillation settings, drawn from `models` (the fans and the stand-in purifier unless a test passes others). */
export const devicesFor = (plan: HomePlan, rand: () => number, models: readonly DeviceModel[] = deviceModels): DeviceState[] => {
	const devices: DeviceState[] = [];
	const count = 1 + Math.floor(rand() * 5);
	for (let n = 0; n < count; n++) {
		const made = newDevice(plan, models[Math.floor(rand() * models.length)], devices);
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
