import {
	BoxGeometry,
	BufferGeometry,
	Float32BufferAttribute,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Quaternion,
	Raycaster,
	Vector2,
	Vector3,
	type Material,
	type PerspectiveCamera
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { PointerPhase, SceneInput } from '$lib/experiments/engine/types';
import { deviceDefaults } from '../devices/placement';
import { footprintRadius } from '../devices/surfaces';
import type { DeviceModel } from '../devices/types';
import { isExterior, type Furniture, type HomePlan, type OpeningSpec } from '../homes/types';
import type { DeviceState, Pin, Setup, Target, Tool } from '../state';
import { DeviceMeshes } from './deviceMeshes';
import { SLOP_PX } from './input';
import { RENDER_ORDER } from './renderOrder';

/**
 * What a click on the 3D world chooses, for the HUD's context menus and Inspector: a door or window, a fan or purifier, or a Probe.
 * The picking is plain geometry against the plan and the setup (boxes round each frame, each device and each pin, with the furniture
 * in front hiding what is behind it), so it runs in Node, and it does not depend on how the walls, the furniture or the devices are
 * drawn. `Selection` adds the three.js side: the ray under the pointer, the screen point of a thing (where its menu is anchored), the
 * outline of what is chosen or under the pointer, and the ghost of a device being carried from the catalog. `ToolInput` makes a
 * press on the world do what the HUD's tool says, and hands everything else to the scene's own input.
 */

export type Vec3 = [number, number, number];

/** An axis-aligned box in the solver's axes (metres; x east, y up, z south). */
export interface Box {
	min: Vec3;
	max: Vec3;
}

/** How far outside a frame, a device or a pin a click still takes it, m. */
export const PICK_MARGIN = 0.06;
/** Outside walls stand outside the footprint and are this thick; inside walls are this thick, centred on their line (scene/wallPieces.ts). */
const EXTERIOR_WALL = 0.2;
const INTERIOR_WALL = 0.1;
/** A Probe's head is a ball this big to a click, m, on a stem this thick. */
const PROBE_HEAD = 0.13;
const PROBE_STEM = 0.05;

/** The box round a door's or window's frame that a click takes: through the whole wall, a little into the room. */
export function openingBox(plan: Pick<HomePlan, 'width' | 'depth'>, opening: OpeningSpec, margin = PICK_MARGIN): Box {
	const { placement, width, height, sill } = opening;
	const y0 = sill - margin;
	const y1 = sill + height + margin;
	if (isExterior(placement)) {
		const u0 = placement.center - width / 2 - margin;
		const u1 = placement.center + width / 2 + margin;
		const out = EXTERIOR_WALL + margin;
		switch (placement.facade) {
			case 'north':
				return { min: [u0, y0, -out], max: [u1, y1, margin] };
			case 'south':
				return { min: [u0, y0, plan.depth - margin], max: [u1, y1, plan.depth + out] };
			case 'west':
				return { min: [-out, y0, u0], max: [margin, y1, u1] };
			case 'east':
				return { min: [plan.width - margin, y0, u0], max: [plan.width + out, y1, u1] };
		}
	}
	const half = INTERIOR_WALL / 2 + margin;
	const u0 = placement.center - width / 2 - margin;
	const u1 = placement.center + width / 2 + margin;
	return placement.axis === 'x' ? { min: [u0, y0, placement.at - half], max: [u1, y1, placement.at + half] } : { min: [placement.at - half, y0, u0], max: [placement.at + half, y1, u1] };
}

/**
 * The box a click takes for a door or window whose wall is cut down to `height` (cutaway, or walls down): what is left of it, the
 * stretch of the cut wall under its frame from the floor to the cap, through the whole wall, so a click on the cap over a window or on a
 * door's stub chooses it. Above the cap a ray passes on into the room, as it does over the rest of the cut wall.
 */
export function cutOpeningBox(plan: Pick<HomePlan, 'width' | 'depth'>, opening: OpeningSpec, height: number, margin = PICK_MARGIN): Box {
	const box = openingBox(plan, opening, margin);
	box.min[1] = 0;
	box.max[1] = Math.max(0, height) + margin;
	return box;
}

/**
 * The strip that marks a window on the cap of a wall cut down below it, `height` m up: as long as the window's frame is wide and as
 * deep as the wall, a hair above the cap. A door needs none, since its own stub shows where it is; null for one, and for a window
 * whose sill is not above the cut.
 */
export function cutSill(plan: Pick<HomePlan, 'width' | 'depth'>, opening: OpeningSpec, height: number): Box | null {
	if (opening.kind === 'door' || opening.kind === 'sliding-door' || opening.sill < height + 0.02) return null;
	const box = openingBox(plan, opening, 0);
	box.min[1] = height;
	box.max[1] = height + SILL_THICKNESS;
	return box;
}

/** How thick the strip on a cut wall's cap over a window is, m. */
const SILL_THICKNESS = 0.012;

/** The top of a device, m above the floor: a pedestal fan's head, or its body. */
const deviceTop = (model: DeviceModel, device: DeviceState) => (model.kind === 'pedestal-fan' ? device.y + device.height + model.diameter / 2 + 0.02 : device.y + model.body.height);

/** The box round a fan or purifier that a click takes: its body turned to its heading, or a pedestal fan from its base to the top of its head. */
export function deviceBox(model: DeviceModel, device: DeviceState, margin = PICK_MARGIN / 2): Box {
	const top = deviceTop(model, device) + margin;
	if (model.kind === 'pedestal-fan') {
		const reach = Math.max(footprintRadius(model), model.diameter / 2 + 0.02) + margin;
		return { min: [device.x - reach, device.y, device.z - reach], max: [device.x + reach, top, device.z + reach] };
	}
	const turn = (device.yaw * Math.PI) / 180;
	const { width, depth } = model.body;
	const ex = Math.abs(Math.cos(turn)) * (width / 2) + Math.abs(Math.sin(turn)) * (depth / 2) + margin;
	const ez = Math.abs(Math.sin(turn)) * (width / 2) + Math.abs(Math.cos(turn)) * (depth / 2) + margin;
	return { min: [device.x - ex, device.y, device.z - ez], max: [device.x + ex, top, device.z + ez] };
}

const furnitureBox = (f: Furniture): Box => ({ min: [f.x, f.y ?? 0, f.z], max: [f.x + f.w, (f.y ?? 0) + f.h, f.z + f.d] });

/** How far along a ray (origin, unit direction) it first meets a box, m, or null if it misses. A ray that starts inside meets it at 0. */
export function rayBox(origin: Vec3, direction: Vec3, box: Box): number | null {
	let near = 0;
	let far = Infinity;
	for (let i = 0; i < 3; i++) {
		if (Math.abs(direction[i]) < 1e-12) {
			if (origin[i] < box.min[i] || origin[i] > box.max[i]) return null;
			continue;
		}
		let t0 = (box.min[i] - origin[i]) / direction[i];
		let t1 = (box.max[i] - origin[i]) / direction[i];
		if (t0 > t1) [t0, t1] = [t1, t0];
		near = Math.max(near, t0);
		far = Math.min(far, t1);
		if (far < near) return null;
	}
	return near;
}

/** How far along a ray it first meets a ball, m, or null. */
export function raySphere(origin: Vec3, direction: Vec3, centre: Vec3, radius: number): number | null {
	const ox = origin[0] - centre[0];
	const oy = origin[1] - centre[1];
	const oz = origin[2] - centre[2];
	const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
	const c = ox * ox + oy * oy + oz * oz - radius * radius;
	const disc = b * b - c;
	if (disc < 0) return null;
	const root = Math.sqrt(disc);
	if (-b + root < 0) return null;
	return Math.max(0, -b - root);
}

/** A Probe to a click: its head, and the stem from the floor up to it. */
function rayProbe(origin: Vec3, direction: Vec3, pin: Pin): number | null {
	const head = raySphere(origin, direction, [pin.x, pin.y, pin.z], PROBE_HEAD);
	const stem = rayBox(origin, direction, { min: [pin.x - PROBE_STEM, 0, pin.z - PROBE_STEM], max: [pin.x + PROBE_STEM, pin.y, pin.z + PROBE_STEM] });
	if (head === null) return stem;
	return stem === null ? head : Math.min(head, stem);
}

/** Everything picking needs to know about the Home on screen. */
export interface PickScene {
	plan: HomePlan;
	devices: readonly DeviceState[];
	models: ReadonlyMap<string, DeviceModel>;
	probes: readonly Pin[];
	/** Whether the furniture is built in, so it hides what stands behind it. */
	furniture: boolean;
	/** The walls as they stand now (their solid parts, each as high as its wall stands): a ray stops at the first it meets. */
	walls?: readonly Box[];
	/**
	 * How high an Opening's wall stands, m, when it is cut down below the top of its frame (cutaway, or walls down); null while it stands
	 * whole. A cut Opening is clicked by what is left of it (`cutOpeningBox`).
	 */
	cutAt?: (opening: string) => number | null;
}

export interface Picked extends Target {
	/** How far along the ray it was met, m. */
	distance: number;
}

/** A Probe or a device met this close behind the nearest thing still wins over it: a window fan sits in its window, a Probe in front of a door. */
export const PREFER = 0.3;
const RANK: Record<Target['kind'], number> = { probe: 0, device: 1, opening: 2 };

/** How far along a ray it first meets a standing wall, m, or Infinity. */
export function wallDistance(origin: Vec3, direction: Vec3, walls: readonly Box[]): number {
	let nearest = Infinity;
	for (const box of walls) {
		const t = rayBox(origin, direction, box);
		if (t !== null && t < nearest) nearest = t;
	}
	return nearest;
}

/** The box a click takes for a door or window as its wall stands now: its whole frame, or what is left of it in a cut wall. */
export function pickBox(scene: Pick<PickScene, 'plan' | 'cutAt'>, opening: OpeningSpec): Box {
	const cut = scene.cutAt?.(opening.id) ?? null;
	return cut === null ? openingBox(scene.plan, opening) : cutOpeningBox(scene.plan, opening, cut);
}

/**
 * What a ray from the camera (origin, unit direction) takes: the nearest door, window, device or Probe it meets that no piece of
 * furniture and no standing wall is in front of, with a Probe or a device preferred over a window just behind it. A door or window in
 * a wall that is cut down is met at what is left of it, the cap over a window or a door's stub. `kinds` limits what it looks for.
 */
export function pickTarget(origin: Vec3, direction: Vec3, scene: PickScene, kinds: readonly Target['kind'][] = ['opening', 'device', 'probe']): Picked | null {
	const hits: Picked[] = [];
	const consider = (kind: Target['kind'], id: string, distance: number | null) => {
		if (distance !== null) hits.push({ kind, id, distance });
	};
	if (kinds.includes('opening')) for (const opening of scene.plan.openings) consider('opening', opening.id, rayBox(origin, direction, pickBox(scene, opening)));
	if (kinds.includes('device'))
		for (const device of scene.devices) {
			const model = scene.models.get(device.model);
			if (model) consider('device', device.id, rayBox(origin, direction, deviceBox(model, device)));
		}
	if (kinds.includes('probe')) for (const pin of scene.probes) consider('probe', pin.id, rayProbe(origin, direction, pin));
	if (!hits.length) return null;

	let blocked = scene.walls ? wallDistance(origin, direction, scene.walls) : Infinity;
	if (scene.furniture)
		for (const piece of scene.plan.furniture) {
			const t = rayBox(origin, direction, furnitureBox(piece));
			if (t !== null && t < blocked) blocked = t;
		}
	const seen = hits.filter((hit) => hit.distance <= blocked + 1e-3).sort((a, b) => a.distance - b.distance);
	if (!seen.length) return null;
	let best = seen[0];
	for (const hit of seen) if (hit.distance - seen[0].distance <= PREFER && RANK[hit.kind] < RANK[best.kind]) best = hit;
	return best;
}

/** Where a thing's menu is anchored, in the solver's axes: the middle of a frame on the room's side of its wall, the middle of a device, a Probe's head. Null when it is not in the Home. */
export function anchorOf(target: Target, scene: Pick<PickScene, 'plan' | 'devices' | 'models' | 'probes'>): Vec3 | null {
	const { plan } = scene;
	if (target.kind === 'opening') {
		const opening = plan.openings.find((o) => o.id === target.id);
		if (!opening) return null;
		const y = opening.sill + opening.height / 2;
		const { placement } = opening;
		if (isExterior(placement)) {
			switch (placement.facade) {
				case 'north':
					return [placement.center, y, 0];
				case 'south':
					return [placement.center, y, plan.depth];
				case 'west':
					return [0, y, placement.center];
				case 'east':
					return [plan.width, y, placement.center];
			}
		}
		return placement.axis === 'x' ? [placement.center, y, placement.at] : [placement.at, y, placement.center];
	}
	if (target.kind === 'device') {
		const device = scene.devices.find((d) => d.id === target.id);
		const model = device ? scene.models.get(device.model) : undefined;
		if (!device || !model) return null;
		return [device.x, (device.y + deviceTop(model, device)) / 2, device.z];
	}
	const pin = scene.probes.find((p) => p.id === target.id);
	return pin ? [pin.x, pin.y, pin.z] : null;
}

/** Whether a target still names something in the Home: a device or Probe that was removed, or an Opening of another plan, does not. */
export const exists = (target: Target, scene: Pick<PickScene, 'plan' | 'devices' | 'probes'>) =>
	target.kind === 'opening' ? scene.plan.openings.some((o) => o.id === target.id) : target.kind === 'device' ? scene.devices.some((d) => d.id === target.id) : scene.probes.some((p) => p.id === target.id);

/** A device being carried in from the catalog or moved from its menu, and where it would land: what the ghost draws. */
export interface DragPreview {
	model: string;
	x: number;
	y: number;
	z: number;
	ok: boolean;
	reason: string | null;
	/** The bearing it would face, degrees. */
	yaw?: number;
	/** The id of the device being moved, when it is one already in the Home. */
	moving?: string;
}

/** What the selection reads from the page's state, and calls to change it. The page's `AirflowExperience` is this object. */
export interface SelectionParams {
	tool: Tool;
	selection: Target | null;
	hovered: Target | null;
	/** Chooses a thing, or nothing; `menu` opens its context menu. */
	select(target: Target | null, menu?: boolean): void;
	/** What is under the pointer now, for the highlight and the cursor. */
	hover(target: Target | null): void;
}

export interface SelectionHost {
	camera: PerspectiveCamera;
	/** Where the Stage is on the page right now. */
	rect(): DOMRect;
	plan(): HomePlan;
	models: ReadonlyMap<string, DeviceModel>;
	params: SelectionParams & { setup: Setup; probes: readonly Pin[]; drag: DragPreview | null };
	/**
	 * The walls as they stand now: their solid parts stop a ray, so nothing behind a full-height wall is chosen, and an Opening whose wall
	 * is cut down (`cut` gives the height it stands at, or null while it is whole) is chosen by what is left of it. Absent: picking sees
	 * through the walls.
	 */
	walls?(): { boxes: readonly Box[]; cut(opening: string): number | null };
}

/** How close two labels' points may be on the page, CSS px across and up, before one sits on the other: a Room's name and a Probe's "Probe 1 0.4 mph". */
const LABEL_CLEAR = { x: 150, y: 36 };

/** The window frames' white, for the strips that mark a window on a cut wall's cap, and the most strips a Home has. */
const SILL_COLOR = 0xf2eee6;
const MAX_SILLS = 48;

/** The HUD's one accent, and the ghost's two colours. */
const ACCENT = 0x5fd59a;
const HOVER = 0xffffff;
const ALLOWED = 0x3fcf86;
const REFUSED = 0xe5484d;
const ON_TOP = RENDER_ORDER.markers + 8;

/** A loop of fat line segments through `points` (closed), drawn over everything. */
function outline(color: number, width: number, opacity: number) {
	const material = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthTest: false, depthWrite: false });
	const line = new LineSegments2(new LineSegmentsGeometry(), material);
	line.renderOrder = ON_TOP;
	line.frustumCulled = false;
	line.visible = false;
	return line;
}

