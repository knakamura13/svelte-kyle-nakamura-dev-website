import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';

/**
 * A tiling 3D noise for the smoke's detail (`smokeVolume.ts`): gradient noise of a few octaves on a lattice that wraps at the edges
 * of the tile, so the texture repeats without a seam. Its values are spread evenly from 0 to 1 (each value is replaced by its rank),
 * so a threshold of t keeps the share 1 - t of it: the smoke's wisps keep as much smoke on average as the field holds. Made once, on
 * the processor, in a few tens of milliseconds. Pure, so Node tests it.
 */

/** A small seeded generator (mulberry32). */
function seeded(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The noise, `size` texels a side, x fastest: `octaves` octaves of gradient noise, the first with `base` lattice cells across the tile
 * and each next twice as many at half the amplitude, ranked to spread evenly over 0 to 1.
 */
export function tilingNoise(size = 48, base = 2, octaves = 3, seed = 7): Float32Array {
	const random = seeded(seed);
	const values = new Float32Array(size * size * size);
	let amplitude = 1;
	for (let octave = 0; octave < octaves; octave++, amplitude *= 0.5) {
		const period = base << octave;
		// A unit gradient at every lattice point of the tile, the same at its wrapped copies.
		const gradients = new Float32Array(3 * period * period * period);
		for (let g = 0; g < period * period * period; g++) {
			const z = 2 * random() - 1;
			const angle = 2 * Math.PI * random();
			const r = Math.sqrt(1 - z * z);
			gradients.set([r * Math.cos(angle), r * Math.sin(angle), z], 3 * g);
		}
		const corner = (i: number, j: number, k: number, x: number, y: number, z: number) => {
			const g = 3 * ((i % period) + period * ((j % period) + period * (k % period)));
			return gradients[g] * x + gradients[g + 1] * y + gradients[g + 2] * z;
		};
		for (let z = 0, n = 0; z < size; z++)
			for (let y = 0; y < size; y++)
				for (let x = 0; x < size; x++, n++) {
					const u = (x / size) * period;
					const v = (y / size) * period;
					const w = (z / size) * period;
					const i = Math.floor(u);
					const j = Math.floor(v);
					const k = Math.floor(w);
					const fx = u - i;
					const fy = v - j;
					const fz = w - k;
					const sx = fade(fx);
					const sy = fade(fy);
					const sz = fade(fz);
					const x00 = lerp(corner(i, j, k, fx, fy, fz), corner(i + 1, j, k, fx - 1, fy, fz), sx);
					const x10 = lerp(corner(i, j + 1, k, fx, fy - 1, fz), corner(i + 1, j + 1, k, fx - 1, fy - 1, fz), sx);
					const x01 = lerp(corner(i, j, k + 1, fx, fy, fz - 1), corner(i + 1, j, k + 1, fx - 1, fy, fz - 1), sx);
					const x11 = lerp(corner(i, j + 1, k + 1, fx, fy - 1, fz - 1), corner(i + 1, j + 1, k + 1, fx - 1, fy - 1, fz - 1), sx);
					values[n] += amplitude * lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
				}
	}
	// Each value replaced by its rank, from 0 to 1: the share of values below it, read off a fine histogram.
	let lo = Infinity;
	let hi = -Infinity;
	for (const value of values) {
		lo = Math.min(lo, value);
		hi = Math.max(hi, value);
	}
	const bins = 4096;
	const counts = new Float64Array(bins + 1);
	const bin = (value: number) => Math.min(bins - 1, Math.floor(((value - lo) / (hi - lo || 1)) * bins));
	for (const value of values) counts[bin(value) + 1]++;
	for (let b = 1; b <= bins; b++) counts[b] += counts[b - 1];
	const ranked = new Float32Array(values.length);
	const last = values.length - 1;
	for (let n = 0; n < values.length; n++) {
		const b = bin(values[n]);
		const within = ((values[n] - lo) / (hi - lo || 1)) * bins - b;
		ranked[n] = Math.min(1, (counts[b] + within * (counts[b + 1] - counts[b])) / last);
	}
	return ranked;
}

/** The noise as a tiling, linearly filtered single-channel 3D texture. */
export function noiseTexture(size = 48): Data3DTexture {
	const values = tilingNoise(size);
	const bytes = new Uint8Array(values.length);
	for (let n = 0; n < values.length; n++) bytes[n] = Math.round(values[n] * 255);
	const texture = new Data3DTexture(bytes, size, size, size);
	texture.format = RedFormat;
	texture.type = UnsignedByteType;
	texture.minFilter = texture.magFilter = LinearFilter;
	texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
	return texture;
}
