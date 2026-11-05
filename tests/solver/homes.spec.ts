import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan, type Raster } from '../../src/lib/experiments/airflow/homes/rasterize';
import {
	OPENING_LIMITS,
	PLAN_MODULE,
	isExterior,
	squareFeet,
	type ExteriorPlacement,
	type Facade,
	type HomePlan,
	type InteriorPlacement,
	type OpeningSpec,
	type PlanId,
	type Rect
} from '../../src/lib/experiments/airflow/homes/types';
import { validatePlan } from '../../src/lib/experiments/airflow/homes/validate';
import { CpuSolver } from '../../src/lib/experiments/airflow/solver/cpu/solver';
import { Grid, SIDE, type SideIndex } from '../../src/lib/experiments/airflow/solver/grid';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { advance } from './scenarios';

/**
 * The four home plans, as data and as the solver sees them. There is no plan editor, so these checks are what stands
 * between a typo and a room the air cannot reach, a window that opens more or less than it says, furniture in a
 * doorway, or a home the solver cannot step.
 */

const TARGET_SQUARE_FEET: Record<PlanId, number> = { studio: 450, 'one-bedroom': 700, 'two-bedroom': 1000, house: 1500 };
/** The auto-tuner's cell sizes from 15 cm down; the solver run below covers a coarse 30 cm grid. */
const CELL_SIZES = [0.15, 0.1, 0.075, 0.05];
/** Rooms that need no window of their own (a bathroom may have a small one). */
const SERVICE_ROOM = /hall|bathroom|laundry|closet/i;
/** For the solver run: a window pair per home, the wind on the first one's facade and suction on the second's. */
const CROSS_VENTILATION: Record<PlanId, [string, string]> = {
	studio: ['main-south-window', 'main-east-window-1'],
	'one-bedroom': ['living-south-window-2', 'bedroom-north-window'],
	'two-bedroom': ['living-window-1', 'bedroom-2-window'],
	house: ['kitchen-window', 'living-north-window-2']
};
const SIDE_OF: Record<Facade, SideIndex> = { west: SIDE.X0, east: SIDE.X1, north: SIDE.Z0, south: SIDE.Z1 };
/** Solver runs that fail and are not yet diagnosed (the bounds below stay as they are). */
const NOT_YET_STEPPING: Partial<Record<PlanId, string>> = {};

const EPSILON = 1e-6;
const multipleOf = (value: number, unit: number) => Math.abs(value / unit - Math.round(value / unit)) < 1e-9;
const roomAt = (plan: HomePlan, x: number, z: number) => plan.rooms.findIndex((room) => room.rects.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d));
const overlaps = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPSILON && Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) > EPSILON;
const exterior = (o: OpeningSpec) => o.placement as ExteriorPlacement;
const interior = (o: OpeningSpec) => o.placement as InteriorPlacement;
const isWindow = (o: OpeningSpec) => isExterior(o.placement) && o.kind !== 'door';
const entryDoors = (plan: HomePlan) => plan.openings.filter((o) => o.kind === 'door' && isExterior(o.placement));

/** A point `depth` metres inside the home from an exterior opening, `along` metres along its wall. */
function inside(plan: HomePlan, facade: Facade, along: number, depth: number): [number, number] {
	if (facade === 'north') return [along, depth];
	if (facade === 'south') return [along, plan.depth - depth];
	return facade === 'west' ? [depth, along] : [plan.width - depth, along];
}

/** The room an exterior opening opens into, sampled at its middle and both ends, or -1 if the frame straddles two rooms. */
function roomBehind(plan: HomePlan, o: OpeningSpec) {
	const { facade, center } = exterior(o);
	const rooms = [center - o.width / 2 + 0.05, center, center + o.width / 2 - 0.05].map((u) => roomAt(plan, ...inside(plan, facade, u, 0.05)));
	return rooms.every((room) => room === rooms[0]) ? rooms[0] : -1;
}

/** The rooms on either side of an interior doorway. */
function roomsEitherSide(plan: HomePlan, o: OpeningSpec) {
	const { axis, at, center } = interior(o);
	return [-0.05, 0.05].map((d) => (axis === 'x' ? roomAt(plan, center, at + d) : roomAt(plan, at + d, center)));
}

