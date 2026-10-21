import {
	BufferAttribute,
	Color,
	DoubleSide,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	NormalBlending,
	SRGBColorSpace,
	ShaderMaterial,
	Vector2,
	type DataTexture,
	type Texture,
	type WebGLRenderer
} from 'three';
import type { Raster } from '../../homes/rasterize';
import type { Volume } from '../../solver/volume';
import type { OverlayId } from '../../state';
import { PALETTE_GLSL } from '../../viz/palettes';
import type { QualityTier } from '../look/quality';
import { paletteTexture } from './palette';
import { STREAK_BIRTHS, drawBirths, streakWeights } from './birth';
import type { AirFields } from './fields';
import { MASK_GLSL, VOLUME_GLSL } from './glsl';
import { STREAK_AIR, overlayMapping, type OverlayKind } from './legend';
import { ParticleField } from './particles';

/**
 * The streaks: thousands of particles carried through the whole room by the simulated air (`particles.ts`), each drawn as a thin
 * ribbon from where it is back along the air it came through, `TAIL` seconds of it, so it bends with the flow; it narrows and fades
 * from its head to its tail and is soft at its edges. Each fades in when it is born and out before it dies, and with the air's
 * speed, so still air shows nothing: everything that moves on screen is the solver's air. They are born where the air moves and at
 * the windows that let air in (`birth.ts`). With no overlay on they are all the air's own blue; an overlay colours each point of a
 * streak by its quantity there (air speed, temperature or PM2.5) on that overlay's palette, which is what its legend shows.
 */

/** How many streaks each quality tier draws. */
export const STREAK_COUNTS: Readonly<Record<QualityTier, number>> = { high: 15_000, medium: 8_000, low: 3_000 };

/** Seconds of travel a streak's tail shows, and the longest it gets, m. */
export const TAIL = 0.5;
const MAX_LENGTH = 0.9;
/**
 * A streak's width, m, as drawn near; it never draws thinner than 1.6 CSS pixels or wider than 4 (scaled by the pixel ratio). The low
 * tier (a phone) draws a third as many, on a screen drawn at fewer pixels than it has, so each is wider, or the air is a faint speckle.
 */
const WIDTH = 0.014;
export const STREAK_PIXELS: Readonly<Record<QualityTier, readonly [number, number]>> = { high: [1.6, 4], medium: [1.6, 4], low: [2.6, 5.5] };
const PIXELS = STREAK_PIXELS.high;
/** Speeds over which a streak fades in, m/s: still air shows nothing, the slow drift of a room shows faintly, a draught fully. */
const SPEED_FADE: [number, number] = [0.02, 0.35];
/** Lives, s, and the fades at each end. */
const LIFE: [number, number] = [2.2, 5.5];
const FADE_IN = 0.35;
const FADE_OUT = 0.6;
/** Births drawn each time a volume arrives. */
const POOL_WIDTH = 64;

/** Segments along a streak: its tail is traced back through the air in this many steps, so it bends with the flow. */
export const SEGMENTS = 8;

