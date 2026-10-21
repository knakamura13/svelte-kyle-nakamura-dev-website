import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * Procedural textures, painted once into canvases: wood planks, two kinds of floor tile, painted plaster, lap siding, paving,
 * grass, and fine weaves for fabric and furniture wood. Nothing is downloaded (CC0 textures come in a later milestone). Each is
 * tileable, so a floor repeats it in world metres, and seeded, so every visit paints the same picture.
 */

/** A seeded generator, uniform in [0, 1). */
function seeded(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};
}

/** Tileable value noise: a lattice of `cells` × `cells` random values, wrapped, read with smooth interpolation at (u, v) in [0, 1). */
class Lattice {
	private readonly values: Float32Array;

	constructor(
		private readonly cellsX: number,
		private readonly cellsY: number,
		seed: number
	) {
		const random = seeded(seed);
		this.values = new Float32Array(cellsX * cellsY);
		for (let i = 0; i < this.values.length; i++) this.values[i] = random();
	}

	at(u: number, v: number) {
		const x = (u - Math.floor(u)) * this.cellsX;
		const y = (v - Math.floor(v)) * this.cellsY;
		const i = Math.floor(x);
		const j = Math.floor(y);
		const fx = x - i;
		const fy = y - j;
		const sx = fx * fx * (3 - 2 * fx);
		const sy = fy * fy * (3 - 2 * fy);
		const i1 = (i + 1) % this.cellsX;
		const j1 = (j + 1) % this.cellsY;
		const a = this.values[i + this.cellsX * j];
		const b = this.values[i1 + this.cellsX * j];
		const c = this.values[i + this.cellsX * j1];
		const d = this.values[i1 + this.cellsX * j1];
		return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
	}
}

/** Fractal noise in [0, 1): octaves of `Lattice` from `cells` across, each twice as fine and half as strong. */
function fbm(cellsX: number, cellsY: number, octaves: number, seed: number) {
	const layers = Array.from({ length: octaves }, (_, n) => new Lattice(cellsX << n, cellsY << n, seed + n * 101));
	let norm = 0;
	for (let n = 0; n < octaves; n++) norm += 0.5 ** n;
	return (u: number, v: number) => {
		let sum = 0;
		for (let n = 0; n < octaves; n++) sum += layers[n].at(u, v) * 0.5 ** n;
		return sum / norm;
	};
}

type Paint = (data: Uint8ClampedArray, size: number) => void;

function canvasTexture(size: number, paint: Paint, color: boolean): CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const context = canvas.getContext('2d')!;
	const image = context.createImageData(size, size);
	paint(image.data, size);
	context.putImageData(image, 0, 0);
	const texture = new CanvasTexture(canvas);
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
	return texture;
}

const put = (data: Uint8ClampedArray, k: number, r: number, g: number, b: number) => {
	data[k] = r;
	data[k + 1] = g;
	data[k + 2] = b;
	data[k + 3] = 255;
};

/** Floor boards 0.2 m wide in staggered lengths, each its own shade of oak, with grain and dark seams. The texture is 2 m a side. */
const woodFloor: Paint = (data, size) => {
	const random = seeded(11);
	const columns = 10;
	const grain = fbm(48, 3, 4, 21);
	const fine = fbm(160, 6, 2, 31);
	const tones = [
		[196, 150, 104],
		[184, 136, 92],
		[205, 160, 112],
		[178, 128, 86],
		[192, 142, 96]
	];
	// Each column of boards: where its joints are (in v, 0 to 1) and the tone of each board.
	const boards = Array.from({ length: columns }, () => {
		const joints: number[] = [];
		let at = random() * 0.6;
		while (at < 1) {
			joints.push(at);
			at += 0.4 + random() * 0.45;
		}
		const shades = joints.map(() => {
			const tone = tones[Math.floor(random() * tones.length)];
			const lift = 0.9 + random() * 0.18;
			return tone.map((c) => c * lift);
		});
		return { joints, shades };
	});
	const column = size / columns;
	for (let y = 0; y < size; y++) {
		const v = y / size;
		for (let x = 0; x < size; x++) {
			const u = x / size;
			const c = Math.min(columns - 1, Math.floor(x / column));
			const { joints, shades } = boards[c];
			// The board this pixel is on: the last joint before v, wrapping round to the last board.
			let b = joints.length - 1;
			for (let n = 0; n < joints.length; n++) if (v >= joints[n]) b = n;
			const [r, g, bl] = shades[b];
			const across = (x % column) / column;
			const streak = grain(u, v + c * 0.137) * 0.7 + fine(u, v) * 0.3;
			const shade = 0.86 + 0.2 * streak;
			let edge = 1;
			if (across < 0.012 || across > 0.988) edge = 0.55;
			for (const j of joints) if (Math.abs(v - j) < 0.0016 || Math.abs(v - j - 1) < 0.0016) edge = 0.6;
			const k = (x + y * size) * 4;
			put(data, k, r * shade * edge, g * shade * edge, bl * shade * edge);
		}
	}
};