/** The floor in front of a door on both sides, as deep as a swinging door is wide (it sweeps that far) or a step for a sliding one. */
function landings(plan: HomePlan, o: OpeningSpec): Rect[] {
	const depth = o.kind === 'door' ? o.width : 0.9;
	const lo = o.placement.center - o.width / 2;
	const p = o.placement;
	const alongX = isExterior(p) ? p.facade === 'north' || p.facade === 'south' : p.axis === 'x';
	const line = isExterior(p) ? (p.facade === 'north' || p.facade === 'west' ? 0 : alongX ? plan.depth : plan.width) : p.at;
	return alongX
		? [
				{ x: lo, z: line - depth, w: o.width, d: depth },
				{ x: lo, z: line, w: o.width, d: depth }
			]
		: [
				{ x: line - depth, z: lo, w: depth, d: o.width },
				{ x: line, z: lo, w: depth, d: o.width }
			];
}

/**
 * Rooms that share a stretch of boundary no wall covers: open plan, so air moves between them whatever the doors
 * do. Worked out from the plan's rectangles and walls, independently of the rasterizer.
 */
function openPlanLinks(plan: HomePlan) {
	const links = plan.rooms.map(() => new Set<number>());
	const walled = (axis: 'x' | 'z', line: number, t: number) => plan.walls.some((w) => w.axis === axis && Math.abs(w.at - line) < EPSILON && t > w.from && t < w.to);
	const open = (axis: 'x' | 'z', line: number, from: number, to: number) => {
		for (let t = from + 0.025; t < to; t += 0.05) if (!walled(axis, line, t)) return true;
		return false;
	};
	plan.rooms.forEach((a, m) =>
		plan.rooms.forEach((b, n) => {
			if (n <= m) return;
			for (const p of a.rects)
				for (const q of b.rects) {
					const zSpan = [Math.max(p.z, q.z), Math.min(p.z + p.d, q.z + q.d)];
					const xSpan = [Math.max(p.x, q.x), Math.min(p.x + p.w, q.x + q.w)];
					// A shared north-south edge is where a wall with axis 'z' would stand, a shared east-west edge one with axis 'x'.
					const edges: ['x' | 'z', number, number[]][] = [];
					if (Math.abs(p.x + p.w - q.x) < EPSILON) edges.push(['z', q.x, zSpan]);
					if (Math.abs(q.x + q.w - p.x) < EPSILON) edges.push(['z', p.x, zSpan]);
					if (Math.abs(p.z + p.d - q.z) < EPSILON) edges.push(['x', q.z, xSpan]);
					if (Math.abs(q.z + q.d - p.z) < EPSILON) edges.push(['x', p.z, xSpan]);
					for (const [axis, line, [from, to]] of edges)
						if (to - from > EPSILON && open(axis, line, from, to)) {
							links[m].add(n);
							links[n].add(m);
						}
				}
		})
	);
	return links;
}

/** Every room connected to `start` through open-plan links, `start` included. */
function openPlanGroup(plan: HomePlan, start: number) {
	const links = openPlanLinks(plan);
	const group = new Set([start]);
	const queue = [start];
	while (queue.length)
		for (const next of links[queue.pop()!])
			if (!group.has(next)) {
				group.add(next);
				queue.push(next);
			}
	return group;
}

/** The rooms air can reach from the rooms in `start`, moving between air cells only through faces that are at least partly open. */
function reachableRooms(raster: Raster, start: Set<number>, faces: { au: Float32Array; aw: Float32Array } = raster.geometry) {
	const grid = new Grid(raster.spec);
	const { nx, ny, nz, sx, sxy } = grid;
	const { fluid, av, room } = raster.geometry;
	const { au, aw } = faces;
	const seen = new Uint8Array(grid.size);
	const stack: number[] = [];
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				if (fluid[c] && start.has(room[c] - 1)) {
					seen[c] = 1;
					stack.push(c);
				}
			}
	const visit = (next: number, face: number) => {
		if (face > 0 && fluid[next] && !seen[next]) {
			seen[next] = 1;
			stack.push(next);
		}
	};
	while (stack.length) {
		const c = stack.pop()!;
		const i = c % sx;
		const j = Math.floor((c % sxy) / sx);
		const k = Math.floor(c / sxy);
		if (i > 0) visit(c - 1, au[c]);
		if (i < nx - 1) visit(c + 1, au[c + 1]);
		if (j > 0) visit(c - sx, av[c]);
		if (j < ny - 1) visit(c + sx, av[c + sx]);
		if (k > 0) visit(c - sxy, aw[c]);
		if (k < nz - 1) visit(c + sxy, aw[c + sxy]);
	}
	const reached = new Set<number>();
	for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (seen[i + sx * j + sxy * k]) reached.add(room[i + sx * j + sxy * k] - 1);
	return reached;
}

