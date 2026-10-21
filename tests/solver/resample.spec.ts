import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { resampleFields, type GridAir } from '../../src/lib/experiments/airflow/sim/resample';
import { World } from '../../src/lib/experiments/airflow/sim/world';
import type { FieldState } from '../../src/lib/experiments/airflow/solver/backend';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * Moving the air from one grid onto another (sim/resample.ts), which a world rebuilt at another cell size starts from: the warm-up's
 * choice of grid and a later step down. What it must keep is what the visitor would see change: the air's speed and where it goes,
 * the temperature, and the smoke, every milligram of it.
 */

const studio = planById('studio')!;
const grid = (h: number, setup: Setup = blankSetup('studio')): GridAir => {
	const raster = rasterizePlan(planById(setup.plan)!, h, { furniture: setup.furniture });
	return { spec: raster.spec, ...raster.geometry };
};
const size = (air: GridAir) => (air.spec.nx + 1) * (air.spec.ny + 1) * (air.spec.nz + 1);
const blank = (air: GridAir): FieldState => {
	const n = size(air);
	return { u: new Float32Array(n), v: new Float32Array(n), w: new Float32Array(n), p: new Float32Array(n), theta: new Float32Array(n), particulates: new Float32Array(n) };
};
/** Every cell of `air` that is air, as (index, i, j, k). */
function* cells(air: GridAir) {
	const { nx, ny, nz } = air.spec;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const index = i + (nx + 1) * j + (nx + 1) * (ny + 1) * k;
				if (air.fluid[index]) yield { index, i, j, k };
			}
}
const massOf = (air: GridAir, particulates: Float32Array) => {
	let sum = 0;
	for (const { index } of cells(air)) sum += particulates[index];
	return sum * air.spec.h ** 3;
};

