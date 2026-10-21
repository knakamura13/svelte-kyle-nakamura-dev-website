import { Box3, BoxGeometry, Color, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isExterior, type Furniture, type HomePlan } from '../../homes/types';
import { INTERIOR_WALL } from '../wallPieces';
import type { FurnitureFile, LookAssets } from './assets';
import type { Materials } from './materials';

/**
 * The plans' furniture, drawn with the Kenney Furniture Kit (CC0). Each piece of a plan is a solid box to the solver, and the solver
 * keeps exactly that box; what is drawn for it keeps its own proportions. A model of the kit is scaled by one factor on every axis,
 * the largest that keeps it inside the box (`uniformFit`; a bed's headboard may stand a little over it), stands on the floor against
 * the back of the box, and where it leaves the box short the rest is padded with what belongs there: legs under the sideboard, a
 * cabinet over the fridge, a lamp on a nightstand, a laptop on the desk. Where no model of the kit has a piece's proportions it is
 * built here, at real proportions and in the kit's flat-shaded style: the dining table, with the kit's chairs round it; the bookcase,
 * open-backed and filled with the kit's books; the kitchen's base cabinets, with the sink under the window and the stove away from
 * it; the chest of drawers; and the wardrobe. A piece is turned to face into its Room, its back to the wall nearest it (unless its
 * model would then fill its box far worse), and repainted in a warmer palette with real roughness.
 *
 * Every model faces +z in its own frame (the kit's convention: the front of a sofa, the foot of a bed). A piece is built in a frame of
 * its own, x across it, y up and z out of its front, centred on its box at the floor, and then turned and placed.
 */

export type Facing = 'north' | 'east' | 'south' | 'west';

/** The way each facing points in the plan (x east, z south). */
const FACING: Record<Facing, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const OPPOSITE: Record<Facing, Facing> = { north: 'south', east: 'west', south: 'north', west: 'east' };

/** A box side further than this from any wall has no wall behind it, m. */
const NO_WALL = 6;
/** How much a model that fits its box badly costs against a wall a metre away, in the choice of facing: a log of the mismatch of their shapes, times this. */
const STRETCH_WEIGHT = 1.6;
/** A piece whose back is this close to a wall stands against it, m; one further out stands in the middle of its box. */
const AGAINST = 0.3;

/**
 * How far each side of a piece's box is from a wall standing along that side, m: an outside wall (the footprint's edge) or an inside
 * one, which must run along at least a third of the side. `NO_WALL` when there is none.
 */
export function wallDistances(plan: HomePlan, item: Furniture): Record<Facing, number> {
	const x0 = item.x;
	const x1 = item.x + item.w;
	const z0 = item.z;
	const z1 = item.z + item.d;
	const lines: { axis: 'x' | 'z'; at: number; from: number; to: number; half: number }[] = [
		{ axis: 'x', at: 0, from: 0, to: plan.width, half: 0 },
		{ axis: 'x', at: plan.depth, from: 0, to: plan.width, half: 0 },
		{ axis: 'z', at: 0, from: 0, to: plan.depth, half: 0 },
		{ axis: 'z', at: plan.width, from: 0, to: plan.depth, half: 0 },
		...plan.walls.map((wall) => ({ ...wall, half: INTERIOR_WALL / 2 }))
	];
	const distances: Record<Facing, number> = { north: NO_WALL, east: NO_WALL, south: NO_WALL, west: NO_WALL };
	const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
	for (const line of lines) {
		if (line.axis === 'x') {
			if (overlap(x0, x1, line.from, line.to) < (x1 - x0) / 3) continue;
			if (line.at <= z0 + 1e-6) distances.north = Math.min(distances.north, z0 - line.at - line.half);
			if (line.at >= z1 - 1e-6) distances.south = Math.min(distances.south, line.at - z1 - line.half);
		} else {
			if (overlap(z0, z1, line.from, line.to) < (z1 - z0) / 3) continue;
			if (line.at <= x0 + 1e-6) distances.west = Math.min(distances.west, x0 - line.at - line.half);
			if (line.at >= x1 - 1e-6) distances.east = Math.min(distances.east, line.at - x1 - line.half);
		}
	}
	for (const side of Object.keys(distances) as Facing[]) distances[side] = Math.max(0, distances[side]);
	return distances;
}

/** The box's size across a piece (perpendicular to where it faces) and along it (front to back), m. */
export const extents = (item: Furniture, facing: Facing) => (facing === 'north' || facing === 'south' ? { across: item.w, along: item.d } : { across: item.d, along: item.w });

/**
 * Which way a piece faces: its back to the nearest wall, unless its model would then fit its box much worse. `natural` is the model's
 * own footprint, across and along (its width and depth); a piece built to its box's size passes a width of 0. Ties go to the facing
 * that looks toward the middle of the home.
 */
export function chooseFacing(plan: HomePlan, item: Furniture, natural: { across: number; along: number }): Facing {
	const walls = wallDistances(plan, item);
	const cx = item.x + item.w / 2;
	const cz = item.z + item.d / 2;
	const toMiddle = [plan.width / 2 - cx, plan.depth / 2 - cz];
	const length = Math.hypot(toMiddle[0], toMiddle[1]) || 1;
	let best: Facing = 'south';
	let bestCost = Infinity;
	for (const facing of ['south', 'east', 'north', 'west'] as Facing[]) {
		const { across, along } = extents(item, facing);
		const mismatch = natural.across > 0 ? Math.abs(Math.log(across / natural.across / (along / natural.along))) : Math.abs(Math.log(Math.max(along, 1e-3) / natural.along)) * 0.5;
		const [fx, fz] = FACING[facing];
		const cost = walls[OPPOSITE[facing]] + STRETCH_WEIGHT * mismatch - 0.02 * ((fx * toMiddle[0] + fz * toMiddle[1]) / length);
		if (cost < bestCost - 1e-9) {
			bestCost = cost;
			best = facing;
		}
	}
	return best;
}

