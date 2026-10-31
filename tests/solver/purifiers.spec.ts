import { expect, test } from '@playwright/test';
import { DEVICE_MODELS, PURIFIER_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { PURIFIER_MARKS, purifierCadr } from '../../src/lib/experiments/airflow/devices/model';
import { CFM, type PurifierModel } from '../../src/lib/experiments/airflow/devices/types';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { linkCatalog, setupFromHash, setupToHash } from '../../src/lib/experiments/airflow/link';
import { DeviceMeshes } from '../../src/lib/experiments/airflow/scene/deviceMeshes';
import { deviceInputs } from '../../src/lib/experiments/airflow/devices/solver';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { CpuSolver } from '../../src/lib/experiments/airflow/solver/cpu/solver';
import { boxGeometry } from '../../src/lib/experiments/airflow/solver/geometry';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { advance } from './scenarios';
import { World, PARTICLE, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { blankSetup, type DeviceState } from '../../src/lib/experiments/airflow/state';

/**
 * The three purifiers in the catalog: one of each size, with the top-speed CADR as the maker or the certification listing prints it,
 * the lower speeds derived from it by the stated assumption, a body and openings the solver and the scene agree on, smoke that clears
 * at the rate the CADR implies, and a Share link that keeps them.
 */
const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const bySize = (size: PurifierModel['size']) => PURIFIER_MODELS.find((m) => m.size === size)!;

/** What each model's top-speed figure is as published, in cfm, and where. A transcription guard: the catalog's number is the cited one. */
const PUBLISHED_CFM: Record<string, number> = {
	'levoit-core-300p': 143,
	'coway-ap-1512hh': 233,
	'coway-airmega-400': 376
};

test.describe('the purifiers in the catalog', () => {
	test('there is one of each size, and each lists a top-speed figure as published', () => {
		expect(PURIFIER_MODELS.map((m) => m.size)).toEqual(['small', 'medium', 'large']);
		for (const model of PURIFIER_MODELS) {
			expect(model.cadr.high / CFM, model.id).toBeCloseTo(PUBLISHED_CFM[model.id], 9);
		}
		// Bigger purifiers clean faster and are bigger.
		const [small, medium, large] = [bySize('small'), bySize('medium'), bySize('large')];
		expect(small.cadr.high).toBeLessThan(medium.cadr.high);
		expect(medium.cadr.high).toBeLessThan(large.cadr.high);
		expect(small.body.height).toBeLessThan(large.body.height);
	});

	test('Sleep, Low and Medium are the top figure times the speed’s power mark, which is what each source line says', () => {
		for (const model of PURIFIER_MODELS) {
			expect(model.cadr.sleep, model.id).toBeCloseTo(model.cadr.high * PURIFIER_MARKS.sleep, 12);
			expect(model.cadr.low, model.id).toBeCloseTo(model.cadr.high * PURIFIER_MARKS.low, 12);
			expect(model.cadr.medium, model.id).toBeCloseTo(model.cadr.high * PURIFIER_MARKS.medium, 12);
			// Between marks the slider is a straight line through them, so the CADR is proportional to power.
			for (const power of [0.1, 0.4, 0.6, 0.9]) expect(purifierCadr(model, power) / model.cadr.high, `${model.id} at ${power}`).toBeCloseTo(power, 9);
			expect(model.source, model.id).toMatch(/Derived, not published/);
			expect(model.source, model.id).toMatch(/0\.25, 0\.5 and 0\.75|power mark/);
			expect(model.source, model.id).toMatch(/[Ee]stimated/);
		}
	});

	test('the inlet band is inside the body, and the outlet is inside its top', () => {
		for (const model of PURIFIER_MODELS) {
			expect(model.inlet.from, model.id).toBeGreaterThanOrEqual(0);
			expect(model.inlet.to, model.id).toBeLessThanOrEqual(model.body.height);
			expect(model.inlet.to - model.inlet.from, model.id).toBeGreaterThan(0.1);
			expect(model.outletDiameter, model.id).toBeLessThanOrEqual(Math.min(model.body.width, model.body.depth));
			// The jet leaves slower than a fan's would: a purifier's outlet is a grille over a large area.
			const speed = model.cadr.high / ((Math.PI * model.outletDiameter ** 2) / 4);
			expect(speed, `${model.id}: ${speed.toFixed(1)} m/s`).toBeLessThan(8);
		}
	});

	test('its stand-in is a body of the model’s size with an outlet of its diameter on top, and the symbol on the slice has no arrow', () => {
		for (const model of PURIFIER_MODELS) {
			const device: DeviceState = { id: 'p', model: model.id, x: 3, z: 3, y: 0, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } };
			const meshes = new DeviceMeshes(models);
			meshes.update([device], 0, 1.1, null);
			meshes.group.updateMatrixWorld(true);
			const pose = meshes.headPose('p')!;
			// A purifier blows up, from the middle of its body.
			expect(pose.forward.y, model.id).toBeCloseTo(1, 9);
			expect(pose.position.y, model.id).toBeCloseTo(model.body.height / 2, 6);
			expect(pose.position.x).toBeCloseTo(3, 6);
			meshes.dispose();
		}
	});

	test('a Share link keeps a purifier’s model, position and power through a round trip, with a fan beside it', () => {
		const catalog = linkCatalog(plans, DEVICE_MODELS);
		for (const model of PURIFIER_MODELS) {
			const setup = blankSetup('two-bedroom');
			setup.devices = [
				{ id: 'd1', model: model.id, x: 2.5, z: 5.25, y: 0, yaw: 0, tilt: 0, power: 0.5, height: 0, oscillation: { on: false, sweep: 90, period: 8 } },
				{ id: 'd2', model: DEVICE_MODELS[0].id, x: 8, z: 4, y: 0, yaw: 90, tilt: 5, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }
			];
			const back = setupFromHash(setupToHash(setup), catalog);
			expect(back, model.id).not.toBeNull();
			const purifier = back!.devices.find((d) => d.model === model.id)!;
			expect(purifier.x, model.id).toBeCloseTo(2.5, 1);
			expect(purifier.z, model.id).toBeCloseTo(5.25, 1);
			expect(purifier.power, model.id).toBeCloseTo(0.5, 2);
			expect(back!.devices).toHaveLength(2);
		}
	});
});

/** A 3 m × 3 m × 2.4 m room with every window shut: smoke leaves it only by settling, sticking to the walls, and the purifier. */
const room: HomePlan = {
	id: 'studio',
	name: 'Test room',
	blurb: '',
	width: 3,
	depth: 3,
	ceiling: 2.4,
	rooms: [{ id: 'room', name: 'Room', rects: [{ x: 0, z: 0, w: 3, d: 3 }] }],
	walls: [],
	furniture: [],
	openings: []
};
const volume = 3 * 3 * 2.4;
const surface = 2 * (3 * 3 + 3 * 2.4 + 3 * 2.4);

/** The smoke in a sealed room with a purifier running, sampled every 5 s in steps of the page's own 0.05 s, and the decay constant read from the log of it. */
async function decay(model: PurifierModel, power: number) {
	const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, { ...initial, particulates: 1 });
	const setup = blankSetup('studio');
	setup.devices = [{ id: 'p', model: model.id, x: 1.5, z: 1.5, y: 0, yaw: 0, tilt: 0, power, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }];
	const world = await World.create(setup, { plans: [room], models, make, h: 0.2 });
	const losses = (PARTICLE.deposition * surface + PARTICLE.settling * 9) / volume;
	const seconds = Math.min(600, 1.5 / (purifierCadr(model, power) / volume + losses));
	const samples: [number, number][] = [];
	const dt = 0.05;
	for (let t = 0; t < seconds - 1e-9; t += dt) {
		world.backend.step(dt);
		const time = t + dt;
		// After the first minute, while the jet mixes the room.
		if (time >= 60 && Math.abs(time / 5 - Math.round(time / 5)) < 1e-4) samples.push([time, (await world.backend.snapshot({})).diagnostics.mass.inAir]);
	}
	world.dispose();
	return decayOf(samples);
}

