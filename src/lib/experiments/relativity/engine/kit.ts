import {
	CanvasTexture,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	Fog,
	GridHelper,
	HemisphereLight,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	SRGBColorSpace,
	Sprite,
	SpriteMaterial,
	Vector3,
	type BufferGeometry,
	type ColorRepresentation,
	type Material,
	type Object3D,
	type PerspectiveCamera,
	type Scene
} from 'three';

/** Everything a scene shares: soft materials, glows, shadows, and the studio it stands in. */

const textures = new Map<string, CanvasTexture>();

function radial(key: string, stops: [number, string][]) {
	const cached = textures.get(key);
	if (cached) return cached;
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const context = canvas.getContext('2d')!;
	const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	for (const [at, color] of stops) gradient.addColorStop(at, color);
	context.fillStyle = gradient;
	context.fillRect(0, 0, size, size);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	textures.set(key, texture);
	return texture;
}

export function disposeKit() {
	for (const texture of textures.values()) texture.dispose();
	textures.clear();
}

/** Soft, matte "clay" surface. */
export const clay = (color: ColorRepresentation, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
	new MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.02, ...extra });

/** Unlit color: diagram lines, light, anything that should read as a flat mark rather than an object. */
export const flat = (color: ColorRepresentation, extra: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}) =>
	new MeshBasicMaterial({ color, ...extra });

/** A soft round glow, for light and stars. Blends normally so it also works on the pale Stage tints. */
export function glow(color: ColorRepresentation, size: number, opacity = 0.6) {
	const texture = radial('glow', [
		[0, 'rgba(255,255,255,1)'],
		[0.3, 'rgba(255,255,255,.55)'],
		[1, 'rgba(255,255,255,0)']
	]);
	const sprite = new Sprite(
		new SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false, opacity })
	);
	sprite.scale.setScalar(size);
	sprite.renderOrder = 5;
	return sprite;
}

/** A soft dark blob on the floor under something, so it looks grounded without shadow maps. */
export function blobShadow(radius: number, strength = 0.32) {
	const texture = radial('blob', [
		[0, 'rgba(24,36,28,1)'],
		[0.55, 'rgba(24,36,28,.55)'],
		[1, 'rgba(24,36,28,0)']
	]);
	const mesh = new Mesh(
		new CircleGeometry(1, 40),
		new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: strength })
	);
	mesh.rotation.x = -Math.PI / 2;
	mesh.scale.setScalar(radius);
	mesh.position.y = 0.004;
	mesh.renderOrder = -1;
	return mesh;
}

/** Multiplies a color's channels: <1 darkens toward black, useful for a floor a little deeper than the Stage tint. */
export const shade = (color: number, factor: number) => new Color(color).multiplyScalar(factor);

/** Sets the Stage tint as background and fog, lights the scene softly, and lays down a floor pool and a grid. */
export function studio(scene: Scene, tint: number, options: { pool?: number; grid?: number; fog?: [number, number] } = {}) {
	scene.background = new Color(tint);
	const [near, far] = options.fog ?? [24, 60];
	scene.fog = new Fog(tint, near, far);

	scene.add(new HemisphereLight(0xffffff, shade(tint, 0.72), 1.55));
	const sun = new DirectionalLight(0xffffff, 2.3);
	sun.position.set(-5, 9, 7);
	scene.add(sun);

	const pool = new Mesh(
		new CircleGeometry(1, 72),
		new MeshBasicMaterial({
			map: radial('pool', [
				[0, 'rgba(255,255,255,.85)'],
				[0.6, 'rgba(255,255,255,.4)'],
				[1, 'rgba(255,255,255,0)']
			]),
			transparent: true,
			depthWrite: false
		})
	);
	pool.rotation.x = -Math.PI / 2;
	pool.position.y = -0.004;
	pool.scale.setScalar(options.pool ?? 14);
	pool.renderOrder = -3;
	scene.add(pool);

	if (options.grid) {
		const grid = new GridHelper(options.grid, Math.round(options.grid / 2), shade(tint, 0.9), shade(tint, 0.935));
		const material = grid.material as Material;
		material.depthWrite = false;
		grid.renderOrder = -2;
		scene.add(grid);
	}
}