/** Square tiles with grout, each a slightly different shade. `tiles` across the texture. */
function tiles(tilesAcross: number, base: [number, number, number], grout: [number, number, number], groutShare: number, spread: number, seed: number): Paint {
	return (data, size) => {
		const random = seeded(seed);
		const shades = Array.from({ length: tilesAcross * tilesAcross }, () => 1 - spread / 2 + random() * spread);
		const speckle = fbm(64, 64, 3, seed + 7);
		const tile = size / tilesAcross;
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				const tx = Math.floor(x / tile);
				const ty = Math.floor(y / tile);
				const fx = (x % tile) / tile;
				const fy = (y % tile) / tile;
				const k = (x + y * size) * 4;
				const g = groutShare / 2;
				if (fx < g || fx > 1 - g || fy < g || fy > 1 - g) {
					put(data, k, grout[0], grout[1], grout[2]);
					continue;
				}
				// A faint bevel: each tile a touch darker toward its edges.
				const bevel = Math.min(fx - g, 1 - g - fx, fy - g, 1 - g - fy);
				const shade = shades[tx + tilesAcross * ty] * (0.94 + 0.06 * Math.min(1, bevel * 30)) * (0.96 + 0.06 * speckle(x / size, y / size));
				put(data, k, base[0] * shade, base[1] * shade, base[2] * shade);
			}
	};
}

/** Painted plaster: a soft, faint mottle round white, to multiply a wall's paint colour by. */
const plaster: Paint = (data, size) => {
	const mottle = fbm(6, 6, 5, 41);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const value = 236 + 19 * mottle(x / size, y / size);
			put(data, (x + y * size) * 4, value, value, value);
		}
};

/** Lap siding: boards 0.15 m high with a shadow under each lip, 1.2 m of wall a texture. */
const siding: Paint = (data, size) => {
	const boards = 8;
	const grain = fbm(4, 40, 3, 51);
	for (let y = 0; y < size; y++) {
		const f = ((y / size) * boards) % 1;
		// Light on the face of a board, darkening into the shadow its upper neighbour casts.
		const lip = f < 0.08 ? 0.62 + f * 3 : 1 - (1 - f) * 0.08;
		for (let x = 0; x < size; x++) {
			const value = 255 * lip * (0.95 + 0.05 * grain(x / size, y / size));
			put(data, (x + y * size) * 4, value, value, value);
		}
	}
};

/** Stone paving, slabs 0.6 by 0.4 m in a running bond, 1.2 m a texture. */
const paving: Paint = (data, size) => {
	const random = seeded(61);
	const shades = Array.from({ length: 32 }, () => 0.88 + random() * 0.16);
	const grit = fbm(32, 32, 4, 63);
	for (let y = 0; y < size; y++) {
		const row = Math.floor((y / size) * 3);
		const fy = ((y / size) * 3) % 1;
		for (let x = 0; x < size; x++) {
			const shifted = (x / size) * 2 + (row % 2) * 0.5;
			const column = Math.floor(shifted) % 2;
			const fx = shifted % 1;
			const k = (x + y * size) * 4;
			if (fx < 0.015 || fx > 0.985 || fy < 0.02 || fy > 0.98) {
				put(data, k, 132, 128, 118);
				continue;
			}
			const shade = shades[(row * 2 + column) % shades.length] * (0.9 + 0.14 * grit(x / size, y / size));
			put(data, k, 206 * shade, 199 * shade, 184 * shade);
		}
	}
};

