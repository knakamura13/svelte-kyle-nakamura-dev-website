import {
	BackSide,
	BoxGeometry,
	BufferAttribute,
	Color,
	CustomBlending,
	OneFactor,
	OneMinusSrcAlphaFactor,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	NormalBlending,
	ShaderMaterial,
	Vector3,
	Vector2,
	type WebGLRenderer
} from 'three';
import type { Raster } from '../../homes/rasterize';
import { SMOKE_DENSE } from '../../sim/session';
import { SCALAR_STRIDE, type Volume } from '../../solver/volume';
import { drawBirths, ppmAtLevel, puffWeights } from './birth';
import type { DepthUniforms } from './depth';
import type { AirFields } from './fields';
import { BOX_GLSL, DEPTH_GLSL, HASH_GLSL, VOLUME_GLSL } from './glsl';
import { noiseTexture } from './noise';
import { ParticleField } from './particles';

/**
 * Smoke: the solver's PM2.5, drawn as a lit volume. A ray from the camera is marched through the box that holds any visible smoke,
 * up to the nearest surface (`depth.ts`), and at each step the smoke takes out some of the light behind it and adds its own: the sky
 * light from all round and the sun's from its direction, dimmed by the smoke between the step and the sun, and brightest when the
 * sun is behind it. It is grey, so it dims the sunlit room behind it, as smoke does. How much light it takes out grows with a power of
 * the concentration (`SMOKE_LOOK.power`): thick at `SMOKE_DENSE`, so the plume round a source reads as smoke, while the same smoke mixed
 * through a room (a tenth as strong) is a haze that the room reads through, rather than a fog that hides it. Smoke too thin to see is
 * what the Smoke overlay is for. Within the field's blocks the air carries a detail (`SMOKE_DETAIL`) that gathers the smoke into wisps,
 * so a plume curls and frays where the field has one.
 *
 * At low quality it is puffs instead: soft round billboards carried by the air (`particles.ts`), born where the smoke is, each as
 * opaque as the smoke around it.
 */

export const SMOKE_LOOK = {
	/** Concentration that reads as thick smoke, ppm, and how many decades below it smoke still shows. */
	dense: SMOKE_DENSE,
	decades: 2.5,
	/**
	 * Extinction of thick smoke (`dense`), per metre, and the power of the concentration it grows with. The plume a cooking burst makes,
	 * about `dense` near its source and half a metre across, hides nearly all of what is behind it (nineteen twentieths). Gentler than the
	 * square, so smoke that has spread to a third of that strength still hides three fifths across a metre and reads as smoke; with the
	 * square it hid a third and read as a veil of mist at check-in 3. A room of smoke a tenth as strong hides about a third across four
	 * metres, a haze the room still reads through. Above `cap` times `dense` it is no thicker.
	 *
	 * Steeper than light's own law, which is linear in the concentration, on purpose. Real smoke shows from about 10 mg/m³ across a metre
	 * (a mass extinction of about 4 m²/g), so a burst is seen near its source and is gone within seconds once it mixes through a room
	 * (about 0.15 mg/m³ for a cooking burst in a living room), while its PM2.5 stays. The volume draws smoke far thinner than the eye could
	 * see, and the steep power keeps a spread burst fading as real smoke does; the Smoke overlay shows the PM2.5 after (check-in 3).
	 */
	extinction: 6,
	power: 1.75,
	cap: 6,
	/**
	 * The share of the light smoke scatters, as a colour: a dark grey, cool against the late sun so that it lights grey rather than brown.
	 * Smoke then dims the sunlit room behind it, as smoke does, even once it has spread thin. At check-in 3 a grey-white (0.8) lit it
	 * cream, lighter than the floor, which read as mist, and a mid grey (0.45) left spread smoke about as bright as the floor, so it
	 * vanished.
	 */
	albedo: new Color(0.32, 0.34, 0.4),
	/** Henyey-Greenstein asymmetry: a little forward scattering, so smoke brightens when the sun is behind it, without turning milky. */
	anisotropy: 0.25,
	/** The level below which a cell holds no smoke worth marching through. */
	visible: 0.01
} as const;

