import { Box3, Vector2, type Material, type Mesh, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Quality } from './quality';

/**
 * The picture after the scene is drawn, in a high dynamic range buffer: ambient occlusion (GTAO, worked out at a share of the
 * resolution), a gentle bloom on what is brighter than white, AgX tone mapping (the renderer's, applied by the output pass), a warm
 * grade, and SMAA for the edges. A tier without ambient occlusion or bloom drops those passes.
 */

/** The grade, after tone mapping: warmer highlights and shadows, a touch more colour and contrast than AgX gives, a soft vignette. */
const GradeShader = {
	name: 'AirflowGrade',
	uniforms: {
		tDiffuse: { value: null },
		uWarmth: { value: 1 },
		uSaturation: { value: 1.14 },
		uContrast: { value: 0.32 },
		uVignette: { value: 0.22 },
		uLift: { value: 0.012 }
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float uWarmth;
		uniform float uSaturation;
		uniform float uContrast;
		uniform float uVignette;
		uniform float uLift;
		varying vec2 vUv;
		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			vec3 c = texel.rgb;
			float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
			// Warm: a little more red and less blue in the light, and the shadows lifted toward amber rather than grey.
			c *= mix( vec3( 1.0 ), vec3( 1.035, 1.0, 0.94 ), uWarmth );
			c += uLift * uWarmth * vec3( 1.0, 0.82, 0.58 ) * ( 1.0 - luma );
			c = mix( vec3( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ), c, uSaturation );
			// A gentle S-curve: AgX is soft, and the Sims look is a little punchier.
			c = clamp( c, 0.0, 1.0 );
			c = mix( c, c * c * ( 3.0 - 2.0 * c ), uContrast );
			vec2 d = vUv - 0.5;
			c *= 1.0 - uVignette * smoothstep( 0.18, 0.75, dot( d, d ) * 2.0 );
			gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), texel.a );
		}`
};

/** GTAO whose working buffers are a share of the picture's size, and which leaves see-through things (glass, the slice, markers) out of its depth. */
class ScaledGTAOPass extends GTAOPass {
	private readonly hidden: Object3D[] = [];

	constructor(
		scene: Scene,
		camera: PerspectiveCamera,
		width: number,
		height: number,
		private readonly scale: number
	) {
		super(scene, camera, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
	}

	override setSize(width: number, height: number) {
		super.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
	}

	/** Called by GTAOPass before it draws normals and depth: points and lines are left out by GTAOPass itself, and transparent meshes here. */
	_overrideVisibility() {
		this.scene.traverse((object) => {
			const mesh = object as Mesh;
			if (!object.visible) return;
			const material = mesh.material as Material | Material[] | undefined;
			const seeThrough = material && (Array.isArray(material) ? material.some((m) => m.transparent) : material.transparent);
			if ((mesh as unknown as { isPoints?: boolean }).isPoints || (mesh as unknown as { isLine?: boolean }).isLine || seeThrough || object.userData.noAO) {
				object.visible = false;
				this.hidden.push(object);
			}
		});
	}

	_restoreVisibility() {
		for (const object of this.hidden) object.visible = true;
		this.hidden.length = 0;
	}
}

export class Post {
	readonly composer: EffectComposer;
	private readonly gtao: ScaledGTAOPass | null = null;
	private readonly bloom: UnrealBloomPass | null = null;
	private readonly grade: ShaderPass;

	constructor(
		renderer: WebGLRenderer,
		scene: Scene,
		camera: PerspectiveCamera,
		quality: Quality,
		size: { width: number; height: number; ratio: number }
	) {
		const width = Math.max(1, Math.round(size.width * size.ratio));
		const height = Math.max(1, Math.round(size.height * size.ratio));
		this.composer = new EffectComposer(renderer);
		this.composer.setPixelRatio(size.ratio);
		this.composer.setSize(size.width, size.height);
		this.composer.addPass(new RenderPass(scene, camera));
		if (quality.ao) {
			const gtao = new ScaledGTAOPass(scene, camera, width, height, quality.ao.scale);
			gtao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1, thickness: 0.35, scale: 1.4, samples: quality.ao.samples, distanceFallOff: 1, screenSpaceRadius: false });
			gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
			gtao.blendIntensity = 1;
			this.composer.addPass(gtao);
			this.gtao = gtao;
		}
		if (quality.bloom) {
			const bloom = new UnrealBloomPass(new Vector2(width, height), 0.08, 0.35, 1.8);
			this.composer.addPass(bloom);
			this.bloom = bloom;
		}
		this.composer.addPass(new OutputPass());
		this.grade = new ShaderPass(GradeShader);
		this.composer.addPass(this.grade);
		if (quality.smaa) this.composer.addPass(new SMAAPass());
	}

	/** Limits ambient occlusion to a box round the Home, so the far lawn and the sky cost nothing. */
	setClipBox(box: Box3 | null) {
		// Null clears the box, which GTAOPass accepts though its type does not say so.
		this.gtao?.setSceneClipBox(box as Box3);
	}

	setSize(width: number, height: number, ratio: number) {
		this.composer.setPixelRatio(ratio);
		this.composer.setSize(width, height);
	}

	render(dt: number) {
		this.composer.render(dt);
	}

	dispose() {
		for (const pass of this.composer.passes) (pass as { dispose?: () => void }).dispose?.();
		this.composer.dispose();
	}
}