/** The turn about the vertical that points a model's front (+z) toward `facing`. */
export const facingAngle = (facing: Facing) => Math.atan2(FACING[facing][0], FACING[facing][1]);

/** A model's size fitted into a box: one scale for every axis, and the width, height and depth it then has, m. */
export interface Fit {
	scale: number;
	width: number;
	height: number;
	depth: number;
}

/**
 * The largest single scale that keeps a model of `size` (its own width, height and depth) inside a box `across` × `height` × `along`,
 * its height allowed to reach `over` times the box's (a bed's headboard over its mattress). The model keeps its proportions; what it
 * leaves of the box is padded or left as space round it.
 */
export function uniformFit(size: { x: number; y: number; z: number }, across: number, height: number, along: number, over = 1): Fit {
	const scale = Math.max(1e-6, Math.min(across / size.x, (height * over) / size.y, along / size.z));
	return { scale, width: size.x * scale, height: size.y * scale, depth: size.z * scale };
}

// ---- the palette ----

interface Finish {
	color: number;
	roughness: number;
	metalness?: number;
}

/** The kit's materials by name, warmed and given a roughness: honey oak, linen, oatmeal upholstery, satin steel and white enamel. */
const FINISHES: Record<string, Finish> = {
	wood: { color: 0xc39a6b, roughness: 0.6 },
	woodDark: { color: 0x86603f, roughness: 0.58 },
	carpet: { color: 0xb9a68d, roughness: 0.95 },
	carpetWhite: { color: 0xf0ebe2, roughness: 0.92 },
	carpetBlue: { color: 0x7a93a2, roughness: 0.95 },
	carpetDarker: { color: 0x5e6a74, roughness: 0.9 },
	metal: { color: 0xc8c8c3, roughness: 0.32, metalness: 0.6 },
	metalLight: { color: 0xf1efea, roughness: 0.3, metalness: 0.04 },
	metalMedium: { color: 0x989d9b, roughness: 0.34, metalness: 0.45 },
	metalDark: { color: 0x3c3f40, roughness: 0.42, metalness: 0.3 },
	plant: { color: 0x7d9a5c, roughness: 0.8 },
	lamp: { color: 0xf3e8d2, roughness: 0.9 },
	_defaultMat: { color: 0xf3eee5, roughness: 0.5 }
};

/** Per kind of piece, the finishes that differ from the kit's: a sage sofa, an ochre armchair, a terracotta throw, porcelain in the bathroom. */
const PORCELAIN: Finish = { color: 0xf7f5f1, roughness: 0.14 };
const SAGE_CABINET = { wood: { color: 0xa9b8a3, roughness: 0.5 }, woodDark: { color: 0x96a690, roughness: 0.5 }, metal: { color: 0xece7de, roughness: 0.22, metalness: 0 } };
const OVERRIDES: Record<string, Record<string, Finish>> = {
	Sofa: { carpet: { color: 0x8aa38e, roughness: 0.96 }, wood: { color: 0x7d5a3e, roughness: 0.55 } },
	Armchair: { carpet: { color: 0xcf9f4c, roughness: 0.96 }, wood: { color: 0x7d5a3e, roughness: 0.55 } },
	'Queen bed': { carpet: { color: 0xc8836a, roughness: 0.96 }, wood: { color: 0xb3885d, roughness: 0.6 }, metal: { color: 0xb8a58c, roughness: 0.5, metalness: 0.2 } },
	'Coffee table': { wood: { color: 0x8c6545, roughness: 0.5 } },
	'TV console': { wood: { color: 0x94704f, roughness: 0.55 } },
	Sideboard: { wood: { color: 0xa67d58, roughness: 0.55 }, woodDark: { color: 0x6f4f36, roughness: 0.55 }, metal: { color: 0xc9a86a, roughness: 0.35, metalness: 0.9 } },
	'Dining table': { wood: { color: 0xb8895c, roughness: 0.55 }, woodDark: { color: 0x9a7049, roughness: 0.55 }, carpet: { color: 0xd8c7a9, roughness: 0.95 } },
	'Kitchen counter': SAGE_CABINET,
	'Kitchen island': SAGE_CABINET,
	Refrigerator: { metalLight: { color: 0xd9dad6, roughness: 0.28, metalness: 0.55 }, metalMedium: { color: 0x8f9593, roughness: 0.3, metalness: 0.6 }, ...SAGE_CABINET },
	Toilet: { carpetWhite: PORCELAIN, _defaultMat: PORCELAIN },
	Bathtub: { carpetWhite: PORCELAIN },
	Vanity: { carpetWhite: PORCELAIN, wood: { color: 0xa98058, roughness: 0.55 } },
	'Double vanity': { carpetWhite: PORCELAIN, wood: { color: 0xa98058, roughness: 0.55 } },
	// Books in clothbound colours: oxblood, cream, moss and navy.
	Bookcase: {
		wood: { color: 0x9e754f, roughness: 0.6 },
		carpetDarker: { color: 0x8a4b3c, roughness: 0.9 },
		carpetWhite: { color: 0xe9dfc9, roughness: 0.9 },
		plant: { color: 0x5f7e5a, roughness: 0.85 },
		metal: { color: 0x3f5872, roughness: 0.85, metalness: 0 }
	},
	Nightstand: { wood: { color: 0xb3885d, roughness: 0.58 }, metal: { color: 0xb39b78, roughness: 0.4, metalness: 0.6 } },
	Dresser: { wood: { color: 0xb3885d, roughness: 0.58 }, woodDark: { color: 0xc29770, roughness: 0.55 } },
	Desk: { wood: { color: 0xc49c6e, roughness: 0.58 } },
	Wardrobe: { wood: { color: 0xb9895d, roughness: 0.58 }, carpetWhite: { color: 0xece5d9, roughness: 0.55 } }
};

// ---- recipes ----

/** Something on top of a model: another model, scaled to `height` m tall, at `at` of the way across, toward the back. */
interface TopProp {
	file: FurnitureFile;
	height: number;
	at: number;
}