/**
 * The smoke's detail: the field averages blocks of solver cells, so on its own it draws a soft cloud. A tiling noise (`noise.ts`) is
 * carried by the simulated air through the smoke, drawn out along the flow, and shapes the smoke the field holds there. Thick smoke (the
 * core of a plume, from about twice `SMOKE_LOOK.dense`) billows: it keeps its body where the noise is above a low threshold, with pockets
 * where it is not. Thin smoke (its edges) frays: it is gathered onto the noise's ridges, curling sheets that read as wisps edge on. The
 * smoke also shades itself, its insides and undersides darker under the smoke above them, so the billows have form. Nothing is added
 * where the field has no smoke, and a region keeps about the smoke it holds.
 */
export const SMOKE_DETAIL = {
	/** How strongly the noise shapes the smoke, 0 (the field as it is) to 1. */
	strength: 1,
	/** The noise's tile, m: its coarsest features are half of it across, its finest about a sixteenth. */
	scale: 2,
	/**
	 * Seconds a copy of the noise is carried by the air before it is renewed. Two copies half a period apart are blended, each fading
	 * out as it gets old and stretched (the flow noise of Neyret, "Advected textures", 2003).
	 */
	period: 2.4,
	/** How much the noise is drawn out along fast air (its features that much longer along the flow), at and above `stretchSpeed` m/s. */
	stretch: 3,
	stretchSpeed: 0.5,
	/** How thin a wisp is: the power the noise's ridge is raised to. */
	sharpness: 5,
	/** The noise's threshold under which thick smoke and thin smoke have pockets. */
	billow: [0.3, 0.5] as readonly [number, number],
	/**
	 * Where smoke goes from thin to thick, as decades of its concentration over `SMOKE_LOOK.dense`: the smoke that shows at all is from about
	 * a fifth of `dense` (an extinction of a sixth of a metre) up, so that is the thin end, and twice `dense` the thick one.
	 */
	thick: [-0.65, 0.3] as readonly [number, number],
	/** How much the smoke above a point darkens the sky's light on it, per unit of optical depth. */
	shade: 0.8
} as const;

/** Blending for colour already multiplied by its opacity, as the marches draw into their target. */
export const PREMULTIPLIED = {
	blending: CustomBlending,
	blendSrc: OneFactor,
	blendDst: OneMinusSrcAlphaFactor,
	blendSrcAlpha: OneFactor,
	blendDstAlpha: OneMinusSrcAlphaFactor
} as const;

/** The most steps a ray takes at each quality, and the step for a fine volume, m (a coarser volume steps half its cell). */
export const SMOKE_STEPS = { high: 96, medium: 56 } as const;

const MARCH_VERTEX = /* glsl */ `
varying vec3 vWorld;

void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const MARCH_FRAGMENT = /* glsl */ `
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uStep;
uniform float uMaxSteps;
uniform float uExtinction;
uniform float uPower;
uniform float uCap;
uniform float uDense;
uniform vec3 uAlbedo;
uniform vec3 uSunDirection;
uniform vec3 uSunLight;
uniform vec3 uSkyLight;
uniform float uAnisotropy;
uniform vec2 uViewport;
uniform highp sampler3D uNoise;
uniform float uTime;
uniform float uDetail;
uniform float uNoiseScale;
uniform float uPeriod;
uniform vec2 uStretch;
uniform float uSharpness;
uniform vec2 uBillow;
uniform vec2 uThick;
uniform float uShade;
varying vec3 vWorld;
${VOLUME_GLSL}
${HASH_GLSL}
${BOX_GLSL}
${DEPTH_GLSL}

/** Light from the room's own surfaces, which the lights do not count: smoke in a pale room is lit from all round by them. */
const float BOUNCE = 1.35;

float henyeyGreenstein(float cosine, float g) {
	return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosine, 1.5);
}

/** Extinction of smoke of concentration c, per metre: a power of the concentration as a share of thick smoke, up to the cap. */
float extinctionOf(float c) {
	return uExtinction * pow(clamp(c / uDense, 0.0, uCap), uPower);
}

/** Extinction at a point, per metre, of the field as it is. */
float extinction(vec3 p) {
	return extinctionOf(airLook(p).b);
}

