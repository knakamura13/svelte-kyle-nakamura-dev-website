import type { Raster } from '../../homes/rasterize';
import { FLOW_STRIDE, SCALAR_STRIDE, type Volume } from '../../solver/volume';

/**
 * Where new streaks and smoke puffs are born. The page picks the points on the processor each time a volume arrives, from the
 * volume and the plan's geometry, and uploads them as a small texture; a particle that dies takes one of them at random. Streaks
 * are born where the air moves (a volume cell's weight grows with its speed) and at the exterior Openings that let air in (a
 * face's weight is the air it lets in). Puffs are born where there is smoke. Every point is in air: inside a cell the solver
 * holds as air, or just outside an open face of the box, from where the incoming air carries it in.
 */

/** How streak births are weighted. */
export const STREAK_BIRTHS = {
	/** Speed added to every cell's, m/s: still air gets a few streaks, so a room that has just gone quiet does not empty at once. */
	speedFloor: 0.04,
	/** The speed at which a cell's weight is its volume of air, m/s. */
	speedReference: 0.5,
	/**
	 * Seconds of incoming air one birth at an Opening stands for, against a cubic metre of air at the reference speed for one birth in
	 * a room: about a streak's mean life, so the stream through a window is as dense as the air it joins, times two, so the window reads.
	 */
	inflowSeconds: 8,
	/** How far outside the wall a streak born at an Opening starts, m: it fades in as the incoming air carries it through the frame. */
	outside: 0.12
} as const;

/** How puff births are weighted: by the smoke's visual density (`smokeLevel`), above this much. */
export const PUFF_THRESHOLD = 0.02;

/** A face of an exterior Opening that lets air in, and how much. */
export interface InflowFace {
	/** The face's lower corner and its extent along the wall and up, m; the wall runs along x for `axis` 2 and along z for `axis` 0. */
	axis: 0 | 2;
	x: number;
	y: number;
	z: number;
	/** Unit vector into the home: +1 or -1 along the face's axis. */
	inward: 1 | -1;
	/** Air coming in through the face, m³/s. */
	inflow: number;
	weight: number;
}

/** The weight of every volume cell and every inflowing face. */
export interface BirthWeights {
	cells: Float64Array;
	faces: InflowFace[];
	/** Sum of all the weights, and of the faces' alone. */
	total: number;
	inflow: number;
}

/** The points one round of births draws from: x, y, z in metres and a spare, four numbers each. */
export interface BirthPool {
	points: Float32Array;
	count: number;
	/** The share of the points that are at Openings. */
	atOpenings: number;
}

/** The solver cells volume cell (I, J, K) averages, along one axis: from `first` up to but not including `end`. */
function span(index: number, stride: number, cells: number) {
	const first = index * stride;
	return { first, end: Math.min(first + stride, cells) };
}

/** The velocity of the volume cell holding solver cell (i, j, k). */
function velocityOf(volume: Volume, i: number, j: number, k: number): [number, number, number] {
	const I = Math.min(volume.nx - 1, Math.floor(i / volume.sx));
	const J = Math.min(volume.ny - 1, Math.floor(j / volume.sy));
	const K = Math.min(volume.nz - 1, Math.floor(k / volume.sz));
	const o = FLOW_STRIDE * (I + volume.nx * (J + volume.ny * K));
	return [volume.flow[o], volume.flow[o + 1], volume.flow[o + 2]];
}

/**
 * The faces of the exterior Openings that let air in now: how far open each is comes from the geometry (which the World keeps
 * current) and the air through it from the volume cell just inside.
 */
