import { Box3, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isExterior, type Furniture, type HomePlan } from '../../homes/types';
import { INTERIOR_WALL } from '../wallPieces';
import type { FurnitureFile, LookAssets } from './assets';
import type { Materials } from './materials';

/**
 * The plans' furniture, drawn with the Kenney Furniture Kit (CC0). Each piece of a plan is a solid box to the solver, and the model
 * drawn for it is fitted to exactly that box: the solver keeps the box, the visitor sees a sofa. A piece is turned to face into its
 * Room, its back to the wall nearest it (unless that would squash the model the wrong way), and repainted in a warmer palette with
 * real roughness. A run of kitchen counter is a row of cabinets with the sink under the window, a bookcase is a stack of shelves, and
 * the wardrobe, which the kit does not have, is built here.
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
/** How much a squashed model costs against a wall a metre away, in the choice of facing: a log of the stretch ratio, times this. */
const STRETCH_WEIGHT = 1.6;

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
 * Which way a piece faces: its back to the nearest wall, unless that would stretch its model the wrong way. `natural` is the model's own
 * footprint, across and along (its width and depth); a row of modules passes a width of 0 and is never stretched across. Ties go to
 * the facing that looks toward the middle of the home.
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
		const stretch = natural.across > 0 ? Math.abs(Math.log(across / natural.across / (along / natural.along))) : Math.abs(Math.log(Math.max(along, 1e-3) / natural.along)) * 0.5;
		const [fx, fz] = FACING[facing];
		const cost = walls[OPPOSITE[facing]] + STRETCH_WEIGHT * stretch - 0.02 * ((fx * toMiddle[0] + fz * toMiddle[1]) / length);
		if (cost < bestCost - 1e-9) {
			bestCost = cost;
			best = facing;
		}
	}
	return best;
}

/** The turn about the vertical that points a model's front (+z) toward `facing`. */
export const facingAngle = (facing: Facing) => Math.atan2(FACING[facing][0], FACING[facing][1]);

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
	_defaultMat: { color: 0xf3eee5, roughness: 0.5 }
};

/** Per kind of piece, the finishes that differ from the kit's: a sage sofa, an ochre armchair, a terracotta throw, porcelain in the bathroom. */
const PORCELAIN: Finish = { color: 0xf7f5f1, roughness: 0.14 };
const OVERRIDES: Record<string, Record<string, Finish>> = {
	Sofa: { carpet: { color: 0x8aa38e, roughness: 0.96 }, wood: { color: 0x7d5a3e, roughness: 0.55 } },
	Armchair: { carpet: { color: 0xcf9f4c, roughness: 0.96 }, wood: { color: 0x7d5a3e, roughness: 0.55 } },
	'Queen bed': { carpet: { color: 0xc8836a, roughness: 0.96 }, wood: { color: 0xb3885d, roughness: 0.6 }, metal: { color: 0xb8a58c, roughness: 0.5, metalness: 0.2 } },
	'Coffee table': { wood: { color: 0x8c6545, roughness: 0.5 } },
	'TV console': { wood: { color: 0x94704f, roughness: 0.55 } },
	Sideboard: { wood: { color: 0xa67d58, roughness: 0.55 }, metal: { color: 0xc9a86a, roughness: 0.35, metalness: 0.9 } },
	'Dining table': { wood: { color: 0xb8895c, roughness: 0.55 } },
	'Kitchen counter': {
		wood: { color: 0xa9b8a3, roughness: 0.5 },
		woodDark: { color: 0x96a690, roughness: 0.5 },
		metal: { color: 0xece7de, roughness: 0.22, metalness: 0 }
	},
	'Kitchen island': {
		wood: { color: 0xa9b8a3, roughness: 0.5 },
		woodDark: { color: 0x96a690, roughness: 0.5 },
		metal: { color: 0xece7de, roughness: 0.22, metalness: 0 }
	},
	Refrigerator: { metalLight: { color: 0xd9dad6, roughness: 0.28, metalness: 0.55 }, metalMedium: { color: 0x8f9593, roughness: 0.3, metalness: 0.6 } },
	Toilet: { carpetWhite: PORCELAIN, _defaultMat: PORCELAIN },
	Bathtub: { carpetWhite: PORCELAIN },
	Vanity: { carpetWhite: PORCELAIN, wood: { color: 0xa98058, roughness: 0.55 } },
	'Double vanity': { carpetWhite: PORCELAIN, wood: { color: 0xa98058, roughness: 0.55 } },
	Bookcase: { wood: { color: 0x9e754f, roughness: 0.6 } },
	Nightstand: { wood: { color: 0xb3885d, roughness: 0.58 } },
	Dresser: { wood: { color: 0xb3885d, roughness: 0.58 } },
	Desk: { wood: { color: 0xc49c6e, roughness: 0.58 } }
};