/** The face arrays with every opening set to `amount`, leaving the raster as it was. */
function withOpenings(raster: Raster, amount: (o: OpeningSpec) => number) {
	const au = raster.geometry.au.slice();
	const aw = raster.geometry.aw.slice();
	for (const opening of raster.openings) {
		const update = opening.update(amount(opening.spec));
		const field = update.axis === 0 ? au : aw;
		update.indices.forEach((index, n) => (field[index] = update.values[n]));
	}
	return { au, aw };
}

const names = (plan: HomePlan, rooms: Iterable<number>) => [...rooms].map((r) => plan.rooms[r]?.name ?? `room ${r}`).sort();

for (const plan of plans) {
	test.describe(`${plan.name} plan`, () => {
		test('is valid, the size it says, and every room, door and window is what the page shows', () => {
			expect(validatePlan(plan)).toEqual([]);
			// Within 5 % of the floor area the plan picker promises.
			expect(Math.abs(squareFeet(plan) / TARGET_SQUARE_FEET[plan.id] - 1)).toBeLessThan(0.05);

			// Room names label the per-room averages, so each is plain and unique.
			const roomNames = plan.rooms.map((room) => room.name.trim());
			expect(roomNames.every((name) => name.length > 0)).toBe(true);
			expect(new Set(roomNames).size).toBe(roomNames.length);
			// Walls and room edges sit on the 0.6 m module, which is a whole number of cells at every grid size the auto-tuner uses, so walls and room boundaries always fall on the same grid plane.
			const offModule = [
				...plan.walls.flatMap((w) => [w.at, w.from, w.to]),
				...plan.rooms.flatMap((room) => room.rects.flatMap((r) => [r.x, r.z, r.w, r.d]))
			].filter((value) => !multipleOf(value, PLAN_MODULE));
			expect(offModule).toEqual([]);

			// Openings: named, closed until the page opens them, and each window opens into one room.
			const openingNames = plan.openings.map((o) => o.name.trim());
			expect(openingNames.every((name) => name.length > 0)).toBe(true);
			expect(new Set(openingNames).size).toBe(openingNames.length);
			expect(plan.openings.filter((o) => o.open !== undefined).map((o) => o.id)).toEqual([]);
			expect(entryDoors(plan)).toHaveLength(1);
			const straddling = plan.openings.filter((o) => isExterior(o.placement) && roomBehind(plan, o) < 0).map((o) => o.id);
			expect(straddling).toEqual([]);
			// Every interior door joins two different rooms.
			const pointless = plan.openings.filter((o) => !isExterior(o.placement) && new Set(roomsEitherSide(plan, o)).size !== 2).map((o) => o.id);
			expect(pointless).toEqual([]);
			// Every room people live in has a window (the patio door counts: it is glass).
			const lit = new Set(plan.openings.filter(isWindow).map((o) => roomBehind(plan, o)));
			const dark = plan.rooms.filter((room, n) => !SERVICE_ROOM.test(room.name) && !lit.has(n)).map((room) => room.name);
			expect(dark).toEqual([]);
			// Both kinds of window, so a visitor can compare half-opening and fully opening ones.
			const kinds = new Set(plan.openings.map((o) => o.kind));
			expect(kinds.has('double-hung') && kinds.has('casement')).toBe(true);

			// Furniture: named, and clear of the floor a door sweeps on either side.
			expect(plan.furniture.every((item) => item.name.trim().length > 0)).toBe(true);
			const blocking = plan.openings
				.filter((o) => o.kind === 'door' || o.kind === 'sliding-door')
				.flatMap((o) => plan.furniture.filter((item) => landings(plan, o).some((zone) => overlaps(zone, item))).map((item) => `${item.id} by ${o.id}`));
			expect(blocking).toEqual([]);
		});

		test('rasterizes to its footprint, with exact openings and furniture that only fills cells, at every cell size', () => {
			const volume = plan.width * plan.depth * plan.ceiling;
			for (const h of CELL_SIZES) {
				const empty = rasterizePlan(plan, h, { furniture: false });
				const full = rasterizePlan(plan, h, { furniture: true });
				const grid = new Grid(empty.spec);
				const { nx, ny, nz, sx, sxy } = grid;
				for (const raster of [empty, full]) {
					// (a) The box is the footprint.
					expect(Math.abs(nx * h - plan.width)).toBeLessThan(1e-9);
					expect(Math.abs(nz * h - plan.depth)).toBeLessThan(1e-9);
					expect(Math.abs(ny * h - plan.ceiling)).toBeLessThan(1e-9);

					// (b) Each opening's open area is its frame times its limit, to rounding, whatever the grid and furniture.
					const wrongArea = raster.openings
						.filter((o) => Math.abs(o.area(1) - o.spec.width * o.spec.height * o.spec.maxOpen) > 1e-9 || Math.abs(o.area(0.5) - 0.5 * o.area(1)) > 1e-9)
						.map((o) => `${o.spec.id} at ${h} m: ${o.area(1)} m²`);
					expect(wrongArea).toEqual([]);

					// (c) Exterior openings are faces on their own side of the box, in the slots the solver's outside arrays use.
					const misplaced: string[] = [];
					for (const o of raster.openings) {
						if (!isExterior(o.spec.placement)) continue;
						const facade = exterior(o.spec).facade;
						const side = SIDE_OF[facade];
						if (o.side !== side || o.facade !== facade || o.axis !== (side < 2 ? 0 : 2)) misplaced.push(`${o.spec.id} is on side ${o.side}`);
						for (const face of o.faces) {
							const i = face.index % sx;
							const j = Math.floor((face.index % sxy) / sx);
							const k = Math.floor(face.index / sxy);
							const plane = { west: i === 0, east: i === nx, north: k === 0, south: k === nz }[facade];
							const slot = side < 2 ? j + ny * k : i + nx * j;
							if (!plane || face.slot !== slot || slot >= grid.sideSize(side)) misplaced.push(`${o.spec.id} face ${face.index}`);
						}
					}
					expect(misplaced).toEqual([]);
				}

				// (e) Furniture turns air cells solid and closes their faces; it never opens a face, moves a wall or changes a room.
				let wrongCells = 0;
				let openedFaces = 0;
				let strayFaces = 0;
				let wrongRooms = 0;
				const furnitureAt = (i: number, j: number, k: number) => {
					const [x, y, z] = [(i + 0.5) * h, (j + 0.5) * h, (k + 0.5) * h];
					return plan.furniture.some((item) => x >= item.x && x < item.x + item.w && z >= item.z && z < item.z + item.d && y >= (item.y ?? 0) && y < (item.y ?? 0) + item.h);
				};
				const solid = (c: number) => full.geometry.fluid[c] === 0;
				for (let k = 0; k <= nz; k++)
					for (let j = 0; j <= ny; j++)
						for (let i = 0; i <= nx; i++) {
							const c = i + sx * j + sxy * k;
							if (empty.geometry.room[c] !== full.geometry.room[c]) wrongRooms++;
							if (i < nx && j < ny && k < nz && empty.geometry.fluid[c] !== full.geometry.fluid[c] && !(solid(c) && furnitureAt(i, j, k))) wrongCells++;
							for (const [field, back] of [
								['au', 1],
								['av', sx],
								['aw', sxy]
							] as const) {
								const before = empty.geometry[field][c];
								const after = full.geometry[field][c];
								if (after > before) openedFaces++;
								else if (after < before && !solid(c) && !(c - back >= 0 && solid(c - back))) strayFaces++;
							}
						}
				expect({ wrongCells, openedFaces, strayFaces, wrongRooms }).toEqual({ wrongCells: 0, openedFaces: 0, strayFaces: 0, wrongRooms: 0 });

				// (f) Every cell belongs to a room, and each room's cells add up to its floor area times the ceiling.
				const cells = new Array(plan.rooms.length).fill(0);
				let roomless = 0;
				for (let k = 0; k < nz; k++)
					for (let j = 0; j < ny; j++)
						for (let i = 0; i < nx; i++) {
							const r = empty.geometry.room[i + sx * j + sxy * k];
							if (r === 0) roomless++;
							else cells[r - 1]++;
						}
				expect(roomless).toBe(0);
				expect(Math.abs(cells.reduce((a, b) => a + b, 0) * h ** 3 - volume)).toBeLessThan(1e-6 * volume);
				const volumes = plan.rooms.map((room, n) => Math.abs(cells[n] * h ** 3 - room.rects.reduce((a, r) => a + r.w * r.d, 0) * plan.ceiling));
				expect(Math.max(...volumes)).toBeLessThan(1e-6 * volume);
			}
		});

		test('with every door open air reaches every room, and closed interior doors shut off all but the open-plan rooms', () => {
			const [entry] = entryDoors(plan);
			const entryRoom = roomBehind(plan, entry);
			expect(entryRoom).toBeGreaterThanOrEqual(0);
			const group = openPlanGroup(plan, entryRoom);
			const everyRoom = new Set(plan.rooms.map((_, n) => n));
			for (const h of CELL_SIZES) {
				// The plan as it starts: every door and window closed, furniture in.
				const raster = rasterizePlan(plan, h, { furniture: true });
				expect(names(plan, reachableRooms(raster, new Set([entryRoom])))).toEqual(names(plan, group));
				expect(names(plan, reachableRooms(raster, new Set([entryRoom]), withOpenings(raster, () => 1)))).toEqual(names(plan, everyRoom));
			}
			// Each home has at least one room behind a door (a bathroom, at least), so the doors matter.
			expect(group.size).toBeLessThan(plan.rooms.length);
		});

		test('the solver steps it with wind through a window pair', () => {
			test.fixme(!!NOT_YET_STEPPING[plan.id], NOT_YET_STEPPING[plan.id]);
			const h = 0.3;
			const pair = CROSS_VENTILATION[plan.id];
			// The pair and every interior door open, everything else shut.
			const opened = { ...plan, openings: plan.openings.map((o) => ({ ...o, open: pair.includes(o.id) || !isExterior(o.placement) ? 1 : 0 })) };
			const raster = rasterizePlan(opened, h, { furniture: true });
			const solver = new CpuSolver({ grid: raster.spec, fluid: { ...AIR, beta: 0 }, geometry: raster.geometry });
			const [windward, leeward] = pair.map((id) => raster.openings.find((o) => o.spec.id === id)!);
			// A 3 m/s wind: ½ρU² ≈ 5.4 Pa, times pressure coefficients of about +0.6 on the windward facade and -0.3 on the leeward one.
			for (const [opening, pressure] of [
				[windward, 3.2],
				[leeward, -1.6]
			] as const) {
				const side = solver.exterior.sides[opening.side!];
				for (let slot = 0; slot < side.length / 3; slot++) side[3 * slot] = pressure;
			}
			solver.fill(0);
			advance(solver, 5, 0.1);

			const finite = (a: Float32Array) => a.every(Number.isFinite);
			expect([solver.vel.u, solver.vel.v, solver.vel.w, solver.pressure.pressure, solver.theta].every(finite)).toBe(true);
			const { divergence } = solver.diagnostics();
			const flow = (o: typeof windward) => {
				const field = o.axis === 0 ? solver.vel.u : solver.vel.w;
				const open = o.axis === 0 ? raster.geometry.au : raster.geometry.aw;
				// Positive into the home: on the west and north sides that is the positive direction, on the east and south the negative one.
				const inward = o.side === SIDE.X0 || o.side === SIDE.Z0 ? 1 : -1;
				return o.faces.reduce((sum, face) => sum + inward * field[face.index] * open[face.index] * h * h, 0);
			};
			const into = flow(windward);
			const out = -flow(leeward);
			console.log(`${plan.id}: ${into.toFixed(4)} m³/s in, ${out.toFixed(4)} out, residual ${solver.pressure.residual.toExponential(2)}, divergence ${divergence.toExponential(2)}`);
			expect(solver.pressure.residual).toBeLessThan(1e-2);
			expect(divergence).toBeLessThan(1e-3);
			// The wind blows air through: in at the windward window, out at the leeward one, and nothing else is open.
			expect(into).toBeGreaterThan(0.05);
			expect(Math.abs(into - out) / into).toBeLessThan(1e-2);
		});
	});
}