export function inflowFaces(volume: Volume, raster: Raster): Omit<InflowFace, 'weight'>[] {
	const { nx, ny, nz, h } = raster.spec;
	const sx = nx + 1;
	const sxy = (nx + 1) * (ny + 1);
	const { au, aw } = raster.geometry;
	const faces: Omit<InflowFace, 'weight'>[] = [];
	for (const opening of raster.openings) {
		if (opening.side === undefined) continue;
		const open = opening.axis === 0 ? au : aw;
		for (const face of opening.faces) {
			const share = open[face.index];
			if (!(share > 0)) continue;
			const i = face.index % sx;
			const j = Math.floor(face.index / sx) % (ny + 1);
			const k = Math.floor(face.index / sxy);
			// The face is at x = i·h (or z = k·h); the cell inside is the first or the last along that axis.
			const axis = opening.axis;
			const plane = axis === 0 ? i : k;
			const last = axis === 0 ? nx : nz;
			const inward: 1 | -1 = plane === 0 ? 1 : -1;
			if (plane !== 0 && plane !== last) continue;
			const [u, , w] = velocityOf(volume, axis === 0 ? (plane === 0 ? 0 : nx - 1) : i, j, axis === 2 ? (plane === 0 ? 0 : nz - 1) : k);
			const into = inward * (axis === 0 ? u : w);
			if (!(into > 0)) continue;
			faces.push({ axis, x: i * h, y: j * h, z: k * h, inward, inflow: into * share * h * h });
		}
	}
	return faces;
}

/** Streak weights: a cell's air volume times its speed (plus a floor) over the reference, and an inflowing face's air in `inflowSeconds`. */
export function streakWeights(volume: Volume, raster: Raster): BirthWeights {
	const { speedFloor, speedReference, inflowSeconds } = STREAK_BIRTHS;
	const cells = new Float64Array(volume.nx * volume.ny * volume.nz);
	const { nx, ny, nz, h } = raster.spec;
	const cube = h * h * h;
	let total = 0;
	for (let K = 0, n = 0; K < volume.nz; K++) {
		const z = span(K, volume.sz, nz);
		for (let J = 0; J < volume.ny; J++) {
			const y = span(J, volume.sy, ny);
			for (let I = 0; I < volume.nx; I++, n++) {
				const x = span(I, volume.sx, nx);
				const o = FLOW_STRIDE * n;
				const air = volume.flow[o + 3];
				if (!(air > 0)) continue;
				const u = volume.flow[o];
				const v = volume.flow[o + 1];
				const w = volume.flow[o + 2];
				const speed = Math.sqrt(u * u + v * v + w * w);
				const space = air * (x.end - x.first) * (y.end - y.first) * (z.end - z.first) * cube;
				const weight = (space * (speed + speedFloor)) / (speedReference + speedFloor);
				cells[n] = weight;
				total += weight;
			}
		}
	}
	const faces = inflowFaces(volume, raster).map((face) => ({ ...face, weight: inflowSeconds * face.inflow }));
	const inflow = faces.reduce((sum, face) => sum + face.weight, 0);
	return { cells, faces, total: total + inflow, inflow };
}

/** How dense smoke of `ppm` looks, 0 to 1: a log scale from `decades` below `dense` up to it. The smoke volume's shader uses the same. */
export function smokeLevel(ppm: number, dense: number, decades: number) {
	if (!(ppm > 0)) return 0;
	return Math.min(1, Math.max(0, Math.log10(ppm / dense) / decades + 1));
}

/** The concentration, ppm, at which smoke reaches `level` on the scale of `smokeLevel`. */
export const ppmAtLevel = (level: number, dense: number, decades: number) => dense * 10 ** (decades * (level - 1));