type Recipe =
	/**
	 * One model fitted to the box. `over` lets its height reach that much over the box's; `stand` raises a model that is too low on legs
	 * to the box's height; `above` is a model fitted into the box over it; `top` stands on it.
	 */
	| { kind: 'model'; file: FurnitureFile; over?: number; stand?: boolean; above?: FurnitureFile; top?: TopProp }
	/** Modules of one model, about `module` metres across each, side by side along the box's width. */
	| { kind: 'row'; file: FurnitureFile; module: number }
	/** Kitchen base cabinets built here, about `module` metres across: the sink under a window behind them, and the stove. */
	| { kind: 'kitchen'; module: number }
	/** Built here: a chest of drawers. */
	| { kind: 'drawers' }
	/** Built here: open shelves, filled with the kit's books. */
	| { kind: 'bookcase' }
	/** Built here: a table at dining height, with the kit's chairs round it where they fit. */
	| { kind: 'dining' }
	/** Built here: the kit has no wardrobe. */
	| { kind: 'wardrobe' };

/** What a row of kitchen cabinets knows about where it stands: the module under a window, if one is behind it, and whether the Home has its sink and stove yet. */
interface RowContext {
	window: number | null;
	home: { sink: boolean; stove: boolean };
}

type CounterKind = 'sink' | 'stove' | 'drawer' | 'cabinet';

/** Which cabinet each module of a run of counter is: the sink under the window (or second from the end), the stove at the end away from it, drawers and doors between. */
function counterKind(index: number, count: number, { window, home }: RowContext): CounterKind {
	const sinkAt = window ?? (home.sink ? -1 : Math.min(count - 1, 1));
	if (index === sinkAt && !home.sink) {
		home.sink = true;
		return 'sink';
	}
	// The stove at the end of the run away from the sink, so there is counter between them.
	const stoveAt = count >= 3 ? (sinkAt < count / 2 ? count - 1 : 0) : -1;
	if (index === stoveAt && !home.stove) {
		home.stove = true;
		return 'stove';
	}
	return index % 2 === 0 ? 'drawer' : 'cabinet';
}

const RECIPES: Record<string, Recipe> = {
	'Queen bed': { kind: 'model', file: 'bedDouble', over: 1.25 },
	Sofa: { kind: 'model', file: 'loungeSofa' },
	Armchair: { kind: 'model', file: 'loungeChair' },
	// The kit's coffee table is lower and flatter than a coffee table's box; its table, at this size, is a coffee table's height.
	'Coffee table': { kind: 'model', file: 'table' },
	'TV console': { kind: 'model', file: 'cabinetTelevision' },
	Sideboard: { kind: 'model', file: 'cabinetTelevisionDoors', stand: true },
	'Dining table': { kind: 'dining' },
	Refrigerator: { kind: 'model', file: 'kitchenFridgeLarge', above: 'kitchenCabinetUpperDouble' },
	Nightstand: { kind: 'model', file: 'cabinetBedDrawerTable', top: { file: 'lampRoundTable', height: 0.36, at: 0.5 } },
	// A writing desk: the kit's desk is as low as a coffee table at a desk's width.
	Desk: { kind: 'model', file: 'sideTableDrawers', top: { file: 'laptop', height: 0.2, at: 0.5 } },
	Vanity: { kind: 'model', file: 'bathroomCabinetDrawer' },
	Toilet: { kind: 'model', file: 'toilet' },
	Bathtub: { kind: 'model', file: 'bathtub' },
	Washer: { kind: 'model', file: 'washer' },
	Dryer: { kind: 'model', file: 'dryer' },
	'Kitchen counter': { kind: 'kitchen', module: 0.6 },
	'Kitchen island': { kind: 'kitchen', module: 0.6 },
	'Double vanity': { kind: 'row', file: 'bathroomCabinetDrawer', module: 0.6 },
	Dresser: { kind: 'drawers' },
	Bookcase: { kind: 'bookcase' },
	Wardrobe: { kind: 'wardrobe' }
};

/** Whether a kind of piece (a plan's furniture `name`) has a recipe of its own, rather than the stand-in. */
export const hasRecipe = (name: string) => name in RECIPES;

/** The footprint a recipe is judged by when its facing is chosen: its model's, across and along. A piece built to its box has no width of its own (0). */
function naturalFootprint(recipe: Recipe, bounds: (file: FurnitureFile) => Vector3): { across: number; along: number } {
	switch (recipe.kind) {
		case 'model': {
			const size = bounds(recipe.file);
			return { across: size.x, along: size.z };
		}
		case 'row':
			return { across: 0, along: bounds(recipe.file).z * (recipe.module / bounds(recipe.file).x) };
		case 'kitchen':
			return { across: 0, along: 0.6 };
		case 'drawers':
			return { across: 0, along: 0.5 };
		case 'bookcase':
			return { across: 0, along: 0.35 };
		case 'dining':
			return { across: 0, along: 0.9 };
		case 'wardrobe':
			return { across: 0, along: 0.6 };
	}
}

/** A piece's own +x (across it) in the plan, once it is turned to `facing`. */
function acrossAxis(facing: Facing): [number, number] {
	const angle = facingAngle(facing);
	return [Math.cos(angle), -Math.sin(angle)];
}

/**
 * Which module of a row (0 to `count` - 1, laid out along the piece's own +x) has a window behind it, if one does: a kitchen's sink
 * goes under its window.
 */
function windowModule(plan: HomePlan, item: Furniture, facing: Facing, count: number): number | null {
	const back = OPPOSITE[facing];
	const { across } = extents(item, facing);
	const [ax, az] = acrossAxis(facing);
	const cx = item.x + item.w / 2;
	const cz = item.z + item.d / 2;
	for (const opening of plan.openings) {
		if (opening.kind !== 'double-hung' && opening.kind !== 'casement') continue;
		const { placement } = opening;
		if (!isExterior(placement) || placement.facade !== back) continue;
		const [wx, wz] = back === 'north' || back === 'south' ? [placement.center, cz] : [cx, placement.center];
		const local = (wx - cx) * ax + (wz - cz) * az;
		if (Math.abs(local) > across / 2) continue;
		return Math.min(count - 1, Math.max(0, Math.floor(((local + across / 2) / across) * count)));
	}
	return null;
}