/** Lawn: greens in drifts, with a speckle of lighter and darker blades. 3 m a texture. */
const grass: Paint = (data, size) => {
	const drift = fbm(5, 5, 5, 71);
	const blades = fbm(180, 180, 1, 73);
	const clumps = fbm(24, 24, 3, 79);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const u = x / size;
			const v = y / size;
			const d = drift(u, v);
			const b = blades(u, v);
			const c = clumps(u, v);
			const light = 0.78 + 0.32 * d + 0.18 * (b - 0.5) + 0.1 * (c - 0.5);
			// Drier, yellower drifts and lusher, bluer ones.
			const r = (86 + 30 * (1 - d)) * light;
			const g = (128 + 14 * d) * light;
			const bl = (58 + 6 * d) * light;
			put(data, (x + y * size) * 4, r, g, bl);
		}
};

/** A fine fabric weave, near white, to multiply an upholstery colour by. */
const weave: Paint = (data, size) => {
	const slub = fbm(16, 16, 3, 81);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const warp = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 96);
			const weft = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 96);
			const value = 222 + 22 * (warp * weft) + 11 * slub(x / size, y / size);
			put(data, (x + y * size) * 4, value, value, value);
		}
};

/** Furniture wood: long grain, near white, to multiply a stain colour by. */
const grainWood: Paint = (data, size) => {
	const long = fbm(28, 2, 4, 91);
	const fine = fbm(140, 5, 2, 93);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const u = x / size;
			const v = y / size;
			const value = 200 + 46 * (0.7 * long(u, v) + 0.3 * fine(u, v));
			put(data, (x + y * size) * 4, value, value, value);
		}
};

/**
 * Soft, tileable fractal noise as plain numbers in [0, 1] (grey, no colour space), `size` pixels a side with `cells` lattice cells
 * across its coarsest octave: for breaking up a texture's repeat over a large surface.
 */
export function noiseTexture(size: number, cells: number, octaves: number, seed: number): CanvasTexture {
	const noise = fbm(cells, cells, octaves, seed);
	const texture = canvasTexture(
		size,
		(data, n) => {
			for (let y = 0; y < n; y++)
				for (let x = 0; x < n; x++) {
					const value = 255 * noise(x / n, y / n);
					put(data, (x + y * n) * 4, value, value, value);
				}
		},
		false
	);
	return texture;
}

export type TextureName = 'wood-floor' | 'stone-tile' | 'bath-tile' | 'plaster' | 'siding' | 'paving' | 'grass' | 'weave' | 'grain';

const RECIPES: Record<TextureName, { size: number; paint: Paint; color: boolean }> = {
	'wood-floor': { size: 1024, paint: woodFloor, color: true },
	'stone-tile': { size: 512, paint: tiles(2, [226, 214, 194], [168, 158, 142], 0.022, 0.1, 13), color: true },
	'bath-tile': { size: 512, paint: tiles(4, [232, 238, 240], [196, 204, 208], 0.05, 0.06, 17), color: true },
	plaster: { size: 256, paint: plaster, color: true },
	siding: { size: 256, paint: siding, color: true },
	paving: { size: 512, paint: paving, color: true },
	grass: { size: 512, paint: grass, color: true },
	weave: { size: 256, paint: weave, color: true },
	grain: { size: 256, paint: grainWood, color: true }
};

/** How many metres one repeat of each texture covers in the world. */
export const TEXTURE_METRES: Record<TextureName, number> = {
	'wood-floor': 2,
	'stone-tile': 1.2,
	'bath-tile': 0.6,
	plaster: 1.6,
	siding: 1.2,
	paving: 1.2,
	grass: 3,
	weave: 0.25,
	grain: 0.6
};

/** Paints textures on first use and keeps them until `dispose`. */
export class TextureSet {
	private readonly made = new Map<TextureName, CanvasTexture>();

	constructor(private readonly anisotropy: number) {}

	get(name: TextureName): Texture {
		let texture = this.made.get(name);
		if (!texture) {
			const recipe = RECIPES[name];
			texture = canvasTexture(recipe.size, recipe.paint, recipe.color);
			texture.anisotropy = this.anisotropy;
			this.made.set(name, texture);
		}
		return texture;
	}

	/** The same picture read as plain numbers (for a bump map), sharing the canvas. */
	data(name: TextureName): Texture {
		const source = this.get(name);
		const key = `${name}:data` as TextureName;
		let texture = this.made.get(key);
		if (!texture) {
			texture = source.clone() as CanvasTexture;
			texture.colorSpace = NoColorSpace;
			texture.needsUpdate = true;
			this.made.set(key, texture);
		}
		return texture;
	}

	dispose() {
		for (const texture of this.made.values()) texture.dispose();
		this.made.clear();
	}
}
