import { expect, test } from '@playwright/test';
import { CpuSolver } from '../../src/lib/experiments/airflow/solver/cpu/solver';
import { boxGeometry } from '../../src/lib/experiments/airflow/solver/geometry';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { advance, cutOpenings, lidDrivenCavity, openingFlows, windRoom } from './scenarios';

/** Properties the solver must keep whatever the scenario: conservation, bounds, determinism, and the parts the benchmarks do not reach. */

test.describe('conservation', () => {
	test('a uniform scalar stays uniform in a closed box with strong circulation', () => {
		// The lid keeps the air moving; the scalar has no sources, sinks or openings, so every flux must telescope.
		const solver = lidDrivenCavity(32);
		solver.fill(0, 50);
		advance(solver, 6, 1 / 32);
		let lowest = Infinity;
		let highest = -Infinity;
		for (let k = 0; k < solver.grid.nz; k++) for (let j = 0; j < solver.grid.ny; j++) for (let i = 0; i < solver.grid.nx; i++) {
			const value = solver.c[solver.grid.index(i, j, k)];
			lowest = Math.min(lowest, value);
			highest = Math.max(highest, value);
		}
		expect(lowest).toBeGreaterThan(49.95);
		expect(highest).toBeLessThan(50.05);
		const { mass } = solver.diagnostics();
		expect(Math.abs(mass.inAir - mass.initial) / mass.initial).toBeLessThan(1e-4);
	});

	test('particulates never go negative or above the largest value they started with, and a still box has no flow', () => {
		const { solver } = windRoom(0.15, 3, -3);
		solver.fill(0, 0);
		// A blob of smoke in the middle, carried through by the wind.
		const g = solver.grid;
		for (let k = 8; k < 12; k++) for (let j = 6; j < 10; j++) for (let i = 8; i < 12; i++) solver.c[g.index(i, j, k)] = 100;
		advance(solver, 12, 0.1);
		let lowest = Infinity;
		let highest = -Infinity;
		for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
			const value = solver.c[g.index(i, j, k)];
			lowest = Math.min(lowest, value);
			highest = Math.max(highest, value);
		}
		expect(lowest).toBeGreaterThanOrEqual(-1e-6);
		expect(highest).toBeLessThanOrEqual(100 + 1e-4);
		const still = new CpuSolver({ grid: { nx: 16, ny: 12, nz: 16, h: 0.15 }, fluid: { ...AIR, beta: 0 }, geometry: boxGeometry({ nx: 16, ny: 12, nz: 16, h: 0.15 }) });
		still.fill(0);
		advance(still, 5, 0.1);
		expect(still.diagnostics().maxSpeed).toBeLessThan(1e-9);
	});

	test('the same inputs give the same answer, bit for bit', () => {
		const run = () => {
			const { solver } = windRoom(0.3, 3, -3);
			advance(solver, 4, 0.1);
			return [...solver.vel.u.slice(0, 400), ...solver.c.slice(0, 200)];
		};
		expect(run()).toEqual(run());
	});
});

test.describe('orientation', () => {
	/** The same cube room with its two openings on the north and south walls instead of the west and east ones. */
	function turnedRoom(h: number, windward: number, leeward: number) {
		const n = Math.round(3 / h);
		const solver = new CpuSolver({ grid: { nx: n, ny: n, nz: n, h }, fluid: { ...AIR, beta: 0, cd: 0.62 }, geometry: boxGeometry({ nx: n, ny: n, nz: n, h }) });
		const g = solver.grid;
		const span = Math.round(0.6 / h);
		const row = Math.round(0.9 / h);
		const column = Math.round((n - span) / 2);
		let into = 0;
		const faces: number[] = [];
		for (let dj = 0; dj < span; dj++)
			for (let di = 0; di < span; di++) {
				const i = column + di;
				const j = row + dj;
				solver.geometry.aw[i + g.sx * j] = 1;
				solver.geometry.aw[i + g.sx * j + g.sxy * n] = 1;
				solver.exterior.sides[4][3 * (i + n * j)] = windward;
				solver.exterior.sides[5][3 * (i + n * j)] = leeward;
				faces.push(i + g.sx * j);
			}
		solver.fill(0);
		return { solver, flow: () => faces.reduce((sum, f) => sum + solver.vel.w[f] * h * h, into) };
	}

	test('openings on the north wall behave like the same openings on the west wall, and eddy viscosity is finite', () => {
		const east = windRoom(0.15, 3, -3);
		const north = turnedRoom(0.15, 3, -3);
		advance(east.solver, 10, 0.1);
		advance(north.solver, 10, 0.1);
		const intoEast = openingFlows(east.solver, east.faces).into;
		expect(Math.abs(north.flow() - intoEast) / intoEast).toBeLessThan(2e-3);
		const g = north.solver.grid;
		let worstNorth = 0;
		let worstEast = 0;
		let finite = true;
		for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
			const a = north.solver.nut[g.index(i, j, k)];
			const b = east.solver.nut[g.index(i, j, k)];
			finite &&= Number.isFinite(a) && Number.isFinite(b);
			worstNorth = Math.max(worstNorth, a);
			worstEast = Math.max(worstEast, b);
		}
		expect(finite).toBe(true);
		expect(Math.abs(worstNorth - worstEast) / worstEast).toBeLessThan(5e-3);
	});
});

