import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { Furniture, HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { chooseFacing, hasRecipe, wallDistances } from '../../src/lib/experiments/airflow/scene/look/furniture';
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
		// The sofa's back is 0.55 m from the wall between the living room and the hall (at x 4.8, 0.1 thick).
		expect(wallDistances(plan, piece('sofa')).east).toBeCloseTo(0.55, 6);
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
		expect(all.filter((m) => m === 'kitchenSink')).toHaveLength(1);
		expect(all.filter((m) => m === 'kitchenStoveElectric')).toHaveLength(1);
		// The north counter faces south, so its modules run east from its west end, 0.6 m each: the sink's middle is the window's (x 6.3).
		const counter = piece('counter-north');
		const sink = north.indexOf('kitchenSink');
		expect(counter.x + (sink + 0.5) * (counter.w / north.length)).toBeCloseTo(6.3, 6);
		// Every wardrobe is built, since the kit has none.
		for (const item of plan.furniture.filter((f) => f.name === 'Wardrobe')) expect(home.furnitureModels.get(item.id)).toEqual(['wardrobe']);
		home.dispose();
	});

	test('every kind of piece in every plan has a recipe of its own, so none falls back to the stand-in', () => {
		for (const each of plans) for (const item of each.furniture) expect(hasRecipe(item.name), `${each.id}: ${item.name}`).toBe(true);
	});
});
