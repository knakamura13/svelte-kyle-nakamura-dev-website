import { isExterior, type HomePlan, type OpeningSpec, type Wall } from '../homes/types';

/**
 * The dollhouse's walls and openings as plain numbers, so Node can check them: which walls there are, the hole each
 * door or window cuts, the pieces of wall left around the holes, and where each sash, panel or leaf sits at an open
 * amount. Positions are the solver's (x east, y up, z south, metres). On a wall, u runs along it in the plan's own
 * coordinate (x on a wall running east-west, z on one running north-south), y is height, and n crosses it: world +z
 * on an east-west wall, world -x on a north-south one, so (u, y, n) is the world frame turned about the vertical.
 */

/** A rectangle on a wall: u along it, y up, metres. */
export interface Span {
	u0: number;
	u1: number;
	y0: number;
	y1: number;
}

/** Outside walls are this thick and stand outside the footprint, so the rooms keep the plan's size. */
export const EXTERIOR_WALL = 0.2;
/** Inside walls are this thick, centred on the plan's line. */
export const INTERIOR_WALL = 0.1;
/** Jambs and head of a frame, m. They sit around the clear opening, never in it, so the opening keeps the plan's size. */
export const FRAME_WIDTH = 0.045;
/** How high the walls stand in the top-down view. */
export const PLAN_WALL = 0.15;
/** A frame whose bottom is lower than this stands on the floor, like a door, and has no sill. */
const FLOOR_SILL = 0.02;
/** Sliding panels and sashes run in two tracks this far apart. */
const TRACK_GAP = 0.008;

const EPS = 1e-6;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const spanArea = (span: Span) => Math.max(0, span.u1 - span.u0) * Math.max(0, span.y1 - span.y0);

/** One straight wall. */
export interface WallRun {
	id: string;
	/** 'x' runs east-west at constant z, 'z' runs north-south at constant x. */
	axis: 'x' | 'z';
	/** Its centre line: z for an 'x' wall, x for a 'z' wall. */
	at: number;
	/** Its extent along u. */
	from: number;
	to: number;
	thickness: number;
	/** Which way across it (in n) is outdoors: +1 or -1, or 0 for a wall inside the home. */
	out: -1 | 0 | 1;
	openings: OpeningSpec[];
}

/**
 * The four outside walls (each the length of its side of the footprint; the corner posts are separate) and the inside
 * walls. An inside wall that ends against another wall's side stops at its face, and at an L-corner of two inside walls
 * the east-west one runs on over the corner while the north-south one stops short, so no two walls overlap.
 */
export function wallRuns(plan: HomePlan): WallRun[] {
	const t = EXTERIOR_WALL;
	const outside = (facade: string) => plan.openings.filter((o) => isExterior(o.placement) && o.placement.facade === facade);
	const runs: WallRun[] = [
		{ id: 'north', axis: 'x', at: -t / 2, from: 0, to: plan.width, thickness: t, out: -1, openings: outside('north') },
		{ id: 'east', axis: 'z', at: plan.width + t / 2, from: 0, to: plan.depth, thickness: t, out: -1, openings: outside('east') },
		{ id: 'south', axis: 'x', at: plan.depth + t / 2, from: 0, to: plan.width, thickness: t, out: 1, openings: outside('south') },
		{ id: 'west', axis: 'z', at: -t / 2, from: 0, to: plan.depth, thickness: t, out: 1, openings: outside('west') }
	];
	const half = INTERIOR_WALL / 2;
	const claimed = new Set<OpeningSpec>();
	plan.walls.forEach((wall, n) => {
		let { from, to } = wall;
		for (const other of plan.walls) {
			if (other.axis === wall.axis || wall.at < other.from - EPS || wall.at > other.to + EPS) continue;
			const through = wall.at > other.from + EPS && wall.at < other.to - EPS;
			const trim = through || wall.axis === 'z' ? half : -half;
			if (Math.abs(other.at - wall.from) < EPS) from += trim;
			if (Math.abs(other.at - wall.to) < EPS) to -= trim;
		}
		const openings = plan.openings.filter((o) => !claimed.has(o) && onWall(o, wall));
		for (const o of openings) claimed.add(o);
		runs.push({ id: `interior-${n}`, axis: wall.axis, at: wall.at, from, to, thickness: INTERIOR_WALL, out: 0, openings });
	});
	return runs;
}

/** Whether an inside opening is in this wall: on its line, and within its plan extent. */
function onWall(opening: OpeningSpec, wall: Wall) {
	const p = opening.placement;
	if (isExterior(p) || p.axis !== wall.axis || Math.abs(p.at - wall.at) > EPS) return false;
	return p.center - opening.width / 2 >= wall.from - EPS && p.center + opening.width / 2 <= wall.to + EPS;
}

