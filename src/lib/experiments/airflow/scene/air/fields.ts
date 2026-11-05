import { ClampToEdgeWrapping, Data3DTexture, DataUtils, FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, UnsignedByteType, Vector3 } from 'three';
import { FLOW_STRIDE, SCALAR_STRIDE, volumeExtent, type Volume } from '../../solver/volume';
import type { SolidMask } from './mask';

/**
 * The air as the GPU sees it: the two newest volume reads as 3D textures, blended from the older to the newer over the time
 * between reads (the session reads ten a second while the clock runs), and the solid mask. Every air shader reads the same
 * uniforms, so they are made once here and shared by reference.
 *
 * Each read is two textures. The velocity one is the volume's own `flow` (east, up and south in m/s, and the share of air), uploaded
 * as it came. The look one is what the ray-marches read in one fetch: the speed, the temperature (K above the reference), the
 * PM2.5 (ppm by mass) and the share of air. Both are filtered linearly, which 32-bit floats allow only with
 * `OES_texture_float_linear`; a GPU without it is given half floats.
 */

export interface FieldUniforms {
	uVelocityA: { value: Data3DTexture };
	uVelocityB: { value: Data3DTexture };
	uLookA: { value: Data3DTexture };
	uLookB: { value: Data3DTexture };
	uBlend: { value: number };
	/** The volume's size, m: a whole number of its cells, which may reach past the home by less than one. */
	uExtent: { value: Vector3 };
	uMask: { value: Data3DTexture };
	/** The solver's cells along x, y and z, and their size, m. */
	uCells: { value: Vector3 };
	uCellSize: { value: number };
	/** The home's box, m: its width, ceiling and depth. */
	uBox: { value: Vector3 };
}

/** The shortest and longest the blend from one read to the next may take, s, whatever the reads' rhythm. */
const BLEND_RANGE: [number, number] = [0.05, 0.5];

function volumeTexture(data: Float32Array | Uint16Array, width: number, height: number, depth: number, half: boolean) {
	const texture = new Data3DTexture(data, width, height, depth);
	texture.format = RGBAFormat;
	texture.type = half ? HalfFloatType : FloatType;
	texture.minFilter = texture.magFilter = LinearFilter;
	texture.wrapS = texture.wrapT = texture.wrapR = ClampToEdgeWrapping;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
	return texture;
}

function maskTexture(mask: SolidMask) {
	const texture = new Data3DTexture(mask.data, mask.width, mask.height, mask.depth);
	texture.format = RGBAFormat;
	texture.type = UnsignedByteType;
	texture.minFilter = texture.magFilter = NearestFilter;
	texture.wrapS = texture.wrapT = texture.wrapR = ClampToEdgeWrapping;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
	return texture;
}

/** One volume read on the GPU, and the arrays behind it (the look array is reused for the next read into this slot). */
interface Slot {
	velocity: Data3DTexture;
	look: Data3DTexture;
	lookData: Float32Array;
}

/** The look of a volume: speed, temperature, PM2.5 and air, four numbers per cell. */
export function lookOf(volume: Volume, out?: Float32Array) {
	const cells = volume.nx * volume.ny * volume.nz;
	const look = out && out.length === 4 * cells ? out : new Float32Array(4 * cells);
	const { flow, scalars } = volume;
	for (let n = 0; n < cells; n++) {
		const f = FLOW_STRIDE * n;
		const s = SCALAR_STRIDE * n;
		look[4 * n] = Math.sqrt(flow[f] * flow[f] + flow[f + 1] * flow[f + 1] + flow[f + 2] * flow[f + 2]);
		look[4 * n + 1] = scalars[s];
		look[4 * n + 2] = scalars[s + 1];
		look[4 * n + 3] = flow[f + 3];
	}
	return look;
}

const toHalf = (data: Float32Array) => {
	const out = new Uint16Array(data.length);
	for (let n = 0; n < data.length; n++) out[n] = DataUtils.toHalfFloat(data[n]);
	return out;
};

export class AirFields {
	readonly uniforms: FieldUniforms;
	/** The newest volume, the one blended toward. */
	newest: Volume | null = null;
	/** The volume before it. */
	older: Volume | null = null;
	private slots: [Slot, Slot] | null = null;
	/** Which slot holds the newest read. */
	private head: 0 | 1 = 0;
	private half = false;
	private arrived = 0;
	private interval = 0.1;
	private mask: Data3DTexture | null = null;
	private readonly empty: Data3DTexture;
	private readonly emptyMask: Data3DTexture;

