import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, Vector2, Vector3, type DataTexture, type Material, type Object3D, type Texture } from 'three';
import type { OverlayId } from '../../state';
import { PALETTE_GLSL } from '../../viz/palettes';
import { paletteTexture } from '../sliceLayer';
import type { DepthUniforms } from './depth';
import type { AirFields } from './fields';
import { BOX_GLSL, DEPTH_GLSL, HASH_GLSL, VOLUME_GLSL } from './glsl';
import { OVERLAY_FLOOR, overlayMapping, type OverlayKind } from './legend';
import { PREMULTIPLIED } from './smokeVolume';

export { OVERLAY_FLOOR, overlayLegend, overlayMapping, overlayStrength, type OverlayKind, type OverlayLegend, type OverlayLegendOptions } from './legend';

/**
 * The overlays, as Cities: Skylines draws its info views: with one on, the world turns a neutral clay and the field is a translucent
 * tint through the rooms. A ray from the camera is marched through the home's box up to the nearest surface (`depth.ts`), and the
 * air it passes tints it by its value on the overlay's palette, the more strongly the stronger the value (`overlayStrength`), so a
 * jet of fast air or a pocket of smoke stands out of clear air. The palettes and the mapping are the slice's (`viz/palettes.ts`), so
 * the legend (`overlayLegend`) reads the same as before.
 */

/** How much a metre of air at full strength tints, per metre. Through a room of about 4 m, strong air is nearly opaque and faint air a wash. */
const DENSITY = 0.85;
/** The most steps a ray takes. */
const MAX_STEPS = 72;

const VERTEX = /* glsl */ `
varying vec3 vWorld;

void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uStep;
uniform float uMaxSteps;
uniform float uChannel;
uniform float uLog;
uniform float uDiverging;
uniform float uFloor;
uniform float uDensity;
uniform vec2 uViewport;
varying vec3 vWorld;
${VOLUME_GLSL}
${HASH_GLSL}
${BOX_GLSL}
${DEPTH_GLSL}
${PALETTE_GLSL}

vec3 toLinear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
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
	vec3 color = vec3(0.0);
	float transmittance = 1.0;
	for (int i = 0; i < 128; i++) {
		if (float(i) >= steps) break;
		vec4 look = airLook(origin + direction * t);
		t += dt;
		float air = smoothstep(0.15, 0.6, look.a);
		if (air <= 0.0) continue;
		float value = uChannel < 0.5 ? look.r : (uChannel < 1.5 ? look.g : look.b);
		float x = uLog > 0.5 ? log2(max(value, 1e-30)) * 0.30102999566 : value;
		float fraction = scaleFraction(x);
		float signal = uDiverging > 0.5 ? abs(2.0 * fraction - 1.0) : fraction;
		float sigma = uDensity * air * (uFloor + (1.0 - uFloor) * signal);
		float alpha = 1.0 - exp(-sigma * dt);
		color += transmittance * alpha * toLinear(paletteColor(fraction));
		transmittance *= 1.0 - alpha;
		if (transmittance < 0.02) break;
	}
	float opacity = 1.0 - transmittance;
	if (opacity < 0.003) discard;
	// Into the march target (march.ts): linear, and already multiplied by its opacity.
	gl_FragColor = vec4(color, opacity);
}
`;

export class Overlay {
	readonly mesh: Mesh<BoxGeometry, ShaderMaterial>;
	kind: OverlayId = 'off';
	private readonly palettes: Record<OverlayKind, DataTexture>;

