import { Color, EquirectangularReflectionMapping, HalfFloatType, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, type DataTexture, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * The CC0 models, textures and sky the Home is drawn with (`static/airflow/`, licences in `static/airflow/LICENSES.md`), fetched
 * once before the first frame, so nothing pops in after the world appears. About 6 MB: the sky 1.2 MB, the twelve maps 4.1 MB and
 * the models a few hundred kB.
 */

const ROOT = '/airflow';

/** The Kenney Furniture Kit models the plans' pieces are built from (`look/furniture.ts` says which piece takes which). */
export const FURNITURE_FILES = [
	'bedDouble',
	'loungeSofa',
	'loungeChair',
	'cabinetTelevision',
	'cabinetTelevisionDoors',
	'table',
	'chairCushion',
	'kitchenFridgeLarge',
	'kitchenCabinetUpperDouble',
	'cabinetBedDrawerTable',
	'lampRoundTable',
	'sideTableDrawers',
	'laptop',
	'books',
	'plantSmall1',
	'bathroomCabinetDrawer',
	'toilet',
	'bathtub',
	'washer',
	'dryer'
] as const;

/** The Kenney Nature Kit models that stand round the Home. */
export const NATURE_FILES = ['tree_oak', 'tree_default', 'tree_fat', 'tree_detailed', 'grass_large', 'flower_redA', 'flower_yellowB', 'flower_purpleA', 'rock_smallA'] as const;

export type FurnitureFile = (typeof FURNITURE_FILES)[number];
export type NatureFile = (typeof NATURE_FILES)[number];

/** A Poly Haven material: its colour map (sRGB), its normal map (OpenGL) and `arm` (ambient occlusion, roughness and metalness in red, green and blue). */
export interface PbrMaps {
	color: Texture;
	normal: Texture;
	arm: Texture;
	/** The colour map's mean, linear, so a material can tint the map to a paint colour without darkening it. */
	mean: Color;
}

export interface LookAssets {
	furniture: Map<FurnitureFile, Object3D>;
	nature: Map<NatureFile, Object3D>;
	laminate: PbrMaps;
	tiles: PbrMaps;
	wall: PbrMaps;
	grass: { color: Texture; normal: Texture; roughness: Texture; mean: Color };
	/** The sky, equirectangular and linear, for the background and (through PMREM) the ambient light and reflections. */
	sky: DataTexture;
}

/** Decodes an image off the drawing path (`decode()`), so uploading it later does not stall a frame. */
async function image(url: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.decoding = 'async';
	img.src = url;
	await img.decode();
	return img;
}

/** The mean colour of an image, linear: drawn into a few pixels and averaged. */
function meanOf(img: HTMLImageElement): Color {
	const size = 16;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	const mean = new Color(0.5, 0.5, 0.5);
	if (!context) return mean;
	context.drawImage(img, 0, 0, size, size);
	const { data } = context.getImageData(0, 0, size, size);
	let r = 0;
	let g = 0;
	let b = 0;
	for (let i = 0; i < data.length; i += 4) {
		const linear = new Color().setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, SRGBColorSpace);
		r += linear.r;
		g += linear.g;
		b += linear.b;
	}
	const n = data.length / 4;
	return mean.setRGB(r / n, g / n, b / n);
}

function texture(img: HTMLImageElement, color: boolean): Texture {
	const map = new Texture(img);
	map.wrapS = map.wrapT = RepeatWrapping;
	map.colorSpace = color ? SRGBColorSpace : NoColorSpace;
	map.needsUpdate = true;
	return map;
}

async function pbr(name: string): Promise<PbrMaps> {
	const [color, normal, arm] = await Promise.all([image(`${ROOT}/textures/${name}_diff_1k.jpg`), image(`${ROOT}/textures/${name}_nor_gl_1k.jpg`), image(`${ROOT}/textures/${name}_arm_1k.jpg`)]);
	return { color: texture(color, true), normal: texture(normal, false), arm: texture(arm, false), mean: meanOf(color) };
}

/**
 * Fetches every asset. `progress` hears the share done, 0 to 1, as each file arrives. Rejects if any file cannot be had: the world is
 * not drawn half furnished.
 */
export async function loadLookAssets(progress?: (done: number) => void): Promise<LookAssets> {
	const total = FURNITURE_FILES.length + NATURE_FILES.length + 3 * 3 + 3 + 1;
	let done = 0;
	const tick = <T>(value: T) => {
		done++;
		progress?.(done / total);
		return value;
	};
	const gltf = new GLTFLoader();
	const model = (kit: string, name: string) => gltf.loadAsync(`${ROOT}/models/${kit}/${name}.glb`).then((loaded) => tick(loaded.scene as Object3D));
	const sky = new HDRLoader()
		.setDataType(HalfFloatType)
		.loadAsync(`${ROOT}/sky/kloppenheim_06_puresky_1k.hdr`)
		.then((loaded) => {
			loaded.mapping = EquirectangularReflectionMapping;
			return tick(loaded as DataTexture);
		});
	const grass = Promise.all([image(`${ROOT}/textures/grass004_color_512.jpg`), image(`${ROOT}/textures/grass004_normal_gl_512.jpg`), image(`${ROOT}/textures/grass004_roughness_512.jpg`)]).then(([color, normal, roughness]) => {
		done += 2;
		return tick({ color: texture(color, true), normal: texture(normal, false), roughness: texture(roughness, false), mean: meanOf(color) });
	});
	const set = (name: string) =>
		pbr(name).then((maps) => {
			done += 2;
			return tick(maps);
		});
	const [furniture, nature, laminate, tiles, wall, lawn, hdr] = await Promise.all([
		Promise.all(FURNITURE_FILES.map((name) => model('furniture', name).then((scene) => [name, scene] as const))),
		Promise.all(NATURE_FILES.map((name) => model('nature', name).then((scene) => [name, scene] as const))),
		set('laminate_floor_02'),
		set('interior_tiles'),
		set('beige_wall_001'),
		grass,
		sky
	]);
	return { furniture: new Map(furniture), nature: new Map(nature), laminate, tiles, wall, grass: lawn, sky: hdr };
}

/** Frees the GPU side of every texture. The models' geometries are freed by whatever drew them. */
export function disposeLookAssets(assets: LookAssets) {
	for (const maps of [assets.laminate, assets.tiles, assets.wall]) for (const map of [maps.color, maps.normal, maps.arm]) map.dispose();
	for (const map of [assets.grass.color, assets.grass.normal, assets.grass.roughness]) map.dispose();
	assets.sky.dispose();
}