/** The world x and z of a point on a wall, at `u` along it and `n` across it. */
export function wallPoint(run: Pick<WallRun, 'axis' | 'at'>, u: number, n: number): [number, number] {
	return run.axis === 'x' ? [u, run.at + n] : [run.at - n, u];
}

/** The world footprint of a box on a wall: `u0`..`u1` along it, `n0`..`n1` across it. */
export function wallBox(run: Pick<WallRun, 'axis' | 'at'>, u0: number, u1: number, n0: number, n1: number) {
	return run.axis === 'x' ? { x0: u0, x1: u1, z0: run.at + n0, z1: run.at + n1 } : { x0: run.at - n1, x1: run.at - n0, z0: u0, z1: u1 };
}

/** An opening's clear frame, exactly the plan's: what the solver opens. */
export function frameSpan(spec: OpeningSpec): Span {
	const { center } = spec.placement;
	return { u0: center - spec.width / 2, u1: center + spec.width / 2, y0: spec.sill, y1: spec.sill + spec.height };
}

/** The part of the frame open at `amount` (0 to 1 of its travel): `amount × maxOpen` of it, grown from the anchor edge, the same rectangle `RasterOpening` opens. */
export function openRegion(spec: OpeningSpec, amount: number): Span {
	const { u0, u1, y0, y1 } = frameSpan(spec);
	const fraction = clamp01(amount) * spec.maxOpen;
	switch (spec.anchor) {
		case 'start':
			return { u0, u1: u0 + fraction * (u1 - u0), y0, y1 };
		case 'end':
			return { u0: u1 - fraction * (u1 - u0), u1, y0, y1 };
		case 'bottom':
			return { u0, u1, y0, y1: y0 + fraction * (y1 - y0) };
		default:
			return { u0, u1, y0: y1 - fraction * (y1 - y0), y1 };
	}
}

/** A frame in its wall: the clear opening, the hole cut for it, and the jambs, head and sill that fill the hole around the opening. */
export interface FrameLayout {
	spec: OpeningSpec;
	frame: Span;
	hole: Span;
	members: Span[];
}

/** The frames of a wall's openings. A jamb is narrowed rather than run past the wall's end or more than halfway to the next opening. */
export function frameLayouts(run: WallRun, ceiling: number): FrameLayout[] {
	const frames = run.openings.map((spec) => ({ spec, frame: frameSpan(spec) }));
	return frames.map(({ spec, frame }) => {
		let left = Math.min(FRAME_WIDTH, frame.u0 - run.from);
		let right = Math.min(FRAME_WIDTH, run.to - frame.u1);
		for (const other of frames) {
			if (other.spec === spec) continue;
			if (other.frame.u1 <= frame.u0 + EPS) left = Math.min(left, (frame.u0 - other.frame.u1) / 2);
			if (other.frame.u0 >= frame.u1 - EPS) right = Math.min(right, (other.frame.u0 - frame.u1) / 2);
		}
		left = Math.max(0, left);
		right = Math.max(0, right);
		const top = Math.max(0, Math.min(FRAME_WIDTH, ceiling - frame.y1));
		const bottom = frame.y0 > FLOOR_SILL ? Math.min(FRAME_WIDTH, frame.y0) : 0;
		const hole = { u0: frame.u0 - left, u1: frame.u1 + right, y0: frame.y0 - bottom, y1: frame.y1 + top };
		const members = [
			{ u0: hole.u0, u1: frame.u0, y0: hole.y0, y1: hole.y1 },
			{ u0: frame.u1, u1: hole.u1, y0: hole.y0, y1: hole.y1 },
			{ u0: frame.u0, u1: frame.u1, y0: frame.y1, y1: hole.y1 },
			{ u0: frame.u0, u1: frame.u1, y0: hole.y0, y1: frame.y0 }
		].filter((m) => m.u1 - m.u0 > EPS && m.y1 - m.y0 > EPS);
		return { spec, frame, hole, members };
	});
}

/** A piece of solid wall. */
export interface WallPiece extends Span {
	/** True when a hole sits right on top of it: the top-down view drops it, so a window reads as a gap in the plan. */
	under: boolean;
}

/**
 * The wall from `from` to `to` and 0 to `height`, less the holes, as rectangles that tile it exactly. The wall is cut
 * into vertical strips at every hole edge, and each strip keeps whatever its holes leave; touching strips with the
 * same pieces are joined again. Holes may overlap, touch, or run past the wall's ends.
 */
