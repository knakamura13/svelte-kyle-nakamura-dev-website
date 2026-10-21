import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan, type Raster } from '../../src/lib/experiments/airflow/homes/rasterize';
import { STREAK_BIRTHS, drawBirths, inAir, inflowFaces, puffWeights, seeded, smokeLevel, streakWeights } from '../../src/lib/experiments/airflow/scene/air/birth';
import { lookOf } from '../../src/lib/experiments/airflow/scene/air/fields';
import { OVERLAY_FLOOR, overlayLegend, overlayMapping, overlayStrength } from '../../src/lib/experiments/airflow/scene/air/legend';
import { MASK_STRIDE, faceByte, passes, solidMask } from '../../src/lib/experiments/airflow/scene/air/mask';
import { SMOKE_LOOK, smokeBounds } from '../../src/lib/experiments/airflow/scene/air/smokeVolume';
import { World } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { FLOW_STRIDE, SCALAR_STRIDE, volumeSpec, type Volume } from '../../src/lib/experiments/airflow/solver/volume';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';
import { dockLegend } from '../../src/lib/experiments/airflow/viz/dockLegend';
import { scaleMapping } from '../../src/lib/experiments/airflow/viz/palettes';

/**
 * The air's pure parts (scene/air): the solid mask that keeps streaks out of walls and furniture, where streaks and smoke puffs are
 * born, the box the smoke is marched through, and the overlays' scales and legends. The shaders that use them run in
 * tests/gpu/streaks.gpu.ts.
 */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const H = 0.15;

/** The mask byte of one face (axis 0, 1, 2 for x, y, z) at texel (i, j, k), or the air byte for axis -1. */
function maskByte(mask: ReturnType<typeof solidMask>, i: number, j: number, k: number, axis: -1 | 0 | 1 | 2) {
	return mask.data[MASK_STRIDE * (i + mask.width * (j + mask.height * k)) + 1 + axis];
}

/** A volume of `raster`'s own grid (every stride 1) whose velocity is `velocity(x, y, z)` at each cell centre, with the share of air from the geometry. */
function volumeOf(raster: Raster, velocity: (x: number, y: number, z: number) => [number, number, number], ppm: (x: number, y: number, z: number) => number = () => 0): Volume {
	const spec = volumeSpec(raster.spec, Infinity);
	const cells = spec.nx * spec.ny * spec.nz;
	const flow = new Float32Array(FLOW_STRIDE * cells);
	const scalars = new Float32Array(SCALAR_STRIDE * cells);
	const grid = new Grid(raster.spec);
	for (let k = 0, n = 0; k < spec.nz; k++)
		for (let j = 0; j < spec.ny; j++)
			for (let i = 0; i < spec.nx; i++, n++) {
				if (!raster.geometry.fluid[grid.index(i, j, k)]) continue;
				const [x, y, z] = [(i + 0.5) * H, (j + 0.5) * H, (k + 0.5) * H];
				flow.set([...velocity(x, y, z), 1], FLOW_STRIDE * n);
				scalars[SCALAR_STRIDE * n + 1] = ppm(x, y, z);
			}
	return { ...spec, flow, scalars };
}

/** The two-bedroom with some Openings set, as the World sets them: the plan's starting positions overwritten by `open`. */
function twoBedroom(open: Record<string, number>) {
	const raster = rasterizePlan(planById('two-bedroom')!, H, { furniture: true });
	const { au, aw } = raster.geometry;
	for (const opening of raster.openings) {
		if (!(opening.spec.id in open)) continue;
		const { axis, indices, values } = opening.update(open[opening.spec.id]);
		const field = axis === 0 ? au : aw;
		indices.forEach((index, n) => (field[index] = values[n]));
	}
	return raster;
}

