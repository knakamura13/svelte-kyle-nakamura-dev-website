import {
	DataTexture,
	FloatType,
	GLSL3,
	HalfFloatType,
	Mesh,
	NearestFilter,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	Vector2,
	WebGLRenderTarget,
	type Texture,
	type WebGLRenderer
} from 'three';
import type { BirthPool } from './birth';
import type { FieldUniforms } from './fields';
import { HASH_GLSL, MASK_GLSL, VOLUME_GLSL } from './glsl';

/**
 * Particles that ride the simulated air, kept on the GPU. Each particle is a texel of two float textures: its position (x, y, z in
 * metres) and age (s) in one, and its life (s), its generation (how many times it has been born; 0 for one that has not been yet)
 * and how long it has been outside the home (s) in the other. One pass a frame moves every particle through the volume's velocity
 * (`fields.ts`), with the midpoint rule and with as many substeps as keep each under a cell, and writes the next pair of textures.
 *
 * A particle never crosses a closed face of the solver's grid (`mask.ts`): walls, shut windows and every side of the furniture.
 * Moving into one, it keeps its other components and slides along. One that leaves through an open window, or was born outside
 * and has not come in, fades out after a moment. A particle whose life is up is born again at a point of the birth pool, which the
 * processor fills (`birth.ts`) and uploads as a small texture.
 */

/** Particles per row of the state textures. */
export const STATE_WIDTH = 128;

export interface ParticleOptions {
	count: number;
	/** The shortest and longest life, s. */
	life: [number, number];
	/** How long a particle fades out for, s, once it has left the home or its life is nearly up. */
	fadeOut: number;
	/** How long a particle may be outside the home before it fades, s: long enough to come in through a window, or to be seen leaving. */
	outside: number;
	/** Births the pool holds: `poolWidth` × `poolWidth / 2`. */
	poolWidth: number;
}

const QUAD_VERTEX = /* glsl */ `
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const ADVECT_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;

uniform highp sampler2D uState;
uniform highp sampler2D uExtra;
uniform highp sampler2D uPool;
uniform float uPoolCount;
uniform float uDt;
uniform float uSeed;
uniform vec2 uLife;
uniform float uFadeOut;
uniform float uOutside;
uniform float uReset;
${VOLUME_GLSL}
${MASK_GLSL}
${HASH_GLSL}

layout(location = 0) out highp vec4 outState;
layout(location = 1) out highp vec4 outExtra;

void main() {
	ivec2 texel = ivec2(gl_FragCoord.xy);
	int width = textureSize(uState, 0).x;
	uint id = uint(texel.x + texel.y * width);
	uint seed = uint(uSeed);

	if (uReset > 0.5) {
		// Not born yet (generation 0), and each waits a little while of its own for its first birth, so they do not all come at once.
		outState = vec4(-1000.0, -1000.0, -1000.0, 0.0);
		outExtra = vec4(hash01(id, 7919u) * uLife.x, 0.0, 0.0, 0.0);
		return;
	}

	vec4 state = texelFetch(uState, texel, 0);
	vec4 extra = texelFetch(uExtra, texel, 0);
	vec3 p = state.xyz;
	float age = state.w + uDt;
	float life = extra.x;
	float generation = extra.y;
	float outside = extra.z;

	if (age >= life) {
		if (uPoolCount < 0.5) {
			// Nowhere to be born: it waits a while of its own, unseen (generation 0), and tries again.
			outState = vec4(-1000.0, -1000.0, -1000.0, 0.0);
			outExtra = vec4(0.05 + hash01(id, seed) * uLife.x, 0.0, 0.0, 0.0);
			return;
		}
		generation += 1.0;
		uint born = uint(generation);
		float pick = hash01(id * 2654435761u + born, seed);
		int index = int(min(floor(pick * uPoolCount), uPoolCount - 1.0));
		int poolWidth = textureSize(uPool, 0).x;
		vec3 birth = texelFetch(uPool, ivec2(index % poolWidth, index / poolWidth), 0).xyz;
		outState = vec4(birth, 0.0);
		outExtra = vec4(mix(uLife.x, uLife.y, hash01(id ^ 0x9e3779b9u, born + seed * 7u)), generation, 0.0, 0.0);
		return;
	}

	if (uDt > 0.0 && generation > 0.0) {
		vec3 v = airVelocity(p);
		float travel = max(max(abs(v.x), abs(v.y)), abs(v.z)) * uDt;
		int steps = int(clamp(ceil(travel / (0.8 * uCellSize)), 1.0, 4.0));
		float dt = uDt / float(steps);
		for (int s = 0; s < 4; s++) {
			if (s >= steps) break;
			vec3 first = airVelocity(p);
			vec3 middle = airVelocity(p + 0.5 * dt * first);
			p = constrain(p, p + dt * middle);
		}
		outside = inBox(p) ? 0.0 : outside + uDt;
		// Gone out of a window, or born outside and not come in: it fades from here.
		if (outside > uOutside) life = min(life, age + uFadeOut);
	}
	outState = vec4(p, age);
	outExtra = vec4(life, generation, outside, 0.0);
}
`;