const VERTEX = /* glsl */ `
uniform highp sampler2D uState;
uniform highp sampler2D uExtra;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uTail;
uniform float uMaxLength;
uniform float uWidth;
uniform vec2 uPixels;
uniform vec2 uSpeedFade;
uniform float uFadeIn;
uniform float uFadeOut;
uniform float uOpacity;
uniform float uColored;
uniform vec3 uAirColor;
uniform float uChannel;
uniform float uLog;
attribute float aParticle;
varying vec2 vQuad;
varying float vAlpha;
varying vec3 vColor;
${VOLUME_GLSL}
${MASK_GLSL}
${PALETTE_GLSL}

const int SEGMENTS = ${SEGMENTS};

vec3 toLinear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void hide() {
	gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
	vAlpha = 0.0;
}

void main() {
	int width = textureSize(uState, 0).x;
	int index = int(aParticle);
	ivec2 at = ivec2(index % width, index / width);
	vec4 state = texelFetch(uState, at, 0);
	vec4 extra = texelFetch(uExtra, at, 0);
	vec3 head = state.xyz;
	float age = state.w;
	float life = extra.x;
	if (extra.y < 0.5) {
		hide();
		return;
	}
	vec3 velocity = airVelocity(head);
	float speed = length(velocity);
	float alpha = uOpacity * smoothstep(0.0, uFadeIn, age) * smoothstep(0.0, uFadeOut, life - age) * smoothstep(uSpeedFade.x, uSpeedFade.y, speed);
	// Written so that a NaN (a particle's state gone bad) hides the streak too: a comparison with NaN is false.
	if (!(alpha >= 0.004)) {
		hide();
		return;
	}
	// This vertex's point: traced back from the head through the air (midpoint rule, never through a wall) for its share of the
	// tail, which is no longer than the streak has lived or than uMaxLength. So a tail bends with the flow it came along.
	float back = position.x * min(min(uTail, age), uMaxLength / max(speed, 1e-3));
	int steps = int(ceil(position.x * float(SEGMENTS) - 0.001));
	float h = back / max(float(steps), 1.0);
	vec3 p = head;
	for (int i = 0; i < SEGMENTS; i++) {
		if (i >= steps) break;
		vec3 v = airVelocity(p);
		p = constrain(p, p - h * airVelocity(p - 0.5 * h * v));
	}
	vec3 v = airVelocity(p);
	float pointSpeed = length(v);
	vec3 ahead = p + v / max(pointSpeed, 1e-4) * 0.02;
	vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
	vec4 aheadClip = projectionMatrix * viewMatrix * vec4(ahead, 1.0);
	// A streak that reaches behind the camera is not drawn rather than drawn inside out.
	if (clip.w < 0.05 || aheadClip.w < 0.05) {
		hide();
		return;
	}
	vec2 halfSize = 0.5 * uResolution;
	vec2 delta = (aheadClip.xy / aheadClip.w - clip.xy / clip.w) * halfSize;
	float span = sqrt(dot(delta, delta));
	vec2 along = span > 1e-4 ? delta / span : vec2(1.0, 0.0);
	vec2 side = vec2(-along.y, along.x);
	// The width the streak would have, in device pixels, narrowing to the tail; below the narrowest drawn it is drawn that wide and fainter instead.
	float pixels = uWidth * mix(1.0, 0.45, position.x) * projectionMatrix[1][1] * halfSize.y / clip.w;
	float drawn = clamp(pixels, uPixels.x * uPixelRatio, uPixels.y * uPixelRatio);
	alpha *= clamp(pixels / drawn, 0.3, 1.0);
	// Above the widest drawn it is drawn that wide and fainter too, and it fades out within a metre of the eye: close to the camera
	// (a visitor standing in a room) the air is a light veil rather than a curtain of lines across the view.
	alpha *= clamp(drawn / pixels, 0.35, 1.0) * smoothstep(0.35, 1.2, clip.w);
	// The head and the tail reach out by half the width, so a short streak is a round dot rather than nothing.
	float cap = position.x < 0.001 ? 1.0 : (position.x > 0.999 ? -1.0 : 0.0);
	clip.xy += (side * position.y + along * cap) * 0.5 * drawn / halfSize * clip.w;
	gl_Position = clip;
	vQuad = vec2(1.0 - position.x, position.y);
	vAlpha = alpha;
	// The overlay's quantity at this point of the streak on the overlay's palette (streakColor in legend.ts), or the air's own colour.
	if (uColored > 0.5) {
		float value = uChannel < 0.5 ? pointSpeed : (uChannel < 1.5 ? airLook(p).g : airLook(p).b);
		float x = uLog > 0.5 ? log2(max(value, 1e-30)) * 0.30102999566 : value;
		vColor = toLinear(paletteColor(scaleFraction(x)));
	} else vColor = uAirColor;
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vQuad;
varying float vAlpha;
varying vec3 vColor;

void main() {
	// Soft across, and fading from the head back to the tail. At the tail vQuad.x is 0, and interpolated it can come out a hair
	// below: pow of a negative number is NaN, and one NaN pixel, blurred by the bloom, blanks the whole picture. So it is clamped,
	// and anything that is not a number is discarded.
	float across = 1.0 - smoothstep(0.25, 1.0, abs(vQuad.y));
	float alpha = vAlpha * across * pow(clamp(vQuad.x, 0.0, 1.0), 1.6);
	if (!(alpha >= 0.002)) discard;
	gl_FragColor = vec4(vColor, alpha);
	#include <colorspace_fragment>
}
`;

export class Streaks {
	readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
	field: ParticleField;
	private readonly palettes: Record<OverlayKind, DataTexture>;
	private readonly resolution = new Vector2();