export function wallPieces(from: number, to: number, height: number, holes: Span[]): WallPiece[] {
	const cut = holes
		.map((h) => ({ u0: Math.max(from, h.u0), u1: Math.min(to, h.u1), y0: Math.max(0, h.y0), y1: Math.min(height, h.y1) }))
		.filter((h) => h.u1 - h.u0 > EPS && h.y1 - h.y0 > EPS);
	const edges = [from, to, ...cut.flatMap((h) => [h.u0, h.u1])].sort((a, b) => a - b);
	const pieces: WallPiece[] = [];
	for (let i = 0; i + 1 < edges.length; i++) {
		const u0 = edges[i];
		const u1 = edges[i + 1];
		if (u1 - u0 <= EPS) continue;
		const mid = (u0 + u1) / 2;
		const blocked = cut.filter((h) => h.u0 < mid && h.u1 > mid).sort((a, b) => a.y0 - b.y0);
		let y = 0;
		for (const h of blocked) {
			if (h.y0 > y + EPS) pieces.push({ u0, u1, y0: y, y1: h.y0, under: true });
			y = Math.max(y, h.y1);
		}
		if (height > y + EPS) pieces.push({ u0, u1, y0: y, y1: height, under: false });
	}
	pieces.sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1 || a.u0 - b.u0);
	const joined: WallPiece[] = [];
	for (const piece of pieces) {
		const last = joined[joined.length - 1];
		if (last && Math.abs(last.y0 - piece.y0) < EPS && Math.abs(last.y1 - piece.y1) < EPS && last.under === piece.under && Math.abs(last.u1 - piece.u0) < EPS) last.u1 = piece.u1;
		else joined.push({ ...piece });
	}
	return joined;
}

/** How a panel moves from where it sits closed. */
export type Motion =
	| { type: 'fixed' }
	| { type: 'slide'; along: 'u' | 'y'; by: number }
	/**
	 * Turns `angle` about a hinge line: vertical at u = `at`, or horizontal at y = `at`. The line is on the panel's back
	 * face at n = `n`, and its free edge swings toward `toward` in n.
	 */
	| { type: 'swing'; hinge: 'vertical' | 'horizontal'; at: number; n: number; toward: 1 | -1; angle: number };

/** A sash, sliding panel or leaf. */
export interface Panel {
	/** A frame with glass (a sash, a sliding panel, a casement), or a solid door leaf. */
	glazed: boolean;
	moving: boolean;
	/** Where it sits closed, on the wall plane. */
	rect: Span;
	/** Its thickness across the wall when closed, n0 < n1. */
	n0: number;
	n1: number;
	motion: Motion;
}

/**
 * The panels of an opening at `amount`, placed so that what they leave uncovered (seen straight on) is exactly
 * `openRegion`:
 *
 * - A double-hung window or a sliding door has two panels in two tracks. The one at the anchor edge slides away from it,
 *   over the other, by exactly the open part: a lower sash rises, an upper sash (anchor 'top') lowers, a door panel
 *   slides toward the far jamb. Both are half the frame, the most a two-track slider opens.
 * - A casement or a door is one leaf hinged on the edge opposite the anchor, so the gap opens at the anchor edge as the
 *   solver's does. It turns by acos(1 - f) for an open fraction f: its face then covers (1 - f) of the frame, next to the
 *   hinge. A casement swings out; a door swings toward `swing` (see `doorSwing`).
 */
