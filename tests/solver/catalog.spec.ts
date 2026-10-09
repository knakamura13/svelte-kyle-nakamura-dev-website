import { expect, test } from '@playwright/test';
import { DEVICE_MODELS, FAN_MODELS, PURIFIER_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { FAN_MARKS, PURIFIER_MARKS, fanFlow, purifierCadr } from '../../src/lib/experiments/airflow/devices/model';
import { deviceInputs } from '../../src/lib/experiments/airflow/devices/solver';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import type { DeviceState } from '../../src/lib/experiments/airflow/state';

/** Every number anywhere in a model, with the path to it, for the "positive and finite" check. */
function numbers(value: unknown, path: string): [string, number][] {
	if (typeof value === 'number') return [[path, value]];
	if (Array.isArray(value)) return value.flatMap((v, n) => numbers(v, `${path}[${n}]`));
	if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => numbers(v, `${path}.${k}`));
	return [];
}

/** The rated values in slider order, with the slider position of each. */
function ratings(model: DeviceModel): [mark: number, rated: number][] {
	if (model.kind === 'air-purifier')
		return [
			[PURIFIER_MARKS.sleep, model.cadr.sleep],
			[PURIFIER_MARKS.low, model.cadr.low],
			[PURIFIER_MARKS.medium, model.cadr.medium],
			[PURIFIER_MARKS.high, model.cadr.high]
		];
	return [
		[FAN_MARKS.low, model.flow.low],
		[FAN_MARKS.medium, model.flow.medium],
		[FAN_MARKS.high, model.flow.high]
	];
}

/** A 6 m × 3 m room with a casement window in each short wall, big enough for any model in the catalog. */
const plan: HomePlan = {
	id: 'studio',
	name: 'Test room',
	blurb: '',
	width: 6,
	depth: 3,
	ceiling: 2.4,
	rooms: [{ id: 'room', name: 'Room', rects: [{ x: 0, z: 0, w: 6, d: 3 }] }],
	walls: [],
	furniture: [],
	openings: [
		{ id: 'west', name: 'West window', kind: 'casement', placement: { facade: 'west', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: 1, anchor: 'start' },
		{ id: 'east', name: 'East window', kind: 'casement', placement: { facade: 'east', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: 1, anchor: 'start' }
	]
};

function deviceFor(model: DeviceModel): DeviceState {
	return {
		id: `d-${model.id}`,
		model: model.id,
		x: 3,
		z: 1.5,
		y: 0,
		yaw: 90,
		tilt: 0,
		power: 1,
		height: model.kind === 'pedestal-fan' && model.heightRange ? (model.heightRange[0] + model.heightRange[1]) / 2 : 0,
		oscillation: { on: false, sweep: 90, period: 8 },
		...(model.kind === 'window-fan' ? { opening: 'west', intake: true } : {})
	};
}

test.describe('the device catalog', () => {
	test('has a fan of every kind, and every id is unique', () => {
		expect(new Set(DEVICE_MODELS.map((m) => m.id)).size).toBe(DEVICE_MODELS.length);
		for (const kind of ['box-fan', 'pedestal-fan', 'window-fan'] as const) expect(FAN_MODELS.some((m) => m.kind === kind), kind).toBe(true);
	});

	test('every number is positive and finite', () => {
		for (const model of DEVICE_MODELS)
			for (const [path, value] of numbers(model, model.id)) {
				expect(Number.isFinite(value), path).toBe(true);
				expect(value, path).toBeGreaterThan(0);
			}
	});

	test('every model names its source: a URL and the date it was read', () => {
		for (const model of DEVICE_MODELS) {
			expect(model.source, model.id).toMatch(/https:\/\/\S+/);
			expect(model.source, model.id).toMatch(/read \d{4}-\d{2}-\d{2}/);
		}
	});

	test('flow rises from each speed to the next', () => {
		for (const model of DEVICE_MODELS) {
			const rated = ratings(model).map(([, value]) => value);
			for (let n = 1; n < rated.length; n++) expect(rated[n], `${model.id} step ${n}`).toBeGreaterThan(rated[n - 1]);
		}
	});

	test('at each mark of the power slider the model delivers its rated flow', () => {
		for (const model of DEVICE_MODELS)
			for (const [mark, rated] of ratings(model)) {
				const delivered = model.kind === 'air-purifier' ? purifierCadr(model, mark) : fanFlow(model, mark);
				expect(Math.abs(delivered - rated) / rated, `${model.id} at ${mark}`).toBeLessThan(1e-9);
			}
	});

	test('body sizes are between 0.1 m and 1.5 m, and a fan blade fits inside its body', () => {
		for (const model of DEVICE_MODELS) {
			for (const [side, size] of Object.entries(model.body)) {
				expect(size, `${model.id} ${side}`).toBeGreaterThanOrEqual(0.1);
				expect(size, `${model.id} ${side}`).toBeLessThanOrEqual(1.5);
			}
			if (model.kind !== 'air-purifier') expect(model.diameter, model.id).toBeLessThanOrEqual(Math.min(model.body.width, model.body.height));
		}
	});

	test('every model turns into solver inputs that carry its rated flow', () => {
		const raster = rasterizePlan(plan, 0.15, { furniture: false });
		for (const model of DEVICE_MODELS) {
			const device = deviceFor(model);
			const inputs = deviceInputs({ devices: [device], models: new Map([[model.id, model]]), raster, fluid: AIR, time: 0 });
			if (model.kind === 'window-fan') {
				expect(inputs.windowFans, model.id).toHaveLength(1);
				const fan = inputs.windowFans[0];
				expect(fan.slots.length, model.id).toBeGreaterThan(0);
				// Drawing air in, the speed through the open window's faces times their open area is the rated flow.
				const opening = raster.openings.find((o) => o.spec.id === 'west')!;
				const area = opening.coverage(1).reduce((sum, c) => sum + c, 0) * raster.spec.h ** 2;
				expect(fan.speed, model.id).toBeGreaterThan(0);
				expect((fan.speed * area) / model.flow.high, model.id).toBeCloseTo(1, 9);
			} else {
				const index = inputs.fanIndex.get(device.id);
				expect(index, model.id).toBeDefined();
				const disk = inputs.fans[index!];
				expect(disk.cells.length, model.id).toBeGreaterThan(0);
				expect(Number.isFinite(disk.dpMax) && disk.dpMax > 0, model.id).toBe(true);
				const rated = model.kind === 'air-purifier' ? model.cadr.high : model.flow.high;
				expect(disk.qMax / rated, model.id).toBeCloseTo(Math.SQRT2, 9);
				if (model.kind === 'air-purifier') expect(inputs.sinks[0].cadr, model.id).toBeCloseTo(model.cadr.high, 9);
			}
		}
	});

	// No maker or certification listing read so far publishes a purifier's CADR at every speed (see the note in catalog.ts).
	test.fixme('has a purifier of each size', () => {
		for (const size of ['small', 'medium', 'large'] as const) expect(PURIFIER_MODELS.some((m) => m.size === size), size).toBe(true);
	});
});