/** Segment pairs for a closed loop. */
function loop(points: Vec3[]): number[] {
	const out: number[] = [];
	for (let i = 0; i < points.length; i++) out.push(...points[i], ...points[(i + 1) % points.length]);
	return out;
}

/** A circle in the horizontal plane at height y. */
const circle = (x: number, y: number, z: number, r: number, n = 40): Vec3[] => Array.from({ length: n }, (_, i): Vec3 => [x + r * Math.cos((i / n) * 2 * Math.PI), y, z + r * Math.sin((i / n) * 2 * Math.PI)]);

/** The outline that marks a thing: a rectangle round a frame on the room's face of its wall, a ring round a device's base or a Probe's foot. */
export function outlinePoints(target: Target, scene: Pick<PickScene, 'plan' | 'devices' | 'models' | 'probes'>): Vec3[] | null {
	const { plan } = scene;
	if (target.kind === 'opening') {
		const opening = plan.openings.find((o) => o.id === target.id);
		if (!opening) return null;
		const pad = 0.05;
		const y0 = Math.max(0.01, opening.sill - pad);
		const y1 = opening.sill + opening.height + pad;
		const { placement } = opening;
		const u0 = placement.center - opening.width / 2 - pad;
		const u1 = placement.center + opening.width / 2 + pad;
		// On the room's face of an outside wall, a centimetre into the room; on the line of an inside wall.
		let along: 'x' | 'z';
		let at: number;
		if (isExterior(placement)) {
			along = placement.facade === 'north' || placement.facade === 'south' ? 'x' : 'z';
			at = placement.facade === 'north' ? 0.01 : placement.facade === 'south' ? plan.depth - 0.01 : placement.facade === 'west' ? 0.01 : plan.width - 0.01;
		} else {
			along = placement.axis;
			at = placement.at;
		}
		const corner = (u: number, y: number): Vec3 => (along === 'x' ? [u, y, at] : [at, y, u]);
		return [corner(u0, y0), corner(u1, y0), corner(u1, y1), corner(u0, y1)];
	}
	if (target.kind === 'device') {
		const device = scene.devices.find((d) => d.id === target.id);
		const model = device ? scene.models.get(device.model) : undefined;
		if (!device || !model) return null;
		return circle(device.x, device.y + 0.015, device.z, footprintRadius(model) + 0.1);
	}
	const pin = scene.probes.find((p) => p.id === target.id);
	return pin ? circle(pin.x, 0.015, pin.z, 0.16, 28) : null;
}

