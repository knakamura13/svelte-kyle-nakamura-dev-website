import {
	Color,
	FloatType,
	HalfFloatType,
	LinearFilter,
	Mesh,
	NormalBlending,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	UnsignedByteType,
	Vector2,
	WebGLRenderTarget,
	type Camera,
	type Texture,
	type WebGLRenderer
} from 'three';
import type { DepthUniforms } from './depth';

/**
 * Where the ray-marches (the smoke and the overlay) are drawn: into a target at half the canvas's size in CSS pixels (a quarter of
 * the device pixels on a Retina screen, half on a plain one), as colour already multiplied by its opacity, and then laid over the
 * world in one full-screen pass. The pass upsamples by depth: of the four march pixels round a screen pixel, those whose surface is
 * at the screen pixel's own depth count most, so the smoke stops cleanly at the edge of a wall or a chair rather than in a blur.
 * A soft volume loses nothing at that resolution, and the march costs the same on any screen.
 */

/** The march's size against the canvas, in CSS pixels. */
const MARCH_SCALE = 0.5;

const COMPOSITE_VERTEX = /* glsl */ `
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform highp sampler2D uMarch;
uniform vec2 uMarchSize;
uniform highp sampler2D uDepth;
uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;

float viewDistance(float depth) {
	return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * depth - uCameraFar) * -1.0;
}

void main() {
	float here = viewDistance(texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).x);
	vec2 at = gl_FragCoord.xy / uResolution * uMarchSize - 0.5;
	ivec2 base = ivec2(floor(at));
	vec2 f = at - vec2(base);
	ivec2 last = ivec2(uMarchSize) - 1;
	vec4 sum = vec4(0.0);
	float total = 0.0;
	for (int j = 0; j < 2; j++)
		for (int i = 0; i < 2; i++) {
			ivec2 texel = clamp(base + ivec2(i, j), ivec2(0), last);
			// The depth the march stopped at for that pixel: the screen's depth at its centre.
			float there = viewDistance(texture(uDepth, (vec2(texel) + 0.5) / uMarchSize).x);
			float weight = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
			weight *= 1.0 / (0.02 + 40.0 * abs(there - here) / max(here, 1e-3));
			sum += weight * texelFetch(uMarch, texel, 0);
			total += weight;
		}
	vec4 color = sum / max(total, 1e-6);
	if (color.a < 0.003) discard;
	gl_FragColor = vec4(color.rgb / color.a, color.a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export class MarchTarget {
	/** What is marched: the smoke and the overlay, drawn here rather than in the world's scene. */
	readonly scene = new Scene();
	/** The full-screen pass that lays the march over the world; the world's scene holds it. */
	readonly composite: Mesh<PlaneGeometry, ShaderMaterial>;
	/** The march's own size, for the marching shaders. */
	readonly size = { value: new Vector2(1, 1) };
	private target: WebGLRenderTarget | null = null;
	private readonly clear = new Color();
	private readonly buffer = new Vector2();
	private type: typeof HalfFloatType | typeof FloatType | typeof UnsignedByteType = HalfFloatType;

	constructor(depth: DepthUniforms) {
		this.composite = new Mesh(
			new PlaneGeometry(2, 2),
			new ShaderMaterial({
				vertexShader: COMPOSITE_VERTEX,
				fragmentShader: COMPOSITE_FRAGMENT,
				uniforms: {
					uMarch: { value: null as Texture | null },
					uMarchSize: this.size,
					uDepth: depth.uDepth,
					uResolution: depth.uResolution,
					uCameraNear: depth.uCameraNear,
					uCameraFar: depth.uCameraFar
				},
				transparent: true,
				depthTest: false,
				depthWrite: false,
				blending: NormalBlending
			})
		);
		this.composite.material.allowOverride = false;
		this.composite.frustumCulled = false;
		this.composite.visible = false;
	}

	/** A GPU that cannot draw into half floats draws the march in bytes, which bands a little in thin smoke. */
	setPrecision(halfFloats: boolean) {
		const type = halfFloats ? HalfFloatType : UnsignedByteType;
		if (type === this.type) return;
		this.type = type;
		this.target?.dispose();
		this.target = null;
	}

	/** Marches whatever in `scene` is visible from `camera` into the target. Returns whether anything was drawn. */
	render(renderer: WebGLRenderer, camera: Camera) {
		if (!this.scene.children.some((child) => child.visible)) {
			this.composite.visible = false;
			return false;
		}
		renderer.getDrawingBufferSize(this.buffer);
		const scale = MARCH_SCALE / Math.max(1, renderer.getPixelRatio());
		const width = Math.max(1, Math.round(this.buffer.x * scale));
		const height = Math.max(1, Math.round(this.buffer.y * scale));
		if (!this.target || this.target.width !== width || this.target.height !== height) {
			this.target?.dispose();
			this.target = new WebGLRenderTarget(width, height, {
				type: this.type,
				format: RGBAFormat,
				minFilter: LinearFilter,
				magFilter: LinearFilter,
				depthBuffer: false,
				stencilBuffer: false,
				generateMipmaps: false
			});
		}
		this.size.value.set(width, height);
		renderer.getClearColor(this.clear);
		const alpha = renderer.getClearAlpha();
		renderer.setClearColor(0x000000, 0);
		renderer.setRenderTarget(this.target);
		renderer.clear(true, false, false);
		renderer.render(this.scene, camera);
		renderer.setClearColor(this.clear, alpha);
		this.composite.material.uniforms.uMarch.value = this.target.texture;
		this.composite.visible = true;
		return true;
	}

	dispose() {
		this.target?.dispose();
		this.composite.geometry.dispose();
		this.composite.material.dispose();
	}
}