	constructor(fields: AirFields, depth: DepthUniforms, viewport: { value: Vector2 }) {
		this.palettes = { speed: paletteTexture('speed'), temperature: paletteTexture('temperature'), smoke: paletteTexture('particulates') };
		const geometry = new BoxGeometry(1, 1, 1);
		geometry.translate(0.5, 0.5, 0.5);
		const material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: {
				...fields.uniforms,
				...depth,
				uBoxMin: { value: new Vector3() },
				uBoxMax: { value: new Vector3(1, 1, 1) },
				uStep: { value: 0.08 },
				uMaxSteps: { value: MAX_STEPS },
				uChannel: { value: 0 },
				uLog: { value: 0 },
				uDiverging: { value: 0 },
				uFloor: { value: 0 },
				uDensity: { value: DENSITY },
				uPalette: { value: this.palettes.speed as Texture },
				uMapping: { value: new Vector2(1, 0) },
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

	/** Shows `kind` (or nothing, for Off) at the view's sensitivity. */
	setKind(kind: OverlayId, sensitivity: number) {
		this.kind = kind;
		this.mesh.visible = kind !== 'off';
		if (kind === 'off') return;
		const { uniforms } = this.mesh.material;
		const mapping = overlayMapping(kind, sensitivity);
		uniforms.uPalette.value = this.palettes[kind];
		uniforms.uMapping.value.set(mapping.scale, mapping.offset);
		uniforms.uChannel.value = mapping.channel;
		uniforms.uLog.value = mapping.log ? 1 : 0;
		uniforms.uDiverging.value = kind === 'temperature' ? 1 : 0;
		uniforms.uFloor.value = OVERLAY_FLOOR[kind];
	}

	/** The home's box, m, and the volume's finest cell edge, which sets the step. */
	setBox(box: Vector3, step: number) {
		const { uniforms } = this.mesh.material;
		(uniforms.uBoxMin.value as Vector3).set(0, 0, 0);
		(uniforms.uBoxMax.value as Vector3).copy(box);
		this.mesh.scale.copy(box);
		uniforms.uStep.value = Math.max(0.04, 0.5 * step);
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		for (const texture of Object.values(this.palettes)) texture.dispose();
	}
}

/** The clay the world turns to under an overlay: a light, warm neutral, matte. */
export const CLAY = new Color(0xd9d5ce);

type Colored = Material & { color: Color; map?: Texture | null; emissive?: Color; roughness?: number; metalness?: number; vertexColors: boolean };

/** What a material was before it turned to clay. */
interface Saved {
	color: Color;
	map: Texture | null;
	emissive: Color | null;
	roughness: number | undefined;
	metalness: number | undefined;
	vertexColors: boolean;
}

const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * Turns the world to clay and back by changing its own materials in place, so whatever a material does in its own shader (a wall
 * cut down on the GPU, a faded wall) carries on: each lit material loses its texture and its colour for the clay, a little lighter
 * or darker as it was, and goes matte. Called each frame while an overlay is on, so what is added meanwhile (a fan dropped in,
 * another Home) turns too; a material already clay is left alone.
 */
export class Clay {
	private readonly saved = new Map<Colored, Saved>();
	private readonly scratch = new Color();

	get active() {
		return this.saved.size > 0;
	}

	apply(roots: Iterable<Object3D>) {
		for (const root of roots)
			root.traverse((object) => {
				const material = (object as Object3D & { material?: Material | Material[] }).material;
				if (!material) return;
				for (const m of Array.isArray(material) ? material : [material]) this.turn(m as Colored);
			});
	}

	private turn(material: Colored) {
		if (this.saved.has(material) || !material.color || !('isMeshStandardMaterial' in material || 'isMeshLambertMaterial' in material || 'isMeshPhongMaterial' in material)) return;
		this.saved.set(material, {
			color: material.color.clone(),
			map: material.map ?? null,
			emissive: material.emissive ? material.emissive.clone() : null,
			roughness: material.roughness,
			metalness: material.metalness,
			vertexColors: material.vertexColors
		});
		const shade = 0.86 + 0.24 * Math.min(1, luminance(material.color));
		material.color.copy(this.scratch.copy(CLAY).multiplyScalar(shade));
		material.emissive?.setRGB(0, 0, 0);
		if (material.roughness !== undefined) material.roughness = Math.max(material.roughness, 0.85);
		if (material.metalness !== undefined) material.metalness = 0;
		if (material.map || material.vertexColors) {
			material.map = null;
			material.vertexColors = false;
			material.needsUpdate = true;
		}
	}

	restore() {
		for (const [material, saved] of this.saved) {
			material.color.copy(saved.color);
			if (saved.emissive) material.emissive?.copy(saved.emissive);
			if (saved.roughness !== undefined) material.roughness = saved.roughness;
			if (saved.metalness !== undefined) material.metalness = saved.metalness;
			if (saved.map || saved.vertexColors) {
				material.map = saved.map;
				material.vertexColors = saved.vertexColors;
				material.needsUpdate = true;
			}
		}
		this.saved.clear();
	}
}