/** A device's stand-in, see-through and green where it can go or red where it cannot, with a ring round its base and an arrow the way it will face. */
class Ghost {
	readonly group = new Group();
	private meshes: DeviceMeshes;
	private readonly base = outline(ALLOWED, 3, 0.95);
	private readonly arrow: Mesh<BufferGeometry, MeshBasicMaterial>;
	private readonly tinted = new Set<Material>();

	constructor(private readonly models: ReadonlyMap<string, DeviceModel>) {
		this.meshes = new DeviceMeshes(models);
		const wedge = new BufferGeometry();
		// Flat on the floor, pointing at -z (north) before it is turned: the way a device at yaw 0 blows.
		wedge.setAttribute('position', new Float32BufferAttribute([-0.11, 0, -0.12, 0.11, 0, -0.12, 0, 0, -0.34], 3));
		this.arrow = new Mesh(wedge, new MeshBasicMaterial({ color: ALLOWED, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
		this.arrow.renderOrder = ON_TOP;
		this.group.add(this.meshes.group, this.base, this.arrow);
		this.group.visible = false;
	}

	set(drag: DragPreview | null, resolution: Vector2) {
		const model = drag ? this.models.get(drag.model) : undefined;
		this.group.visible = !!drag && !!model;
		if (!drag || !model) return;
		const yaw = drag.yaw ?? 0;
		const device: DeviceState = { ...deviceDefaults(model), id: 'ghost', x: drag.x, y: drag.y, z: drag.z, yaw, power: 0 };
		this.meshes.update([device], 0, drag.y + 1, null);
		const color = drag.ok ? ALLOWED : REFUSED;
		this.meshes.group.traverse((object) => {
			if (object.userData.symbol) object.visible = false;
			const mesh = object as Mesh;
			if (!mesh.isMesh) return;
			let material = mesh.material as MeshBasicMaterial;
			if (!this.tinted.has(material)) {
				(mesh.material as Material).dispose();
				// Drawn over everything, as a hologram: the slice plane and the walls would hide most of a device standing below them.
				material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false });
				mesh.material = material;
				mesh.renderOrder = ON_TOP - 1;
				this.tinted.add(material);
			}
			material.color.setHex(color);
		});
		const r = footprintRadius(model) + 0.08;
		(this.base.geometry as LineSegmentsGeometry).setPositions(loop(circle(drag.x, drag.y + 0.015, drag.z, r)));
		this.base.computeLineDistances();
		const baseMaterial = this.base.material as LineMaterial;
		baseMaterial.color.setHex(color);
		baseMaterial.resolution.copy(resolution);
		this.base.visible = true;
		// The arrow lies just outside the ring, the way the device will face; a purifier blows up, so it has none.
		this.arrow.visible = model.kind !== 'air-purifier';
		this.arrow.material.color.setHex(color);
		this.arrow.position.set(drag.x, drag.y + 0.02, drag.z);
		this.arrow.scale.setScalar(1 + r);
		this.arrow.rotation.y = (-yaw * Math.PI) / 180;
	}

	dispose() {
		this.meshes.dispose();
		this.base.geometry.dispose();
		(this.base.material as LineMaterial).dispose();
		this.arrow.geometry.dispose();
		this.arrow.material.dispose();
		this.group.removeFromParent();
	}
}

/**
 * The three.js side of choosing things: the ray under a screen point, the screen point of a thing, the outlines of the chosen thing
 * and the one under the pointer, and the ghost of a device being carried. `update` once a frame.
 */
export class Selection {
	readonly group = new Group();
	private readonly raycaster = new Raycaster();
	private readonly ndc = new Vector2();
	private readonly point = new Vector3();
	private readonly resolution = new Vector2(1, 1);
	private readonly chosen = outline(ACCENT, 3.5, 1);
	private readonly under = outline(HOVER, 2, 0.75);
	private readonly ghost: Ghost;
	/** The strips on the caps of cut walls over the windows they cut away (`cutSill`): where a click chooses such a window. */
	private readonly sills = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: SILL_COLOR, roughness: 0.55 }), MAX_SILLS);
	private readonly matrix = new Matrix4();
	private readonly scale = new Vector3();
	private readonly turn = new Quaternion();
	private sillShape = '';
	private shapes = { chosen: '', under: '' };
	private pulse = 0;

	constructor(private readonly host: SelectionHost) {
		this.ghost = new Ghost(host.models);
		this.sills.count = 0;
		this.sills.receiveShadow = true;
		this.sills.frustumCulled = false;
		this.sills.name = 'cut-sills';
		this.group.add(this.chosen, this.under, this.ghost.group, this.sills);
	}

	private scene(walls = false): PickScene {
		const { setup, probes } = this.host.params;
		const scene: PickScene = { plan: this.host.plan(), devices: setup.devices, models: this.host.models, probes, furniture: setup.furniture };
		const standing = walls ? this.host.walls?.() : undefined;
		if (standing) {
			scene.walls = standing.boxes;
			scene.cutAt = (opening) => standing.cut(opening);
		}
		return scene;
	}

	/** Lays a strip on the cap of each cut wall over every window it cut away, at the height the wall stands now. */
	private drawSills() {
		const walls = this.host.walls?.();
		const plan = this.host.plan();
		const boxes: Box[] = [];
		if (walls)
			for (const opening of plan.openings) {
				const height = walls.cut(opening.id);
				const sill = height === null ? null : cutSill(plan, opening, height);
				if (sill && boxes.length < MAX_SILLS) boxes.push(sill);
			}
		const shape = boxes.map((b) => [...b.min, ...b.max].map((n) => n.toFixed(4)).join(',')).join(';');
		if (shape === this.sillShape) return;
		this.sillShape = shape;
		boxes.forEach((b, n) => {
			this.point.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
			this.scale.set(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
			this.sills.setMatrixAt(n, this.matrix.compose(this.point, this.turn, this.scale));
		});
		this.sills.count = boxes.length;
		this.sills.instanceMatrix.needsUpdate = true;
	}

	/** What is under a point of the Stage, in normalized device coordinates. The camera's matrices must be current, as they are after a frame. */
	pickAt(at: { x: number; y: number }, kinds?: readonly Target['kind'][]): Target | null {
		this.ndc.set(at.x, at.y);
		this.raycaster.setFromCamera(this.ndc, this.host.camera);
		const { origin, direction } = this.raycaster.ray;
		const picked = pickTarget([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], this.scene(true), kinds);
		return picked ? { kind: picked.kind, id: picked.id } : null;
	}

	/**
	 * Whether a standing wall is between the camera and a point of the Home: then the pointer is on the wall, not on the floor or the air
	 * behind it, and a Probe, smoke or a carried device does not go there.
	 */
	walled(point: { x: number; y: number; z: number }): boolean {
		const walls = this.host.walls?.();
		if (!walls) return false;
		const origin = this.host.camera.getWorldPosition(this.point);
		const dx = point.x - origin.x;
		const dy = point.y - origin.y;
		const dz = point.z - origin.z;
		const length = Math.hypot(dx, dy, dz);
		if (length < 1e-6) return false;
		return wallDistance([origin.x, origin.y, origin.z], [dx / length, dy / length, dz / length], walls.boxes) < length - 1e-3;
	}

	/**
	 * Whether a label over `point` would sit on one over any of `others` (a Room's name under a Probe's label, say): their points within
	 * `LABEL_CLEAR` CSS pixels of each other across and up, the size of two labels side by side.
	 */
	crowded(point: Vec3, others: readonly Vec3[]): boolean {
		const at = this.project(point);
		if (!at) return false;
		return others.some((other) => {
			const there = this.project(other);
			return !!there && Math.abs(there.x - at.x) < LABEL_CLEAR.x && Math.abs(there.y - at.y) < LABEL_CLEAR.y;
		});
	}

	/** Where a point of the Home is on the page, CSS pixels from the viewport's corner, or null behind the camera. */
	project(point: Vec3): { x: number; y: number } | null {
		const v = this.point.set(point[0], point[1], point[2]).project(this.host.camera);
		if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z > 1 || v.z < -1) return null;
		const box = this.host.rect();
		return { x: box.left + ((v.x + 1) / 2) * box.width, y: box.top + ((1 - v.y) / 2) * box.height };
	}

	/** The screen point a thing's menu hangs from, or null when it is gone or behind the camera. */
	anchor(target: Target): { x: number; y: number } | null {
		const at = anchorOf(target, this.scene());
		return at ? this.project(at) : null;
	}

	private draw(line: LineSegments2, key: 'chosen' | 'under', target: Target | null) {
		const scene = this.scene();
		const points = target ? outlinePoints(target, scene) : null;
		line.visible = !!points;
		if (!points) {
			this.shapes[key] = '';
			return;
		}
		const shape = points.map((p) => p.map((n) => n.toFixed(3)).join(',')).join(';');
		if (shape !== this.shapes[key]) {
			this.shapes[key] = shape;
			(line.geometry as LineSegmentsGeometry).setPositions(loop(points));
			line.computeLineDistances();
		}
		(line.material as LineMaterial).resolution.copy(this.resolution);
	}

	/** Once a frame. Returns true while the outline of the chosen thing is pulsing, so the Stage keeps drawing. */
	update(dt: number, reducedMotion: boolean): boolean {
		const box = this.host.rect();
		this.resolution.set(Math.max(1, box.width), Math.max(1, box.height));
		this.drawSills();
		const { selection, hovered, drag } = this.host.params;
		this.draw(this.chosen, 'chosen', selection);
		const under = hovered && !(selection && hovered.kind === selection.kind && hovered.id === selection.id) ? hovered : null;
		this.draw(this.under, 'under', drag ? null : under);
		this.ghost.set(drag, this.resolution);
		// The chosen outline breathes a little, unless the visitor prefers less motion.
		const material = this.chosen.material as LineMaterial;
		if (this.chosen.visible && !reducedMotion) {
			this.pulse += dt;
			material.opacity = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.pulse * 3.2));
			return true;
		}
		material.opacity = 1;
		return false;
	}

	dispose() {
		this.ghost.dispose();
		for (const line of [this.chosen, this.under]) {
			line.geometry.dispose();
			(line.material as LineMaterial).dispose();
		}
		this.sills.geometry.dispose();
		(this.sills.material as MeshStandardMaterial).dispose();
		this.sills.dispose();
		this.group.removeFromParent();
	}
}

