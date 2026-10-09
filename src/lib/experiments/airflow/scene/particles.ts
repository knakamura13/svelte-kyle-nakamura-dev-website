import {
	BufferGeometry,
	DynamicDrawUsage,
	InterleavedBuffer,
	InterleavedBufferAttribute,
	NormalBlending,
	Points,
	ShaderMaterial,
	Vector2,
	type DataTexture,
	type WebGLRenderer
} from 'three';
import { PALETTE_GLSL, scaleMapping, type ScaleOptions } from '../viz/palettes';
import { RENDER_ORDER, paletteTexture } from './sliceLayer';

/** The most tracers the page may ask for. */
export const MAX_TRACERS = 60_000;

/**
 * Four floats per particle, exactly as a snapshot holds them (x, y, z in metres, then the value), in one interleaved
 * buffer read as `position` and `aValue`. The buffer is reused; each update uploads only the particles drawn.
 */
class ParticleBuffer {
	geometry: BufferGeometry;
	private buffer: InterleavedBuffer;
	private readonly range = { start: 0, count: 0 };

	constructor(capacity: number) {
		this.buffer = new InterleavedBuffer(new Float32Array(4 * capacity), 4);
		this.geometry = this.build();
	}

	get capacity() {
		return this.buffer.count;
	}

	private build() {
		this.buffer.setUsage(DynamicDrawUsage);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new InterleavedBufferAttribute(this.buffer, 3, 0));
		geometry.setAttribute('aValue', new InterleavedBufferAttribute(this.buffer, 1, 3));
		geometry.setDrawRange(0, 0);
		return geometry;
	}

	/** Makes room for `capacity` particles. Allocates, so it belongs to a count change, never to a frame. */
	grow(capacity: number) {
		if (capacity <= this.capacity) return false;
		this.geometry.dispose();
		this.buffer = new InterleavedBuffer(new Float32Array(4 * capacity), 4);
		this.geometry = this.build();
		return true;
	}

	/** Copies up to `limit` particles from `source` and draws that many. */
	fill(source: Float32Array, limit: number) {
		const data = this.buffer.array as Float32Array;
		const count = Math.min(limit, this.capacity, Math.floor(source.length / 4));
		if (source.length <= data.length) data.set(source);
		else for (let i = 0; i < 4 * count; i++) data[i] = source[i];
		this.geometry.setDrawRange(0, count);
		if (count === 0) return;
		// One reused range, so nothing is allocated; a range of length 0 would mean "to the end" to WebGL.
		this.buffer.clearUpdateRanges();
		this.range.count = 4 * count;
		this.buffer.updateRanges.push(this.range);
		this.buffer.needsUpdate = true;
	}
}

/** Point size in pixels: a world size, attenuated with distance, clamped to a range of device pixels. */
const SIZE_GLSL = /* glsl */ `
uniform float uSize;
uniform float uHalfHeight;
uniform vec2 uPixels;

float pointPixels(vec4 view) {
	float pixels = uSize * projectionMatrix[1][1] * uHalfHeight / (isOrthographic ? 1.0 : max(-view.z, 1e-3));
	return clamp(pixels, uPixels.x, uPixels.y);
}
`;

// A type alias rather than an interface, so it fits ShaderMaterial's indexed uniforms.
type SizeUniforms = {
	uSize: { value: number };
	uHalfHeight: { value: number };
	uPixels: { value: Vector2 };
};

/** Keeps the size uniforms in step with the drawing buffer, every frame, without allocating. */
function trackSize(points: Points, uniforms: SizeUniforms, cssPixels: [number, number]) {
	const drawing = new Vector2();
	points.onBeforeRender = (renderer: WebGLRenderer) => {
		renderer.getDrawingBufferSize(drawing);
		const ratio = renderer.getPixelRatio();
		uniforms.uHalfHeight.value = drawing.y / 2;
		uniforms.uPixels.value.set(cssPixels[0] * ratio, cssPixels[1] * ratio);
	};
}

const tracerVertex = /* glsl */ `
attribute float aValue;
varying vec3 vColor;
varying float vPixels;
${PALETTE_GLSL}
${SIZE_GLSL}

void main() {
	vec4 view = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * view;
	vPixels = pointPixels(view);
	gl_PointSize = vPixels;
	vColor = paletteColor(max(TRACER_FLOOR, scaleFraction(aValue)));
}
`;

const tracerFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vPixels;