test.describe('the solid mask', () => {
	test('is the geometry at the solver’s resolution: furniture solid on every side, walls shut, the box shut but for its Openings', () => {
		const raster = twoBedroom({ 'living-window-1': 1, 'bedroom-1-door': 0 });
		const mask = solidMask(raster.spec, raster.geometry);
		expect([mask.width, mask.height, mask.depth]).toEqual([raster.spec.nx + 1, raster.spec.ny + 1, raster.spec.nz + 1]);
		// The dining table (x 1.65 to 3.15, z 1.35 to 2.25, 0.75 high): a cell inside it is solid, and so is every face of it.
		const [ti, tj, tk] = [Math.floor(2.4 / H), Math.floor(0.3 / H), Math.floor(1.8 / H)];
		expect(maskByte(mask, ti, tj, tk, -1)).toBe(0);
		for (const axis of [0, 1, 2] as const) expect(maskByte(mask, ti, tj, tk, axis)).toBe(0);
		expect(maskByte(mask, ti + 1, tj, tk, 0), 'its east face, which is the next cell’s west face').toBe(0);
		// Air beside it, open to the air around.
		expect(maskByte(mask, ti, Math.floor(1.5 / H), tk, -1)).toBe(255);
		expect(maskByte(mask, ti, Math.floor(1.5 / H), tk, 0)).toBe(255);
		// The wall between the hall and the kitchen (z = 3.0) is shut floor to ceiling, away from the bedroom door.
		for (let j = 0; j < raster.spec.ny; j++) expect(maskByte(mask, Math.floor(6.0 / H), j, 3.0 / H, 2)).toBe(0);
		// The west side of the box: shut beside the window, open in the window's lower half (a double-hung sash opens half its frame).
		expect(maskByte(mask, 0, Math.floor(1.2 / H), Math.floor(2.4 / H), 0), 'the wall beside it').toBe(0);
		expect(maskByte(mask, 0, Math.floor(1.2 / H), Math.floor(3.9 / H), 0), 'the open sash').toBe(255);
		expect(maskByte(mask, 0, Math.floor(2.0 / H), Math.floor(3.9 / H), 0), 'the fixed upper sash').toBe(0);
		// The east side of the box is in the padding layer (texel nx), as the solver keeps it.
		expect(maskByte(mask, raster.spec.nx, Math.floor(1.2 / H), Math.floor(1.5 / H), 0), 'bedroom 1’s window, shut').toBe(0);
	});

	test('a move never crosses a closed face, by the rule the streaks’ shader follows', () => {
		const raster = twoBedroom({ 'living-window-1': 1, 'bedroom-1-door': 0 });
		const mask = solidMask(raster.spec, raster.geometry);
		expect(passes(mask, [3.6, 1.2, 4.0], [3.7, 1.25, 4.1]), 'through open air').toBe(true);
		expect(passes(mask, [6.0, 1.2, 2.95], [6.0, 1.2, 3.05]), 'through the wall from the kitchen into the hall').toBe(false);
		expect(passes(mask, [8.4, 1.0, 2.95], [8.4, 1.0, 3.05]), 'through bedroom 1’s shut door').toBe(false);
		expect(passes(mask, [2.4, 0.8, 1.8], [2.4, 0.7, 1.8]), 'down into the dining table').toBe(false);
		expect(passes(mask, [0.05, 1.2, 3.9], [-0.05, 1.2, 3.9]), 'out through the open window').toBe(true);
		expect(passes(mask, [-0.05, 1.2, 3.9], [0.05, 1.2, 3.9]), 'in through it').toBe(true);
		expect(passes(mask, [0.05, 1.2, 2.4], [-0.05, 1.2, 2.4]), 'out through the wall beside it').toBe(false);
		expect(passes(mask, [-0.3, 1.2, 2.4], [-0.2, 1.2, 2.5]), 'outside the box, nothing blocks').toBe(true);
		// The door open, the same move goes through.
		const open = twoBedroom({ 'living-window-1': 1, 'bedroom-1-door': 1 });
		expect(passes(solidMask(open.spec, open.geometry), [8.4, 1.0, 2.95], [8.4, 1.0, 3.05])).toBe(true);
	});

	test('follows the World: closing a window bumps its revision, and the mask built again shuts the window', async () => {
		const setup: Setup = { ...blankSetup('two-bedroom'), openings: { 'living-window-1': 1 } };
		const world = await World.create(setup, { plans, models, make: (config, initial) => new CpuBackend(config, initial), h: H });
		const face = [0, Math.floor(1.2 / H), Math.floor(3.9 / H)] as const;
		const before = solidMask(world.raster.spec, world.raster.geometry);
		expect(maskByte(before, ...face, 0)).toBe(255);
		const revision = world.revision;
		world.apply({ ...setup, openings: { 'living-window-1': 0 } }, 0);
		expect(world.revision).toBeGreaterThan(revision);
		const after = solidMask(world.raster.spec, world.raster.geometry, before);
		expect(after.data, 'the bytes are written over, not reallocated').toBe(before.data);
		expect(maskByte(after, ...face, 0)).toBe(0);
		world.dispose();
	});

	test('a face open at all is open to the mask, however little', () => {
		expect(faceByte(0)).toBe(0);
		expect(faceByte(0.0001)).toBe(1);
		expect(faceByte(0.5)).toBe(128);
		expect(faceByte(1)).toBe(255);
	});
});

