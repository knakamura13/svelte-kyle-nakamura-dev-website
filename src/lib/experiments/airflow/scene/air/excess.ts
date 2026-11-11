import type { Raster } from '../../homes/rasterize';
import { FLOW_STRIDE, SCALAR_STRIDE, type Volume, type VolumeSpec } from '../../solver/volume';

/**
 * The smoke that stands out: the PM2.5 above each Room's average, which is what the smoke volume and the phone's puffs draw (#94).
 * The volume draws smoke far more opaque than real smoke (`SMOKE_LOOK`), so that a released plume still reads once the grid has
 * averaged it. Smoke spread evenly through a home would then draw as a fog, though real smoke at those levels looks clear: at
 * 150 µg/m³ a 4 m room dims what is behind it by about 0.3% (`docs/research/airflow/smoke-and-visibility.md`). So the smoke is drawn
 * from what is left once each Room's average is taken away. Smoke spread evenly through a Room draws nothing, and a release on top of a
 * smoky Room draws as it would in clean air, fading as it mixes. The Smoke overlay and the probes keep showing the PM2.5 itself.
 *
 * A Room's average is the one the Physics panel's Room averages give, the mean over the Room's air, measured here from the same
 * volume read the smoke is drawn from, so the two never fall out of step. A volume cell that straddles two Rooms (at a doorway)
 * takes their averages in proportion to its air in each.
 */

/** Which Rooms each volume cell's air is in: for cell n, the entries from `start[n]` up to `start[n + 1]`, each a Room and its share of the cell's air. */
export interface VolumeRooms {
	/** The volume grid these are for. */
	spec: VolumeSpec;
	start: Uint32Array;
	room: Uint8Array;
	share: Float32Array;
	/** How many Rooms the Home has. */
	rooms: number;
}

/** The Rooms of each volume cell of `spec`, from the solver cells of air each one averages. */
export function volumeRooms(spec: VolumeSpec, raster: Raster): VolumeRooms {
	const { nx, ny, nz } = raster.spec;
	const sx = nx + 1;
	const sxy = (nx + 1) * (ny + 1);
	const { fluid, room, rooms } = raster.geometry;
	const cells = spec.nx * spec.ny * spec.nz;
	const start = new Uint32Array(cells + 1);
	const roomOut: number[] = [];
	const shareOut: number[] = [];
	const counts = new Float64Array(rooms + 1);
	for (let K = 0, n = 0; K < spec.nz; K++)
		for (let J = 0; J < spec.ny; J++)
			for (let I = 0; I < spec.nx; I++, n++) {
				start[n] = roomOut.length;
				counts.fill(0);
				let air = 0;
				for (let k = K * spec.sz; k < Math.min((K + 1) * spec.sz, nz); k++)
					for (let j = J * spec.sy; j < Math.min((J + 1) * spec.sy, ny); j++)
						for (let i = I * spec.sx; i < Math.min((I + 1) * spec.sx, nx); i++) {
							const c = i + sx * j + sxy * k;
							if (!fluid[c] || room[c] === 0) continue;
							counts[room[c]]++;
							air++;
						}
				for (let r = 1; r <= rooms; r++) {
					if (!counts[r]) continue;
					roomOut.push(r);
					shareOut.push(counts[r] / air);
				}
			}
	start[cells] = roomOut.length;
	return { spec: { ...spec }, start, room: Uint8Array.from(roomOut), share: Float32Array.from(shareOut), rooms };
}

/** Whether `rooms` was made for the grid of `volume`. */
export const roomsFit = (rooms: VolumeRooms | null, volume: VolumeSpec) =>
	!!rooms && (['nx', 'ny', 'nz', 'sx', 'sy', 'sz', 'h'] as const).every((key) => rooms.spec[key] === volume[key]);

/** Each Room's average PM2.5, ppm, over its air in `volume` (index 0 is unused: Rooms are 1-based). */
export function roomAverages(volume: Volume, rooms: VolumeRooms): Float64Array {
	const sum = new Float64Array(rooms.rooms + 1);
	const weight = new Float64Array(rooms.rooms + 1);
	const cells = volume.nx * volume.ny * volume.nz;
	for (let n = 0; n < cells; n++) {
		const air = volume.flow[FLOW_STRIDE * n + 3];
		if (!(air > 0)) continue;
		const ppm = volume.scalars[SCALAR_STRIDE * n + 1];
		for (let e = rooms.start[n]; e < rooms.start[n + 1]; e++) {
			const w = air * rooms.share[e];
			sum[rooms.room[e]] += w * ppm;
			weight[rooms.room[e]] += w;
		}
	}
	for (let r = 1; r <= rooms.rooms; r++) sum[r] = weight[r] > 0 ? sum[r] / weight[r] : 0;
	return sum;
}

/**
 * The PM2.5 above each Room's average, ppm, per volume cell (into `out` when it fits), never below 0. A cell in no Room keeps its
 * PM2.5 as it is.
 */
export function smokeExcess(volume: Volume, rooms: VolumeRooms, out?: Float32Array): Float32Array {
	const cells = volume.nx * volume.ny * volume.nz;
	const excess = out && out.length === cells ? out : new Float32Array(cells);
	const average = roomAverages(volume, rooms);
	for (let n = 0; n < cells; n++) {
		const ppm = volume.scalars[SCALAR_STRIDE * n + 1];
		let background = 0;
		for (let e = rooms.start[n]; e < rooms.start[n + 1]; e++) background += rooms.share[e] * average[rooms.room[e]];
		// Rounding leaves a few parts in ten million of an even field; that is no smoke.
		const above = ppm - background;
		excess[n] = above > 1e-6 * background ? above : 0;
	}
	return excess;
}

/** `volume` with its PM2.5 replaced by `excess`: what the smoke's box and the puffs' births are worked out from. */
export const withSmoke = (volume: Volume, excess: Float32Array): Volume => {
	const scalars = new Float32Array(volume.scalars);
	for (let n = 0; n < excess.length; n++) scalars[SCALAR_STRIDE * n + 1] = excess[n];
	return { ...volume, scalars };
};