/** The same from the newer read alone: one fetch, for the light's samples, which a tenth of a second's blend changes by nothing seen. */
float extinctionNow(vec3 p) {
	return extinctionOf(texture(uLookB, p / uExtent).b);
}

/**
 * The detail's noise at p, 0 to 1 and evenly spread: carried by the air (velocity v, m/s) and drawn out along it, warped by a finer copy
 * of itself so its shapes curl, in two copies half a period apart, each carried from where it began its period and fading out as it
 * nears its end, when the other is fresh. Two noises blended lose contrast in the middle of the blend, so it is given back.
 */
float detail(vec3 p, vec3 v) {
	float speed = length(v);
	vec3 along = speed > 1e-4 ? v / speed : vec3(0.0, 1.0, 0.0);
	float squash = 1.0 / mix(1.0, uStretch.x, smoothstep(0.0, uStretch.y, speed));
	float clock = fract(uTime / uPeriod);
	float sum = 0.0;
	float weights = 0.0;
	for (int k = 0; k < 2; k++) {
		float phase = fract(clock + 0.5 * float(k));
		float w = 1.0 - abs(2.0 * phase - 1.0);
		vec3 q = p - v * (phase * uPeriod);
		float parallel = dot(q, along);
		q += along * (parallel * squash - parallel);
		q = q / uNoiseScale + float(k) * vec3(0.31, 0.57, 0.13);
		float fine = texture(uNoise, q * 2.03 + 0.37).r;
		sum += w * (0.74 * texture(uNoise, q + 0.32 * (fine - 0.5)).r + 0.26 * fine);
		weights += w * w;
	}
	return clamp(0.5 + (sum - 0.5) / sqrt(max(weights, 0.25)) * 1.25, 0.0, 1.0);
}

/**
 * What the detail leaves of smoke of concentration c, as a factor of its extinction: thick smoke billows round pockets where the noise is
 * low, thin smoke (the edges of a plume) is gathered onto the noise's ridges, and what is left is that much denser, so a region keeps
 * about the smoke it holds.
 */
float wisps(float n, float c) {
	float thick = smoothstep(uThick.x, uThick.y, log2(max(c / uDense, 1e-6)) * 0.30102999566);
	float threshold = mix(uBillow.y, uBillow.x, thick);
	float billow = smoothstep(threshold - 0.1, threshold + 0.1, n) / (1.0 - threshold);
	float ridge = pow(1.0 - abs(2.0 * n - 1.0), uSharpness) * (uSharpness + 1.0);
	return mix(1.0, mix(ridge, billow, thick), uDetail);
}

