import { Grid } from './grid';
import type { FanDisk, Geometry } from './types';

export interface FanShape {
	/** Centre of the disk, metres. */
	center: [number, number, number];
	/** Unit vector the fan blows along. */
	normal: [number, number, number];
	/** Radius of the disk, m. */
	radius: number;
	/** Thickness of the disk along the normal, m. At least one cell. */
	thickness: number;
	/** Flow with no back-pressure, m³/s, and pressure rise with no flow, Pa. */
	qMax: number;
	dpMax: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Turns a fan into the cells and faces the solver pushes on. Each cell gets a weight from how much of it the
 * disk covers, with a soft edge one cell wide, so a fan that is smaller than a cell still pushes (the weights
 * just add up to less than one cell) and a tilted one does not shimmer as it turns. Faces on walls are left out.
 */
export function rasterizeFan(grid: Grid, geometry: Geometry, shape: FanShape): FanDisk {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const [cx, cy, cz] = shape.center;
	const [ax, ay, az] = shape.normal;
	const half = Math.max(shape.thickness, h) / 2;
	const reach = Math.hypot(shape.radius + h, half + h);
	const lo = (centre: number) => Math.max(0, Math.floor((centre - reach) / h));
	const hi = (centre: number, cells: number) => Math.min(cells - 1, Math.ceil((centre + reach) / h));

	const cells: number[] = [];
	const weights: number[] = [];
	for (let k = lo(cz); k <= hi(cz, nz); k++)
		for (let j = lo(cy); j <= hi(cy, ny); j++)
			for (let i = lo(cx); i <= hi(cx, nx); i++) {
				const cell = i + sx * j + sxy * k;
				if (!geometry.fluid[cell]) continue;
				const dx = (i + 0.5) * h - cx;
				const dy = (j + 0.5) * h - cy;
				const dz = (k + 0.5) * h - cz;
				const along = dx * ax + dy * ay + dz * az;
				const across = Math.hypot(dx - along * ax, dy - along * ay, dz - along * az);
				const weight = clamp01((shape.radius - across) / h + 0.5) * clamp01((half - Math.abs(along)) / h + 0.5);
				if (weight <= 0) continue;
				cells.push(cell);
				weights.push(weight);
			}

	// A face between two cells is pushed by half the force of each, along the fan's component on that face's axis.
	const pushed = new Map<number, number>();
	const strides = [1, sx, sxy];
	const normal = [ax, ay, az];
	const open = [geometry.au, geometry.av, geometry.aw];
	for (let n = 0; n < cells.length; n++)
		for (let axis = 0; axis < 3; axis++) {
			if (normal[axis] === 0) continue;
			for (const face of [cells[n], cells[n] + strides[axis]]) {
				if (open[axis][face] <= 0) continue;
				const key = face * 3 + axis;
				pushed.set(key, (pushed.get(key) ?? 0) + 0.5 * normal[axis] * weights[n]);
			}
		}
	const faceAxis = new Uint8Array(pushed.size);
	const faceIndex = new Uint32Array(pushed.size);
	const faceWeight = new Float32Array(pushed.size);
	let e = 0;
	for (const [key, weight] of pushed) {
		faceAxis[e] = key % 3;
		faceIndex[e] = (key - (key % 3)) / 3;
		faceWeight[e] = weight;
		e++;
	}
	return {
		cells: Uint32Array.from(cells),
		cellWeight: Float32Array.from(weights),
		faceAxis,
		faceIndex,
		faceWeight,
		normal: [ax, ay, az],
		area: Math.PI * shape.radius * shape.radius,
		qMax: shape.qMax,
		dpMax: shape.dpMax
	};
}
