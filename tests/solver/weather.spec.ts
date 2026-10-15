import { expect, test } from '@playwright/test';
import { FACADE_BEARING, WIND_AT_EAVES, exteriorState, windPressureCoefficient } from '../../src/lib/experiments/airflow/homes/weather';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { OPENING_LIMITS, type HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { DEFAULT_CONDITIONS } from '../../src/lib/experiments/airflow/state';

/** A 6 m × 3 m single room with a window in each short wall, enough to check the outside pressures. */
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
		{ id: 'west', name: 'West window', kind: 'casement', placement: { facade: 'west', center: 1.5 }, width: 0.9, height: 1.2, sill: 0.9, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'start' },
		{ id: 'east', name: 'East window', kind: 'casement', placement: { facade: 'east', center: 1.5 }, width: 0.9, height: 1.2, sill: 0.9, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'start' }
	]
};

test.describe('wind pressure coefficients', () => {
	/** Check table from docs/research/airflow/openings-and-wind.md §1a (Swami and Chandra; EnergyPlus form), which agrees with CONTAM's table to 0.001. */
	const table: [ratio: number, values: number[]][] = [
		[1, [0.603, 0.323, -0.443, -0.535, -0.364]],
		[0.5, [0.603, 0.292, -0.517, -0.494, -0.226]],
		[2, [0.603, 0.356, -0.34, -0.494, -0.452]]
	];
	for (const [ratio, values] of table)
		test(`side ratio ${ratio} at 0, 45, 90, 135 and 180 degrees`, () => {
			[0, 45, 90, 135, 180].forEach((angle, n) => expect(windPressureCoefficient(angle, ratio)).toBeCloseTo(values[n], 2));
		});

	test('is symmetric about the wall’s normal', () => {
		for (const angle of [10, 45, 100, 170]) expect(windPressureCoefficient(360 - angle, 2)).toBeCloseTo(windPressureCoefficient(angle, 2), 12);
	});
});

test.describe('outside pressures', () => {
	const raster = () => rasterizePlan(plan, 0.15, { furniture: false });
	const pressureAt = (exterior: ReturnType<typeof exteriorState>, opening: string) => {
		const found = raster().openings.find((o) => o.spec.id === opening)!;
		const slots = found.faces.map((face) => exterior.sides[found.side!][3 * face.slot]);
		return slots.reduce((a, b) => a + b, 0) / slots.length;
	};

	test('a west wind pushes on the west window and sucks on the east one, by ½ρU²Cp at the eaves', () => {
		const conditions = { ...DEFAULT_CONDITIONS, windFrom: 270, windSpeed: 5, outdoorTemp: DEFAULT_CONDITIONS.indoorTemp };
		const exterior = exteriorState(raster(), conditions, conditions.indoorTemp, { ...AIR, beta: 0 });
		const eaves = 5 * WIND_AT_EAVES;
		const dynamic = 0.5 * AIR.rho * eaves * eaves;
		// The long (6 m) walls are north and south; the west and east walls are the short ones, so their side ratio is 3/6 = 0.5.
		expect(pressureAt(exterior, 'west')).toBeCloseTo(dynamic * windPressureCoefficient(270 - FACADE_BEARING.west, 0.5), 3);
		expect(pressureAt(exterior, 'west')).toBeGreaterThan(0);
		expect(pressureAt(exterior, 'east')).toBeLessThan(0);
	});

	test('colder outside air has less pressure higher up, which is what drives the stack effect', () => {
		const conditions = { ...DEFAULT_CONDITIONS, windSpeed: 0, outdoorTemp: 0, indoorTemp: 20 };
		const fluid = { ...AIR, beta: 1 / 293.15 };
		const exterior = exteriorState(raster(), conditions, 20, fluid);
		const west = raster().openings.find((o) => o.spec.id === 'west')!;
		const low = west.faces.reduce((a, b) => (a.y0 < b.y0 ? a : b));
		const high = west.faces.reduce((a, b) => (a.y0 > b.y0 ? a : b));
		const side = west.side!;
		const lowPressure = exterior.sides[side][3 * low.slot];
		const highPressure = exterior.sides[side][3 * high.slot];
		expect(highPressure).toBeLessThan(lowPressure);
		// ρ·g·β·ΔT·Δy with ΔT = -20 K over the height between the two faces.
		expect(highPressure - lowPressure).toBeCloseTo(AIR.rho * AIR.g * fluid.beta * -20 * ((high.y0 + high.y1) / 2 - (low.y0 + low.y1) / 2), 4);
		expect(exterior.theta).toBeCloseTo(-20, 12);
	});

	test('outdoor particulates are given in ug/m3 and arrive in ppm by mass', () => {
		const exterior = exteriorState(raster(), { ...DEFAULT_CONDITIONS, outdoorPm25: 150 }, 21, AIR);
		expect(exterior.particulates).toBeCloseTo(150 / (AIR.rho * 1000), 12);
		expect(exterior.particulates).toBeCloseTo(0.1246, 3);
	});
});