void main() {
	// Coverage of a round dot of radius vPixels / 2 at this pixel: crisp edges at every size, even 1.5 px.
	float radius = 0.5 * vPixels;
	float alpha = clamp(radius * (1.0 - 2.0 * length(gl_PointCoord - 0.5)) + 0.5, 0.0, 1.0);
	if (alpha < 0.02) discard;
	gl_FragColor = sRGBTransferEOTF(vec4(vColor, uOpacity * alpha));
	#include <colorspace_fragment>
}
`;

/**
 * The tiny dots that drift through the room with the air, colored by the local speed with the speed palette (from
 * blue step 350 up, so slow dots stay visible). 1.5 to 6 px whatever the distance.
 */
export class TracerPoints {
	readonly points: Points<BufferGeometry, ShaderMaterial>;
	private readonly particles: ParticleBuffer;
	private readonly palette: DataTexture;
	private readonly uniforms: SizeUniforms & {
		uPalette: { value: DataTexture };
		uMapping: { value: Vector2 };
		uOpacity: { value: number };
	};
	private count: number;

	constructor(count = 20_000) {
		this.count = Math.min(MAX_TRACERS, Math.max(0, Math.floor(count)));
		this.particles = new ParticleBuffer(this.count);
		this.palette = paletteTexture('speed');
		this.uniforms = {
			uPalette: { value: this.palette },
			uMapping: { value: new Vector2(1, 0) },
			uOpacity: { value: 0.88 },
			uSize: { value: 0.02 },
			uHalfHeight: { value: 400 },
			uPixels: { value: new Vector2(1.5, 6) }
		};
		const material = new ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: tracerVertex,
			fragmentShader: tracerFragment,
			transparent: true,
			depthWrite: false,
			blending: NormalBlending
		});
		this.points = new Points(this.particles.geometry, material);
		this.points.frustumCulled = false;
		this.points.renderOrder = RENDER_ORDER.tracers;
		trackSize(this.points, this.uniforms, [1.5, 6]);
	}

	/** How many tracers to draw, up to MAX_TRACERS, so the page can scale them to the GPU. */
	setCount(count: number) {
		this.count = Math.min(MAX_TRACERS, Math.max(0, Math.floor(count)));
		if (this.particles.grow(this.count)) this.points.geometry = this.particles.geometry;
	}

	/** `array` is a snapshot's tracers: x, y, z and speed (m/s) for each. */
	update(array: Float32Array, options: ScaleOptions) {
		const mapping = scaleMapping('speed', options);
		this.uniforms.uMapping.value.set(mapping.scale, mapping.offset);
		this.particles.fill(array, this.count);
	}

	setVisible(on: boolean) {
		this.points.visible = on;
	}

	dispose() {
		this.particles.geometry.dispose();
		this.points.material.dispose();
		this.palette.dispose();
	}
}

/** Smoke shows from this many decades below the dense concentration up to it. */
const SMOKE_DECADES = 2.5;

const smokeVertex = /* glsl */ `
attribute float aValue;
uniform float uDenseLog;
varying float vDensity;
varying float vPixels;
${SIZE_GLSL}

void main() {
	vDensity = clamp((log2(max(aValue, 1e-12)) * 0.30102999566 - uDenseLog) / ${SMOKE_DECADES.toFixed(1)} + 1.0, 0.0, 1.0);
	if (vDensity <= 0.0) {
		// No smoke here: off screen, so it costs no fragments.
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		gl_PointSize = 0.0;
		return;
	}
	vec4 view = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * view;
	vPixels = pointPixels(view);
	gl_PointSize = vPixels;
}
`;

const smokeFragment = /* glsl */ `
uniform vec3 uThin;
uniform vec3 uDense;
uniform float uOpacity;
varying float vDensity;
varying float vPixels;

void main() {
	vec2 p = 2.0 * gl_PointCoord - 1.0;
	float r2 = dot(p, p);
	if (r2 >= 1.0) discard;
	float falloff = (1.0 - r2) * (1.0 - r2);
	float alpha = uOpacity * pow(vDensity, 1.4) * falloff;
	if (alpha < 0.004) discard;
	gl_FragColor = sRGBTransferEOTF(vec4(mix(uThin, uDense, vDensity), alpha));
	#include <colorspace_fragment>
}
`;

const srgb = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255] as const;

/**
 * Soft puffs where there is smoke: warm white where it is thin, light gray where it is dense, and their opacity follows
 * the concentration on a log scale, from invisible 2.5 decades below `dense` to nearly opaque at it.
 */
export class SmokePoints {
	readonly points: Points<BufferGeometry, ShaderMaterial>;
	private readonly particles: ParticleBuffer;
	private readonly uniforms: SizeUniforms & {
		uDenseLog: { value: number };
		uThin: { value: Vector3Like };
		uDense: { value: Vector3Like };
		uOpacity: { value: number };
	};

	constructor(capacity = 20_000) {
		this.particles = new ParticleBuffer(Math.max(0, Math.floor(capacity)));
		this.uniforms = {
			uDenseLog: { value: 0 },
			uThin: { value: srgb(0xf4efe6) },
			uDense: { value: srgb(0xb3ada4) },
			uOpacity: { value: 0.6 },
			uSize: { value: 0.22 },
			uHalfHeight: { value: 400 },
			uPixels: { value: new Vector2(2, 64) }
		};
		const material = new ShaderMaterial({
			uniforms: this.uniforms,
			vertexShader: smokeVertex,
			fragmentShader: smokeFragment,
			transparent: true,
			depthWrite: false,
			blending: NormalBlending
		});
		this.points = new Points(this.particles.geometry, material);
		this.points.frustumCulled = false;
		this.points.renderOrder = RENDER_ORDER.smoke;
		trackSize(this.points, this.uniforms, [2, 64]);
	}

	/** `array` is a snapshot's smoke: x, y, z and concentration (ppm) for each. `dense` is the ppm that reads as thick smoke. */
	update(array: Float32Array, options: { dense: number }) {
		this.uniforms.uDenseLog.value = Math.log10(Math.max(options.dense, 1e-9));
		this.particles.fill(array, this.particles.capacity);
	}

	setVisible(on: boolean) {
		this.points.visible = on;
	}

	dispose() {
		this.particles.geometry.dispose();
		this.points.material.dispose();
	}
}

type Vector3Like = readonly [number, number, number];
