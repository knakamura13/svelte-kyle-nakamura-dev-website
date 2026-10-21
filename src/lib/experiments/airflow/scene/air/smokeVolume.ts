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
	type Vector2,
	type WebGLRenderer
} from 'three';
import type { Raster } from '../../homes/rasterize';
import { SMOKE_DENSE } from '../../sim/session';
import { SCALAR_STRIDE, type Volume } from '../../solver/volume';
import { drawBirths, ppmAtLevel, puffWeights } from './birth';
import type { DepthUniforms } from './depth';
import type { AirFields } from './fields';
import { BOX_GLSL, DEPTH_GLSL, HASH_GLSL, VOLUME_GLSL } from './glsl';
import { ParticleField } from './particles';

/**
 * Smoke: the solver's PM2.5, drawn as a lit volume. A ray from the camera is marched through the box that holds any visible smoke,
 * up to the nearest surface (`depth.ts`), and at each step the smoke takes out some of the light behind it and adds its own: the sky
 * light from all round and the sun's from its direction, dimmed by the smoke between the step and the sun, and brightest when the
 * sun is behind it. How dense it looks follows the concentration on a log scale, from nothing 2.5 decades below `SMOKE_DENSE` to
 * thick at it, as the old smoke puffs did, so a cloud thinning in a draught stays in sight as long as an overlay would show it.
 *
 * At low quality it is puffs instead: soft round billboards carried by the air (`particles.ts`), born where the smoke is, each as
 * opaque as the smoke around it.
 */

export const SMOKE_LOOK = {
	/** Concentration that reads as thick smoke, ppm, and how many decades below it smoke still shows. */
	dense: SMOKE_DENSE,
	decades: 2.5,
	/** Extinction of thick smoke, per metre (a third of a metre of it hides nearly everything behind), and how fast it falls off as the smoke thins: a plume reads as smoke and the haze it leaves in a room as haze. */
	extinction: 10,
	falloff: 2.2,
	/** The share of the light smoke scatters, as a colour: a faintly warm grey-white. */
	albedo: new Color(0.98, 0.97, 0.95),
	/** Henyey-Greenstein asymmetry: a little forward scattering, so smoke glows when the sun is behind it. */
	anisotropy: 0.35,
	/** The level below which a cell holds no smoke worth marching through. */
	visible: 0.01
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
uniform float uDenseLog;
uniform float uDecades;
uniform float uExtinction;
uniform float uFalloff;
uniform vec3 uAlbedo;
uniform vec3 uSunDirection;
uniform vec3 uSunLight;
uniform vec3 uSkyLight;
uniform float uAnisotropy;
uniform vec2 uViewport;
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

float smokeLevel(float ppm) {
	return clamp((log2(max(ppm, 1e-12)) * 0.30102999566 - uDenseLog) / uDecades + 1.0, 0.0, 1.0);
}

/** Extinction at a point, per metre. */
float extinction(vec3 p) {
	return uExtinction * pow(smokeLevel(airLook(p).b), uFalloff);
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
		float sigma = extinction(p);
		if (sigma > 1e-3) {
			// The smoke between here and the sun, from two samples toward it. Light that smoke has scattered more than once gets through
			// more of it and less in one direction (the octaves of Wrenninge et al.), which keeps thick smoke white rather than grey.
			float toward = extinction(p + uSunDirection * 0.12) * 0.18 + extinction(p + uSunDirection * 0.42) * 0.42;
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
	if (opacity < 0.003) discard;
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
				uDenseLog: { value: Math.log10(SMOKE_LOOK.dense) },
				uDecades: { value: SMOKE_LOOK.decades },
				uExtinction: { value: SMOKE_LOOK.extinction },
				uFalloff: { value: SMOKE_LOOK.falloff },
				uAlbedo: { value: SMOKE_LOOK.albedo.clone() },
				uSunDirection: { value: new Vector3(0, 1, 0) },
				uSunLight: { value: new Color(0.6, 0.6, 0.6) },
				uSkyLight: { value: new Color(0.4, 0.4, 0.4) },
				uAnisotropy: { value: SMOKE_LOOK.anisotropy },
				uViewport: viewport
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
		if (!bounds || this.strength <= 0) {
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

	/** How thick the smoke is drawn against its full look, 0 to 1: thinner under an overlay, so the overlay's tint reads through it. */
	setStrength(strength: number) {
		this.mesh.material.uniforms.uExtinction.value = SMOKE_LOOK.extinction * strength;
		this.strength = strength;
	}

	strength = 1;

	setMaxSteps(steps: number) {
		this.mesh.material.uniforms.uMaxSteps.value = steps;
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
	if (alpha < 0.004) {
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
	if (alpha < 0.003) discard;
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

