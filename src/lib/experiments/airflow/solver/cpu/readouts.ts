import type { Grid } from '../grid';
import { POINT_FIELDS, type Geometry, type RoomStats, type Slice } from '../types';
import { sample, type Velocity } from './advect';

/** Cuts the box at height `y`: the layer of cells that height falls in. */
export function extractSlice(grid: Grid, geometry: Geometry, vel: Velocity, theta: Float32Array, particulates: Float32Array, y: number): Slice {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const layer = Math.min(ny - 1, Math.max(0, Math.floor(y / h)));
	const size = nx * nz;
	const slice: Slice = {
		nx,
		nz,
		h,
		y: (layer + 0.5) * h,
		u: new Float32Array(size),
		v: new Float32Array(size),
		w: new Float32Array(size),
		speed: new Float32Array(size),
		theta: new Float32Array(size),
		particulates: new Float32Array(size),
		fluid: new Uint8Array(size)
	};
	for (let k = 0; k < nz; k++)
		for (let i = 0; i < nx; i++) {
			const cell = i + sx * layer + sxy * k;
			const at = i + nx * k;
			if (!geometry.fluid[cell]) continue;
			const u = 0.5 * (vel.u[cell] + vel.u[cell + 1]);
			const v = 0.5 * (vel.v[cell] + vel.v[cell + sx]);
			const w = 0.5 * (vel.w[cell] + vel.w[cell + sxy]);
			slice.u[at] = u;
			slice.v[at] = v;
			slice.w[at] = w;
			slice.speed[at] = Math.sqrt(u * u + v * v + w * w);
			slice.theta[at] = theta[cell];
			slice.particulates[at] = particulates[cell];
			slice.fluid[at] = 1;
		}
	return slice;
}

/** Trilinear interpolation of a cell-centred field, clamped to the box. */
function cellSample(grid: Grid, field: Float32Array, x: number, y: number, z: number) {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);
	const gx = clamp(x / h - 0.5, nx - 1);
	const gy = clamp(y / h - 0.5, ny - 1);
	const gz = clamp(z / h - 0.5, nz - 1);
	const i = Math.floor(gx);
	const j = Math.floor(gy);
	const k = Math.floor(gz);
	const fx = gx - i;
	const fy = gy - j;
	const fz = gz - k;
	const dx = i < nx - 1 ? 1 : 0;
	const dy = j < ny - 1 ? sx : 0;
	const dz = k < nz - 1 ? sxy : 0;
	const b = i + sx * j + sxy * k;
	const lerp = (a: number, c: number, t: number) => a + (c - a) * t;
	return lerp(
		lerp(lerp(field[b], field[b + dx], fx), lerp(field[b + dy], field[b + dx + dy], fx), fy),
		lerp(lerp(field[b + dz], field[b + dx + dz], fx), lerp(field[b + dy + dz], field[b + dx + dy + dz], fx), fy),
		fz
	);
}

/**
 * Air velocity, temperature and particulates at each of `points` (x, y, z in metres, three numbers per point).
 * Returns `POINT_FIELDS.length` numbers per point.
 */
export function samplePoints(grid: Grid, vel: Velocity, theta: Float32Array, particulates: Float32Array, points: Float32Array) {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const out = new Float32Array((points.length / 3) * POINT_FIELDS.length);
	const stride = POINT_FIELDS.length;
	for (let n = 0; n < points.length / 3; n++) {
		const gx = points[3 * n] / h;
		const gy = points[3 * n + 1] / h;
		const gz = points[3 * n + 2] / h;
		out[stride * n] = sample(vel.u, sx, sxy, nx, ny - 1, nz - 1, gx, gy - 0.5, gz - 0.5);
		out[stride * n + 1] = sample(vel.v, sx, sxy, nx - 1, ny, nz - 1, gx - 0.5, gy, gz - 0.5);
		out[stride * n + 2] = sample(vel.w, sx, sxy, nx - 1, ny - 1, nz, gx - 0.5, gy - 0.5, gz);
		out[stride * n + 3] = cellSample(grid, theta, points[3 * n], points[3 * n + 1], points[3 * n + 2]);
		out[stride * n + 4] = cellSample(grid, particulates, points[3 * n], points[3 * n + 1], points[3 * n + 2]);
	}
	return out;
}

/**
 * Per-room averages, and how much air each room takes in. A room's inflow is the flow that enters it across
 * every face shared with a cell of another room (or with the outside, through an exterior opening): half of
 * what it exchanges with the other rooms, if the exchange is steady, which is what "air changes per hour" is.
 */
export function roomStats(grid: Grid, geometry: Geometry, vel: Velocity, theta: Float32Array, particulates: Float32Array): RoomStats[] {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const { fluid, room, au, av, aw, rooms } = geometry;
	const stats: RoomStats[] = Array.from({ length: rooms }, () => ({ volume: 0, speed: 0, theta: 0, particulates: 0, inflow: 0, changesPerHour: 0 }));
	const area = h * h;
	const cellVolume = h * h * h;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				const r = room[c];
				if (!fluid[c] || r === 0) continue;
				const entry = stats[r - 1];
				const u = 0.5 * (vel.u[c] + vel.u[c + 1]);
				const v = 0.5 * (vel.v[c] + vel.v[c + sx]);
				const w = 0.5 * (vel.w[c] + vel.w[c + sxy]);
				entry.volume += cellVolume;
				entry.speed += Math.sqrt(u * u + v * v + w * w) * cellVolume;
				entry.theta += theta[c] * cellVolume;
				entry.particulates += particulates[c] * cellVolume;
				// Flow into this cell across each face that leads out of the room.
				const into = (neighbour: number, open: number, flux: number) => {
					if (open > 0 && (neighbour < 0 || room[neighbour] !== r) && flux > 0) entry.inflow += flux * area * open;
				};
				into(i > 0 ? c - 1 : -1, au[c], vel.u[c]);
				into(i < nx - 1 ? c + 1 : -1, au[c + 1], -vel.u[c + 1]);
				into(j > 0 ? c - sx : -1, av[c], vel.v[c]);
				into(j < ny - 1 ? c + sx : -1, av[c + sx], -vel.v[c + sx]);
				into(k > 0 ? c - sxy : -1, aw[c], vel.w[c]);
				into(k < nz - 1 ? c + sxy : -1, aw[c + sxy], -vel.w[c + sxy]);
			}
	for (const entry of stats) {
		if (entry.volume > 0) {
			entry.speed /= entry.volume;
			entry.theta /= entry.volume;
			entry.particulates /= entry.volume;
			entry.changesPerHour = (entry.inflow * 3600) / entry.volume;
		}
	}
	return stats;
}