/** A small seeded generator (mulberry32), seeded from a piece's id, so a bookcase is filled the same way every time. */
function seededFrom(text: string) {
	let state = 2166136261;
	for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619) >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Shapes gathered per material and merged into one mesh each, so a piece built here, with the kit's books or chairs baked into it, is a
 * few draw calls whatever its detail. Only positions and normals are kept, unindexed, so any two shapes can be merged.
 */
class Batch {
	private readonly parts = new Map<Material, BufferGeometry[]>();
	private readonly matrix = new Matrix4();

	constructor(private readonly owned: (BufferGeometry | Material)[]) {}

	/** A box w × h × d (across, up, out of the front), standing at y, centred on x and z. */
	box(material: Material, w: number, h: number, d: number, x: number, y: number, z: number) {
		if (!(w > 1e-4 && h > 1e-4 && d > 1e-4)) return;
		this.add(material, new BoxGeometry(w, h, d).translate(x, y + h / 2, z));
	}

	/** A flat disc of radius `r` and thickness `t`, standing at y. */
	disc(material: Material, r: number, t: number, x: number, y: number, z: number) {
		this.add(material, new CylinderGeometry(r, r, t, 24).translate(x, y + t / 2, z));
	}

	/** The meshes of a model, placed by `place` in the piece's frame, each in the material `finish` gives its kit material's name. */
	model(source: Object3D, place: Matrix4, finish: (name: string) => Material) {
		source.updateMatrixWorld(true);
		source.traverse((object) => {
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '_defaultMat';
			this.add(finish(name), mesh.geometry.clone().applyMatrix4(this.matrix.multiplyMatrices(place, mesh.matrixWorld)));
		});
	}

	private add(material: Material, geometry: BufferGeometry) {
		for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
		const flat = geometry.index ? geometry.toNonIndexed() : geometry;
		if (flat !== geometry) geometry.dispose();
		const list = this.parts.get(material) ?? [];
		list.push(flat);
		this.parts.set(material, list);
	}

	/** Merges each material's shapes into one mesh, in `group`. */
	build(group: Group) {
		for (const [material, list] of this.parts) {
			const merged = list.length === 1 ? list[0] : mergeGeometries(list);
			if (list.length > 1) for (const geometry of list) geometry.dispose();
			if (!merged) continue;
			this.owned.push(merged);
			const mesh = new Mesh(merged, material);
			mesh.castShadow = mesh.receiveShadow = true;
			group.add(mesh);
		}
		this.parts.clear();
	}
}

export interface FurnitureView {
	group: Group;
	/** One invisible box per piece, the solver's own boxes: what a pointer lands on. */
	solids: Mesh;
	/** Where each piece faces, by id, for tests. */
	facings: Map<string, Facing>;
	/** What each piece is drawn with, by id, in the order it is laid out (the kit's models by file name, and what is built here by kind), for tests. */
	models: Map<string, string[]>;
	dispose(): void;
}

/** Where a box `w` × `d` of the piece's frame, centred on (x, z) there, lands in the plan, as a rectangle: the piece's frame turned by `facing` and centred on (cx, cz). */
function inPlan(facing: Facing, cx: number, cz: number, x: number, z: number, w: number, d: number) {
	const angle = facingAngle(facing);
	const cos = Math.round(Math.cos(angle));
	const sin = Math.round(Math.sin(angle));
	const px = cx + x * cos + z * sin;
	const pz = cz - x * sin + z * cos;
	const [pw, pd] = cos !== 0 ? [w, d] : [d, w];
	return { x0: px - pw / 2, x1: px + pw / 2, z0: pz - pd / 2, z1: pz + pd / 2 };
}

/** Whether a rectangle of the plan is clear: inside the footprint, off every inside wall and every other piece's box, by `margin` m. */
function clearInPlan(plan: HomePlan, item: Furniture, rect: { x0: number; x1: number; z0: number; z1: number }, margin = 0.03) {
	if (rect.x0 < margin || rect.z0 < margin || rect.x1 > plan.width - margin || rect.z1 > plan.depth - margin) return false;
	const overlaps = (x0: number, x1: number, z0: number, z1: number) => rect.x0 < x1 + margin && rect.x1 > x0 - margin && rect.z0 < z1 + margin && rect.z1 > z0 - margin;
	for (const wall of plan.walls) {
		const half = INTERIOR_WALL / 2;
		if (wall.axis === 'x' ? overlaps(wall.from, wall.to, wall.at - half, wall.at + half) : overlaps(wall.at - half, wall.at + half, wall.from, wall.to)) return false;
	}
	for (const other of plan.furniture) if (other !== item && overlaps(other.x, other.x + other.w, other.z, other.z + other.d)) return false;
	return true;
}

/**
 * The furniture of a plan, drawn with `assets`' models, or as plain blocks of each model's fitted size when there are none (Node
 * tests, or a fetch that failed). The models' geometries are the loaded ones, shared and never freed here.
 */
