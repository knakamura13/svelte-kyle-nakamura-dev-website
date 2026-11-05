import { Box3, Group, Vector3, type Mesh, type Object3D } from 'three';
import type { HomePlan, Room } from '../../homes/types';
import type { CameraBounds } from '../camera/sims';
import { corridorFor, cutWalls, wallHeights, type WallMode } from '../walls/cutaway';
import { WallsView } from '../walls/walls';
import { EXTERIOR_WALL } from '../wallPieces';
import type { LookAssets } from './assets';
import { GRADE, buildFloors } from './floors';
import { buildFurniture, type FurnitureView } from './furniture';
import type { Materials } from './materials';
import { buildOutside, type OutsideView } from './outside';

/** Where the camera is and what it looks at, in the plan, for the cutaway: positions in metres, zoom 0 (eye level) to 1 (bird's-eye). */
export interface CameraLook {
	camera: { x: number; z: number };
	focus: { x: number; z: number };
	zoom: number;
}

/** Where a Room's name goes: its area-weighted middle if that falls inside it, otherwise the middle of its largest rectangle. */
export function roomMiddle(room: Room): [number, number] {
	let area = 0;
	let x = 0;
	let z = 0;
	for (const r of room.rects) {
		const a = r.w * r.d;
		area += a;
		x += a * (r.x + r.w / 2);
		z += a * (r.z + r.d / 2);
	}
	x /= area || 1;
	z /= area || 1;
	if (room.rects.some((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d)) return [x, z];
	const largest = room.rects.reduce((best, r) => (r.w * r.d > best.w * best.d ? r : best));
	return [largest.x + largest.w / 2, largest.z + largest.d / 2];
}

/**
 * A Home as the world draws it, with the roof never drawn: painted walls that cut away between the camera and the room it looks into
 * (`walls/walls.ts`, `walls/cutaway.ts`), laminate and tile floors on a foundation, the plan's furniture as fitted models, and the lawn,
 * the walk and the planting outside. It replaces the old dollhouse. Everything is in the solver's axes (metres; x east, y up, z south;
 * the origin at the footprint's north-west floor corner), so the scene and the solver agree with no conversion.
 */
export class Home {
	readonly group = new Group();
	readonly walls: WallsView;
	readonly roomAnchors: { id: string; name: string; position: Vector3 }[];
	/** The floors, and the furniture's boxes while it is shown: what a pointer can land on. A raycaster ignores `visible`, so hidden things leave this list. */
	readonly pickables: Object3D[] = [];
	readonly floors: Mesh[];
	private readonly furniture: FurnitureView;
	private readonly outside: OutsideView;
	private readonly disposeFloors: () => void;
	private cut: boolean[] = [];
	/** Something that casts a shadow appeared or went (the furniture) since the scene last asked. */
	private changed = true;

	constructor(
		readonly plan: HomePlan,
		materials: Materials,
		assets: LookAssets | null,
		options: { furniture: boolean }
	) {
		this.group.name = `home:${plan.id}`;
		this.walls = new WallsView(plan, materials);
		const { group: floorGroup, floors, dispose } = buildFloors(plan, materials);
		this.floors = floors;
		this.disposeFloors = dispose;
		this.furniture = buildFurniture(plan, materials, assets);
		this.outside = buildOutside(plan, materials, assets);
		this.group.add(this.walls.group, floorGroup, this.furniture.group, this.outside.group);
		this.pickables.push(...floors);
		this.setFurniture(options.furniture);
		this.roomAnchors = plan.rooms.map((room) => {
			const [x, z] = roomMiddle(room);
			return { id: room.id, name: room.name, position: new Vector3(x, 1.6, z) };
		});
		this.walls.setOpenings({});
	}

	/** The footprint and how high the walls stand, for the camera. */
	get bounds(): CameraBounds {
		return { width: this.plan.width, depth: this.plan.depth, ceiling: this.plan.ceiling };
	}

	/** A box round the Home and its planting, for what ambient occlusion has to cover. */
	aoBox(margin = 9): Box3 {
		const t = EXTERIOR_WALL;
		return new Box3(new Vector3(-t - margin, GRADE - 0.5, -t - margin), new Vector3(this.plan.width + t + margin, 12, this.plan.depth + t + margin));
	}

	/** Sets each Opening to `amounts[id]` (0 to 1 of its travel), or its plan position if it is not listed. */
	setOpenings(amounts: Record<string, number>) {
		this.walls.setOpenings(amounts);
	}

	setFurniture(on: boolean) {
		const listed = this.pickables.indexOf(this.furniture.solids);
		const pickable = listed >= 0;
		if (this.furniture.group.visible === on && pickable === on) return;
		this.furniture.group.visible = on;
		if (on && listed < 0) this.pickables.push(this.furniture.solids);
		if (!on && listed >= 0) this.pickables.splice(listed, 1);
		this.changed = true;
	}

	/**
	 * Once a frame: which walls stand, for the camera and the wall mode, and eases them there (all at once when `instant`, for reduced
	 * motion). Returns true while a wall is still moving.
	 */
	update(look: CameraLook, mode: WallMode, dt: number, instant: boolean): boolean {
		this.cut = cutWalls(this.walls.lines, { camera: look.camera, focus: look.focus, corridor: corridorFor(look.zoom), zoom: look.zoom }, this.cut);
		this.walls.setGoals(wallHeights(mode, this.cut, this.plan.ceiling));
		return this.walls.update(dt, instant);
	}

	/** Whether something that casts the sun's shadow moved since the last call: the shadow map needs drawing again. */
	takeShadowChange(): boolean {
		const changed = this.changed || this.walls.shadowsChanged;
		this.changed = false;
		this.walls.shadowsChanged = false;
		return changed;
	}

	/** Where each piece of furniture faces, by id (for tests). */
	get facings() {
		return this.furniture.facings;
	}

	/** The models each piece of furniture is drawn with, by id (for tests). */
	get furnitureModels() {
		return this.furniture.models;
	}

	dispose() {
		this.group.removeFromParent();
		this.walls.dispose();
		this.furniture.dispose();
		this.outside.dispose();
		this.disposeFloors();
		this.pickables.length = 0;
	}
}
