import { Color, Group, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3, type BufferGeometry, type Material, type MeshStandardMaterial, type Object3D, type Texture } from 'three';
import { isExterior, type HomePlan } from '../../homes/types';
import { EXTERIOR_WALL } from '../wallPieces';
import type { LookAssets, NatureFile } from './assets';
import { CutBoxes } from './boxes';
import { GRADE } from './floors';
import type { Materials } from './materials';
import { TEXTURE_METRES, noiseTexture } from './textures';

/**
 * What stands round a Home: a lawn whose grass maps are broken up by a large, slow tint (drier and lusher drifts, so the repeat never
 * shows), a paved walk to the front door, and a few Kenney Nature Kit trees, shrubs, flowers and tufts. Nothing here is in the
 * simulation: the solver's box is the footprint, and the lawn and the planting are only the setting.
 */

/** How far the lawn reaches from the middle of the Home, m. Past it the fog has long since taken over. */
const LAWN = 90;

/** The kit's colours replaced: natural greens for the leaves and a warm brown bark, so the planting sits with the house. */
const NATURE_FINISH: Record<string, { color: number; roughness: number }> = {
	leafsGreen: { color: 0x6c9348, roughness: 0.82 },
	leafsDark: { color: 0x557a3e, roughness: 0.82 },
	woodBark: { color: 0x6b5141, roughness: 0.9 },
	woodBarkDark: { color: 0x5c4536, roughness: 0.9 },
	grass: { color: 0x6f9447, roughness: 0.85 },
	dirt: { color: 0x8a6c50, roughness: 0.95 },
	stone: { color: 0xb3ada2, roughness: 0.9 },
	stoneDark: { color: 0x9a948a, roughness: 0.9 },
	colorRed: { color: 0xd25c50, roughness: 0.7 },
	colorYellow: { color: 0xeab845, roughness: 0.7 },
	colorPurple: { color: 0x9a7cc6, roughness: 0.7 },
	_defaultMat: { color: 0xd8d2c6, roughness: 0.8 }
};

/** A seeded generator, uniform in [0, 1), so a Home's planting is the same on every visit. */
function seeded(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};
}

/**
 * The lawn's material: the grass maps at their size, tinted by two octaves of soft noise far larger than a repeat, in world space,
 * so the same patch of grass never shows twice.
 */