/**
 * Many thin cylinders in one draw call: paths, rulers, the legs of a triangle. Each segment carries its
 * own color, so old parts of a trail can fade toward the background without any transparency.
 */
export class Tubes {
	readonly mesh: InstancedMesh;
	private readonly matrix = new Matrix4();
	private readonly quaternion = new Quaternion();
	private readonly scale = new Vector3();
	private readonly middle = new Vector3();
	private readonly along = new Vector3();
	private readonly color = new Color();
	private readonly up = new Vector3(0, 1, 0);
	private readonly background: Color;

	constructor(capacity: number, background: number) {
		this.background = new Color(background);
		const geometry = new CylinderGeometry(1, 1, 1, 10, 1, false);
		this.mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ color: 0xffffff }), capacity);
		this.mesh.count = 0;
		// Instances move every frame, so the bounds computed at creation would cull them wrongly.
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1;
	}

	/** Draws segment `index` from `a` to `b`. `fade` (0 to 1) blends its color toward the background. */
	set(index: number, a: Vector3, b: Vector3, radius: number, color: ColorRepresentation, fade = 0) {
		this.along.subVectors(b, a);
		const length = Math.max(this.along.length(), 1e-4);
		this.middle.addVectors(a, b).multiplyScalar(0.5);
		this.quaternion.setFromUnitVectors(this.up, this.along.divideScalar(length));
		this.scale.set(radius, length, radius);
		this.matrix.compose(this.middle, this.quaternion, this.scale);
		this.mesh.setMatrixAt(index, this.matrix);
		this.color.set(color).lerp(this.background, fade);
		this.mesh.setColorAt(index, this.color);
	}

	/** Shows the first `count` segments. */
	commit(count: number) {
		this.mesh.count = count;
		this.mesh.instanceMatrix.needsUpdate = true;
		if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
	}
}

/** 0 → 1 → 0 over one unit of phase: a point bouncing between two mirrors. */
export const triangle = (phase: number) => {
	const p = phase - Math.floor(phase);
	return p < 0.5 ? p * 2 : (1 - p) * 2;
};

/** Fades everything under `root` to `amount` (0 to 1) of its own opacity. Materials must not be shared with anything that fades separately. */
export function setOpacity(root: Object3D, amount: number) {
	root.traverse((object) => {
		const material = (object as Mesh).material as Material | Material[] | undefined;
		if (!material) return;
		for (const m of Array.isArray(material) ? material : [material]) {
			m.userData.base ??= m.opacity;
			m.transparent = amount < 0.999 || m.userData.base < 1;
			m.opacity = m.userData.base * amount;
		}
	});
}

/**
 * A sheet of Stage tint in front of the camera. Fading to it hides a loop's reset, so a scene can
 * snap its objects back to the start without anyone seeing them jump.
 */
export class Fader {
	private readonly mesh: Mesh;

	constructor(scene: Scene, camera: PerspectiveCamera, tint: number) {
		this.mesh = new Mesh(
			new PlaneGeometry(6, 6),
			new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false })
		);
		this.mesh.position.z = -1;
		this.mesh.renderOrder = 999;
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
		camera.add(this.mesh);
		scene.add(camera);
	}

	/** 0 shows the scene, 1 shows only the tint. */
	set(amount: number) {
		const material = this.mesh.material as MeshBasicMaterial;
		material.opacity = amount;
		this.mesh.visible = amount > 0.001;
	}
}

/** Frees the geometries and materials under `root` (never the shared textures). */
export function disposeTree(root: Object3D) {
	root.traverse((object) => {
		const mesh = object as Mesh;
		(mesh.geometry as BufferGeometry | undefined)?.dispose();
		const material = mesh.material as Material | Material[] | undefined;
		if (Array.isArray(material)) for (const m of material) m.dispose();
		else material?.dispose();
	});
}
