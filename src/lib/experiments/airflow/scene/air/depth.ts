import {
	DepthTexture,
	FloatType,
	Material,
	MeshBasicMaterial,
	NearestFilter,
	UnsignedByteType,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	type Object3D,
	type PerspectiveCamera,
	type Scene,
	type Texture,
	type WebGLRenderer
} from 'three';

/**
 * One depth pre-pass of the world, which the smoke and the overlay share: each stops its ray at the nearest wall, floor or piece of
 * furniture, so smoke never shows through a wall and the tint never fills a sofa. Only opaque surfaces are drawn into it; glass, a
 * wall faded to see through, particles and the air itself are left out. It draws with one plain material that writes depth only,
 * except for a mesh whose material changes its vertices in its own shader (a wall cut down on the GPU), which keeps its own
 * material with its colour writes off, so the depth is of the wall as it stands.
 */

export interface DepthUniforms {
	uDepth: { value: Texture | null };
	uResolution: { value: Vector2 };
	uCameraNear: { value: number };
	uCameraFar: { value: number };
	uCameraForward: { value: Vector3 };
}

/** Whether a material moves its vertices in a shader of its own, so the plain depth material would put them somewhere else. */
const ownShader = (material: Material) => Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') || (material as Material & { isShaderMaterial?: boolean }).isShaderMaterial === true;

export class DepthPrepass {
	readonly uniforms: DepthUniforms = {
		uDepth: { value: null },
		uResolution: { value: new Vector2(1, 1) },
		uCameraNear: { value: 0.1 },
		uCameraFar: { value: 100 },
		uCameraForward: { value: new Vector3(0, 0, -1) }
	};
	private target: WebGLRenderTarget | null = null;
	private readonly material = new MeshBasicMaterial({ colorWrite: false });
	private readonly size = new Vector2();
	private readonly hidden: Object3D[] = [];
	/** Materials drawn as themselves with their colour writes off, and whether each wrote colour before. */
	private readonly muted: [Material, boolean][] = [];

	/** Draws the depth of `scene` from `camera` at the size of the canvas, leaving out `skip` (the air) and whatever is not an opaque surface. */
	render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, skip: Object3D) {
		renderer.getDrawingBufferSize(this.size);
		const width = Math.max(1, Math.floor(this.size.x));
		const height = Math.max(1, Math.floor(this.size.y));
		if (!this.target || this.target.width !== width || this.target.height !== height) {
			this.target?.depthTexture?.dispose();
			this.target?.dispose();
			const depthTexture = new DepthTexture(width, height, FloatType);
			depthTexture.minFilter = depthTexture.magFilter = NearestFilter;
			this.target = new WebGLRenderTarget(width, height, { type: UnsignedByteType, depthBuffer: true, stencilBuffer: false, depthTexture, generateMipmaps: false });
		}

		const { hidden, muted } = this;
		if (skip.visible) {
			skip.visible = false;
			hidden.push(skip);
		}
		scene.traverseVisible((object) => {
			if (!object.visible) return;
			const drawn = object as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean; material?: Material | Material[] };
			if (drawn.isPoints || drawn.isLine || drawn.isSprite) {
				object.visible = false;
				hidden.push(object);
				return;
			}
			if (!drawn.isMesh || !drawn.material) return;
			const materials = Array.isArray(drawn.material) ? drawn.material : [drawn.material];
			if (materials.every((m) => m.transparent || !m.visible || !m.depthWrite || !m.depthTest)) {
				object.visible = false;
				hidden.push(object);
				return;
			}
			for (const m of materials)
				if (m.allowOverride && ownShader(m)) {
					muted.push([m, m.colorWrite]);
					m.allowOverride = false;
					m.colorWrite = false;
				}
		});

		const background = scene.background;
		const override = scene.overrideMaterial;
		const shadows = renderer.shadowMap.autoUpdate;
		scene.background = null;
		scene.overrideMaterial = this.material;
		renderer.shadowMap.autoUpdate = false;
		renderer.setRenderTarget(this.target);
		renderer.clear(true, true, false);
		renderer.render(scene, camera);
		renderer.shadowMap.autoUpdate = shadows;
		scene.overrideMaterial = override;
		scene.background = background;

		for (const [m, colorWrite] of muted) {
			m.allowOverride = true;
			m.colorWrite = colorWrite;
		}
		for (const object of hidden) object.visible = true;
		hidden.length = 0;
		muted.length = 0;

		const { uniforms } = this;
		uniforms.uDepth.value = this.target.depthTexture;
		uniforms.uResolution.value.set(width, height);
		uniforms.uCameraNear.value = camera.near;
		uniforms.uCameraFar.value = camera.far;
		camera.getWorldDirection(uniforms.uCameraForward.value);
	}

	dispose() {
		this.target?.depthTexture?.dispose();
		this.target?.dispose();
		this.material.dispose();
	}
}