void main() {
	vec3 origin = cameraPosition;
	vec3 direction = normalize(vWorld - origin);
	vec2 span = boxHit(origin, direction, uBoxMin, uBoxMax);
	float start = max(span.x, 0.0);
	float end = min(span.y, surfaceDistance(gl_FragCoord.xy / uViewport, direction));
	if (end <= start) discard;
	float steps = min(uMaxSteps, ceil((end - start) / uStep));
	float dt = (end - start) / steps;
	float t = start + dt * gradientNoise(gl_FragCoord.xy);
	// Henyey-Greenstein, scaled so that light scattered evenly would be 1, for the sun's light and for two orders of it scattered again.
	float cosine = dot(direction, uSunDirection);
	float phase0 = henyeyGreenstein(cosine, uAnisotropy);
	float phase1 = henyeyGreenstein(cosine, 0.5 * uAnisotropy);
	float phase2 = henyeyGreenstein(cosine, 0.25 * uAnisotropy);
	vec3 light = vec3(0.0);
	float transmittance = 1.0;
	for (int i = 0; i < 160; i++) {
		if (float(i) >= steps) break;
		vec3 p = origin + direction * t;
		float c = airLook(p).b;
		float sigma = extinctionOf(c);
		if (sigma > 1e-3) {
			// The field's own smoke, shaped by the detail the air carries.
			sigma *= wisps(detail(p, texture(uVelocityB, p / uExtent).xyz), c);
		}
		if (sigma > 1e-3) {
			// The smoke between here and the sun, from two samples toward it. Light that smoke has scattered more than once gets through
			// more of it and less in one direction (the octaves of Wrenninge et al.), so thick smoke is lit through rather than black.
			// A wisp shades itself too, over the few centimetres of its own depth, so a dense one is darker than its edges.
			float toward = extinctionNow(p + uSunDirection * 0.12) * 0.18 + extinctionNow(p + uSunDirection * 0.42) * 0.42 + sigma * 0.05;
			float sun = (phase0 * exp(-toward) + 0.5 * phase1 * exp(-0.5 * toward) + 0.25 * phase2 * exp(-0.25 * toward)) / 1.75;
			// The sky's light and the room's comes mostly from above: the smoke over a point dims it, so a plume's underside and middle are
			// darker than its top and its edges, and its billows have form.
			float over = extinctionNow(p + vec3(0.0, 0.35, 0.0)) * 0.55;
			vec3 lit = uSkyLight * BOUNCE * mix(0.42, 1.0, exp(-uShade * over)) + uSunLight * sun;
			float alpha = 1.0 - exp(-sigma * dt);
			light += transmittance * alpha * uAlbedo * lit;
			transmittance *= 1.0 - alpha;
			if (transmittance < 0.02) break;
		}
		t += dt;
	}
	float opacity = 1.0 - transmittance;
	if (!(opacity >= 0.003)) discard;
	// Into the march target (march.ts): linear, and already multiplied by its opacity.
	gl_FragColor = vec4(light, opacity);
}
`;

/** The sun and the sky as the smoke sees them: the direction to the sun, and the light of each, as a colour. */
export interface SmokeLighting {
	sunDirection: Vector3;
	sun: Color;
	sky: Color;
}

/** The box of the cells of `volumes` that hold visible smoke, padded by one cell, or null when none do. */
export function smokeBounds(volumes: readonly Volume[], visible = SMOKE_LOOK.visible): { min: [number, number, number]; max: [number, number, number] } | null {
	let found = false;
	const least = ppmAtLevel(visible, SMOKE_LOOK.dense, SMOKE_LOOK.decades);
	const lo = [Infinity, Infinity, Infinity];
	const hi = [-Infinity, -Infinity, -Infinity];
	for (const volume of volumes) {
		const { nx, ny, nz, sx, sy, sz, h, scalars } = volume;
		for (let K = 0, n = 0; K < nz; K++)
			for (let J = 0; J < ny; J++)
				for (let I = 0; I < nx; I++, n++) {
					if (!(scalars[SCALAR_STRIDE * n + 1] >= least)) continue;
					found = true;
					const cell = [I, J, K];
					const stride = [sx, sy, sz];
					for (let a = 0; a < 3; a++) {
						lo[a] = Math.min(lo[a], (cell[a] - 1) * stride[a] * h);
						hi[a] = Math.max(hi[a], (cell[a] + 2) * stride[a] * h);
					}
				}
	}
	return found ? { min: lo as [number, number, number], max: hi as [number, number, number] } : null;
}

export class SmokeVolume {
	readonly mesh: Mesh<BoxGeometry, ShaderMaterial>;
	/** The tiling noise the smoke's detail is made of (`SMOKE_DETAIL`). */
	private readonly noise = noiseTexture();

	constructor(fields: AirFields, depth: DepthUniforms, viewport: { value: Vector2 }) {
		const geometry = new BoxGeometry(1, 1, 1);
		geometry.translate(0.5, 0.5, 0.5);
		const material = new ShaderMaterial({
			vertexShader: MARCH_VERTEX,
			fragmentShader: MARCH_FRAGMENT,
			uniforms: {
				...fields.uniforms,
				...depth,
				uBoxMin: { value: new Vector3() },
				uBoxMax: { value: new Vector3(1, 1, 1) },
				uStep: { value: 0.06 },
				uMaxSteps: { value: SMOKE_STEPS.high },
				uExtinction: { value: SMOKE_LOOK.extinction },
				uPower: { value: SMOKE_LOOK.power },
				uCap: { value: SMOKE_LOOK.cap },
				uDense: { value: SMOKE_LOOK.dense },
				uAlbedo: { value: SMOKE_LOOK.albedo.clone() },
				uSunDirection: { value: new Vector3(0, 1, 0) },
				uSunLight: { value: new Color(0.6, 0.6, 0.6) },
				uSkyLight: { value: new Color(0.4, 0.4, 0.4) },
				uAnisotropy: { value: SMOKE_LOOK.anisotropy },
				uViewport: viewport,
				uNoise: { value: this.noise },
				uTime: { value: 0 },
				uDetail: { value: SMOKE_DETAIL.strength },
				uNoiseScale: { value: SMOKE_DETAIL.scale },
				uPeriod: { value: SMOKE_DETAIL.period },
				uStretch: { value: new Vector2(SMOKE_DETAIL.stretch, SMOKE_DETAIL.stretchSpeed) },
				uSharpness: { value: SMOKE_DETAIL.sharpness },
				uBillow: { value: new Vector2(...SMOKE_DETAIL.billow) },
				uThick: { value: new Vector2(...SMOKE_DETAIL.thick) },
				uShade: { value: SMOKE_DETAIL.shade }
			},
			side: BackSide,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			...PREMULTIPLIED
		});
		material.allowOverride = false;
		this.mesh = new Mesh(geometry, material);
		this.mesh.visible = false;
	}

	/** Marches through `bounds` (clipped to the home's box), or nothing when there is no smoke. `step` is the volume's finest cell edge, m. */
	setBounds(bounds: ReturnType<typeof smokeBounds>, box: Vector3, step: number) {
		if (!bounds) {
			this.mesh.visible = false;
			return;
		}
		const { uniforms } = this.mesh.material;
		const min = (uniforms.uBoxMin.value as Vector3).set(Math.max(0, bounds.min[0]), Math.max(0, bounds.min[1]), Math.max(0, bounds.min[2]));
		const max = (uniforms.uBoxMax.value as Vector3).set(Math.min(box.x, bounds.max[0]), Math.min(box.y, bounds.max[1]), Math.min(box.z, bounds.max[2]));
		this.mesh.visible = max.x > min.x && max.y > min.y && max.z > min.z;
		this.mesh.position.copy(min);
		this.mesh.scale.set(Math.max(1e-3, max.x - min.x), Math.max(1e-3, max.y - min.y), Math.max(1e-3, max.z - min.z));
		uniforms.uStep.value = Math.max(0.03, 0.5 * step);
	}

	setMaxSteps(steps: number) {
		this.mesh.material.uniforms.uMaxSteps.value = steps;
	}

	/** Moves the detail on with the air by `dt` real seconds (0 while the clock is paused, which holds it still). */
	advance(dt: number) {
		const { uniforms } = this.mesh.material;
		// Kept within a long multiple of the period, so the shader's clock never loses its precision.
		uniforms.uTime.value = (uniforms.uTime.value + Math.max(0, dt)) % (SMOKE_DETAIL.period * 1000);
	}

	setLighting(lighting: SmokeLighting) {
		const { uniforms } = this.mesh.material;
		(uniforms.uSunDirection.value as Vector3).copy(lighting.sunDirection);
		(uniforms.uSunLight.value as Color).copy(lighting.sun);
		(uniforms.uSkyLight.value as Color).copy(lighting.sky);
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.noise.dispose();
	}
}

const PUFF_VERTEX = /* glsl */ `
uniform highp sampler2D uState;
uniform highp sampler2D uExtra;
uniform float uSize;
uniform float uDenseLog;
uniform float uDecades;
uniform float uFadeIn;
uniform float uFadeOut;
attribute float aParticle;
varying vec2 vCorner;
varying float vAlpha;
${VOLUME_GLSL}