	constructor() {
		this.empty = volumeTexture(new Float32Array(4), 1, 1, 1, false);
		this.emptyMask = maskTexture({ width: 1, height: 1, depth: 1, h: 1, data: new Uint8Array(4) });
		this.uniforms = {
			uVelocityA: { value: this.empty },
			uVelocityB: { value: this.empty },
			uLookA: { value: this.empty },
			uLookB: { value: this.empty },
			uBlend: { value: 1 },
			uExtent: { value: new Vector3(1, 1, 1) },
			uMask: { value: this.emptyMask },
			uCells: { value: new Vector3(1, 1, 1) },
			uCellSize: { value: 1 },
			uBox: { value: new Vector3(1, 1, 1) }
		};
	}

	/** Whether there is a volume to draw. */
	get ready() {
		return this.newest !== null;
	}

	/**
	 * Floats are filtered only with `OES_texture_float_linear`; without it the volumes go up as half floats. Settled once the
	 * renderer is known, and any volume already up is sent again.
	 */
	useHalfFloats(half: boolean) {
		if (half === this.half) return;
		this.half = half;
		const [older, newest] = [this.older, this.newest];
		this.disposeSlots();
		if (newest) {
			this.push(older ?? newest, 0);
			if (older) this.push(newest, 0);
		}
	}

	/** Takes a new volume read, made at `now` (real seconds). The blend restarts from the read before it. */
	push(volume: Volume, now: number) {
		const fresh = !this.slots || !this.newest || this.newest.nx !== volume.nx || this.newest.ny !== volume.ny || this.newest.nz !== volume.nz || this.newest.h !== volume.h;
		if (fresh) {
			this.disposeSlots();
			const look = lookOf(volume);
			const make = (): Slot => ({
				velocity: volumeTexture(this.half ? toHalf(volume.flow) : volume.flow, volume.nx, volume.ny, volume.nz, this.half),
				look: volumeTexture(this.half ? toHalf(look) : look, volume.nx, volume.ny, volume.nz, this.half),
				lookData: new Float32Array(look)
			});
			this.slots = [make(), make()];
			this.head = 0;
			this.older = volume;
			this.newest = volume;
			this.arrived = now;
			const [ex, ey, ez] = volumeExtent(volume);
			this.uniforms.uExtent.value.set(ex, ey, ez);
		} else {
			const next = (1 - this.head) as 0 | 1;
			const slot = this.slots![next];
			lookOf(volume, slot.lookData);
			slot.velocity.image.data = this.half ? toHalf(volume.flow) : volume.flow;
			slot.look.image.data = this.half ? toHalf(slot.lookData) : slot.lookData;
			slot.velocity.needsUpdate = true;
			slot.look.needsUpdate = true;
			this.head = next;
			this.older = this.newest;
			this.newest = volume;
			const gap = now - this.arrived;
			if (gap > 0) this.interval = Math.min(BLEND_RANGE[1], Math.max(BLEND_RANGE[0], 0.5 * this.interval + 0.5 * gap));
			this.arrived = now;
		}
		const newer = this.slots![this.head];
		const older = this.slots![1 - this.head];
		this.uniforms.uVelocityA.value = older.velocity;
		this.uniforms.uLookA.value = older.look;
		this.uniforms.uVelocityB.value = newer.velocity;
		this.uniforms.uLookB.value = newer.look;
		this.uniforms.uBlend.value = fresh ? 1 : 0;
	}

	/** Moves the blend on to `now`, real seconds. Returns the blend, 0 (the older read) to 1 (the newer). */
	tick(now: number) {
		const blend = Math.min(1, Math.max(0, (now - this.arrived) / this.interval));
		this.uniforms.uBlend.value = blend;
		return blend;
	}

	/** Puts up the solid mask for the grid `cells` of the given size, m, in the home's `box`. */
	setMask(mask: SolidMask, box: { width: number; ceiling: number; depth: number }) {
		const current = this.mask;
		if (current && current.image.width === mask.width && current.image.height === mask.height && current.image.depth === mask.depth) {
			current.image.data = mask.data;
			current.needsUpdate = true;
		} else {
			current?.dispose();
			this.mask = maskTexture(mask);
		}
		this.uniforms.uMask.value = this.mask!;
		this.uniforms.uCells.value.set(mask.width - 1, mask.height - 1, mask.depth - 1);
		this.uniforms.uCellSize.value = mask.h;
		this.uniforms.uBox.value.set(box.width, box.ceiling, box.depth);
	}

	/** Forgets the volumes (another world is coming): nothing is drawn until the next read. */
	clear() {
		this.disposeSlots();
		this.newest = this.older = null;
	}

	private disposeSlots() {
		if (!this.slots) return;
		for (const slot of this.slots) {
			slot.velocity.dispose();
			slot.look.dispose();
		}
		this.slots = null;
		this.uniforms.uVelocityA.value = this.uniforms.uVelocityB.value = this.empty;
		this.uniforms.uLookA.value = this.uniforms.uLookB.value = this.empty;
	}

	dispose() {
		this.disposeSlots();
		this.mask?.dispose();
		this.mask = null;
		this.empty.dispose();
		this.emptyMask.dispose();
	}
}