test.describe('moving the air onto another grid', () => {
	test('still air at one temperature with smoke spread evenly is the same air on the new grid, coarser or finer', () => {
		for (const [from, to] of [
			[0.075, 0.15],
			[0.2, 0.3],
			[0.3, 0.1]
		]) {
			const a = grid(from);
			const b = grid(to);
			const fields = blank(a);
			for (const { index } of cells(a)) {
				fields.theta[index] = -2.5;
				fields.particulates[index] = 0.04;
			}
			const out = resampleFields(a, fields, b);
			// The furniture is drawn a little differently on each grid, so the room holds a little more or less air: the same smoke is a touch thicker or thinner.
			const air = (g: GridAir) => massOf(g, new Float32Array(size(g)).fill(1));
			const thickness = (0.04 * air(a)) / air(b);
			expect(Math.abs(thickness / 0.04 - 1), 'the two grids hold nearly the same air').toBeLessThan(0.05);
			let off = { theta: 0, smoke: 0 };
			for (const { index } of cells(b)) off = { theta: Math.max(off.theta, Math.abs(out.theta[index] + 2.5)), smoke: Math.max(off.smoke, Math.abs(out.particulates[index] - thickness)) };
			expect(off.theta, `${from} to ${to}: the temperature`).toBeLessThan(1e-5);
			expect(off.smoke, 'and the smoke').toBeLessThan(1e-7);
			const fastest = [out.u, out.v, out.w].reduce((most, values) => values.reduce((m, value) => Math.max(m, Math.abs(value)), most), 0);
			expect(fastest, 'still air stays still').toBe(0);
		}
	});

	test('the smoke in the air is kept to the milligram, whatever the two grids are and wherever the smoke is', () => {
		for (const plan of plans)
			for (const [from, to] of [
				[0.075, 0.1],
				[0.1, 0.15],
				[0.15, 0.3],
				[0.2, 0.15]
			]) {
				const setup = blankSetup(plan.id);
				const a = grid(from, setup);
				const b = grid(to, setup);
				const fields = blank(a);
				// A plume in one corner, falling off with distance.
				for (const { index, i, j, k } of cells(a)) fields.particulates[index] = Math.exp(-((i * from - 1) ** 2 + (j * from - 1) ** 2 + (k * from - 1) ** 2));
				const out = resampleFields(a, fields, b);
				expect(massOf(b, out.particulates) / massOf(a, fields.particulates), `${plan.id} ${from} to ${to}`).toBeCloseTo(1, 6);
				expect(out.particulates.reduce((least, value) => Math.min(least, value), Infinity), 'and none of it below zero').toBeGreaterThanOrEqual(0);
			}
	});

	test('a temperature that rises steadily across the room is read exactly where both grids have air', () => {
		const a = grid(0.15);
		const b = grid(0.3);
		const fields = blank(a);
		const h = a.spec.h;
		for (const { index, i, j } of cells(a)) fields.theta[index] = 0.5 * (i + 0.5) * h + 0.2 * (j + 0.5) * h;
		const out = resampleFields(a, fields, b);
		let checked = 0;
		const { nx, ny, nz } = b.spec;
		// Away from furniture and the walls, where every old cell around a new cell's middle is air.
		for (const { index, i, j, k } of cells(b)) {
			if (i < 2 || j < 1 || k < 2 || i > nx - 3 || j > ny - 2 || k > nz - 3) continue;
			let clear = true;
			for (let dk = -2; dk <= 3 && clear; dk++)
				for (let dj = -2; dj <= 3 && clear; dj++)
					for (let di = -2; di <= 3 && clear; di++) {
						const ii = 2 * i + di;
						const jj = 2 * j + dj;
						const kk = 2 * k + dk;
						if (ii < 0 || jj < 0 || kk < 0 || ii >= a.spec.nx || jj >= a.spec.ny || kk >= a.spec.nz) clear = false;
						else if (!a.fluid[ii + (a.spec.nx + 1) * jj + (a.spec.nx + 1) * (a.spec.ny + 1) * kk]) clear = false;
					}
			if (!clear) continue;
			checked++;
			expect(out.theta[index]).toBeCloseTo(0.5 * (i + 0.5) * b.spec.h + 0.2 * (j + 0.5) * b.spec.h, 4);
		}
		expect(checked, 'a good part of the room was checked').toBeGreaterThan(50);
	});

	test('air whose velocity changes steadily in every direction is read exactly at every face of the new grid, each at its own offset', () => {
		// Each component is a different linear function of x, y and z, so a face read half a cell off, or a component read at another
		// component's points, comes out wrong. Furniture is left out, so every face of the box is air.
		const setup = { ...blankSetup('studio'), furniture: false };
		const a = grid(0.15, setup);
		const b = grid(0.3, setup);
		const fields = blank(a);
		const flow = {
			u: (x: number, y: number, z: number) => 0.3 + 0.2 * x - 0.15 * y + 0.05 * z,
			v: (x: number, y: number, z: number) => -0.1 + 0.03 * x + 0.4 * y - 0.07 * z,
			w: (x: number, y: number, z: number) => 0.2 - 0.06 * x + 0.1 * y + 0.12 * z
		};
		const fill = (g: GridAir, out: FieldState) => {
			const { nx, ny, nz, h } = g.spec;
			for (let k = 0; k <= nz; k++)
				for (let j = 0; j <= ny; j++)
					for (let i = 0; i <= nx; i++) {
						const index = i + (nx + 1) * j + (nx + 1) * (ny + 1) * k;
						out.u[index] = flow.u(i * h, (j + 0.5) * h, (k + 0.5) * h);
						out.v[index] = flow.v((i + 0.5) * h, j * h, (k + 0.5) * h);
						out.w[index] = flow.w((i + 0.5) * h, (j + 0.5) * h, k * h);
					}
		};
		fill(a, fields);
		const out = resampleFields(a, fields, b);
		const expected = blank(b);
		fill(b, expected);
		const { nx, ny, nz } = b.spec;
		let worst = 0;
		let checked = 0;
		// Faces that are open in the new grid, one cell in from its walls, where the old grid's faces surround the point on every side.
		for (let k = 1; k < nz - 1; k++)
			for (let j = 1; j < ny - 1; j++)
				for (let i = 1; i < nx - 1; i++) {
					const index = i + (nx + 1) * j + (nx + 1) * (ny + 1) * k;
					for (const component of ['u', 'v', 'w'] as const) {
						const open = component === 'u' ? b.au : component === 'v' ? b.av : b.aw;
						if (!(open[index] > 0)) continue;
						worst = Math.max(worst, Math.abs(out[component][index] - expected[component][index]));
						checked++;
					}
				}
		expect(checked, 'most of the box was checked').toBeGreaterThan(1500);
		expect(worst, 'every face exact, to the float').toBeLessThan(1e-5);
	});

	test('a face the new grid has shut carries no flow, and a cell that is furniture there holds nothing', () => {
		const a = grid(0.1);
		const b = grid(0.2);
		const fields = blank(a);
		fields.u.fill(1);
		fields.v.fill(0.5);
		fields.w.fill(-1);
		fields.theta.fill(3);
		fields.particulates.fill(0.1);
		const out = resampleFields(a, fields, b);
		let shut = 0;
		let leaks = 0;
		let open = 0;
		for (let n = 0; n < out.u.length; n++) {
			if (b.au[n] === 0) shut++;
			if ((b.au[n] === 0 && out.u[n] !== 0) || (b.av[n] === 0 && out.v[n] !== 0) || (b.aw[n] === 0 && out.w[n] !== 0)) leaks++;
			if (!b.fluid[n] && (out.theta[n] !== 0 || out.particulates[n] !== 0)) leaks++;
			if (b.au[n] > 0 && out.u[n] !== 0) open++;
		}
		expect(shut, 'the walls and the box are shut faces').toBeGreaterThan(100);
		expect(leaks, 'and nothing is written where the new grid has no air').toBe(0);
		expect(open, 'while the open faces carry the flow').toBeGreaterThan(1000);
	});

	test('a fan’s jet moved onto a coarser grid keeps blowing the same way, and the solver carries on from it', async () => {
		const setup: Setup = { ...blankSetup('studio'), devices: [{ id: 'f1', model: DEVICE_MODELS[0].id, x: 2.4, z: 2.7, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } } as unknown as Setup['devices'][number]] };
		const make = (h: number) => World.create(setup, { plans, models: new Map(DEVICE_MODELS.map((m) => [m.id, m])), make: (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial), h });
		const fine = await make(0.15);
		for (let n = 0; n < 160; n++) fine.backend.step(0.05);
		const before = await fine.backend.readFields();
		const coarse = await make(0.3);
		const moved = resampleFields({ spec: fine.raster.spec, ...fine.raster.geometry }, before, { spec: coarse.raster.spec, ...coarse.raster.geometry });
		coarse.backend.writeFields(moved);
		/** The air's velocity at the middle of every cell of the coarse grid that is air, from `fields` on the grid of `world` (each coarse cell is two fine ones a side). */
		const middles = (fields: FieldState, world: World) => {
			const { nx, ny } = world.raster.spec;
			const r = Math.round(0.3 / world.raster.spec.h);
			const sx = nx + 1;
			const sxy = (nx + 1) * (ny + 1);
			return [...cells({ spec: coarse.raster.spec, ...coarse.raster.geometry })].map(({ i, j, k }) => {
				const sum = [0, 0, 0];
				let count = 0;
				for (let dk = 0; dk < r; dk++)
					for (let dj = 0; dj < r; dj++)
						for (let di = 0; di < r; di++) {
							const c = r * i + di + sx * (r * j + dj) + sxy * (r * k + dk);
							if (!world.raster.geometry.fluid[c]) continue;
							sum[0] += 0.5 * (fields.u[c] + fields.u[c + 1]);
							sum[1] += 0.5 * (fields.v[c] + fields.v[c + sx]);
							sum[2] += 0.5 * (fields.w[c] + fields.w[c + sxy]);
							count++;
						}
				return count ? sum.map((s) => s / count) : [0, 0, 0];
			});
		};
		/** How alike two fields of velocities are: 1 for the same flow, 0 for unrelated ones. And the second's energy over the first's. */
		const compare = (a: number[][], b: number[][]) => {
			let dot = 0;
			let aa = 0;
			let bb = 0;
			a.forEach((va, n) => {
				const vb = b[n];
				dot += va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
				aa += va[0] ** 2 + va[1] ** 2 + va[2] ** 2;
				bb += vb[0] ** 2 + vb[1] ** 2 + vb[2] ** 2;
			});
			return { alike: dot / Math.sqrt(aa * bb), energy: bb / aa };
		};
		const was = middles(before, fine);
		expect(Math.max(...was.map((v) => Math.hypot(v[0], v[1], v[2]))), 'the fan blows').toBeGreaterThan(0.2);
		const moving = compare(was, middles(moved, coarse));
		expect(moving.alike, 'the coarse grid has the same air: the same jet, the same eddies').toBeGreaterThan(0.9);
		expect(moving.energy).toBeGreaterThan(0.7);
		expect(moving.energy).toBeLessThan(1.3);
		for (let n = 0; n < 10; n++) coarse.backend.step(0.05);
		const after = await coarse.backend.readFields();
		const carrying = compare(was, middles(after, coarse));
		expect(carrying.alike, 'the solver carries on blowing it, rather than starting from rest').toBeGreaterThan(0.7);
		expect(carrying.energy).toBeGreaterThan(0.3);
		expect(after.u.every(Number.isFinite) && after.theta.every(Number.isFinite)).toBe(true);
		fine.dispose();
		coarse.dispose();
	});
});

test('the studio plan is what these tests assume', () => {
	expect(studio.width).toBe(7.8);
	expect(studio.depth).toBe(5.4);
});