test.describe('what the scenarios need from the homes', () => {
	const plan = (id: PlanId) => plans.find((p) => p.id === id)!;

	test('the plans come smallest first, with unique ids', () => {
		expect(plans.map((p) => p.id)).toEqual(['studio', 'one-bedroom', 'two-bedroom', 'house']);
	});

	test('the two-bedroom is a through-unit: windows at both ends, joined only through open doors', () => {
		const home = plan('two-bedroom');
		const windowRooms = (facade: Facade) => new Set(home.openings.filter((o) => isWindow(o) && exterior(o).facade === facade).map((o) => roomBehind(home, o)));
		const west = windowRooms('west');
		const east = windowRooms('east');
		expect(west.size).toBeGreaterThan(0);
		expect(east.size).toBeGreaterThan(0);
		const raster = rasterizePlan(home, 0.1, { furniture: true });
		const closed = reachableRooms(raster, west);
		expect([...east].filter((room) => closed.has(room))).toEqual([]);
		const open = reachableRooms(raster, west, withOpenings(raster, (o) => (isExterior(o.placement) ? 0 : 1)));
		expect([...east].filter((room) => !open.has(room))).toEqual([]);
	});

	test('the house has a sliding glass door to the patio, and a clerestory above low windows for the stack effect', () => {
		const home = plan('house');
		const patio = home.openings.filter((o) => o.kind === 'sliding-door' && isExterior(o.placement));
		expect(patio).toHaveLength(1);
		expect(patio[0].width).toBeCloseTo(1.83, 2);
		expect(patio[0].maxOpen).toBe(0.5);
		const windowsOf = (room: number) => home.openings.filter((o) => isWindow(o) && roomBehind(home, o) === room);
		const stack = home.rooms.filter((_, n) => windowsOf(n).some((o) => o.sill >= 1.7) && windowsOf(n).some((o) => o.sill <= 1));
		expect(stack.length).toBeGreaterThan(0);
	});

	test('the one-bedroom has a high window', () => {
		expect(plan('one-bedroom').openings.some((o) => isWindow(o) && o.sill >= 1.5)).toBe(true);
	});
});