	constructor(
		count: number,
		private readonly fields: AirFields,
		private precise = true
	) {
		this.field = this.makeField(count);
		this.palettes = { speed: paletteTexture('speed'), temperature: paletteTexture('temperature'), smoke: paletteTexture('particulates') };
		const material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: {
				...fields.uniforms,
				uState: { value: this.field.state },
				uExtra: { value: this.field.extra },
				uResolution: { value: this.resolution },
				uPixelRatio: { value: 1 },
				uTail: { value: TAIL },
				uMaxLength: { value: MAX_LENGTH },
				uWidth: { value: WIDTH },
				uPixels: { value: new Vector2(...PIXELS) },
				uSpeedFade: { value: new Vector2(...SPEED_FADE) },
				uFadeIn: { value: FADE_IN },
				uFadeOut: { value: FADE_OUT },
				uOpacity: { value: 0.85 },
				uColored: { value: 0 },
				uAirColor: { value: new Color().setRGB(...STREAK_AIR, SRGBColorSpace) },
				uChannel: { value: 0 },
				uLog: { value: 0 },
				uPalette: { value: this.palettes.speed as Texture },
				uMapping: { value: new Vector2(1, 0) }
			},
			transparent: true,
			depthWrite: false,
			blending: NormalBlending,
			side: DoubleSide,
			toneMapped: false
		});
		material.allowOverride = false;
		this.mesh = new Mesh(this.geometry(this.field.count), material);
		this.mesh.frustumCulled = false;
		this.mesh.onBeforeRender = (renderer) => {
			renderer.getDrawingBufferSize(this.resolution);
			material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
		};
	}

	private makeField(count: number) {
		return new ParticleField({ count, life: LIFE, fadeOut: FADE_OUT, outside: 0.7, poolWidth: POOL_WIDTH }, this.fields.uniforms, this.precise);
	}

	/** One strip per streak: SEGMENTS + 1 pairs of vertices from the head (x = 0) to the tail (x = 1), one each side (y = ±1). */
	private geometry(count: number) {
		const geometry = new InstancedBufferGeometry();
		const positions: number[] = [];
		const indices: number[] = [];
		for (let k = 0; k <= SEGMENTS; k++) {
			positions.push(k / SEGMENTS, -1, 0, k / SEGMENTS, 1, 0);
			if (k < SEGMENTS) indices.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
		}
		geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
		geometry.setIndex(indices);
		geometry.setAttribute('aParticle', new InstancedBufferAttribute(Float32Array.from({ length: count }, (_, n) => n), 1));
		geometry.instanceCount = count;
		return geometry;
	}

	get count() {
		return this.field.count;
	}

	/** The narrowest and widest a streak is drawn, CSS pixels. */
	setPixels([narrowest, widest]: readonly [number, number]) {
		this.mesh.material.uniforms.uPixels.value.set(narrowest, widest);
	}

	/** Draws `count` streaks, their positions kept in full floats or (`precise` false, for a GPU that cannot draw into those) half floats: a new field, every streak unborn. */
	setCount(count: number, precise = this.precise) {
		if (count === this.field.count && precise === this.precise) return;
		this.precise = precise;
		this.field.dispose();
		this.field = this.makeField(count);
		this.mesh.geometry.dispose();
		this.mesh.geometry = this.geometry(this.field.count);
		const { uniforms } = this.mesh.material;
		uniforms.uState.value = this.field.state;
		uniforms.uExtra.value = this.field.extra;
	}

	/** Colours the streaks by an overlay's quantity on its palette, at the view's sensitivity, or (Off) all in the air's own colour. */
	setOverlay(kind: OverlayId, sensitivity: number) {
		const { uniforms } = this.mesh.material;
		uniforms.uColored.value = kind === 'off' ? 0 : 1;
		if (kind === 'off') return;
		const mapping = overlayMapping(kind, sensitivity);
		uniforms.uPalette.value = this.palettes[kind];
		uniforms.uMapping.value.set(mapping.scale, mapping.offset);
		uniforms.uChannel.value = mapping.channel;
		uniforms.uLog.value = mapping.log ? 1 : 0;
	}

	/** Draws a new round of births from a volume and the plan's geometry. */
	births(volume: Volume, raster: Raster, random: () => number = Math.random) {
		const pool = drawBirths(streakWeights(volume, raster), volume, raster, this.field.poolSize, random, STREAK_BIRTHS.outside);
		this.field.setPool(pool);
		return pool;
	}

	/** Moves the streaks on by `dt` seconds of air. */
	step(renderer: WebGLRenderer, dt: number) {
		this.field.step(renderer, dt);
		const { uniforms } = this.mesh.material;
		uniforms.uState.value = this.field.state;
		uniforms.uExtra.value = this.field.extra;
	}

	reset() {
		this.field.reset();
	}

	dispose() {
		this.field.dispose();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		for (const palette of Object.values(this.palettes)) palette.dispose();
	}
}
