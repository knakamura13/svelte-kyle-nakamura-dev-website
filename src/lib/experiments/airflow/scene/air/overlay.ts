import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, Vector2, Vector3, type DataTexture, type Material, type Object3D, type Texture } from 'three';
import type { OverlayId } from '../../state';
import { PALETTE_GLSL } from '../../viz/palettes';
import { paletteTexture } from '../sliceLayer';
import type { DepthUniforms } from './depth';
import type { AirFields } from './fields';
import { BOX_GLSL, DEPTH_GLSL, HASH_GLSL, VOLUME_GLSL } from './glsl';
import { HAZE, overlayMapping, type OverlayKind } from './legend';
import { PREMULTIPLIED } from './smokeVolume';

export { HAZE, STREAK_AIR, overlayLegend, overlayMapping, overlayStrength, streakColor, type OverlayKind, type OverlayLegend, type OverlayLegendOptions } from './legend';

/**
 * What an overlay adds besides colouring the streaks (`streaks.ts`): a faint haze of the same colours through the rooms, so a jet of
 * fast air, a pocket of cold air or a cloud of smoke shows between the streaks too. A ray from the camera is marched through the
 * home's box up to the nearest surface (`depth.ts`), and the air it passes tints it by its value on the overlay's palette, the more
 * strongly the stronger the value (`overlayStrength`); air with nothing to show adds nothing. However much air a ray crosses, the haze
 * covers at most `HAZE.cap` of what is behind it, so the room always reads through it. There is no plane: the field is drawn where
 * the air is.
 *
 * The world keeps its own colours, a little muted (`Mute`), so the overlay's colours stand out of it.
 */

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
uniform float uDensity;
uniform float uCap;
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
		float alpha = 1.0 - exp(-uDensity * air * signal * dt);
		color += transmittance * alpha * toLinear(paletteColor(fraction));
		transmittance *= 1.0 - alpha;
	}
	float opacity = 1.0 - transmittance;
	if (opacity < 0.003) discard;
	// Never more than the cap, so the room reads through it: colour and opacity scaled together keep the haze's hue.
	float keep = min(1.0, uCap / opacity);
	// Into the march target (march.ts): linear, and already multiplied by its opacity.
	gl_FragColor = vec4(color * keep, opacity * keep);
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
				uDensity: { value: HAZE.density },
				uCap: { value: HAZE.cap },
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

	/** Shows the haze of `kind` (or nothing, for Off) at the view's sensitivity. */
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

/** How far the world's colours move toward grey while an overlay is on: lightly, so a room is still its own colour. */
export const MUTE = 0.3;

/** A colour moved `share` of the way to the grey of its own luminance (in the linear colours three.js keeps): lighter and darker stay so. */
export function muted(color: Color, share = MUTE, out = new Color()) {
	const grey = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
	return out.setRGB(color.r + (grey - color.r) * share, color.g + (grey - color.g) * share, color.b + (grey - color.b) * share);
}

type Colored = Material & { color: Color };

/**
 * Mutes the world's colours a little while an overlay is on, and gives them back, by changing each lit material's colour in place:
 * nothing else about a material changes, so its textures, its own shader (a wall cut down on the GPU) and its transparency (a faded
 * wall, glass) carry on, and no shader is compiled. Called each frame while an overlay is on, so what is added meanwhile (a fan dropped
 * in, another Home) is muted too; a material already muted is left alone.
 */
export class Mute {
	private readonly saved = new Map<Colored, Color>();

	get active() {
		return this.saved.size > 0;
	}

	apply(roots: Iterable<Object3D>) {
		for (const root of roots)
			root.traverse((object) => {
				const material = (object as Object3D & { material?: Material | Material[] }).material;
				if (!material) return;
				for (const m of Array.isArray(material) ? material : [material]) this.mute(m as Colored);
			});
	}

	private mute(material: Colored) {
		if (this.saved.has(material) || !material.color || !('isMeshStandardMaterial' in material || 'isMeshLambertMaterial' in material || 'isMeshPhongMaterial' in material)) return;
		this.saved.set(material, material.color.clone());
		muted(material.color, MUTE, material.color);
	}

	restore() {
		for (const [material, color] of this.saved) material.color.copy(color);
		this.saved.clear();
	}
}