/** What the tools need from the scene: what is under a point, and a device or handle a press would take hold of. */
export interface ToolHost {
	tool(): Tool;
	pickAt(at: { x: number; y: number }, kinds?: readonly Target['kind'][]): Target | null;
	/** The device, or the handle of the chosen one, under a point; `body` when it is the device itself rather than a handle. */
	grab(at: { x: number; y: number }): { device: string; body: boolean } | null;
	select(target: Target | null, menu: boolean): void;
	hover(target: Target | null): void;
	/** Whether a device is being carried from the catalog or moved from its menu. The HUD puts it down on a click; a press here only turns the camera. */
	carrying?(): boolean;
}

interface Press {
	id: number;
	x: number;
	y: number;
	/** It wandered past the slop, so it was a drag (the camera's, or a device's), not a click. */
	moved: boolean;
	/** Handed to the scene's own input, as itself or as a finger (`asTouch`). */
	forwarded: boolean;
	asTouch: boolean;
	/** What a click opens the menu of; undefined when a click opens nothing, null when it clears the choice. */
	click: Target | null | undefined;
}

const same = (a: Target | null, b: Target | null) => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/**
 * A press on the world does what the HUD's tool says. With Select or Build, a click on a door, window, device or Probe opens its
 * menu and a click on nothing clears it, while a drag still turns the camera; a device or one of its handles is dragged as before.
 * With Probe and Smoke a mouse acts as a finger does in Probe and Emit mode (`scene/input.ts`): a click pins a Probe, a press releases
 * smoke at once and drags its source, and the camera stays still. A finger and the keys follow `View.mode`, which each tool sets.
 */