test.describe('where streaks are born', () => {
	// The two-bedroom with its west windows open: slow air everywhere and one fast jet across the living room at sill height.
	const fast = (x: number, y: number, z: number) => x < 4.8 && z > 3.4 && z < 4.4 && y > 0.9 && y < 1.6;
	const raster = twoBedroom({ 'living-window-1': 1, 'living-window-2': 0, 'dining-window': 0 });
	const into = (inward: number): ((x: number, y: number, z: number) => [number, number, number]) => (x, y, z) => (fast(x, y, z) ? [inward * 1.2, 0, 0] : [0.05, 0.02, 0]);

	test('a cell’s weight is its air times its speed, plus a floor; solid cells and cells outside get none', () => {
		const volume = volumeOf(raster, into(1));
		const weights = streakWeights(volume, raster);
		const { speedFloor, speedReference } = STREAK_BIRTHS;
		const cube = H ** 3;
		const index = (x: number, y: number, z: number) => Math.floor(x / H) + volume.nx * (Math.floor(y / H) + volume.ny * Math.floor(z / H));
		const slow = Math.hypot(0.05, 0.02);
		expect(weights.cells[index(2.0, 1.2, 3.9)]).toBeCloseTo((cube * (1.2 + speedFloor)) / (speedReference + speedFloor), 9);
		expect(weights.cells[index(2.0, 2.0, 6.0)]).toBeCloseTo((cube * (slow + speedFloor)) / (speedReference + speedFloor), 9);
		expect(weights.cells[index(2.4, 0.3, 1.8)], 'inside the dining table').toBe(0);
		const total = [...weights.cells].reduce((a, b) => a + b, 0) + weights.inflow;
		expect(weights.total).toBeCloseTo(total, 9);
	});

	test('an exterior Opening with air coming in is a place of birth, as much as the air it lets in; one letting air out, or shut, is not', () => {
		const incoming = inflowFaces(volumeOf(raster, into(1)), raster);
		// The jet reaches the window's open lower sash at x = 0 between z 3.45 and 4.35 for rows from 0.9 to 1.6 m: only those faces count.
		expect(incoming.length).toBeGreaterThan(0);
		for (const face of incoming) {
			expect(face.axis).toBe(0);
			expect(face.x).toBe(0);
			expect(face.inward).toBe(1);
			expect(face.z + H / 2).toBeGreaterThan(3.4);
			expect(face.z + H / 2).toBeLessThan(4.4);
			expect(face.inflow).toBeLessThanOrEqual(1.2 * H * H * (1 + 1e-6));
		}
		const total = incoming.reduce((sum, face) => sum + face.inflow, 0);
		// Open faces of 0.15 m in the jet: the lower sash, 0.7 m tall by 0.9 m, of which the jet covers 0.9 to 1.6 m and 3.45 to 4.35 m.
		expect(total).toBeCloseTo(1.2 * 0.9 * 0.7, 1);
		expect(inflowFaces(volumeOf(raster, into(-1)), raster), 'the same air going out').toEqual([]);
		const shut = twoBedroom({ 'living-window-1': 0, 'living-window-2': 0, 'dining-window': 0 });
		expect(inflowFaces(volumeOf(shut, into(1)), shut), 'the windows shut').toEqual([]);
	});

	test('births are drawn in proportion to the weights, in air, or just outside an Opening that lets air in', () => {
		const volume = volumeOf(raster, into(1));
		const weights = streakWeights(volume, raster);
		const pool = drawBirths(weights, volume, raster, 6000, seeded(7));
		expect(pool.count).toBeGreaterThan(5900);
		expect(pool.atOpenings).toBeCloseTo(weights.inflow / weights.total, 2);
		let jet = 0;
		let jetWeight = 0;
		for (let n = 0; n < volume.nx * volume.ny * volume.nz; n++) {
			const i = n % volume.nx;
			const j = Math.floor(n / volume.nx) % volume.ny;
			const k = Math.floor(n / (volume.nx * volume.ny));
			if (fast((i + 0.5) * H, (j + 0.5) * H, (k + 0.5) * H)) jetWeight += weights.cells[n];
		}
		for (let n = 0; n < pool.count; n++) {
			const [x, y, z, opening] = pool.points.subarray(4 * n, 4 * n + 4);
			if (opening) {
				expect(x, 'born outside the west wall').toBeCloseTo(-STREAK_BIRTHS.outside, 5);
				expect(z).toBeGreaterThan(3.4);
				expect(z).toBeLessThan(4.4);
			} else {
				expect(inAir(raster, x, y, z), `(${x}, ${y}, ${z}) is in air`).toBe(true);
				const centre = (v: number) => (Math.floor(v / H) + 0.5) * H;
				if (fast(centre(x), centre(y), centre(z))) jet++;
			}
		}
		// Systematic sampling: the jet's cells get their share of the births, to within a few.
		expect(Math.abs(jet - (pool.count * jetWeight) / weights.total)).toBeLessThan(15);
		// The same seed draws the same births.
		expect(drawBirths(weights, volume, raster, 6000, seeded(7)).points).toEqual(pool.points);
	});

	test('smoke puffs are born only where there is smoke to see, the more the denser it looks', () => {
		const smoky = (x: number, y: number, z: number) => (Math.hypot(x - 2, y - 1.2, z - 5) < 0.5 ? 0.3 : x > 9 ? 0.003 : 0);
		const volume = volumeOf(raster, () => [0, 0, 0], smoky);
		const weights = puffWeights(volume, raster, SMOKE_LOOK.dense, SMOKE_LOOK.decades);
		const index = (x: number, y: number, z: number) => Math.floor(x / H) + volume.nx * (Math.floor(y / H) + volume.ny * Math.floor(z / H));
		expect(weights.cells[index(2.0, 1.2, 5.0)]).toBeCloseTo(H ** 3, 9);
		const thin = smokeLevel(0.003, SMOKE_LOOK.dense, SMOKE_LOOK.decades);
		expect(weights.cells[index(10.0, 1.2, 6.0)]).toBeCloseTo(H ** 3 * thin * thin, 9);
		expect(weights.cells[index(6.0, 1.2, 2.0)], 'clean air').toBe(0);
		expect(weights.faces).toEqual([]);
	});
});