// ---- recipes ----

type Recipe =
	/** One model fitted to the whole box. */
	| { kind: 'model'; file: FurnitureFile }
	/** Modules of `module` metres or so across, side by side along the box's width; `pick` says which model each one is. */
	| { kind: 'row'; module: number; pick: (index: number, count: number, context: RowContext) => FurnitureFile }
	/** A grid of one model, `rows` high and as many across as fit at about `module` metres. */
	| { kind: 'stack'; file: FurnitureFile; rows: number; module: number }
	/** Built here: the kit has no wardrobe. */
	| { kind: 'wardrobe' };

/** What a row knows about where it stands: the module under a window, if one is behind it, and whether the Home has its sink and stove yet. */
interface RowContext {
	window: number | null;
	home: { sink: boolean; stove: boolean };
}

const RECIPES: Record<string, Recipe> = {
	'Queen bed': { kind: 'model', file: 'bedDouble' },
	Sofa: { kind: 'model', file: 'loungeSofa' },
	Armchair: { kind: 'model', file: 'loungeChair' },
	'Coffee table': { kind: 'model', file: 'tableCoffee' },
	'TV console': { kind: 'model', file: 'cabinetTelevision' },
	Sideboard: { kind: 'model', file: 'cabinetTelevisionDoors' },
	'Dining table': { kind: 'model', file: 'table' },
	Refrigerator: { kind: 'model', file: 'kitchenFridgeLarge' },
	Nightstand: { kind: 'model', file: 'cabinetBedDrawerTable' },
	Desk: { kind: 'model', file: 'desk' },
	Vanity: { kind: 'model', file: 'bathroomCabinetDrawer' },
	Toilet: { kind: 'model', file: 'toilet' },
	Bathtub: { kind: 'model', file: 'bathtub' },
	Washer: { kind: 'model', file: 'washer' },
	Dryer: { kind: 'model', file: 'dryer' },
	'Kitchen counter': {
		kind: 'row',
		module: 0.6,
		pick: (index, count, { window, home }) => {
			const sinkAt = window ?? (home.sink ? -1 : Math.min(count - 1, 1));
			if (index === sinkAt && !home.sink) {
				home.sink = true;
				return 'kitchenSink';
			}
			// The stove at the end of the run away from the sink, so there is counter between them.
			const stoveAt = count >= 3 ? (sinkAt < count / 2 ? count - 1 : 0) : -1;
			if (index === stoveAt && !home.stove) {
				home.stove = true;
				return 'kitchenStoveElectric';
			}
			return index % 2 === 0 ? 'kitchenCabinetDrawer' : 'kitchenCabinet';
		}
	},
	'Kitchen island': { kind: 'row', module: 0.6, pick: (index) => (index % 2 === 0 ? 'kitchenCabinet' : 'kitchenCabinetDrawer') },
	'Double vanity': { kind: 'row', module: 0.6, pick: () => 'bathroomCabinetDrawer' },
	Dresser: { kind: 'row', module: 0.6, pick: () => 'cabinetBedDrawer' },
	Bookcase: { kind: 'stack', file: 'bookcaseClosedWide', rows: 2, module: 0.9 },
	Wardrobe: { kind: 'wardrobe' }
};

/** Whether a kind of piece (a plan's furniture `name`) has a recipe of its own, rather than the stand-in. */
export const hasRecipe = (name: string) => name in RECIPES;