/** Puff weights: a cell's air volume times the square of how dense its smoke looks, where it looks like any. No births at Openings. */
export function puffWeights(volume: Volume, raster: Raster, dense: number, decades: number): BirthWeights {
	const cells = new Float64Array(volume.nx * volume.ny * volume.nz);
	const { nx, ny, nz, h } = raster.spec;
	const cube = h * h * h;
	const least = ppmAtLevel(PUFF_THRESHOLD, dense, decades);
	let total = 0;
	for (let K = 0, n = 0; K < volume.nz; K++) {
		const z = span(K, volume.sz, nz);
		for (let J = 0; J < volume.ny; J++) {
			const y = span(J, volume.sy, ny);
			for (let I = 0; I < volume.nx; I++, n++) {
				const air = volume.flow[FLOW_STRIDE * n + 3];
				const ppm = volume.scalars[SCALAR_STRIDE * n + 1];
				if (!(air > 0) || !(ppm >= least)) continue;
				const level = smokeLevel(ppm, dense, decades);
				const x = span(I, volume.sx, nx);
				const weight = air * (x.end - x.first) * (y.end - y.first) * (z.end - z.first) * cube * level * level;
				cells[n] = weight;
				total += weight;
			}
		}
	}
	return { cells, faces: [], total, inflow: 0 };
}

/** Whether the solver holds the point as air. */
export function inAir(raster: Raster, x: number, y: number, z: number) {
	const { nx, ny, nz, h } = raster.spec;
	const i = Math.floor(x / h);
	const j = Math.floor(y / h);
	const k = Math.floor(z / h);
	if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
	return raster.geometry.fluid[i + (nx + 1) * (j + (ny + 1) * k)] === 1;
}

/** Tries to find air in a block of a volume cell this many times before giving the birth up. */
const TRIES = 8;

/**
 * `count` points drawn from `weights` in proportion: systematic sampling, so a cell with a hundredth of the weight gets a hundredth of
 * the points to within one. A point in a cell is at a random place in its block that is air; a point at a face is at a random
 * place on the face, `outside` metres out of the home. `random` gives numbers from 0 to 1 (a seeded one in tests).
 */
export function drawBirths(weights: BirthWeights, volume: Volume, raster: Raster, count: number, random: () => number = Math.random, outside: number = STREAK_BIRTHS.outside): BirthPool {
	const points = new Float32Array(4 * count);
	if (!(weights.total > 0) || count <= 0) return { points, count: 0, atOpenings: 0 };
	const { nx, ny, nz, h } = raster.spec;
	const step = weights.total / count;
	let target = random() * step;
	let reached = 0;
	let made = 0;
	let atOpenings = 0;
	const place = (x: number, y: number, z: number, opening: boolean) => {
		points[4 * made] = x;
		points[4 * made + 1] = y;
		points[4 * made + 2] = z;
		points[4 * made + 3] = opening ? 1 : 0;
		made++;
		if (opening) atOpenings++;
	};
	// The cells, in order: each takes the targets that fall within its share of the running total.
	for (let K = 0, n = 0; K < volume.nz && made < count; K++)
		for (let J = 0; J < volume.ny && made < count; J++)
			for (let I = 0; I < volume.nx && made < count; I++, n++) {
				const weight = weights.cells[n];
				if (!(weight > 0)) continue;
				reached += weight;
				const x = span(I, volume.sx, nx);
				const y = span(J, volume.sy, ny);
				const z = span(K, volume.sz, nz);
				for (; target < reached && made < count; target += step)
					for (let attempt = 0; attempt < TRIES; attempt++) {
						const px = (x.first + random() * (x.end - x.first)) * h;
						const py = (y.first + random() * (y.end - y.first)) * h;
						const pz = (z.first + random() * (z.end - z.first)) * h;
						if (!inAir(raster, px, py, pz)) continue;
						place(px, py, pz, false);
						break;
					}
			}
	for (const face of weights.faces) {
		reached += face.weight;
		for (; target < reached && made < count; target += step) {
			const along = random() * h;
			const up = face.y + random() * h;
			const out = -face.inward * outside;
			if (face.axis === 0) place(face.x + out, up, face.z + along, true);
			else place(face.x + along, up, face.z + out, true);
		}
	}
	return { points, count: made, atOpenings: made ? atOpenings / made : 0 };
}

/** A small seeded generator (mulberry32), so a test can draw the same births twice. */
export function seeded(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
