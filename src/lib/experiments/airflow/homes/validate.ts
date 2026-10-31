import { Grid } from '../solver/grid';
import { rasterizePlan } from './rasterize';
import { CEILING, OPENING_LIMITS, PLAN_MODULE, isExterior, type Furniture, type HomePlan, type OpeningSpec, type Rect } from './types';

const EPSILON = 1e-6;
/** An opening keeps this far from a corner of the home and from the end of its wall. */
const MARGIN = 0.3;

const multipleOf = (value: number, unit: number) => Math.abs(value / unit - Math.round(value / unit)) < 1e-6;

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

const rectsOverlap = (a: Rect, b: Rect) => overlap(a.x, a.x + a.w, b.x, b.x + b.w) > EPSILON && overlap(a.z, a.z + a.d, b.z, b.z + b.d) > EPSILON;

/** Where an opening is, as an interval along its wall and which wall (the same wall gives the same key). */
function wallKey(opening: OpeningSpec) {
	const p = opening.placement;
	return isExterior(p) ? p.facade : `${p.axis}@${p.at}`;
}

/**
 * Everything wrong with a plan, as sentences; none if it is sound. A plan is data and there is no editor, so this
 * is the only line of defence against a typo producing a room the air cannot reach or a window in a wall that is
 * not there.
 */