export function buildFurniture(plan: HomePlan, materials: Materials, assets: LookAssets | null): FurnitureView {
	const group = new Group();
	group.name = 'furniture';
	const owned: (BufferGeometry | Material)[] = [];
	const facings = new Map<string, Facing>();
	const used = new Map<string, string[]>();
	const boundsCache = new Map<FurnitureFile, Box3>();
	const bounds = (file: FurnitureFile) => {
		let box = boundsCache.get(file);
		if (!box) {
			const source = assets?.furniture.get(file);
			box = source ? new Box3().setFromObject(source) : new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
			boundsCache.set(file, box);
		}
		return box;
	};
	const sizeOf = (file: FurnitureFile) => bounds(file).getSize(new Vector3());

	const finishes = new Map<string, Material>();
	const finish = (piece: string, name: string): Material => {
		const chosen = OVERRIDES[piece]?.[name] ?? FINISHES[name] ?? FINISHES._defaultMat;
		if (name === 'glass') {
			let glass = finishes.get('glass');
			if (!glass) {
				glass = new MeshStandardMaterial({ color: 0xbfd2d8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.45 });
				finishes.set('glass', glass);
				owned.push(glass);
			}
			return glass;
		}
		return materials.paint(new Color(chosen.color), chosen.roughness, chosen.metalness ?? 0);
	};

	/**
	 * A copy of a model in the piece's frame, one scale on every axis (`uniformFit`), standing at `y`, centred across on `x`, and with its
	 * back at the back of a box `along` deep (`back`) or centred in it. Returns it and its fit.
	 */
	const fitted = (file: FurnitureFile, piece: string, across: number, height: number, along: number, options: { over?: number; back?: boolean; x?: number; y?: number } = {}) => {
		const source = assets?.furniture.get(file);
		const box = bounds(file);
		const size = box.getSize(new Vector3());
		const fit = uniformFit(size, across, height, along, options.over);
		const centre = box.getCenter(new Vector3());
		const inner = new Group();
		if (source) {
			const copy = source.clone(true);
			copy.traverse((object) => {
				const mesh = object as Mesh;
				if (!mesh.isMesh) return;
				const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '_defaultMat';
				mesh.material = finish(piece, name);
				mesh.castShadow = mesh.receiveShadow = true;
			});
			copy.position.set(-centre.x, -box.min.y, -centre.z);
			inner.add(copy);
			inner.scale.setScalar(fit.scale);
		} else {
			const block = new Mesh(new BoxGeometry(fit.width, fit.height, fit.depth), finish(piece, 'carpet'));
			block.position.y = fit.height / 2;
			block.castShadow = block.receiveShadow = true;
			owned.push(block.geometry);
			inner.add(block);
		}
		inner.position.set(options.x ?? 0, options.y ?? 0, options.back ? -along / 2 + fit.depth / 2 : 0);
		inner.userData.fit = { file, scale: fit.scale };
		return { object: inner, fit };
	};

	/** Where a model of the kit lands in the piece's frame when baked into a batch: scaled by `scale`, its foot centred at (x, y, z), turned by `yaw`. */
	const placing = (file: FurnitureFile, scale: number, x: number, y: number, z: number, yaw = 0) => {
		const box = bounds(file);
		const centre = box.getCenter(new Vector3());
		return new Matrix4()
			.makeTranslation(x, y, z)
			.multiply(new Matrix4().makeRotationY(yaw))
			.multiply(new Matrix4().makeScale(scale, scale, scale))
			.multiply(new Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
	};

	const home = { sink: false, stove: false };
	// Counters with a window behind them go first, so the sink lands under a window when the Home has one.
	const order = [...plan.furniture].sort((a, b) => Number(RECIPES[b.name]?.kind === 'kitchen') - Number(RECIPES[a.name]?.kind === 'kitchen'));
	for (const item of order) {
		const recipe = RECIPES[item.name] ?? ({ kind: 'model', file: 'cabinetBedDrawerTable' } as Recipe);
		const facing = chooseFacing(plan, item, naturalFootprint(recipe, sizeOf));
		facings.set(item.id, facing);
		const { across, along } = extents(item, facing);
		const backed = wallDistances(plan, item)[OPPOSITE[facing]] < AGAINST;
		const piece = new Group();
		piece.name = item.id;
		const files: string[] = [];
		used.set(item.id, files);
		const batch = new Batch(owned);
		const paint = (name: string) => finish(item.name, name);
		switch (recipe.kind) {
			case 'model': {
				// A model too low for its box stands on legs to its height (`stand`); the legs are what is built here.
				const { object, fit } = fitted(recipe.file, item.name, across, item.h, along, { over: recipe.over, back: backed });
				if (recipe.stand && fit.height < item.h - 0.05) {
					const legs = item.h - fit.height;
					object.position.y = legs;
					stand(batch, paint('woodDark'), fit.width, legs, fit.depth, object.position.z);
					files.push('stand');
				}
				piece.add(object);
				files.push(recipe.file);
				if (recipe.above) {
					const room = item.h - fit.height - (recipe.stand ? 0 : 0.02);
					if (room >= 0.15) {
						const upper = fitted(recipe.above, item.name, across, room, along, { back: true, y: item.h - room });
						piece.add(upper.object);
						files.push(recipe.above);
					}
				}
				if (recipe.top && assets?.furniture.get(recipe.top.file)) {
					const prop = recipe.top;
					const size = sizeOf(prop.file);
					const scale = prop.height / size.y;
					const x = (prop.at - 0.5) * Math.max(0, fit.width - size.x * scale);
					const z = object.position.z - fit.depth / 2 + (size.z * scale) / 2 + 0.03;
					batch.model(assets.furniture.get(prop.file)!, placing(prop.file, scale, x, object.position.y + fit.height, z), paint);
					files.push(prop.file);
				}
				break;
			}
			case 'row': {
				const count = Math.max(1, Math.round(across / recipe.module));
				const width = across / count;
				for (let i = 0; i < count; i++) {
					const { object } = fitted(recipe.file, item.name, width, item.h, along, { back: backed, x: -across / 2 + (i + 0.5) * width });
					piece.add(object);
					files.push(recipe.file);
				}
				break;
			}
			case 'kitchen': {
				const count = Math.max(1, Math.round(across / recipe.module));
				const width = across / count;
				const window = windowModule(plan, item, facing, count);
				// An island stands free, so it is cabinets on both sides, and the sink and the stove stay on the counters along the walls.
				const island = !backed;
				for (let i = 0; i < count; i++) {
					const kind = island ? (i % 2 === 0 ? 'drawer' : 'cabinet') : counterKind(i, count, { window, home });
					counter(batch, materials, kind, -across / 2 + (i + 0.5) * width, width, item.h, along, island);
					files.push(`counter:${kind}`);
				}
				break;
			}
			case 'drawers':
				drawers(batch, materials, paint, across, item.h, along);
				files.push('drawers');
				break;
			case 'bookcase':
				files.push('bookcase', ...bookcase(batch, materials, paint, item, across, item.h, along, assets, sizeOf, placing));
				break;
			case 'dining': {
				diningTable(batch, paint, across, item.h, along);
				files.push('dining-table');
				const chair = assets?.furniture.get('chairCushion');
				if (chair) {
					const size = sizeOf('chairCushion');
					const scale = CHAIR_HEIGHT / size.y;
					const [cw, cd] = [size.x * scale, size.z * scale];
					// Along the longer sides, tucked a little under the edge, facing the table, wherever the floor beside it is clear.
					const long = across >= along;
					const length = long ? across : along;
					const reach = (long ? along : across) / 2 + cd / 2 - CHAIR_TUCK;
					const count = Math.max(1, Math.floor((length - 0.1) / CHAIR_SPACING));
					for (const side of [-1, 1])
						for (let n = 0; n < count; n++) {
							const t = (n + 0.5) / count - 0.5;
							const [x, z] = long ? [t * (length - 0.1), side * reach] : [side * reach, t * (length - 0.1)];
							const yaw = long ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
							const cx = item.x + item.w / 2;
							const cz = item.z + item.d / 2;
							const footprint = long ? inPlan(facing, cx, cz, x, z, cw, cd) : inPlan(facing, cx, cz, x, z, cd, cw);
							if (!clearInPlan(plan, item, footprint)) continue;
							batch.model(chair, placing('chairCushion', scale, x, 0, z, yaw), paint);
							files.push('chairCushion');
						}
				}
				break;
			}
			case 'wardrobe':
				wardrobe(batch, materials, paint, across, item.h, along);
				files.push('wardrobe');
				break;
		}
		batch.build(piece);
		piece.rotation.y = facingAngle(facing);
		piece.position.set(item.x + item.w / 2, item.y ?? 0, item.z + item.d / 2);
		group.add(piece);
	}

	// The solver's boxes, invisible, for picking.
	const boxes = plan.furniture.map((item) => {
		const box = new BoxGeometry(item.w, item.h, item.d);
		box.translate(item.x + item.w / 2, (item.y ?? 0) + item.h / 2, item.z + item.d / 2);
		return box;
	});
	const merged = boxes.length ? mergeGeometries(boxes)! : new BoxGeometry(0, 0, 0);
	for (const box of boxes) box.dispose();
	const hidden = new MeshBasicMaterial({ visible: false });
	const solids = new Mesh(merged, hidden);
	solids.name = 'furniture-solids';
	owned.push(merged, hidden);
	group.add(solids);

	return {
		group,
		solids,
		facings,
		models: used,
		dispose() {
			group.removeFromParent();
			for (const thing of owned) thing.dispose();
		}
	};
}

// ---- pieces built here, in a piece's own frame: x across, y up, z out of the front, centred, standing on the floor ----

/** How tall a dining chair is, m, how far apart chairs are set, and how far a chair's seat is pushed in under the table's edge. */
const CHAIR_HEIGHT = 0.88;
const CHAIR_SPACING = 0.62;
const CHAIR_TUCK = 0.12;

/** Four square legs and a rail round their tops, `height` tall, under something `width` × `depth` whose middle is `z` out. */
function stand(batch: Batch, wood: Material, width: number, height: number, depth: number, z: number) {
	const leg = 0.045;
	const inset = 0.05;
	const rail = Math.min(0.05, height * 0.3);
	for (const sx of [-1, 1])
		for (const sz of [-1, 1]) batch.box(wood, leg, height - rail, leg, sx * (width / 2 - inset), 0, z + sz * (depth / 2 - inset));
	batch.box(wood, width - 2 * inset + leg, rail, depth - 2 * inset + leg, 0, height - rail, z);
}

/**
 * A dining table at real proportions, in the style of the kit's tables: a thick top over an apron, square legs at the corners, and
 * stretchers low between them.
 */
function diningTable(batch: Batch, paint: (name: string) => Material, across: number, height: number, along: number) {
	const wood = paint('wood');
	const dark = paint('woodDark');
	const top = 0.045;
	const leg = 0.07;
	const inset = 0.06;
	const apron = 0.09;
	batch.box(wood, across, top, along, 0, height - top, 0);
	batch.box(wood, across - 2 * inset, apron, along - 2 * inset, 0, height - top - apron, 0);
	const lx = across / 2 - inset - leg / 2;
	const lz = along / 2 - inset - leg / 2;
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(wood, leg, height - top, leg, sx * lx, 0, sz * lz);
	// Stretchers between the legs at each end, and one along the middle from end to end.
	const low = 0.14;
	const bar = 0.035;
	for (const sx of [-1, 1]) batch.box(dark, bar, bar, 2 * lz, sx * lx, low, 0);
	batch.box(dark, 2 * lx, bar, bar, 0, low, 0);
}

/**
 * A kitchen base cabinet module, `width` wide, centred `x` across a run: a recessed kick, the carcass, a worktop that overhangs the
 * fronts, and its front: a door, a drawer over a door, a pair of doors under a sink, or an oven under a cooktop. Doors have the kit's
 * raised frame round a darker panel, and a bar handle.
 */
function counter(batch: Batch, materials: Materials, kind: CounterKind, x: number, width: number, height: number, depth: number, twoSided = false) {
	const body = materials.paint(0xa9b8a3, 0.5);
	const panel = materials.paint(0x96a690, 0.5);
	const worktop = materials.paint(0xece7de, 0.22);
	const kickPaint = materials.paint(0x6f7a6b, 0.7);
	const handle = materials.paint(0xe7e5df, 0.28, 0.6);
	const steel = materials.paint(0xbfc3c4, 0.3, 0.7);
	const glass = materials.paint(0x1b1c1d, 0.12, 0.1);
	const ring = materials.paint(0x4a4c4e, 0.4, 0.3);
	const kick = 0.1;
	const top = 0.04;
	const gap = 0.004;
	const w = width - gap;
	const back = -depth / 2;
	// The carcass stands 5 cm back from the worktop's edge, the fronts on its face, the kick 6 cm further in. An island's module has its
	// fronts on both sides, so it is a cabinet from either side.
	const face = depth / 2 - 0.05;
	const rear = twoSided ? -face : back;
	const kickDepth = twoSided ? depth - 0.22 : depth - 0.11;
	batch.box(kickPaint, w, kick, kickDepth, x, 0, twoSided ? 0 : back + kickDepth / 2);
	batch.box(body, w, height - top - kick, face - rear, x, kick, (rear + face) / 2);
	let dir = 1;
	const front = (y0: number, y1: number, x0: number, x1: number, bar: 'top' | 'side' | 'none' = 'top') => {
		const fw = x1 - x0 - 0.008;
		const fh = y1 - y0 - 0.008;
		const cx = (x0 + x1) / 2;
		const fy = y0 + 0.004;
		const at = (offset: number) => dir * (face + offset);
		batch.box(panel, fw, fh, 0.018, cx, fy, at(0.009));
		// The raised frame round the panel.
		const rim = Math.min(0.045, fw * 0.14, fh * 0.14);
		for (const [bw, bh, bx, by] of [
			[fw, rim, cx, fy],
			[fw, rim, cx, fy + fh - rim],
			[rim, fh - 2 * rim, cx - fw / 2 + rim / 2, fy + rim],
			[rim, fh - 2 * rim, cx + fw / 2 - rim / 2, fy + rim]
		])
			batch.box(body, bw, bh, 0.008, bx, by, at(0.022));
		if (bar === 'top') batch.box(handle, Math.min(0.14, fw * 0.4), 0.016, 0.02, cx, fy + fh - rim - 0.04, at(0.036));
		if (bar === 'side') batch.box(handle, 0.016, Math.min(0.14, fh * 0.4), 0.02, cx + (x1 > x ? -1 : 1) * (fw / 2 - rim - 0.03), fy + fh / 2, at(0.036));
	};
	const x0 = x - width / 2;
	const x1 = x + width / 2;
	const under = height - top;
	switch (kind) {
		case 'cabinet':
			for (dir of twoSided ? [1, -1] : [1]) front(kick, under, x0, x1);
			dir = 1;
			break;
		case 'drawer':
			for (dir of twoSided ? [1, -1] : [1]) {
				front(under - 0.19, under, x0, x1);
				front(kick, under - 0.19, x0, x1);
			}
			dir = 1;
			break;
		case 'sink':
			front(kick, under, x0, x, 'side');
			front(kick, under, x, x1, 'side');
			break;
		case 'stove': {
			// The oven: a door with a dark window and a bar across its top, under a strip of knobs.
			const doorTop = under - 0.11;
			batch.box(panel, w - 0.008, doorTop - kick - 0.008, 0.018, x, kick + 0.004, face + 0.009);
			batch.box(glass, w * 0.62, (doorTop - kick) * 0.42, 0.006, x, kick + (doorTop - kick) * 0.3, face + 0.02);
			batch.box(handle, w * 0.7, 0.018, 0.024, x, doorTop - 0.05, face + 0.034);
			batch.box(panel, w - 0.008, under - doorTop - 0.012, 0.018, x, doorTop + 0.004, face + 0.009);
			for (let k = 0; k < 4; k++) batch.box(handle, 0.03, 0.03, 0.02, x + (k - 1.5) * (w / 5), doorTop + 0.035, face + 0.028);
			break;
		}
	}
	// The worktop, over the whole depth, with a hole for the sink's basin.
	if (kind === 'sink') {
		const bw = Math.min(width - 0.16, 0.48);
		const bd = Math.min(depth * 0.55, 0.38);
		const bz = 0.02;
		const z0 = bz - bd / 2;
		const z1 = bz + bd / 2;
		batch.box(worktop, width, top, z0 - back, x, under, (back + z0) / 2);
		batch.box(worktop, width, top, depth / 2 - z1, x, under, (z1 + depth / 2) / 2);
		batch.box(worktop, (width - bw) / 2, top, bd, x0 + (width - bw) / 4, under, bz);
		batch.box(worktop, (width - bw) / 2, top, bd, x1 - (width - bw) / 4, under, bz);
		// The basin: a floor and four walls of steel under the hole, and the tap behind it.
		const deep = 0.16;
		batch.box(steel, bw, 0.01, bd, x, height - deep, bz);
		batch.box(steel, bw, deep, 0.01, x, height - deep, z0 + 0.005);
		batch.box(steel, bw, deep, 0.01, x, height - deep, z1 - 0.005);
		batch.box(steel, 0.01, deep, bd, x - bw / 2 + 0.005, height - deep, bz);
		batch.box(steel, 0.01, deep, bd, x + bw / 2 - 0.005, height - deep, bz);
		batch.box(steel, 0.028, 0.22, 0.028, x, height, z0 - 0.045);
		batch.box(steel, 0.024, 0.024, 0.15, x, height + 0.2, z0 - 0.045 + 0.075);
	} else {
		batch.box(worktop, width, top, depth, x, under, 0);
		if (kind === 'stove') {
			// A cooktop of black glass with four rings.
			const cw = Math.min(width - 0.06, 0.56);
			const cd = depth - 0.1;
			batch.box(glass, cw, 0.008, cd, x, height - 0.002, 0.01);
			for (const [rx, rz, r] of [
				[-1, -1, 0.085],
				[1, -1, 0.07],
				[-1, 1, 0.07],
				[1, 1, 0.085]
			])
				batch.disc(ring, r, 0.003, x + rx * cw * 0.25, height + 0.006, 0.01 + rz * cd * 0.24);
		}
	}
}

/** A chest of drawers at real proportions: a recessed plinth, the carcass, a top that overhangs it a little, rows of drawers in one or two columns, and a brass knob on each. */
function drawers(batch: Batch, materials: Materials, paint: (name: string) => Material, across: number, height: number, depth: number) {
	const body = paint('wood');
	const fronts = paint('woodDark');
	const shadow = materials.paint(0x4a4038, 0.8);
	const brass = materials.brass;
	const plinth = 0.07;
	const top = 0.03;
	const face = depth / 2 - 0.02;
	batch.box(shadow, across - 0.06, plinth, depth - 0.06, 0, 0, -0.03);
	batch.box(body, across - 0.02, height - plinth - top, face + depth / 2, 0, plinth, (face - depth / 2) / 2);
	batch.box(body, across, top, depth, 0, height - top, 0);
	const rows = height > 0.7 ? 4 : 3;
	const columns = across > 0.8 ? 2 : 1;
	const tall = (height - plinth - top - 0.01) / rows;
	const wide = (across - 0.03) / columns;
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < columns; c++) {
			const x = -across / 2 + 0.015 + (c + 0.5) * wide;
			const y = plinth + 0.005 + r * tall;
			batch.box(fronts, wide - 0.008, tall - 0.008, 0.02, x, y + 0.004, face + 0.01);
			batch.box(brass, 0.035, 0.035, 0.025, x, y + tall / 2 - 0.0175, face + 0.032);
		}
}