test.describe('opening limits', () => {
	test('a casement opens 0.8 of its frame, in every home, and the other kinds as they were: a double-hung window and a sliding door half, a door all of it', () => {
		// 0.8 is what the research measured for a single casement sash (78 to 80 %, one vendor bulletin), not the whole frame.
		expect(OPENING_LIMITS).toEqual({ door: { maxOpen: 1 }, 'sliding-door': { maxOpen: 0.5 }, 'double-hung': { maxOpen: 0.5 }, casement: { maxOpen: 0.8 } });
		const all = plans.flatMap((plan) => plan.openings.map((spec) => ({ plan: plan.id, spec })));
		expect(all.filter(({ spec }) => spec.kind === 'casement').length, 'the homes have casements to hold to it').toBeGreaterThan(10);
		const wrong = all.filter(({ spec }) => spec.maxOpen !== OPENING_LIMITS[spec.kind].maxOpen).map(({ plan, spec }) => `${plan}/${spec.id} is a ${spec.kind} that opens ${spec.maxOpen}`);
		expect(wrong).toEqual([]);
	});

	test('a casement at full travel passes 0.8 of its frame in the solver, at any cell size', () => {
		for (const h of [0.15, 0.2]) {
			const raster = rasterizePlan(plans.find((p) => p.id === 'house')!, h, { furniture: false });
			const clerestory = raster.openings.find((o) => o.spec.id === 'clerestory-window')!;
			expect(clerestory.spec.kind).toBe('casement');
			// 1.2 m by 0.45 m, hinged at the top: the open part is the top 0.8 of its height, which is 0.36 m of it.
			expect(Math.abs(clerestory.area(1) - 1.2 * 0.45 * 0.8), `${h} m cells`).toBeLessThan(1e-9);
		}
	});

	test('the validator refuses a casement, or any opening, that opens more than its kind does', () => {
		const home = structuredClone(plans.find((p) => p.id === 'studio')!);
		expect(validatePlan(home)).toEqual([]);
		const casement = home.openings.find((o) => o.kind === 'casement')!;
		casement.maxOpen = 1;
		expect(validatePlan(home)).toEqual([`${home.id}: ${casement.id} is a casement, which opens at most 0.8 of its frame, not 1`]);
		casement.maxOpen = 0.8;
		const hung = home.openings.find((o) => o.kind === 'double-hung')!;
		hung.maxOpen = 0.8;
		expect(validatePlan(home)).toEqual([`${home.id}: ${hung.id} is a double-hung, which opens at most 0.5 of its frame, not 0.8`]);
	});
});