test.describe('window fan', () => {
	/**
	 * A room with an open window and a window fan: the flow settles where the fan's curve meets the open window's
	 * orifice, which has a closed form: Q² = ΔP₀ / (ΔP₀/Q₀² + ρ/(2·Cd²·A²)).
	 */
	function fanRoom(speed: number, rise: number, wind = 0) {
		const h = 0.15;
		const n = 20;
		const fluid = { ...AIR, beta: 0, cd: 0.62 };
		const solver = new CpuSolver({ grid: { nx: n, ny: n, nz: n, h }, fluid, geometry: boxGeometry({ nx: n, ny: n, nz: n, h }) });
		const span = 4;
		const faces = cutOpenings(solver, [
			{ side: 0, j: 6, k: 8, rows: span, columns: span },
			{ side: 1, j: 6, k: 8, rows: span, columns: span }
		]);
		for (const f of faces) {
			const base = 3 * f.slot;
			if (f.side === 0) {
				solver.exterior.sides[0][base + 1] = speed;
				solver.exterior.sides[0][base + 2] = rise;
				solver.exterior.sides[0][base] = wind;
			}
		}
		solver.fill(0);
		const area = span * span * h * h;
		return { solver, faces, area, fluid, h };
	}

	test('settles where its curve meets the open window’s orifice', () => {
		const free = 0.3; // free-delivery speed through the fan's faces, m/s
		const rise = 25;
		const { solver, faces, area, fluid } = fanRoom(free, rise);
		advance(solver, 15, 0.1);
		const { into, out } = openingFlows(solver, faces);
		const q0 = free * area;
		const orifice = fluid.rho / (2 * fluid.cd * fluid.cd * area * area);
		const expected = Math.sqrt(rise / (rise / (q0 * q0) + orifice));
		console.log(`window fan: in ${into.toFixed(4)} out ${out.toFixed(4)} expected ${expected.toFixed(4)} m³/s`);
		expect(into / expected).toBeGreaterThan(0.95);
		expect(into / expected).toBeLessThan(1.05);
		expect(Math.abs(into - out) / into).toBeLessThan(1e-3);
	});

	test('an exhaust fan pushes air out, and outside pressure against the fan slows it', () => {
		const exhaust = fanRoom(-0.3, 25);
		advance(exhaust.solver, 15, 0.1);
		expect(openingFlows(exhaust.solver, exhaust.faces).into).toBeLessThan(-0.01);
		// A pressure outside the intake side that pushes air in assists the fan; one against it slows it.
		const assisted = fanRoom(0.3, 25, 10);
		const opposed = fanRoom(0.3, 25, -10);
		advance(assisted.solver, 15, 0.1);
		advance(opposed.solver, 15, 0.1);
		expect(openingFlows(assisted.solver, assisted.faces).into).toBeGreaterThan(openingFlows(opposed.solver, opposed.faces).into);
	});
});