/**
 * Open shelves at real proportions, with no back, so the books show from behind as well: two sides, a top, a recessed plinth, a rail
 * at the back top and bottom, and shelves about a third of a metre apart, filled with the kit's books (`assets`) a different way in each
 * bookcase, and a small plant on one shelf. Returns the models it filled them with.
 */
function bookcase(
	batch: Batch,
	materials: Materials,
	paint: (name: string) => Material,
	item: Furniture,
	across: number,
	height: number,
	depth: number,
	assets: LookAssets | null,
	sizeOf: (file: FurnitureFile) => Vector3,
	placing: (file: FurnitureFile, scale: number, x: number, y: number, z: number, yaw?: number) => Matrix4
): string[] {
	const wood = paint('wood');
	const side = 0.028;
	const board = 0.024;
	const plinth = 0.07;
	const inner = across - 2 * side;
	batch.box(wood, side, height, depth, -across / 2 + side / 2, 0, 0);
	batch.box(wood, side, height, depth, across / 2 - side / 2, 0, 0);
	batch.box(wood, across, 0.03, depth, 0, height - 0.03, 0);
	batch.box(materials.paint(0x5a4130, 0.7), inner, plinth, depth - 0.04, 0, 0, -0.02);
	batch.box(wood, inner, 0.05, 0.016, 0, height - 0.08, -depth / 2 + 0.008);
	batch.box(wood, inner, 0.05, 0.016, 0, plinth, -depth / 2 + 0.008);
	const shelves = Math.max(2, Math.round((height - plinth - 0.03) / 0.34));
	const pitch = (height - plinth - 0.03) / shelves;
	for (let s = 0; s < shelves; s++) batch.box(wood, inner, board, depth - 0.01, 0, plinth + s * pitch, 0);
	const filled: string[] = [];
	const books = assets?.furniture.get('books');
	if (!books) return filled;
	const random = seededFrom(item.id);
	const size = sizeOf('books');
	const plant = assets?.furniture.get('plantSmall1');
	const plantShelf = Math.floor(random() * shelves);
	for (let s = 0; s < shelves; s++) {
		const floor = plinth + s * pitch + board;
		const clear = pitch - board - 0.03;
		const scale = Math.min(0.26, clear * 0.82) / size.y;
		const span = size.x * scale;
		let x = -inner / 2 + 0.02 + random() * 0.08;
		let end = inner / 2 - 0.02;
		if (s === plantShelf && plant) {
			const plantSize = sizeOf('plantSmall1');
			const plantScale = Math.min(0.24, clear * 0.8) / plantSize.y;
			const px = end - (plantSize.x * plantScale) / 2;
			batch.model(plant, placing('plantSmall1', plantScale, px, floor, 0), paint);
			filled.push('plantSmall1');
			end -= plantSize.x * plantScale + 0.04;
		}
		while (x + span <= end) {
			// Now and then a gap, and every other set the other way round, so no two shelves read alike.
			if (random() < 0.18) {
				x += span * 0.5;
				continue;
			}
			const flip = random() < 0.5 ? Math.PI : 0;
			batch.model(books, placing('books', scale, x + span / 2, floor, -depth / 2 + (size.z * scale) / 2 + 0.05, flip), paint);
			filled.push('books');
			x += span + 0.005;
		}
	}
	return filled;
}