/** The model a recipe is judged by when its facing is chosen: its footprint, across and along. A row's width is free (0). */
function naturalFootprint(recipe: Recipe, bounds: (file: FurnitureFile) => Vector3): { across: number; along: number } {
	switch (recipe.kind) {
		case 'model': {
			const size = bounds(recipe.file);
			return { across: size.x, along: size.z };
		}
		case 'row':
			return { across: 0, along: recipe.module };
		case 'stack': {
			const size = bounds(recipe.file);
			return { across: 0, along: size.z };
		}
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

export interface FurnitureView {
	group: Group;
	/** One invisible box per piece, the solver's own boxes: what a pointer lands on. */
	solids: Mesh;
	/** Where each piece faces, by id, for tests. */
	facings: Map<string, Facing>;
	/** The models each piece is drawn with, by id, in the order they are laid out along it (from its own -x), for tests. */
	models: Map<string, (FurnitureFile | 'wardrobe')[]>;
	dispose(): void;
}

/**
 * The furniture of a plan, drawn with `assets`' models, or as plain rounded blocks when there are none (Node tests, or a fetch that
 * failed). The models' geometries are the loaded ones, shared and never freed here.
 */
export function buildFurniture(plan: HomePlan, materials: Materials, assets: LookAssets | null): FurnitureView {
	const group = new Group();
	group.name = 'furniture';
	const owned: (BufferGeometry | Material)[] = [];
	const facings = new Map<string, Facing>();
	const used = new Map<string, (FurnitureFile | 'wardrobe')[]>();
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

	/** A copy of a model in its own frame, centred at the floor, `across` by `height` by `along`, repainted for `piece`. */
	const fitted = (file: FurnitureFile, piece: string, across: number, height: number, along: number): Object3D => {
		const source = assets?.furniture.get(file);
		const box = bounds(file);
		const size = box.getSize(new Vector3());
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
			inner.scale.set(across / size.x, height / size.y, along / size.z);
		} else {
			const block = new Mesh(new BoxGeometry(across * 0.96, height, along * 0.96), finish(piece, 'carpet'));
			block.position.y = height / 2;
			block.castShadow = block.receiveShadow = true;
			owned.push(block.geometry);
			inner.add(block);
		}
		return inner;
	};

	const home = { sink: false, stove: false };
	// Counters with a window behind them go first, so the sink lands under a window when the Home has one.
	const order = [...plan.furniture].sort((a, b) => Number(RECIPES[b.name]?.kind === 'row') - Number(RECIPES[a.name]?.kind === 'row'));
	for (const item of order) {
		const recipe = RECIPES[item.name] ?? ({ kind: 'model', file: 'cabinetBedDrawer' } as Recipe);
		const facing = chooseFacing(plan, item, naturalFootprint(recipe, sizeOf));
		facings.set(item.id, facing);
		const { across, along } = extents(item, facing);
		const piece = new Group();
		piece.name = item.id;
		const files: (FurnitureFile | 'wardrobe')[] = [];
		used.set(item.id, files);
		switch (recipe.kind) {
			case 'model':
				piece.add(fitted(recipe.file, item.name, across, item.h, along));
				files.push(recipe.file);
				break;
			case 'row': {
				const count = Math.max(1, Math.round(across / recipe.module));
				const width = across / count;
				const window = windowModule(plan, item, facing, count);
				for (let i = 0; i < count; i++) {
					const file = recipe.pick(i, count, { window, home });
					const module = fitted(file, item.name, width, item.h, along);
					module.position.x = -across / 2 + (i + 0.5) * width;
					piece.add(module);
					files.push(file);
				}
				break;
			}
			case 'stack': {
				const columns = Math.max(1, Math.round(across / recipe.module));
				const width = across / columns;
				const height = item.h / recipe.rows;
				for (let c = 0; c < columns; c++)
					for (let r = 0; r < recipe.rows; r++) {
						const module = fitted(recipe.file, item.name, width, height, along);
						module.position.set(-across / 2 + (c + 0.5) * width, r * height, 0);
						piece.add(module);
						files.push(recipe.file);
					}
				break;
			}
			case 'wardrobe':
				piece.add(wardrobe(materials, across, item.h, along, owned));
				files.push('wardrobe');
				break;
		}
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

/**
 * A wardrobe in its own frame (front +z, centred, standing on the floor): a carcass on a recessed plinth under a thin crown, two doors
 * with a shadow gap between them and a brass bar on each, all within its box.
 */
function wardrobe(materials: Materials, across: number, height: number, along: number, owned: (BufferGeometry | Material)[]): Group {
	const group = new Group();
	const body = materials.paint(0xece5d9, 0.55);
	const oak = materials.paint(0xb9895d, 0.58);
	const shadow = materials.paint(0x4a4038, 0.8);
	const brass = materials.brass;
	const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: Material) => {
		const geometry = new BoxGeometry(w, h, d);
		owned.push(geometry);
		const mesh = new Mesh(geometry, material);
		mesh.position.set(x, y + h / 2, z);
		mesh.castShadow = mesh.receiveShadow = true;
		group.add(mesh);
		return mesh;
	};
	const plinth = 0.08;
	const crown = 0.05;
	const door = 0.025;
	// The plinth, set back so the doors overhang it, and the carcass and crown, which reach the box's back.
	box(across - 0.06, plinth, along - 0.08, 0, 0, -0.04, shadow);
	box(across, height - plinth - crown, along - door, 0, plinth, -door / 2, body);
	box(across, crown, along, 0, height - crown, 0, oak);
	// Two doors in front, with a dark gap between them, and a bar handle on each beside the gap.
	const gap = 0.012;
	const leaf = (across - gap) / 2;
	const doorHeight = height - plinth - crown - 0.01;
	for (const side of [-1, 1]) {
		box(leaf - 0.004, doorHeight, door, side * (gap / 2 + leaf / 2), plinth + 0.005, along / 2 - door / 2, oak);
		box(0.018, 0.34, 0.03, side * (gap / 2 + 0.05), plinth + doorHeight * 0.48, along / 2 + 0.012, brass);
	}
	box(gap, doorHeight, 0.004, 0, plinth + 0.005, along / 2 - door + 0.002, shadow);
	return group;
}