test.describe('the smoke and the look of the air', () => {
	test('the smoke is marched only through the box of cells that show any, padded by a cell', () => {
		const raster = rasterizePlan(planById('studio')!, H, { furniture: false });
		const clean = volumeOf(raster, () => [0, 0, 0]);
		expect(smokeBounds([clean])).toBeNull();
		const puff = volumeOf(raster, () => [0, 0, 0], (x, y, z) => (Math.abs(x - 3.075) < 0.01 && Math.abs(y - 1.275) < 0.01 && Math.abs(z - 2.025) < 0.01 ? 0.3 : 0));
		const bounds = smokeBounds([clean, puff])!;
		expect(bounds.min.map((v) => +v.toFixed(6))).toEqual([3.0 - H, 1.2 - H, 1.95 - H].map((v) => +v.toFixed(6)));
		expect(bounds.max.map((v) => +v.toFixed(6))).toEqual([3.15 + H, 1.35 + H, 2.1 + H].map((v) => +v.toFixed(6)));
	});

	test('the look texture holds speed, temperature, PM2.5 and air, in that order', () => {
		const volume: Volume = { nx: 2, ny: 1, nz: 1, sx: 1, sy: 1, sz: 1, h: 0.2, flow: Float32Array.of(3, 4, 0, 1, 0, 0, 0, 0.5), scalars: Float32Array.of(-1.5, 0.02, 0, 0) };
		expect([...lookOf(volume)]).toEqual([5, -1.5, Math.fround(0.02), 1, 0, 0, 0, 0.5]);
	});
});

