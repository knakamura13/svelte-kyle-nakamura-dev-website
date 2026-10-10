import {
	ClampToEdgeWrapping,
	DataTexture,
	DoubleSide,
	FloatType,
	LinearFilter,
	Mesh,
	NearestFilter,
	PlaneGeometry,
	RGBAFormat,
	RepeatWrapping,
	ShaderMaterial,
	UnsignedByteType,
	Vector2
} from 'three';
import type { Slice } from '../solver/types';
import type { LayerId } from '../state';
import { LUT_SIZE, PALETTES, PALETTE_GLSL, isCyclic, scaleMapping, type ScaleOptions } from '../viz/palettes';

/**
 * Draw order among transparent objects: the slice, which writes depth so particles behind it are hidden rather than
 * drawn over it; then the arrows; then the particles. The dollhouse's opaque pieces draw at 0 and its faded walls at
 * `FADED_ORDER` (20 in `dollhouse.ts`), after all of these, so a wall between the camera and the slice tints what is
 * behind it. Keep any new layer below 20.
 */
export const RENDER_ORDER = { slice: 10, arrows: 11, tracers: 12, smoke: 13 } as const;

/** Overall opacity of the slice, so the dollhouse reads through it. */
export const SLICE_OPACITY = 0.82;

/** A layer's palette as a texture: 256 × 1 RGBA8, linearly filtered, wrapping only for the direction loop. */
export function paletteTexture(layer: LayerId) {
	const texture = new DataTexture(PALETTES[layer], LUT_SIZE, 1, RGBAFormat, UnsignedByteType);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.wrapS = isCyclic(layer) ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

/** The slice's values at a point, for the hover readout. */
export interface SliceSample {
	/** Velocity east, up and south, and speed, m/s. */
	u: number;
	v: number;
	w: number;
	speed: number;
	/** K above the solver's reference. */
	theta: number;
	/** ppm by mass. */
	particulates: number;
	/** Whether the cell under the point holds air (not furniture, not outside the plan). */
	air: boolean;
}

export const emptySample = (): SliceSample => ({ u: 0, v: 0, w: 0, speed: 0, theta: 0, particulates: 0, air: false });

function gather(out: SliceSample, slice: Slice, index: number, weight: number) {
	if (!slice.fluid[index] || weight <= 0) return 0;
	out.u += weight * slice.u[index];
	out.v += weight * slice.v[index];
	out.w += weight * slice.w[index];
	out.speed += weight * slice.speed[index];
	out.theta += weight * slice.theta[index];
	out.particulates += weight * slice.particulates[index];
	return weight;
}

/**
 * The slice's values at (x, z) in metres: bilinear between cell centres, over only the neighbours that hold air, so
 * furniture never drags a reading toward zero. Outside the air every value is zero and `air` is false. Pass `out` to
 * reuse an object.
 */
export function sampleAt(slice: Slice, x: number, z: number, out: SliceSample = emptySample()): SliceSample {
	const { nx, nz, h } = slice;
	const ci = Math.floor(x / h);
	const ck = Math.floor(z / h);
	out.u = out.v = out.w = out.speed = out.theta = out.particulates = 0;
	out.air = ci >= 0 && ck >= 0 && ci < nx && ck < nz && slice.fluid[ci + nx * ck] === 1;
	if (!out.air) return out;
	const gx = Math.min(nx - 1, Math.max(0, x / h - 0.5));
	const gz = Math.min(nz - 1, Math.max(0, z / h - 0.5));
	const i0 = Math.floor(gx);
	const k0 = Math.floor(gz);
	const i1 = Math.min(i0 + 1, nx - 1);
	const k1 = Math.min(k0 + 1, nz - 1);
	const fx = gx - i0;
	const fz = gz - k0;
	// The cell under the point is one of the four and carries at least a quarter of the weight, so the total is never 0.
	const total =
		gather(out, slice, i0 + nx * k0, (1 - fx) * (1 - fz)) +
		gather(out, slice, i1 + nx * k0, fx * (1 - fz)) +
		gather(out, slice, i0 + nx * k1, (1 - fx) * fz) +
		gather(out, slice, i1 + nx * k1, fx * fz);
	out.u /= total;
	out.v /= total;
	out.w /= total;
	out.speed /= total;
	out.theta /= total;
	out.particulates /= total;
	return out;
}

const vertexShader = /* glsl */ `
varying vec2 vPlane;

void main() {
	vPlane = position.xz;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Filters by hand with texelFetch rather than with the texture unit: that needs no float-linear extension, and it
 * weights only cells that hold air, where hardware filtering would blend the zeros of furniture into the readings.
 */
const fragmentShader = /* glsl */ `
uniform highp sampler2D uField;
uniform vec2 uCells;
uniform float uCellSize;
uniform float uOpacity;
uniform float uDirection;
varying vec2 vPlane;
${PALETTE_GLSL}

vec4 cellAt(ivec2 c) {
	return texelFetch(uField, clamp(c, ivec2(0), ivec2(uCells) - 1), 0);
}

void main() {
	vec2 g = vPlane / uCellSize - 0.5;
	vec2 corner = floor(g);
	vec2 f = g - corner;
	ivec2 c = ivec2(corner);
	vec4 c00 = cellAt(c);
	vec4 c10 = cellAt(c + ivec2(1, 0));
	vec4 c01 = cellAt(c + ivec2(0, 1));
	vec4 c11 = cellAt(c + ivec2(1, 1));
	vec4 weight = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) * vec4(c00.w, c10.w, c01.w, c11.w);
	float air = weight.x + weight.y + weight.z + weight.w;
	// The share of air crosses one half on a cell boundary: an antialiased edge there, about a pixel wide.
	float edge = max(fwidth(air), 1e-4);
	float alpha = smoothstep(0.5 - edge, 0.5 + edge, air);
	if (alpha < 0.004) discard;
	weight /= max(air, 1e-6);
	vec3 color;
	if (uDirection > 0.5) {
		vec2 flow = weight.x * c00.xy + weight.y * c10.xy + weight.z * c01.xy + weight.w * c11.xy;
		color = headingColor(flow.x, flow.y);
	} else {
		// Interpolating the scale position, not the value, keeps a log scale smooth between cells.
		vec4 t = vec4(scaleFraction(c00.z), scaleFraction(c10.z), scaleFraction(c01.z), scaleFraction(c11.z));
		color = paletteColor(dot(weight, t));
	}
	gl_FragColor = sRGBTransferEOTF(vec4(color, uOpacity * alpha));
	#include <colorspace_fragment>
}
`;

/**
 * The horizontal slice plane: one layer of a `Slice` as a heatmap over the plan's footprint, x from 0 to `width` and
 * z from 0 to `depth` metres. The slice is uploaded as one RGBA float texture (east, south, the layer's value, air)
 * and colored in the shader from the layer's palette. Cells that are not air are transparent.
 */
export class SliceLayer {
	readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
	private readonly palettes: Record<LayerId, DataTexture>;
	private readonly uniforms: {
		uField: { value: DataTexture };
		uCells: { value: Vector2 };
		uCellSize: { value: number };
		uOpacity: { value: number };
		uDirection: { value: number };
		uPalette: { value: DataTexture };
		uMapping: { value: Vector2 };
	};
	private field: DataTexture;
	private data: Float32Array;
	private slice: Slice | null = null;
	private layer: LayerId | null = null;

	constructor(width: number, depth: number) {
		const geometry = new PlaneGeometry(width, depth);
		geometry.rotateX(-Math.PI / 2);
		geometry.translate(width / 2, 0, depth / 2);
		this.palettes = {
			speed: paletteTexture('speed'),
			direction: paletteTexture('direction'),
			particulates: paletteTexture('particulates'),
			temperature: paletteTexture('temperature')
		};
		// Until the first slice arrives, one cell with no air: the plane draws nothing.
		this.data = new Float32Array(4);
		this.field = SliceLayer.fieldTexture(this.data, 1, 1);
		this.uniforms = {
			uField: { value: this.field },
			uCells: { value: new Vector2(1, 1) },
			uCellSize: { value: 1 },
			uOpacity: { value: SLICE_OPACITY },
			uDirection: { value: 0 },
			uPalette: { value: this.palettes.speed },
			uMapping: { value: new Vector2(1, 0) }
		};
		const material = new ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: true,
			side: DoubleSide
		});
		this.mesh = new Mesh(geometry, material);
		this.mesh.renderOrder = RENDER_ORDER.slice;
	}

	private static fieldTexture(data: Float32Array, width: number, height: number) {
		const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
		texture.magFilter = NearestFilter;
		texture.minFilter = NearestFilter;
		texture.generateMipmaps = false;
		texture.needsUpdate = true;
		return texture;
	}

	/** Shows `layer` of `slice`. Cheap to call every frame: the slice is only uploaded when it or the layer changed. */
	update(slice: Slice, layer: LayerId, options: ScaleOptions) {
		const mapping = scaleMapping(layer, options);
		this.uniforms.uMapping.value.set(mapping.scale, mapping.offset);
		this.uniforms.uDirection.value = layer === 'direction' ? 1 : 0;
		this.uniforms.uPalette.value = this.palettes[layer];
		if (slice === this.slice && layer === this.layer) return;
		this.slice = slice;
		this.layer = layer;
		this.upload(slice, layer);
	}

	private upload(slice: Slice, layer: LayerId) {
		const cells = slice.nx * slice.nz;
		if (this.field.image.width !== slice.nx || this.field.image.height !== slice.nz) {
			this.field.dispose();
			this.data = new Float32Array(4 * cells);
			this.field = SliceLayer.fieldTexture(this.data, slice.nx, slice.nz);
			this.uniforms.uField.value = this.field;
			this.uniforms.uCells.value.set(slice.nx, slice.nz);
		}
		this.uniforms.uCellSize.value = slice.h;
		const scalar = layer === 'temperature' ? slice.theta : layer === 'particulates' ? slice.particulates : slice.speed;
		const log = layer === 'particulates';
		const data = this.data;
		for (let n = 0; n < cells; n++) {
			data[4 * n] = slice.u[n];
			data[4 * n + 1] = slice.w[n];
			// The particulate scale is logarithmic, so the value goes up already in that space.
			data[4 * n + 2] = log ? Math.log10(Math.max(scalar[n], 1e-12)) : scalar[n];
			data[4 * n + 3] = slice.fluid[n];
		}
		this.field.needsUpdate = true;
	}

	/** Height of the plane above the floor, m. */
	setHeight(y: number) {
		this.mesh.position.y = y;
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.field.dispose();
		for (const texture of Object.values(this.palettes)) texture.dispose();
	}
}
