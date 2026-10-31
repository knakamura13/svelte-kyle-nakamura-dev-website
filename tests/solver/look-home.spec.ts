import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { Furniture, HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { FURNITURE_FILES, type FurnitureFile, type LookAssets } from '../../src/lib/experiments/airflow/scene/look/assets';
import { buildFurniture, chooseFacing, hasRecipe, uniformFit, wallDistances } from '../../src/lib/experiments/airflow/scene/look/furniture';
import { Home } from '../../src/lib/experiments/airflow/scene/look/home';
import { Materials } from '../../src/lib/experiments/airflow/scene/look/materials';
import { CUT_HEIGHT, DOWN_HEIGHT } from '../../src/lib/experiments/airflow/scene/walls/cutaway';

/**
 * The Home as the world draws it (`scene/look/home.ts`), checked in Node without its CC0 assets: the furniture is then plain blocks and
 * the textures single texels, but the walls, the floors, the picking, the cutaway and the choice of which way each piece faces are the
 * same. What it looks like is checked in a browser (the check-in screenshots).
 */

const materials = () => new Materials(1, null);
/** A camera far out to the south-south-west, looking at the middle of the Home, as the default view does. */
const farView = (plan: HomePlan) => ({ camera: { x: plan.width / 2 - 6, z: plan.depth + 9 }, focus: { x: plan.width / 2, z: plan.depth / 2 }, zoom: 0.8 });

test.describe('the Home', () => {
	test('builds for every plan, with an anchor for every Room, and the floors and the furniture to land on', () => {
		for (const plan of plans) {
			const home = new Home(plan, materials(), null, { furniture: true });
			expect(home.roomAnchors, plan.id).toHaveLength(plan.rooms.length);
			for (const anchor of home.roomAnchors) for (const value of anchor.position.toArray()) expect(Number.isFinite(value), `${plan.id}: ${anchor.id}`).toBe(true);
			// Floors (one mesh per kind) and the furniture's boxes.
			expect(home.pickables.length, plan.id).toBe(home.floors.length + (plan.furniture.length ? 1 : 0));
			expect(home.bounds).toEqual({ width: plan.width, depth: plan.depth, ceiling: plan.ceiling });
			// Every piece of the plan is drawn, and faces somewhere.
			expect(home.facings.size, plan.id).toBe(plan.furniture.length);
			home.dispose();
		}
	});

	test('takes any opening state and the furniture on and off in any order, and hidden furniture leaves what can be picked', () => {
		for (const plan of plans) {
			const home = new Home(plan, materials(), null, { furniture: true });
			const every = (amount: number) => Object.fromEntries(plan.openings.map((o) => [o.id, amount]));
			const withFurniture = home.pickables.length;
			expect(() => {
				home.setOpenings({});
				home.setOpenings(every(0.5));
				home.setOpenings(every(1));
				home.setOpenings({ [plan.openings[0].id]: 0 });
				home.setFurniture(false);
				home.setFurniture(false);
				home.setFurniture(true);
			}, plan.id).not.toThrow();
			expect(home.pickables.length, plan.id).toBe(withFurniture);
			home.setFurniture(false);
			if (plan.furniture.length) expect(home.pickables.length, plan.id).toBe(withFurniture - 1);
			home.dispose();
		}
	});

	test('stands its walls for the wall mode: all full height, all down, or cut for the camera; settled at once when told, eased otherwise', () => {
		const plan = planById('two-bedroom')!;
		const home = new Home(plan, materials(), null, { furniture: false });
		const view = farView(plan);
		home.update(view, 'up', 0, true);
		expect(home.walls.heights.every((h) => h === plan.ceiling)).toBe(true);
		home.update(view, 'down', 0, true);
		expect(home.walls.heights.every((h) => h === DOWN_HEIGHT)).toBe(true);
		home.update(view, 'cutaway', 0, true);
		const heights = home.walls.heights;
		expect(heights.some((h) => h === CUT_HEIGHT) && heights.some((h) => h === plan.ceiling), 'some walls cut and some standing').toBe(true);
		// Eased: a step moves toward the goal, and enough steps settle it.
		expect(home.update(view, 'up', 1 / 60, false), 'still moving after one frame').toBe(true);
		let moving = true;
		for (let n = 0; n < 600 && moving; n++) moving = home.update(view, 'up', 1 / 60, false);
		expect(moving).toBe(false);
		expect(home.walls.heights.every((h) => h === plan.ceiling)).toBe(true);
		home.dispose();
	});

	test('says once that the shadow map is stale after something that casts a shadow moved', () => {
		const plan = planById('two-bedroom')!;
		const home = new Home(plan, materials(), null, { furniture: true });
		expect(home.takeShadowChange(), 'a new Home has never been drawn').toBe(true);
		expect(home.takeShadowChange(), 'and that was said once').toBe(false);
		// The camera moving and the walls cutting away do not change the shadows: they are cast by the walls as built.
		home.update(farView(plan), 'down', 0, true);
		expect(home.takeShadowChange()).toBe(false);
		home.setOpenings({ 'front-door': 1 });
		expect(home.takeShadowChange(), 'a door swung').toBe(true);
		home.setFurniture(false);
		expect(home.takeShadowChange(), 'the furniture went').toBe(true);
		home.dispose();
	});
});

test.describe('the furniture', () => {
	/** The kit's models' own footprints, across and along (their width and depth), read from the GLB files. */
	const KIT = {
		bed: { across: 0.956, along: 1.125 },
		sofa: { across: 0.98, along: 0.41 },
		tub: { across: 1.19, along: 0.56 },
		toilet: { across: 0.313, along: 0.477 },
		console: { across: 0.8, along: 0.25 },
		fridge: { across: 0.52, along: 0.41 }
	};
	const plan = planById('two-bedroom')!;
	const piece = (id: string) => plan.furniture.find((f) => f.id === id) as Furniture;

	test('knows how far each side of a piece is from a wall', () => {
		// Bedroom 1's bed stands against the north wall.
		expect(wallDistances(plan, piece('bed-1')).north).toBeCloseTo(0, 6);
		// The sofa's back is 0.64 m from the wall between the living room and the hall (at x 4.8, 0.1 thick).
		expect(wallDistances(plan, piece('sofa')).east).toBeCloseTo(0.64, 6);
		// The coffee table stands free on every side but the far ones.
		expect(Math.min(...Object.values(wallDistances(plan, piece('coffee-table'))))).toBeGreaterThan(1);
	});

	test('faces into its Room: beds head to the wall, the sofa toward the TV and the TV toward it, the tub along its wall, the toilet back to its wall', () => {
		expect(chooseFacing(plan, piece('bed-1'), KIT.bed)).toBe('south');
		expect(chooseFacing(plan, piece('bed-2'), KIT.bed)).toBe('north');
		expect(chooseFacing(plan, piece('sofa'), KIT.sofa)).toBe('west');
		expect(chooseFacing(plan, piece('tv-console'), KIT.console)).toBe('east');
		// The tub fills a corner: its long side goes against the south wall, so it faces north, whichever wall is nearer its end.
		expect(chooseFacing(plan, piece('tub'), KIT.tub)).toBe('north');
		expect(chooseFacing(plan, piece('toilet'), KIT.toilet)).toBe('west');
		// The fridge stands in the kitchen's south-east corner and opens into the kitchen.
		expect(chooseFacing(plan, piece('fridge'), KIT.fridge)).toBe('west');
	});

	test('a kitchen has one sink, under its window, and one stove, along the counters', () => {
		const home = new Home(plan, materials(), null, { furniture: true });
		expect(home.facings.get('counter-north')).toBe('south');
		expect(home.facings.get('counter-east')).toBe('west');
		const north = home.furnitureModels.get('counter-north')!;
		const east = home.furnitureModels.get('counter-east')!;
		const all = [...north, ...east];
		expect(all.filter((m) => m === 'counter:sink')).toHaveLength(1);
		expect(all.filter((m) => m === 'counter:stove')).toHaveLength(1);
		// The north counter faces south, so its modules run east from its west end, 0.6 m each: the sink's middle is the window's (x 6.3).
		const counter = piece('counter-north');
		const sink = north.indexOf('counter:sink');
		expect(counter.x + (sink + 0.5) * (counter.w / north.length)).toBeCloseTo(6.3, 6);
		// Every wardrobe is built, since the kit has none.
		for (const item of plan.furniture.filter((f) => f.name === 'Wardrobe')) expect(home.furnitureModels.get(item.id)).toEqual(['wardrobe']);
		home.dispose();
		// Every Home with a kitchen has one sink and one stove, on the counters along its walls, and an island has neither.
		for (const each of plans) {
			const view = buildFurniture(each, materials(), null);
			const counters = each.furniture.filter((f) => f.name === 'Kitchen counter' || f.name === 'Kitchen island').flatMap((f) => view.models.get(f.id)!);
			if (!counters.length) continue;
			expect(counters.filter((m) => m === 'counter:sink'), each.id).toHaveLength(1);
			expect(counters.filter((m) => m === 'counter:stove'), each.id).toHaveLength(1);
			for (const island of each.furniture.filter((f) => f.name === 'Kitchen island')) expect(view.models.get(island.id)!.every((m) => m === 'counter:drawer' || m === 'counter:cabinet'), island.id).toBe(true);
			view.dispose();
		}
	});

	test('every kind of piece in every plan has a recipe of its own, so none falls back to the stand-in', () => {
		for (const each of plans) for (const item of each.furniture) expect(hasRecipe(item.name), `${each.id}: ${item.name}`).toBe(true);
	});

	test('a model is scaled by one factor, the largest that keeps it inside its box', () => {
		const sofa = uniformFit({ x: 0.98, y: 0.46, z: 0.41 }, 2.0, 0.8, 0.9);
		expect(sofa.scale).toBeCloseTo(0.8 / 0.46, 9);
		expect([sofa.width, sofa.height, sofa.depth].map((v) => +v.toFixed(3))).toEqual([1.704, 0.8, 0.713]);
		// A bed's headboard may stand over its mattress's box, so its footprint fills the box instead.
		const bed = uniformFit({ x: 0.956, y: 0.375, z: 1.125 }, 1.5, 0.5, 2.0, 1.25);
		expect(bed.width).toBeCloseTo(1.5, 9);
		expect(bed.height).toBeLessThanOrEqual(0.5 * 1.25);
	});

	/** Stand-ins for the kit's models at their real sizes (width, height, depth, m, from the GLB files), one mesh in one of its materials. */
	const KIT_SIZES: Record<FurnitureFile, [number, number, number]> = {
		bedDouble: [0.956, 0.375, 1.125],
		loungeSofa: [0.98, 0.46, 0.41],
		loungeChair: [0.49, 0.46, 0.41],
		cabinetTelevision: [0.8, 0.31, 0.25],
		cabinetTelevisionDoors: [0.8, 0.31, 0.26],
		table: [0.841, 0.327, 0.447],
		chairCushion: [0.2, 0.46, 0.2],
		kitchenFridgeLarge: [0.52, 0.92, 0.406],
		kitchenCabinetUpperDouble: [0.43, 0.39, 0.22],
		cabinetBedDrawerTable: [0.266, 0.263, 0.217],
		lampRoundTable: [0.152, 0.314, 0.176],
		sideTableDrawers: [0.534, 0.384, 0.222],
		laptop: [0.264, 0.162, 0.24],
		books: [0.15, 0.104, 0.095],
		plantSmall1: [0.095, 0.14, 0.095],
		bathroomCabinetDrawer: [0.43, 0.472, 0.32],
		toilet: [0.313, 0.451, 0.477],
		bathtub: [1.19, 0.42, 0.56],
		washer: [0.39, 0.47, 0.39],
		dryer: [0.39, 0.47, 0.38]
	};
	const kit = (): LookAssets => {
		const furniture = new Map<FurnitureFile, Object3D>();
		for (const file of FURNITURE_FILES) {
			const [w, h, d] = KIT_SIZES[file];
			const root = new Group();
			const mesh = new Mesh(new BoxGeometry(w, h, d).translate(w / 2, h / 2, -d / 2), new MeshStandardMaterial({ name: 'wood' }));
			root.add(mesh);
			furniture.set(file, root);
		}
		return { furniture } as unknown as LookAssets;
	};

	test('every model of the kit keeps its proportions, stands inside its piece’s box, and the solver’s boxes are the plan’s', () => {
		const assets = kit();
		for (const each of plans) {
			const view = buildFurniture(each, materials(), assets);
			view.group.updateMatrixWorld(true);
			let fitted = 0;
			view.group.traverse((object) => {
				if (!object.userData.fit) return;
				fitted++;
				const { file } = object.userData.fit as { file: FurnitureFile };
				const piece = each.furniture.find((f) => f.id === object.parent!.name)!;
				// One scale on every axis: the model is not stretched to its box.
				expect(object.scale.x, `${each.id} ${piece.id} ${file}`).toBeCloseTo(object.scale.y, 9);
				expect(object.scale.z, `${each.id} ${piece.id} ${file}`).toBeCloseTo(object.scale.y, 9);
				// Inside the piece's box on the floor plan, and no higher than it (a bed's headboard a quarter over).
				const box = new Box3().setFromObject(object);
				const over = piece.name === 'Queen bed' ? 1.25 : 1;
				expect(box.min.x, `${piece.id} ${file}`).toBeGreaterThanOrEqual(piece.x - 1e-6);
				expect(box.max.x, `${piece.id} ${file}`).toBeLessThanOrEqual(piece.x + piece.w + 1e-6);
				expect(box.min.z, `${piece.id} ${file}`).toBeGreaterThanOrEqual(piece.z - 1e-6);
				expect(box.max.z, `${piece.id} ${file}`).toBeLessThanOrEqual(piece.z + piece.d + 1e-6);
				expect(box.max.y, `${piece.id} ${file}`).toBeLessThanOrEqual((piece.y ?? 0) + piece.h * over + 1e-6);
			});
			expect(fitted, each.id).toBeGreaterThan(0);
			// The solver's boxes, which a pointer lands on, are exactly the plan's.
			const solids = new Box3().setFromObject(view.solids);
			expect(solids.min.x).toBeCloseTo(Math.min(...each.furniture.map((f) => f.x)), 5);
			expect(solids.max.z).toBeCloseTo(Math.max(...each.furniture.map((f) => f.z + f.d)), 5);
			expect(view.solids.geometry.getAttribute('position').count, each.id).toBe(24 * each.furniture.length);
			view.dispose();
		}
	});

	test('every piece fills its box to the centimetre, so the solver blocks no air where the room looks open', () => {
		const assets = kit();
		for (const each of plans) {
			const view = buildFurniture(each, materials(), assets);
			view.group.updateMatrixWorld(true);
			for (const piece of each.furniture) {
				const drawn = new Box3().setFromObject(view.group.getObjectByName(piece.id)!);
				const top = (piece.y ?? 0) + piece.h;
				// What each side of the box leaves undrawn, m: the plans' boxes are what is drawn, rounded out to the centimetre.
				const undrawn = [drawn.min.x - piece.x, piece.x + piece.w - drawn.max.x, drawn.min.z - piece.z, piece.z + piece.d - drawn.max.z, top - drawn.max.y];
				for (const gap of undrawn) expect(gap, `${each.id} ${piece.id}: a side of its box left undrawn, m`).toBeLessThanOrEqual(0.011);
			}
			view.dispose();
		}
	});

	test('nothing reads as a plain box: the bookcase holds books, the dining table has chairs, the sideboard stands on legs', () => {
		const assets = kit();
		for (const each of plans) {
			const view = buildFurniture(each, materials(), assets);
			for (const item of each.furniture) {
				const models = view.models.get(item.id)!;
				if (item.name === 'Bookcase') expect(models.filter((m) => m === 'books').length, `${each.id} ${item.id}`).toBeGreaterThanOrEqual(8);
				if (item.name === 'Dining table') expect(models.filter((m) => m === 'chairCushion').length, `${each.id} ${item.id}`).toBeGreaterThanOrEqual(2);
				if (item.name === 'Sideboard') expect(models, `${each.id} ${item.id}`).toEqual(['stand', 'cabinetTelevisionDoors']);
				if (item.name === 'Refrigerator') expect(models, `${each.id} ${item.id}`).toEqual(['kitchenFridgeLarge', 'kitchenCabinetUpperDouble']);
				// A piece built here is several merged parts in a few materials, not one block.
				const group = view.group.getObjectByName(item.id)!;
				let meshes = 0;
				group.traverse((object) => void ((object as Mesh).isMesh && meshes++));
				expect(meshes, `${each.id} ${item.id}`).toBeGreaterThanOrEqual(1);
			}
			view.dispose();
		}
	});
});