export class ToolInput implements SceneInput {
	private press: Press | null = null;
	private hovered: Target | null = null;

	constructor(
		private readonly inner: SceneInput,
		private readonly host: ToolHost
	) {}

	touchAction() {
		return this.inner.touchAction?.() ?? 'pan-y';
	}

	key(event: KeyboardEvent) {
		return this.inner.key?.(event) ?? false;
	}

	private setHover(target: Target | null) {
		if (same(target, this.hovered)) return;
		this.hovered = target;
		this.host.hover(target);
	}

	/** A mouse press handed on as a finger's, so the scene's input gives it a finger's meaning in Probe and Emit mode. */
	private static asTouch(event: PointerEvent): PointerEvent {
		return { pointerId: event.pointerId, pointerType: 'touch', clientX: event.clientX, clientY: event.clientY, button: event.button } as PointerEvent;
	}

	pointer(phase: PointerPhase, event: PointerEvent, ndc: { x: number; y: number }): boolean {
		if (phase === 'leave') {
			this.setHover(null);
			return this.inner.pointer(phase, event, ndc);
		}
		if (phase === 'down') return this.down(event, ndc);
		const press = this.press?.id === event.pointerId ? this.press : null;
		const relay = (p: Press) => (p.asTouch ? ToolInput.asTouch(event) : event);
		if (phase === 'move') {
			if (press) {
				if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) press.moved = true;
				return press.forwarded ? this.inner.pointer('move', relay(press), ndc) : false;
			}
			if (event.pointerType !== 'mouse') return false;
			const tool = this.host.tool();
			// What a click would take: anything with Select and Build, a Probe with the Probe tool (whose clicks otherwise pin), nothing while carrying.
			if (this.host.carrying?.()) this.setHover(null);
			else this.setHover(tool === 'select' || tool === 'build' ? this.host.pickAt(ndc) : tool === 'probe' ? this.host.pickAt(ndc, ['probe']) : null);
			// The Probe tool reads the air under the pointer, as the mouse always did.
			return tool === 'probe' ? this.inner.pointer('move', event, ndc) : false;
		}
		// 'up'
		if (!press) return false;
		this.press = null;
		if (press.forwarded) this.inner.pointer('up', relay(press), ndc);
		if (!press.moved && press.click !== undefined) this.host.select(press.click, press.click !== null);
		return false;
	}

	private down(event: PointerEvent, ndc: { x: number; y: number }): boolean {
		const tool = this.host.tool();
		const start = (forwarded: boolean, asTouch: boolean, click: Press['click']) => {
			this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, forwarded, asTouch, click };
		};
		// While a device is carried, a click is the HUD's to put it down, and a drag still turns the camera.
		if (this.host.carrying?.()) {
			start(false, false, undefined);
			return false;
		}
		// A device or a handle of the chosen one is taken hold of in every tool, as before.
		const grab = this.host.grab(ndc);
		if (grab) {
			// A click (no drag) on the device or on one of its handles opens its menu; a drag moves, turns or aims it.
			start(true, false, { kind: 'device', id: grab.device });
			return this.inner.pointer('down', event, ndc);
		}
		if (tool === 'probe' || tool === 'smoke') {
			// A click on a Probe with the Probe tool opens its menu instead of pinning another beside it.
			const probe = tool === 'probe' ? this.host.pickAt(ndc, ['probe']) : null;
			if (probe) {
				start(false, false, probe);
				return true;
			}
			const asTouch = event.pointerType === 'mouse';
			start(true, asTouch, undefined);
			return this.inner.pointer('down', asTouch ? ToolInput.asTouch(event) : event, ndc);
		}
		// Select and Build: the press is the camera's unless it ends where it began, which is a click on whatever is there.
		start(false, false, this.host.pickAt(ndc));
		return false;
	}
}