test.describe('readouts', () => {
	test('rooms report their volume, and a through-flow room turns its air over at Q/V', () => {
		const { solver, volume, faces } = windRoom(0.15, 3, -3);
		solver.geometry.room.fill(0);
		const g = solver.grid;
		for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) solver.geometry.room[g.index(i, j, k)] = 1;
		solver.geometry.rooms = 1;
		advance(solver, 15, 0.1);
		const [room] = solver.rooms();
		const { into } = openingFlows(solver, faces);
		expect(room.volume).toBeCloseTo(volume, 6);
		expect(room.changesPerHour).toBeCloseTo((into * 3600) / volume, 1);
		expect(room.speed).toBeGreaterThan(0);
	});

	test('a slice has the cell layer’s values and marks furniture as not air', () => {
		const { solver } = windRoom(0.15, 3, -3);
		solver.geometry.fluid[solver.grid.index(10, 6, 10)] = 0;
		advance(solver, 5, 0.1);
		const slice = solver.slice(0.95);
		expect(slice.nx).toBe(solver.grid.nx);
		expect(slice.y).toBeCloseTo(6.5 * 0.15, 9);
		expect(slice.fluid[10 + slice.nx * 10]).toBe(0);
		expect(slice.fluid[3 + slice.nx * 3]).toBe(1);
		const peak = Math.max(...slice.speed);
		expect(peak).toBeGreaterThan(0.1);
		// Point sampling agrees with the slice at a cell centre.
		const probe = solver.sample(Float32Array.from([(5 + 0.5) * 0.15, 6.5 * 0.15, (7 + 0.5) * 0.15]));
		const at = 5 + slice.nx * 7;
		expect(probe[0]).toBeCloseTo(slice.u[at], 3);
		expect(probe[2]).toBeCloseTo(slice.w[at], 3);
	});
});

test.describe('particles', () => {
	test('tracers stay in the air, move with it, and do not leave the box', () => {
		const { solver } = windRoom(0.15, 3, -3);
		solver.geometry.fluid[solver.grid.index(10, 6, 10)] = 0;
		advance(solver, 8, 0.1);
		const particles = solver.makeParticles(400, 0, 7);
		const g = solver.grid;
		for (let n = 0; n < 200; n++) particles.step(0.05, solver.vel, solver.c, 1);
		const { tracers } = particles;
		let moving = 0;
		let fastest = 0;
		for (let n = 0; n < tracers.length / 4; n++) {
			const x = tracers[4 * n];
			const y = tracers[4 * n + 1];
			const z = tracers[4 * n + 2];
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(g.nx * g.h);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(g.ny * g.h);
			expect(z).toBeGreaterThanOrEqual(0);
			expect(z).toBeLessThanOrEqual(g.nz * g.h);
			const cell = g.index(Math.floor(x / g.h), Math.floor(y / g.h), Math.floor(z / g.h));
			expect(solver.geometry.fluid[cell]).toBe(1);
			if (tracers[4 * n + 3] > 0.05) moving++;
			fastest = Math.max(fastest, tracers[4 * n + 3]);
		}
		// Most of the room is slow air outside the jet between the openings, but tracers in the jet carry its speed.
		expect(moving).toBeGreaterThan(50);
		expect(fastest).toBeGreaterThan(0.5);
	});

	test('smoke particles appear only where there is smoke', () => {
		const { solver } = windRoom(0.15, 0, 0);
		const g = solver.grid;
		// Smoke in one corner only.
		for (let k = 0; k < 5; k++) for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) solver.c[g.index(i, j, k)] = 10;
		const particles = solver.makeParticles(0, 600, 3);
		for (let n = 0; n < 30; n++) particles.step(0.05, solver.vel, solver.c, 10);
		let visible = 0;
		for (let n = 0; n < particles.smoke.length / 4; n++) {
			if (particles.smoke[4 * n + 3] <= 0.2) continue;
			visible++;
			expect(particles.smoke[4 * n]).toBeLessThan(6 * g.h);
			expect(particles.smoke[4 * n + 1]).toBeLessThan(6 * g.h);
			expect(particles.smoke[4 * n + 2]).toBeLessThan(6 * g.h);
		}
		expect(visible).toBeGreaterThan(50);
	});

	test('the same seed gives the same particles', () => {
		const { solver } = windRoom(0.3, 3, -3);
		advance(solver, 2, 0.1);
		const a = solver.makeParticles(100, 0, 11);
		const b = solver.makeParticles(100, 0, 11);
		for (let n = 0; n < 20; n++) {
			a.step(0.05, solver.vel, solver.c, 1);
			b.step(0.05, solver.vel, solver.c, 1);
		}
		expect([...a.tracers]).toEqual([...b.tracers]);
	});
});