export function openingPanels(spec: OpeningSpec, amount: number, run: Pick<WallRun, 'thickness' | 'out'>, swing: 1 | -1 = 1): Panel[] {
	const frame = frameSpan(spec);
	const fraction = clamp01(amount) * spec.maxOpen;
	const along = spec.anchor === 'start' || spec.anchor === 'end' ? 'u' : 'y';
	if (spec.kind === 'double-hung' || spec.kind === 'sliding-door') {
		const thickness = spec.kind === 'sliding-door' ? 0.045 : 0.04;
		const [lo, hi] = along === 'u' ? [frame.u0, frame.u1] : [frame.y0, frame.y1];
		const half = (hi - lo) / 2;
		const fromLow = spec.anchor === 'start' || spec.anchor === 'bottom';
		const travel = Math.min(fraction, 0.5) * (hi - lo);
		// The room side is the inner track. The panel that moves runs in it, except a double-hung's upper sash, which runs outside.
		const inner = run.out === 0 ? -1 : -run.out;
		const movingSide = spec.anchor === 'top' ? -inner : inner;
		const track = (side: number): [number, number] => (side > 0 ? [TRACK_GAP / 2, TRACK_GAP / 2 + thickness] : [-TRACK_GAP / 2 - thickness, -TRACK_GAP / 2]);
		const part = (a: number, b: number): Span => (along === 'u' ? { u0: a, u1: b, y0: frame.y0, y1: frame.y1 } : { u0: frame.u0, u1: frame.u1, y0: a, y1: b });
		const [m0, m1] = track(movingSide);
		const [f0, f1] = track(-movingSide);
		return [
			{ glazed: true, moving: true, rect: fromLow ? part(lo, lo + half) : part(hi - half, hi), n0: m0, n1: m1, motion: { type: 'slide', along, by: fromLow ? travel : -travel } },
			{ glazed: true, moving: false, rect: fromLow ? part(lo + half, hi) : part(lo, lo + half), n0: f0, n1: f1, motion: { type: 'fixed' } }
		];
	}
	const thickness = spec.kind === 'door' ? 0.04 : 0.045;
	const at = spec.anchor === 'start' ? frame.u1 : spec.anchor === 'end' ? frame.u0 : spec.anchor === 'bottom' ? frame.y1 : frame.y0;
	const toward: 1 | -1 = spec.kind === 'casement' ? (run.out === 0 ? 1 : run.out) : swing;
	// Closed, the leaf is flush with the wall face on the side it swings to.
	const hinge = toward * (run.thickness / 2 - thickness);
	const [n0, n1] = toward > 0 ? [hinge, hinge + thickness] : [hinge - thickness, hinge];
	const angle = Math.acos(1 - Math.min(1, fraction));
	return [{ glazed: spec.kind === 'casement', moving: true, rect: frame, n0, n1, motion: { type: 'swing', hinge: along === 'u' ? 'vertical' : 'horizontal', at, n: hinge, toward, angle } }];
}

/**
 * What a panel covers seen straight on: its rectangle moved by a slide, or for a turned leaf the cos(angle) of it next
 * to the hinge. A turned leaf's own thickness swings past the hinge line, into the jamb, so it covers nothing more of the
 * opening.
 */
export function coveredSpan(panel: Panel): Span {
	const { rect, motion } = panel;
	if (motion.type === 'fixed') return { ...rect };
	if (motion.type === 'slide') return motion.along === 'u' ? { ...rect, u0: rect.u0 + motion.by, u1: rect.u1 + motion.by } : { ...rect, y0: rect.y0 + motion.by, y1: rect.y1 + motion.by };
	const c = Math.cos(motion.angle);
	if (motion.hinge === 'vertical') {
		const width = rect.u1 - rect.u0;
		return rect.u1 <= motion.at + EPS ? { ...rect, u0: motion.at - c * width } : { ...rect, u1: motion.at + c * width };
	}
	const height = rect.y1 - rect.y0;
	return rect.y1 <= motion.at + EPS ? { ...rect, y0: motion.at - c * height } : { ...rect, y1: motion.at + c * height };
}

/** The lowest height a panel reaches at its pose, so a view that cuts the walls lower can drop it whole. */
export function panelBottom(panel: Panel) {
	const { rect, motion } = panel;
	if (motion.type === 'slide' && motion.along === 'y') return rect.y0 + motion.by;
	if (motion.type === 'swing' && motion.hinge === 'horizontal' && rect.y1 <= motion.at + EPS) return motion.at - Math.cos(motion.angle) * (rect.y1 - rect.y0) - (panel.n1 - panel.n0);
	return rect.y0;
}

/**
 * Which way a door swings, in n. An outside door swings into the home and an inside one into the larger of the two
 * rooms, unless furniture stands where the leaf would sweep and the other side is clear.
 */
export function doorSwing(plan: HomePlan, run: WallRun, spec: OpeningSpec): 1 | -1 {
	const frame = frameSpan(spec);
	const face = run.thickness / 2;
	const roomArea = (side: 1 | -1) => {
		const [x, z] = wallPoint(run, spec.placement.center, side * (face + 0.05));
		const room = plan.rooms.find((r) => r.rects.some((rect) => x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d));
		return room ? room.rects.reduce((sum, rect) => sum + rect.w * rect.d, 0) : 0;
	};
	const preferred: 1 | -1 = run.out !== 0 ? (-run.out as 1 | -1) : roomArea(1) >= roomArea(-1) ? 1 : -1;
	const sweep = Math.min(frame.u1 - frame.u0, 1.2);
	const blocked = (side: 1 | -1) => {
		const box = wallBox(run, frame.u0, frame.u1, side > 0 ? face : -face - sweep, side > 0 ? face + sweep : -face);
		return plan.furniture.some((item) => item.h > 0.05 && item.x < box.x1 - EPS && item.x + item.w > box.x0 + EPS && item.z < box.z1 - EPS && item.z + item.d > box.z0 + EPS);
	};
	return blocked(preferred) && !blocked(-preferred as 1 | -1) ? (-preferred as 1 | -1) : preferred;
}