/**
 * A wardrobe at real proportions (the kit has none): a carcass on a recessed plinth under a thin crown, two doors with a shadow gap
 * between them and a brass bar on each, all within its box.
 */
function wardrobe(batch: Batch, materials: Materials, paint: (name: string) => Material, across: number, height: number, along: number) {
	const body = paint('carpetWhite');
	const oak = paint('wood');
	const shadow = materials.paint(0x4a4038, 0.8);
	const brass = materials.brass;
	const plinth = 0.08;
	const crown = 0.05;
	const door = 0.025;
	// The plinth, set back so the doors overhang it, and the carcass and crown, which reach the box's back.
	batch.box(shadow, across - 0.06, plinth, along - 0.08, 0, 0, -0.04);
	batch.box(body, across, height - plinth - crown, along - door, 0, plinth, -door / 2);
	batch.box(oak, across, crown, along, 0, height - crown, 0);
	// Two doors in front, with a dark gap between them, and a bar handle on each beside the gap.
	const gap = 0.012;
	const leaf = (across - gap) / 2;
	const doorHeight = height - plinth - crown - 0.01;
	for (const side of [-1, 1]) {
		batch.box(oak, leaf - 0.004, doorHeight, door, side * (gap / 2 + leaf / 2), plinth + 0.005, along / 2 - door / 2);
		batch.box(brass, 0.018, 0.34, 0.03, side * (gap / 2 + 0.05), plinth + doorHeight * 0.48, along / 2 + 0.012);
	}
	batch.box(shadow, gap, doorHeight, 0.004, 0, plinth + 0.005, along / 2 - door + 0.002);
}