/** The state of every particle, double-buffered: one pair of textures is read while the other is written. */
export class ParticleField {
	readonly count: number;
	readonly height: number;
	readonly options: ParticleOptions;
	private readonly targets: [WebGLRenderTarget, WebGLRenderTarget];
	private current = 0;
	private readonly pool: DataTexture;
	private readonly material: ShaderMaterial;
	private readonly scene = new Scene();
	private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private needsReset = true;
	private seed = 0;

	constructor(options: ParticleOptions, fields: FieldUniforms, precise = true) {
		this.options = options;
		this.count = Math.max(1, Math.floor(options.count));
		this.height = Math.ceil(this.count / STATE_WIDTH);
		const target = () =>
			new WebGLRenderTarget(STATE_WIDTH, this.height, {
				count: 2,
				type: precise ? FloatType : HalfFloatType,
				format: RGBAFormat,
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				depthBuffer: false,
				stencilBuffer: false,
				generateMipmaps: false
			});
		this.targets = [target(), target()];
		const width = options.poolWidth;
		this.pool = new DataTexture(new Float32Array(4 * width * (width / 2)), width, width / 2, RGBAFormat, FloatType);
		this.pool.minFilter = this.pool.magFilter = NearestFilter;
		this.pool.needsUpdate = true;
		this.material = new ShaderMaterial({
			glslVersion: GLSL3,
			vertexShader: QUAD_VERTEX,
			fragmentShader: ADVECT_FRAGMENT,
			uniforms: {
				...fields,
				uState: { value: null },
				uExtra: { value: null },
				uPool: { value: this.pool },
				uPoolCount: { value: 0 },
				uDt: { value: 0 },
				uSeed: { value: 0 },
				uLife: { value: new Vector2(...options.life) },
				uFadeOut: { value: options.fadeOut },
				uOutside: { value: options.outside },
				uReset: { value: 1 }
			},
			depthTest: false,
			depthWrite: false
		});
		const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
		quad.frustumCulled = false;
		this.scene.add(quad);
	}

	/** Positions and ages: x, y, z in metres and the age in seconds. */
	get state(): Texture {
		return this.targets[this.current].textures[0];
	}

	/** Life (s), generation and seconds outside the home. */
	get extra(): Texture {
		return this.targets[this.current].textures[1];
	}

	/** How many births the pool holds. */
	get poolSize() {
		return this.options.poolWidth * (this.options.poolWidth / 2);
	}

	/** Takes the births the processor drew. */
	setPool(pool: BirthPool) {
		const data = this.pool.image.data as Float32Array;
		const count = Math.min(pool.count, this.poolSize);
		data.set(pool.points.subarray(0, 4 * count));
		this.pool.needsUpdate = true;
		this.material.uniforms.uPoolCount.value = count;
	}

	/** The shortest and longest life of a particle born from now on, s. */
	setLife(shortest: number, longest: number) {
		(this.material.uniforms.uLife.value as Vector2).set(shortest, longest);
	}

	/**
	 * Reads every particle back: position (m) and age (s) in `state`, life (s), generation and seconds outside in `extra`, four numbers
	 * each, in particle order. A stall of the GPU, so for tests only.
	 */
	read(renderer: WebGLRenderer) {
		const target = this.targets[this.current];
		const state = new Float32Array(4 * STATE_WIDTH * this.height);
		const extra = new Float32Array(4 * STATE_WIDTH * this.height);
		renderer.readRenderTargetPixels(target, 0, 0, STATE_WIDTH, this.height, state, undefined, 0);
		renderer.readRenderTargetPixels(target, 0, 0, STATE_WIDTH, this.height, extra, undefined, 1);
		return { state: state.subarray(0, 4 * this.count), extra: extra.subarray(0, 4 * this.count) };
	}

	/** Every particle unborn again (another home), each born within the shortest life. */
	reset() {
		this.needsReset = true;
		this.material.uniforms.uPoolCount.value = 0;
	}

	/** Moves every particle on by `dt` seconds of air (0 holds them still while births still happen). */
	step(renderer: WebGLRenderer, dt: number) {
		const uniforms = this.material.uniforms;
		const next = 1 - this.current;
		uniforms.uState.value = this.targets[this.current].textures[0];
		uniforms.uExtra.value = this.targets[this.current].textures[1];
		uniforms.uDt.value = dt;
		uniforms.uSeed.value = (this.seed = (this.seed + 1) % 1_000_003);
		uniforms.uReset.value = this.needsReset ? 1 : 0;
		this.needsReset = false;
		renderer.setRenderTarget(this.targets[next]);
		renderer.render(this.scene, this.camera);
		this.current = next;
	}

	dispose() {
		for (const target of this.targets) target.dispose();
		this.pool.dispose();
		this.material.dispose();
		(this.scene.children[0] as Mesh).geometry.dispose();
	}
}