export function validatePlan(plan: HomePlan): string[] {
	const problems: string[] = [];
	const say = (message: string) => problems.push(`${plan.id}: ${message}`);

	if (!multipleOf(plan.width, PLAN_MODULE) || !multipleOf(plan.depth, PLAN_MODULE)) say(`width ${plan.width} and depth ${plan.depth} must be multiples of ${PLAN_MODULE} m so the solver box matches the footprint at every grid size`);
	if (Math.abs(plan.ceiling - CEILING) > EPSILON) say(`ceiling must be ${CEILING} m`);

	// Rooms: inside the footprint, not overlapping, tiling it.
	const ids = new Set<string>();
	let covered = 0;
	for (const room of plan.rooms) {
		if (ids.has(room.id)) say(`two rooms are called ${room.id}`);
		ids.add(room.id);
		if (!room.rects.length) say(`room ${room.id} has no rectangles`);
		for (const rect of room.rects) {
			covered += rect.w * rect.d;
			if (rect.x < -EPSILON || rect.z < -EPSILON || rect.x + rect.w > plan.width + EPSILON || rect.z + rect.d > plan.depth + EPSILON) say(`room ${room.id} extends outside the footprint`);
		}
	}
	for (let a = 0; a < plan.rooms.length; a++)
		for (let b = a + 1; b < plan.rooms.length; b++)
			if (plan.rooms[a].rects.some((ra) => plan.rooms[b].rects.some((rb) => rectsOverlap(ra, rb)))) say(`rooms ${plan.rooms[a].id} and ${plan.rooms[b].id} overlap`);
	if (Math.abs(covered - plan.width * plan.depth) > 1e-4) say(`rooms cover ${covered.toFixed(2)} m² of a ${(plan.width * plan.depth).toFixed(2)} m² footprint`);

	// Walls: inside, and each one separates two rooms along most of its length.
	const roomAt = (x: number, z: number) => plan.rooms.findIndex((r) => r.rects.some((rect) => x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d));
	for (const [n, wall] of plan.walls.entries()) {
		const length = wall.axis === 'x' ? plan.width : plan.depth;
		const across = wall.axis === 'x' ? plan.depth : plan.width;
		if (wall.at <= EPSILON || wall.at >= across - EPSILON) say(`wall ${n} lies on the outside wall`);
		if (wall.from < -EPSILON || wall.to > length + EPSILON || wall.to - wall.from <= EPSILON) say(`wall ${n} has a bad extent ${wall.from} to ${wall.to}`);
		let separating = 0;
		let samples = 0;
		for (let t = wall.from + 0.05; t < wall.to; t += 0.1) {
			samples++;
			const [a, b] = wall.axis === 'x' ? [roomAt(t, wall.at - 0.05), roomAt(t, wall.at + 0.05)] : [roomAt(wall.at - 0.05, t), roomAt(wall.at + 0.05, t)];
			if (a !== b) separating++;
		}
		if (samples && separating / samples < 0.5) say(`wall ${n} does not separate rooms along most of its length`);
	}

	// Openings.
	const openingIds = new Set<string>();
	for (const o of plan.openings) {
		if (openingIds.has(o.id)) say(`two openings are called ${o.id}`);
		openingIds.add(o.id);
		const limit = OPENING_LIMITS[o.kind].maxOpen;
		if (o.maxOpen <= 0 || o.maxOpen > limit + EPSILON) say(`${o.id} is a ${o.kind}, which opens at most ${limit} of its frame, not ${o.maxOpen}`);
		if (o.sill < -EPSILON || o.sill + o.height > plan.ceiling - 0.05 + EPSILON) say(`${o.id} does not fit between floor and ceiling`);
		if (o.width <= 0 || o.height <= 0) say(`${o.id} has no size`);
		const p = o.placement;
		const lo = p.center - o.width / 2;
		const hi = p.center + o.width / 2;
		if (isExterior(p)) {
			const length = p.facade === 'north' || p.facade === 'south' ? plan.width : plan.depth;
			if (lo < MARGIN - EPSILON || hi > length - MARGIN + EPSILON) say(`${o.id} is within ${MARGIN} m of a corner`);
		} else {
			const wall = plan.walls.find((w) => w.axis === p.axis && Math.abs(w.at - p.at) < EPSILON && lo >= w.from + 0.05 - EPSILON && hi <= w.to - 0.05 + EPSILON);
			if (!wall) say(`${o.id} is not inside any ${p.axis === 'x' ? 'east-west' : 'north-south'} wall at ${p.at}`);
		}
	}
	for (let a = 0; a < plan.openings.length; a++)
		for (let b = a + 1; b < plan.openings.length; b++) {
			const [oa, ob] = [plan.openings[a], plan.openings[b]];
			if (wallKey(oa) !== wallKey(ob)) continue;
			if (overlap(oa.placement.center - oa.width / 2, oa.placement.center + oa.width / 2, ob.placement.center - ob.width / 2, ob.placement.center + ob.width / 2) > -0.1) say(`${oa.id} and ${ob.id} are on the same wall and overlap or nearly touch`);
		}

	// Furniture: inside, not overlapping, not blocking an opening.
	const itemIds = new Set<string>();
	const boxOverlap = (a: Furniture, b: Furniture) =>
		overlap(a.x, a.x + a.w, b.x, b.x + b.w) > EPSILON && overlap(a.z, a.z + a.d, b.z, b.z + b.d) > EPSILON && overlap(a.y ?? 0, (a.y ?? 0) + a.h, b.y ?? 0, (b.y ?? 0) + b.h) > EPSILON;
	for (const item of plan.furniture) {
		if (itemIds.has(item.id)) say(`two pieces of furniture are called ${item.id}`);
		itemIds.add(item.id);
		if (item.x < -EPSILON || item.z < -EPSILON || item.x + item.w > plan.width + EPSILON || item.z + item.d > plan.depth + EPSILON || (item.y ?? 0) + item.h > plan.ceiling + EPSILON) say(`${item.id} extends outside the home`);
		for (const o of plan.openings) {
			// A zone either side of the wall, as wide as the opening and half a metre deep. A door has to be walkable; a window only matters above its sill.
			const p = o.placement;
			const lo = p.center - o.width / 2;
			const hi = p.center + o.width / 2;
			const [wallAxis, wallAt] = isExterior(p) ? (p.facade === 'north' || p.facade === 'south' ? (['x', p.facade === 'north' ? 0 : plan.depth] as const) : (['z', p.facade === 'west' ? 0 : plan.width] as const)) : ([p.axis, p.at] as const);
			const zone = wallAxis === 'x' ? { x: lo, z: wallAt - 0.5, w: o.width, d: 1 } : { x: wallAt - 0.5, z: lo, w: 1, d: o.width };
			const blocks = o.kind === 'door' || o.kind === 'sliding-door' || (item.y ?? 0) + item.h > o.sill + 0.05;
			if (blocks && rectsOverlap(zone, item) && hi > lo) say(`${item.id} stands in front of ${o.id}`);
		}
	}
	for (let a = 0; a < plan.furniture.length; a++) for (let b = a + 1; b < plan.furniture.length; b++) if (boxOverlap(plan.furniture[a], plan.furniture[b])) say(`${plan.furniture[a].id} and ${plan.furniture[b].id} overlap`);

	// Reachability: with every door and window wide open and the furniture in, air can get from any room to any other.
	if (!problems.length) {
		const open = { ...plan, openings: plan.openings.map((o) => ({ ...o, open: 1 })) };
		const { geometry, spec } = rasterizePlan(open, 0.15, { furniture: true });
		const grid = new Grid(spec);
		const seen = new Uint8Array(grid.size);
		const stack: number[] = [];
		const start = geometry.fluid.findIndex((f, c) => f === 1 && c % grid.sx < spec.nx);
		stack.push(start);
		seen[start] = 1;
		const { nx, ny, nz, sx, sxy } = grid;
		while (stack.length) {
			const c = stack.pop()!;
			const i = c % sx;
			const j = Math.floor((c % sxy) / sx);
			const k = Math.floor(c / sxy);
			const visit = (next: number, face: number) => {
				if (geometry.fluid[next] === 1 && !seen[next] && face > 0) {
					seen[next] = 1;
					stack.push(next);
				}
			};
			if (i > 0) visit(c - 1, geometry.au[c]);
			if (i < nx - 1) visit(c + 1, geometry.au[c + 1]);
			if (j > 0) visit(c - sx, geometry.av[c]);
			if (j < ny - 1) visit(c + sx, geometry.av[c + sx]);
			if (k > 0) visit(c - sxy, geometry.aw[c]);
			if (k < nz - 1) visit(c + sxy, geometry.aw[c + sxy]);
		}
		const reached = new Set<number>();
		for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (seen[i + sx * j + sxy * k]) reached.add(geometry.room[i + sx * j + sxy * k] - 1);
		for (const [n, room] of plan.rooms.entries()) if (!reached.has(n)) say(`air cannot reach ${room.id} even with every door open`);
	}
	return problems;
}