function lawnMaterial(materials: Materials, noise: Texture): MeshStandardMaterial {
	const material = materials.grass.clone() as MeshStandardMaterial;
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uLawnNoise = { value: noise };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec2 vLawn;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLawn = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform sampler2D uLawnNoise;\nvarying vec2 vLawn;')
			.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				float lawnDrift = texture2D( uLawnNoise, vLawn / 41.0 ).r * 0.62 + texture2D( uLawnNoise, vLawn / 13.0 + 0.37 ).r * 0.38;
				float lawnDry = smoothstep( 0.36, 0.72, lawnDrift );
				diffuseColor.rgb *= mix( vec3( 0.86, 1.02, 0.9 ), vec3( 1.16, 1.06, 0.74 ), lawnDry );`
			);
	};
	material.customProgramCacheKey = () => 'airflow-lawn';
	return material;
}

interface Planting {
	file: NatureFile;
	x: number;
	z: number;
	/** Height of the model as drawn, m. */
	height: number;
	turn: number;
}

/** Where the trees stand: behind the Home and to its sides as the default view sees it (it looks from the south-west), so none hides a room. */
function trees(plan: HomePlan): Planting[] {
	const { width: w, depth: d } = plan;
	return [
		{ file: 'tree_oak', x: -3.6, z: -2.6, height: 5.2, turn: 0.4 },
		{ file: 'tree_default', x: w * 0.42, z: -9.5, height: 7.4, turn: 1.3 },
		{ file: 'tree_fat', x: w * 0.82, z: -8.2, height: 6.0, turn: 2.1 },
		{ file: 'tree_detailed', x: w + 3.2, z: -2.2, height: 5.0, turn: 0.9 },
		{ file: 'tree_oak', x: w + 4.6, z: d * 0.6, height: 5.8, turn: 2.6 },
		{ file: 'tree_fat', x: w + 3.8, z: d + 3.4, height: 4.4, turn: 1.7 },
		{ file: 'tree_default', x: -5.8, z: d * 0.34, height: 5.6, turn: 3.0 }
	];
}

/** The front door: the first outside door of the plan, and the facade it is in. */
function frontDoor(plan: HomePlan) {
	for (const opening of plan.openings) {
		if (opening.kind !== 'door' && opening.kind !== 'sliding-door') continue;
		if (isExterior(opening.placement)) return { opening, facade: opening.placement.facade, center: opening.placement.center };
	}
	return null;
}

/** A point `out` metres out from a facade at `along` metres along it, in the plan. */
function outFrom(plan: HomePlan, facade: 'north' | 'east' | 'south' | 'west', along: number, out: number): [number, number] {
	const t = EXTERIOR_WALL;
	switch (facade) {
		case 'north':
			return [along, -t - out];
		case 'south':
			return [along, plan.depth + t + out];
		case 'west':
			return [-t - out, along];
		default:
			return [plan.width + t + out, along];
	}
}

export interface OutsideView {
	group: Group;
	dispose(): void;
}

/** The lawn, the walk and the planting for a plan. With no `assets` (Node, or a failed fetch) the lawn is all there is. */
export function buildOutside(plan: HomePlan, materials: Materials, assets: LookAssets | null): OutsideView {
	const group = new Group();
	group.name = 'outside';
	const owned: (BufferGeometry | Material | Texture)[] = [];
	const cx = plan.width / 2;
	const cz = plan.depth / 2;

	// The lawn: one big plane with texture coordinates in world metres.
	const metres = materials.lawnMetres;
	const lawnGeometry = new PlaneGeometry(LAWN * 2, LAWN * 2, 1, 1);
	lawnGeometry.rotateX(-Math.PI / 2);
	lawnGeometry.translate(cx, GRADE, cz);
	const position = lawnGeometry.getAttribute('position');
	const uv = lawnGeometry.getAttribute('uv');
	for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / metres, -position.getZ(i) / metres);
	const noise = noiseTexture(256, 4, 4, 97);
	const lawnMat = lawnMaterial(materials, noise);
	const lawn = new Mesh(lawnGeometry, lawnMat);
	lawn.name = 'lawn';
	lawn.receiveShadow = true;
	group.add(lawn);
	owned.push(lawnGeometry, lawnMat, noise);

	// A paved walk from the front door's step out across the lawn.
	const door = frontDoor(plan);
	if (door) {
		const walk = new CutBoxes(TEXTURE_METRES.paving);
		const half = 0.6;
		const [x0, z0] = outFrom(plan, door.facade, door.center - half, 0.7);
		const [x1, z1] = outFrom(plan, door.facade, door.center + half, 5.5);
		walk.add(Math.min(x0, x1), Math.max(x0, x1), GRADE - 0.02, GRADE + 0.025, Math.min(z0, z1), Math.max(z0, z1), { skip: ['ny'] });
		const mesh = new Mesh(walk.build().geometry, materials.paving);
		mesh.receiveShadow = true;
		owned.push(mesh.geometry);
		group.add(mesh);
	}

	if (!assets) return { group, dispose: () => dispose(group, owned) };

	const random = seeded(plan.width * 1000 + plan.depth * 7);
	const finish = (name: string) => {
		const chosen = NATURE_FINISH[name] ?? NATURE_FINISH._defaultMat;
		return materials.paint(new Color(chosen.color), chosen.roughness, 0);
	};
	const place = (spot: Planting) => {
		const source = assets.nature.get(spot.file);
		if (!source) return;
		const copy = source.clone(true);
		const size = sizeOf(source);
		// Each tree a little different: its leaves a shade lighter or darker.
		const shade = 0.9 + random() * 0.2;
		copy.traverse((object) => {
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '_defaultMat';
			if (/leafs/i.test(name)) {
				const base = NATURE_FINISH[name] ?? NATURE_FINISH.leafsGreen;
				mesh.material = materials.paint(new Color(base.color).multiplyScalar(shade), base.roughness, 0);
			} else mesh.material = finish(name);
			mesh.castShadow = mesh.receiveShadow = true;
		});
		const scale = spot.height / Math.max(size.y, 1e-3);
		copy.scale.setScalar(scale);
		copy.rotation.y = spot.turn;
		copy.position.set(spot.x, GRADE + 0.05 * scale - 0.02, spot.z);
		group.add(copy);
	};
	for (const tree of trees(plan)) place(tree);

	// Shrubs along the facades the default view looks at, between the windows, and flowers either side of the front door.
	const busy = (facade: string, at: number) =>
		plan.openings.some((o) => isExterior(o.placement) && o.placement.facade === facade && Math.abs(o.placement.center - at) < o.width / 2 + 0.45);
	for (const facade of ['south', 'west'] as const) {
		const length = facade === 'south' ? plan.width : plan.depth;
		for (let at = 0.9; at < length - 0.6; at += 1.5 + random() * 0.6) {
			if (busy(facade, at)) continue;
			const [x, z] = outFrom(plan, facade, at, 0.45);
			place({ file: 'plant_bushDetailed', x, z, height: 0.55 + random() * 0.25, turn: random() * Math.PI * 2 });
		}
	}
	if (door) {
		const flowers: NatureFile[] = ['flower_redA', 'flower_yellowB', 'flower_purpleA'];
		for (const side of [-1, 1]) {
			for (let n = 0; n < 5; n++) {
				const along = door.center + side * (1.15 + random() * 0.9);
				const [x, z] = outFrom(plan, door.facade, along, 0.3 + random() * 0.7);
				place({ file: flowers[n % flowers.length], x, z, height: 0.32 + random() * 0.18, turn: random() * Math.PI * 2 });
			}
		}
		const [rx, rz] = outFrom(plan, door.facade, door.center + 2.6, 2.2);
		place({ file: 'rock_smallA', x: rx, z: rz, height: 0.35, turn: 0.7 });
	}

	// Tufts of long grass scattered over the lawn near the Home, as one instanced mesh per part of the model.
	const tuft = assets.nature.get('grass_large');
	if (tuft) {
		const spots: Matrix4[] = [];
		const size = sizeOf(tuft);
		const at = new Vector3();
		const turn = new Quaternion();
		const scale = new Vector3();
		for (let tries = 0; tries < 400 && spots.length < 70; tries++) {
			const x = cx + (random() * 2 - 1) * (plan.width / 2 + 9);
			const z = cz + (random() * 2 - 1) * (plan.depth / 2 + 9);
			if (x > -1.2 && x < plan.width + 1.2 && z > -1.2 && z < plan.depth + 1.2) continue;
			const s = (0.28 + random() * 0.22) / size.y;
			at.set(x, GRADE - 0.01, z);
			turn.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
			scale.set(s, s, s);
			spots.push(new Matrix4().compose(at, turn, scale));
		}
		tuft.traverse((object) => {
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			const instanced = new InstancedMesh(mesh.geometry, materials.paint(new Color(0x7a9a4d), 0.9, 0), spots.length);
			const local = mesh.matrixWorld.clone();
			spots.forEach((spot, i) => instanced.setMatrixAt(i, spot.clone().multiply(local)));
			instanced.receiveShadow = true;
			group.add(instanced);
		});
	}
	return { group, dispose: () => dispose(group, owned) };
}

function sizeOf(object: Object3D) {
	object.updateMatrixWorld(true);
	let top = -Infinity;
	let bottom = Infinity;
	object.traverse((child) => {
		const mesh = child as Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry.computeBoundingBox();
		const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
		top = Math.max(top, box.max.y);
		bottom = Math.min(bottom, box.min.y);
	});
	return { y: top - bottom };
}

function dispose(group: Group, owned: (BufferGeometry | Material | Texture)[]) {
	group.removeFromParent();
	for (const thing of owned) thing.dispose();
}