test.describe('the overlays’ scales and legends', () => {
	test('each overlay is a slice layer’s scale, read from its own channel', () => {
		expect(overlayMapping('speed', 0.5)).toEqual({ ...scaleMapping('speed', { sensitivity: 0.5, baseline: 0 }), layer: 'speed', channel: 0 });
		expect(overlayMapping('temperature', 1)).toEqual({ ...scaleMapping('temperature', { sensitivity: 1, baseline: 0 }), layer: 'temperature', channel: 1 });
		expect(overlayMapping('smoke', 2)).toEqual({ ...scaleMapping('particulates', { sensitivity: 2, baseline: 0 }), layer: 'particulates', channel: 2 });
	});

	test('the tint is faint where there is nothing to show and full where the value is strong', () => {
		expect(overlayStrength('speed', 0)).toBe(OVERLAY_FLOOR.speed);
		expect(overlayStrength('speed', 1)).toBe(1);
		expect(overlayStrength('smoke', 0), 'clean air is clear').toBe(0);
		expect(overlayStrength('temperature', 0.5), 'the starting temperature').toBe(OVERLAY_FLOOR.temperature);
		expect(overlayStrength('temperature', 0)).toBe(1);
		expect(overlayStrength('temperature', 1)).toBe(1);
		expect(overlayStrength('temperature', 0.25)).toBeCloseTo(overlayStrength('temperature', 0.75), 12);
	});

	test('the legend is the slice’s, in the page’s units, and Off has none', () => {
		expect(overlayLegend('off', { units: 'metric', sensitivity: 0.5, reference: 21 })).toBeNull();
		const speed = overlayLegend('speed', { units: 'imperial', sensitivity: 0.5, reference: 21 })!;
		expect(speed).toEqual({ ...dockLegend({ layer: 'speed', units: 'imperial', sensitivity: 0.5, reference: 21 }), overlay: 'speed' });
		expect(speed.unit).toBe('mph');
		expect(speed.ticks[0].at).toBe(0);
		const temperature = overlayLegend('temperature', { units: 'metric', sensitivity: 0.5, reference: 21 })!;
		expect(temperature.midpoint?.label.text).toMatch(/^21\s°C$/);
		expect(temperature.title).toBe('Temperature');
		const smoke = overlayLegend('smoke', { units: 'metric', sensitivity: 1, reference: 21 })!;
		expect(smoke.title).toBe('Particulates (PM2.5)');
		expect(smoke.ticks.map((tick) => tick.label.value)).toEqual(['0.001', '0.01', '0.1', '1', '10']);
	});
});
