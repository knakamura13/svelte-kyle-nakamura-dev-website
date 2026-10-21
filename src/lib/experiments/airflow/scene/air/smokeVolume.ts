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
 * sun is behind it. How much light it takes out grows with the square of the concentration: thick at `SMOKE_DENSE`, so the plume
 * round a source reads as smoke, while the same smoke mixed through a room (a tenth as strong) is a faint haze that the room reads
 * through, rather than a fog that whites it out. Smoke too thin to see is what the Smoke overlay is for. Within the field's blocks the
 * air carries a detail (`SMOKE_DETAIL`) that gathers the smoke into wisps, so a plume curls and frays where the field has one.
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
	 * about `dense` near its source and half a metre across, hides most of what is behind it (five sixths); a room of smoke a tenth as
	 * strong tints what is behind it by about an eighth across four metres. Above `cap` times `dense` it is no thicker. Lighter than
	 * the soft volume of check-in 2, so that a room a burst has filled is not one white wall and the wisps of `SMOKE_DETAIL` show in it.
	 */
	extinction: 3.5,
	power: 2,
	cap: 6,
	/** The share of the light smoke scatters, as a colour: a cool grey-white, so the late sun on it reads as smoke rather than as the walls' cream. */
	albedo: new Color(0.8, 0.83, 0.88),
	/** Henyey-Greenstein asymmetry: a little forward scattering, so smoke glows when the sun is behind it. */
	anisotropy: 0.35,
	/** The level below which a cell holds no smoke worth marching through. */
	visible: 0.01
} as const;

/**
 * The smoke's detail: the field averages blocks of solver cells, so on its own it draws a soft cloud. A tiling noise (`noise.ts`) is
 * carried by the simulated air through the smoke and gathers the smoke the field holds into thin, curling sheets, the ridges of the
 * noise where it crosses its middle, drawn out along the flow: seen edge on, a sheet is a wisp. Thin smoke (low on the log scale of
 * `SMOKE_LOOK`) is all sheets; thick smoke keeps some of its body between them, so a plume's core billows and its edges fray. It never
 * adds smoke where the field has none, and on average it keeps as much as the field holds.
 */
export const SMOKE_DETAIL = {
	/** How strongly the noise gathers the smoke, 0 (the field as it is) to 1. */
	strength: 1,
	/** The noise's tile, m: its coarsest features are half of it across, its finest a sixteenth. */
	scale: 3,
	/**
	 * Seconds a copy of the noise is carried by the air before it is renewed. Two copies half a period apart are blended, each fading
	 * out as it gets old and stretched (the flow noise of Neyret, "Advected textures", 2003).
	 */
	period: 2.4,
	/** How much the noise is drawn out along fast air (its features that much longer along the flow), at and above `stretchSpeed` m/s. */
	stretch: 3,
	stretchSpeed: 0.5,
	/** How thin the sheets are: the power the ridge is raised to (the higher, the thinner and denser each sheet). */
	sharpness: 6,
	/** The share of the field's smoke left as it is between the sheets, for the thinnest smoke and for the thickest. */
	body: [0, 0.15] as readonly [number, number]
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
uniform vec2 uBody;
uniform float uDecades;
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

/** Extinction of smoke of concentration c, per metre: the square of the concentration as a share of thick smoke, up to the cap. */
float extinctionOf(float c) {
	return uExtinction * pow(clamp(c / uDense, 0.0, uCap), uPower);
}

/** Extinction at a point, per metre, of the field as it is. */
float extinction(vec3 p) {
	return extinctionOf(airLook(p).b);
}

/**
 * The sheets at p: 0 between them to about uSharpness + 1 on them, 1 on average. The noise is carried by the air (velocity v, m/s) and
 * drawn out along it, and warped by a finer copy of itself, so its ridges (where it crosses its middle) curl. Two copies, half a
 * period apart, are each carried from where they began their period; each fades out as it nears its end, when the other is fresh.
 */
float sheets(vec3 p, vec3 v) {
	float speed = length(v);
	vec3 along = speed > 1e-4 ? v / speed : vec3(0.0, 1.0, 0.0);
	float squash = 1.0 / mix(1.0, uStretch.x, smoothstep(0.0, uStretch.y, speed));
	float clock = fract(uTime / uPeriod);
	float sum = 0.0;
	for (int k = 0; k < 2; k++) {
		float phase = fract(clock + 0.5 * float(k));
		vec3 q = p - v * (phase * uPeriod);
		float parallel = dot(q, along);
		q += along * (parallel * squash - parallel);
		q = q / uNoiseScale + float(k) * vec3(0.31, 0.57, 0.13);
		q += 0.35 * (texture(uNoise, q * 2.03 + 0.37).r - 0.5);
		float ridge = 1.0 - abs(2.0 * texture(uNoise, q).r - 1.0);
		sum += (1.0 - abs(2.0 * phase - 1.0)) * pow(ridge, uSharpness) * (uSharpness + 1.0);
	}
	return sum;
}

/**
 * What the detail leaves of smoke whose look is at \`level\` (0 thin to 1 thick, on the log scale of SMOKE_LOOK), as a factor of its
 * extinction: the sheets, with some of the smoke's body kept between them, more of it in thick smoke.
 */
float wisps(float sheet, float level) {
	float body = mix(uBody.x, uBody.y, smoothstep(0.1, 0.9, level));
	return mix(1.0, mix(sheet, 1.0, body), uDetail);
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
	float denseLog = log2(uDense) * 0.30102999566;
	for (int i = 0; i < 160; i++) {
		if (float(i) >= steps) break;
		vec3 p = origin + direction * t;
		float c = airLook(p).b;
		float sigma = extinctionOf(c);
		if (sigma > 1e-3) {
			// The field's own smoke, broken into wisps by the detail the air carries.
			float level = clamp((log2(c) * 0.30102999566 - denseLog) / uDecades + 1.0, 0.0, 1.0);
			sigma *= wisps(sheets(p, airVelocity(p)), level);
		}
		if (sigma > 1e-3) {
			// The smoke between here and the sun, from two samples toward it. Light that smoke has scattered more than once gets through
			// more of it and less in one direction (the octaves of Wrenninge et al.), which keeps thick smoke white rather than grey.
			// A sheet of the detail shades itself too, over the few centimetres of its own depth, so a dense wisp is darker than its edges.
			float toward = extinction(p + uSunDirection * 0.12) * 0.18 + extinction(p + uSunDirection * 0.42) * 0.42 + sigma * 0.05;
			float sun = (phase0 * exp(-toward) + 0.5 * phase1 * exp(-0.5 * toward) + 0.25 * phase2 * exp(-0.25 * toward)) / 1.75;
			vec3 lit = uSkyLight * BOUNCE + uSunLight * sun;
			float alpha = 1.0 - exp(-sigma * dt);
			light += transmittance * alpha * uAlbedo * lit;
			transmittance *= 1.0 - alpha;
			if (transmittance < 0.01) break;
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
				uBody: { value: new Vector2(...SMOKE_DETAIL.body) },
				uDecades: { value: SMOKE_LOOK.decades }
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

/** Smoke as soft puffs, for low quality: what a phone can afford. */
export class SmokePuffs {
	readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
	readonly field: ParticleField;

	constructor(fields: AirFields, precise = true) {
		this.field = new ParticleField({ count: PUFFS.count, life: PUFFS.life, fadeOut: PUFFS.fadeOut, outside: 0.3, poolWidth: PUFFS.poolWidth }, fields.uniforms, precise);
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