/** The least-squares decay constant of a series of (time, mass) samples, 1/s, from the log of the mass. */
function decayOf(samples: [number, number][]) {
	const logs = samples.map(([time, mass]): [number, number] => [time, Math.log(mass)]);
	const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
	const mt = mean(logs.map(([time]) => time));
	const my = mean(logs.map(([, y]) => y));
	return -logs.reduce((a, [time, y]) => a + (time - mt) * (y - my), 0) / logs.reduce((a, [time]) => a + (time - mt) ** 2, 0);
}

test.describe('smoke in a sealed room with a catalog purifier', () => {
	test('its CADR is what the solver takes out: in well-mixed air the smoke decays at about CADR / volume, in proportion to the power, for each size', async () => {
		test.setTimeout(600_000);
		// The same room and mixing as the benchmark that checks the solver's decay law: a large eddy diffusivity holds the air well mixed, which is
		// what the fan in the test chamber of a CADR rating does. The purifier is the catalog's, turned into solver inputs the way the page does,
		// and stepped by the page's own 0.05 s (a jet of several m/s needs no more).
		const h = 0.2;
		const [nx, ny, nz] = [15, 12, 15];
		const raster = rasterizePlan(room, h, { furniture: false });
		const ratios: Record<string, number> = {};
		for (const [model, power] of [
			[bySize('small'), 1],
			[bySize('small'), 0.5],
			[bySize('medium'), 1],
			[bySize('large'), 1]
		] as const) {
			const device: DeviceState = { id: 'p', model: model.id, x: 1.5, z: 1.5, y: 0, yaw: 0, tilt: 0, power, height: 0, oscillation: { on: false, sweep: 90, period: 8 } };
			const inputs = deviceInputs({ devices: [device], models, raster, fluid: AIR, time: 0 });
			const solver = new CpuSolver({
				grid: { nx, ny, nz, h },
				fluid: { ...AIR, beta: 0, particleDiffusivity: 0.3, deposition: PARTICLE.deposition, settling: PARTICLE.settling },
				geometry: boxGeometry({ nx, ny, nz, h })
			});
			solver.fill(0, 100);
			solver.setFans(inputs.fans);
			solver.setSinks(inputs.sinks);
			const cadr = purifierCadr(model, power);
			const losses = (PARTICLE.deposition * surface + PARTICLE.settling * 9) / volume;
			const total = Math.min(600, 1.5 / (cadr / volume + losses));
			const samples: [number, number][] = [];
			advance(solver, total, 0.05, (time) => {
				if (time >= 30 && Math.abs(time / 5 - Math.round(time / 5)) < 1e-4) samples.push([time, solver.airborneMass()]);
			});
			const predicted = cadr / volume + losses;
			const measured = decayOf(samples);
			console.log(`${model.id} at ${power} in well-mixed air: ${(measured * 3600).toFixed(2)} per hour measured, ${(predicted * 3600).toFixed(2)} implied by CADR ${(cadr / CFM).toFixed(0)} cfm in ${volume.toFixed(1)} m³ (${((measured / predicted) * 100).toFixed(1)} %)`);
			expect(Number.isFinite(measured), `${model.id} at ${power}: the run stayed finite`).toBe(true);
			// Within a tenth: the smoke in the few cells in front of the inlet is a little cleaner than the room's mean, so the room clears a little slower.
			expect(measured / predicted, `${model.id} at ${power}`).toBeGreaterThan(0.85);
			expect(measured / predicted, `${model.id} at ${power}`).toBeLessThan(1.05);
			ratios[`${model.id}@${power}`] = measured;
		}
		// Half the power clears about half as fast: the lower speeds are the top speed's CADR times the power mark.
		const small = bySize('small').id;
		expect(ratios[`${small}@0.5`] / ratios[`${small}@1`]).toBeGreaterThan(0.45);
		expect(ratios[`${small}@0.5`] / ratios[`${small}@1`]).toBeLessThan(0.6);
	});

	test('in a still room with only its own jet to mix the air, a purifier clears smoke at roughly two thirds to four fifths of what its CADR implies', async () => {
		test.setTimeout(600_000);
		const results: Record<string, number> = {};
		for (const model of [bySize('small'), bySize('medium')]) {
			const measured = await decay(model, 1);
			const losses = (PARTICLE.deposition * surface + PARTICLE.settling * 9) / volume;
			const predicted = purifierCadr(model, 1) / volume + losses;
			console.log(`${model.id} at top speed in a still room: ${(measured * 3600).toFixed(2)} per hour measured, ${(predicted * 3600).toFixed(2)} implied by CADR ${(purifierCadr(model, 1) / CFM).toFixed(0)} cfm in ${volume.toFixed(1)} m³ (${((measured / predicted) * 100).toFixed(0)} %)`);
			// A CADR is measured in a chamber whose air a fan keeps mixed. In a room that only the purifier's jet stirs, the smoke in front of its inlet is
			// cleaner than the room's mean, so the room clears more slowly than the box model says: the ratio is the mixing the jet manages.
			expect(measured / predicted, model.id).toBeGreaterThan(0.45);
			expect(measured / predicted, model.id).toBeLessThan(1.05);
			results[model.id] = measured / predicted;
		}
		// A stronger jet mixes better.
		expect(results[bySize('medium').id]).toBeGreaterThan(results[bySize('small').id]);
	});
});