void main() {
	int width = textureSize(uState, 0).x;
	int index = int(aParticle);
	ivec2 at = ivec2(index % width, index / width);
	vec4 state = texelFetch(uState, at, 0);
	vec4 extra = texelFetch(uExtra, at, 0);
	float level = clamp((log2(max(airLook(state.xyz).b, 1e-12)) * 0.30102999566 - uDenseLog) / uDecades + 1.0, 0.0, 1.0);
	float alpha = extra.y < 0.5 ? 0.0 : pow(level, 1.4) * smoothstep(0.0, uFadeIn, state.w) * smoothstep(0.0, uFadeOut, extra.x - state.w);
	if (!(alpha >= 0.004)) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		vAlpha = 0.0;
		return;
	}
	vec4 view = viewMatrix * vec4(state.xyz, 1.0);
	view.xy += position.xy * uSize * (0.6 + 0.4 * level);
	gl_Position = projectionMatrix * view;
	vCorner = position.xy;
	vAlpha = alpha;
}
`;

const PUFF_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vCorner;
varying float vAlpha;

void main() {
	float r2 = dot(vCorner, vCorner) * 4.0;
	if (r2 >= 1.0) discard;
	float alpha = uOpacity * vAlpha * (1.0 - r2) * (1.0 - r2);
	if (!(alpha >= 0.003)) discard;
	gl_FragColor = vec4(uColor, alpha);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/** Puffs at each quality that draws them, and the births a round draws. */
const PUFFS = { count: 1_200, life: [3, 7] as [number, number], fadeIn: 0.6, fadeOut: 1, poolWidth: 32 };

/** What a quality tier may change of the puffs: how many there are, how wide one is, m, and how opaque (0 to 1). */
export interface PuffLook {
	count?: number;
	size?: number;
	opacity?: number;
}

/** Smoke as soft puffs, for low quality: what a phone can afford. */
export class SmokePuffs {
	readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
	readonly field: ParticleField;

	constructor(fields: AirFields, precise = true, count: number = PUFFS.count) {
		this.field = new ParticleField({ count, life: PUFFS.life, fadeOut: PUFFS.fadeOut, outside: 0.3, poolWidth: PUFFS.poolWidth }, fields.uniforms, precise);
		const geometry = new InstancedBufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
		geometry.setIndex([0, 1, 2, 2, 1, 3]);
		geometry.setAttribute('aParticle', new InstancedBufferAttribute(Float32Array.from({ length: this.field.count }, (_, n) => n), 1));
		geometry.instanceCount = this.field.count;
		const material = new ShaderMaterial({
			vertexShader: PUFF_VERTEX,
			fragmentShader: PUFF_FRAGMENT,
			uniforms: {
				...fields.uniforms,
				uState: { value: this.field.state },
				uExtra: { value: this.field.extra },
				uSize: { value: 0.5 },
				uDenseLog: { value: Math.log10(SMOKE_LOOK.dense) },
				uDecades: { value: SMOKE_LOOK.decades },
				uFadeIn: { value: PUFFS.fadeIn },
				uFadeOut: { value: PUFFS.fadeOut },
				uColor: { value: new Color(0.85, 0.84, 0.82) },
				uOpacity: { value: 0.55 }
			},
			transparent: true,
			depthWrite: false,
			blending: NormalBlending
		});
		material.allowOverride = false;
		this.mesh = new Mesh(geometry, material);
		this.mesh.frustumCulled = false;
	}

	births(volume: Volume, raster: Raster, random: () => number = Math.random) {
		const pool = drawBirths(puffWeights(volume, raster, SMOKE_LOOK.dense, SMOKE_LOOK.decades), volume, raster, this.field.poolSize, random);
		this.field.setPool(pool);
		return pool;
	}

	step(renderer: WebGLRenderer, dt: number) {
		this.field.step(renderer, dt);
		const { uniforms } = this.mesh.material;
		uniforms.uState.value = this.field.state;
		uniforms.uExtra.value = this.field.extra;
	}

	/** The size and opacity the puffs were made with, for `setLook` to go back to. */
	private base?: { size: number; opacity: number };

	/** How wide and how opaque a puff is, where a quality tier asks for its own (`AirLook`); unset is the default. The count is the constructor's. */
	setLook(look: PuffLook = {}) {
		const { uniforms } = this.mesh.material;
		this.base ??= { size: uniforms.uSize.value, opacity: uniforms.uOpacity.value };
		uniforms.uSize.value = look.size ?? this.base.size;
		uniforms.uOpacity.value = look.opacity ?? this.base.opacity;
	}

	/** Lit as the volume is, but evenly: the sky, and half the sun. */
	setLighting(lighting: SmokeLighting) {
		const color = this.mesh.material.uniforms.uColor.value as Color;
		color.copy(lighting.sun).multiplyScalar(0.5).add(lighting.sky).multiply(SMOKE_LOOK.albedo);
	}

	reset() {
		this.field.reset();
	}

	dispose() {
		this.field.dispose();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}

