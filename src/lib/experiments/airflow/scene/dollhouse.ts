import {
	BufferGeometry,
	Color,
	DataTexture,
	Float32BufferAttribute,
	Group,
	LinearFilter,
	Mesh,
	MeshBasicMaterial,
	Vector3,
	type Camera,
	type ColorRepresentation,
	type MeshStandardMaterial,
	type Object3D
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clay, disposeTree, shade } from '$lib/experiments/engine/kit';
import type { RigSetup } from '$lib/experiments/engine/types';
import type { HomePlan, OpeningSpec, Room } from '../homes/types';
import {
	EXTERIOR_WALL,
	PLAN_WALL,
	doorSwing,
	frameLayouts,
	openingPanels,
	panelBottom,
	wallBox,
	wallPieces,
	wallRuns,
	type Panel,
	type Span,
	type WallRun
} from './wallPieces';

/** The site's soft tints (src/lib/styles/site.css, and experiments.css for mist and lilac). */
const TINTS = {
	sage: 0xe1e9d9,
	sand: 0xf4e9d8,
	cream: 0xf0e3cf,
	peach: 0xf1dfcd,
	butter: 0xf5e1bb,
	mist: 0xdde7ee,
	lilac: 0xe6ddf0
};
const ROOM_TINTS = [TINTS.sage, TINTS.sand, TINTS.mist, TINTS.peach, TINTS.lilac, TINTS.butter, TINTS.cream];
const COLORS = {
	wall: 0xf7f1e7,
	/** The tops of the walls, where the roof was cut off: a little deeper, so the plan reads. */
	cap: 0xd9ccb7,
	frame: 0xfdfbf7,
	leaf: 0xeee4d4,
	glass: 0xcfe2ee,
	threshold: 0xe4d9c7
};
const GLASS_OPACITY = 0.3;
/** How far an exterior wall fades when it stands between the camera and the rooms. */
const FADED = 0.12;
/** `dot(outward normal, direction to the camera)` above which a wall fades, and below which it comes back. */
const FADE_ON = 0.2;
const FADE_OFF = 0.15;
/** Interior walls drop to this height while the camera is higher than CUT_ON above the horizon (back above CUT_OFF). */
const CUTAWAY = 1.1;
const CUT_ON = (35 * Math.PI) / 180;
const CUT_OFF = (32 * Math.PI) / 180;
/** Rate of every eased change, per second. */
const EASE = 7;
/** Faded walls draw after everything else in the room (the page's tracers and slice plane should stay below this). */
const FADED_ORDER = 20;
/** Frame members stand this far proud of the wall faces, so a frame reads apart from its wall. */
const LIP = 0.006;
/** The floor slab under the rooms, the plinth under the whole house, and the plinth's ledge past the outside walls. */
const FLOOR = 0.02;
const PLINTH_BOTTOM = -0.16;
const LEDGE = 0.14;
const ALWAYS: [number, number] = [-1, 1e4];

const color = (value: ColorRepresentation) => new Color(value);

interface CutUniform {
	value: number;
}

const CUT_COMMON = /* glsl */ `#include <common>
uniform float uCut;
attribute vec2 cutRange;`;

/**
 * Walls are cut down for the overview and the plan by moving every vertex above the cut down to it, so a cut wall
 * keeps a real top face. A piece whose `cutRange` (lo, hi) does not hold the cut is dropped whole (a lintel above
 * the cut would otherwise squash into a sheet across its doorway); a piece shows while lo < cut ≤ hi.
 */
const CUT_PROJECT = /* glsl */ `vec4 mvPosition = modelMatrix * vec4( transformed, 1.0 );
mvPosition.y = min( mvPosition.y, uCut );
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
if ( cutRange.x >= uCut || uCut > cutRange.y ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );`;

/** Clay that follows a cut height. Every geometry drawn with it needs a `cutRange` attribute. */
function cutClay(value: ColorRepresentation, cut: CutUniform, extra: Parameters<typeof clay>[1] = {}) {
	const material = clay(value, extra);
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uCut = cut;
		shader.vertexShader = shader.vertexShader.replace('#include <common>', CUT_COMMON).replace('#include <project_vertex>', CUT_PROJECT);
	};
	material.customProgramCacheKey = () => 'dollhouse-cut';
	return material;
}

/** Fades a material to `fade` of `base` opacity. It leaves the opaque pass, and stops writing depth, only while faded. */
function fadeMaterial(material: MeshStandardMaterial, base: number, fade: number, glass: boolean) {
	const transparent = glass || fade < 0.999;
	if (material.transparent !== transparent) {
		material.transparent = transparent;
		// The opaque and blended versions of a material are different shader programs.
		material.needsUpdate = true;
	}
	material.opacity = base * fade;
	material.depthWrite = !transparent;
}

/** Axis-aligned boxes gathered into one geometry, with a color per vertex and the range of cut heights each shows in. */
class Boxes {
	private readonly positions: number[] = [];
	private readonly normals: number[] = [];
	private readonly colors: number[] = [];
	private readonly ranges: number[] = [];
	private readonly indices: number[] = [];

	get empty() {
		return this.indices.length === 0;
	}

	/** `top` colors the upper face. */
	add(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, side: Color, top: Color = side, range: [number, number] = ALWAYS) {
		if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return;
		const faces: [number[], number[]][] = [
			[[x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0]],
			[[x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0]],
			[[x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], [0, 1, 0]],
			[[x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, -1, 0]],
			[[x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1]],
			[[x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1]]
		];
		for (const [corners, normal] of faces) {
			const base = this.positions.length / 3;
			const tone = normal[1] > 0 ? top : side;
			this.positions.push(...corners);
			for (let i = 0; i < 4; i++) {
				this.normals.push(...normal);
				this.colors.push(tone.r, tone.g, tone.b);
				this.ranges.push(...range);
			}
			this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
	}

	build() {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
		geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
		geometry.setAttribute('cutRange', new Float32BufferAttribute(this.ranges, 2));
		geometry.setIndex(this.indices);
		geometry.computeBoundingSphere();
		return geometry;
	}
}

/** A box on a wall, from `u0`..`u1` along it and `n0`..`n1` across it, into world-space `boxes`. */
function addOnWall(boxes: Boxes, run: WallRun, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, side: Color, top: Color = side, range: [number, number] = ALWAYS) {
	const { x0, x1, z0, z1 } = wallBox(run, u0, u1, n0, n1);
	boxes.add(x0, x1, y0, y1, z0, z1, side, top, range);
}

/**
 * A sash or sliding panel: a frame of four bars round a pane, in whatever space `put` draws into. Bars are a little
 * wider on a door panel.
 */
function sash(rect: Span, n0: number, n1: number, bar: number, put: (boxes: 'frame' | 'glass', u0: number, u1: number, y0: number, y1: number, n0: number, n1: number) => void) {
	const b = Math.min(bar, (rect.u1 - rect.u0) / 4, (rect.y1 - rect.y0) / 4);
	put('frame', rect.u0, rect.u0 + b, rect.y0, rect.y1, n0, n1);
	put('frame', rect.u1 - b, rect.u1, rect.y0, rect.y1, n0, n1);
	put('frame', rect.u0 + b, rect.u1 - b, rect.y0, rect.y0 + b, n0, n1);
	put('frame', rect.u0 + b, rect.u1 - b, rect.y1 - b, rect.y1, n0, n1);
	// The pane runs a little into the bars, so no seam of light shows round it.
	const mid = (n0 + n1) / 2;
	put('glass', rect.u0 + b * 0.6, rect.u1 - b * 0.6, rect.y0 + b * 0.6, rect.y1 - b * 0.6, mid - 0.003, mid + 0.003);
}

/** One outside wall's look, or all the inside walls': the materials and everything drawn with them, to fade as one. */
interface WallView {
	exterior: boolean;
	wall: MeshStandardMaterial;
	frame: MeshStandardMaterial;
	glass: MeshStandardMaterial;
	meshes: Mesh[];
	glassMeshes: Mesh[];
	/** For an outside wall: its outward normal and middle, for deciding whether it stands in the way. */
	outward: Vector3;
	middle: Vector3;
	fade: number;
	goal: number;
}

interface Corner {
	material: MeshStandardMaterial;
	mesh: Mesh;
	walls: [WallView, WallView];
	fade: number;
}

/** A sash, panel or leaf that moves, and the opening it belongs to. */
interface MovingPart {
	/** Its index in `openingPanels()`. */
	index: number;
	holder: Group;
	meshes: Mesh[];
	/** The lowest point it reaches as posed, so a cut below it hides it whole. */
	bottom: number;
	cut: CutUniform;
}

interface OpeningView {
	spec: OpeningSpec;
	run: WallRun;
	swing: 1 | -1;
	parts: MovingPart[];
}

/** A 64 × 64 soft rectangle: opaque in the middle third, falling smoothly to clear at the edges, for nine-slice shadows. */
function softRectTexture() {
	const size = 64;
	const data = new Uint8Array(size * size * 4);
	const ramp = (t: number) => {
		const s = Math.min(1, Math.max(0, Math.min(t, 1 - t) * 3));
		return s * s * (3 - 2 * s);
	};
	for (let j = 0; j < size; j++)
		for (let i = 0; i < size; i++) {
			const k = (i + j * size) * 4;
			data[k] = data[k + 1] = data[k + 2] = 255;
			data[k + 3] = Math.round(255 * ramp((i + 0.5) / size) * ramp((j + 0.5) / size));
		}
	const texture = new DataTexture(data, size, size);
	texture.magFilter = texture.minFilter = LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

/** Soft shadows on the floor, nine-slice quads in one geometry: full under the middle, fading out over `spread` past each edge. */
class Shadows {
	private readonly positions: number[] = [];
	private readonly uvs: number[] = [];
	private readonly colors: number[] = [];
	private readonly indices: number[] = [];

	get empty() {
		return this.indices.length === 0;
	}

	/** A shadow under the rectangle `x0`..`x1`, `z0`..`z1` at height `y`: full `inset` inside its edges, clear `spread` outside them. */
	add(x0: number, x1: number, z0: number, z1: number, y: number, inset: number, spread: number, strength: number) {
		const columns = this.stops(x0, x1, inset, spread);
		const rows = this.stops(z0, z1, inset, spread);
		const base = this.positions.length / 3;
		const steps = [0, 1 / 3, 2 / 3, 1];
		for (let j = 0; j < 4; j++)
			for (let i = 0; i < 4; i++) {
				this.positions.push(columns[i], y, rows[j]);
				this.uvs.push(steps[i], 1 - steps[j]);
				this.colors.push(1, 1, 1, strength);
			}
		for (let j = 0; j < 3; j++)
			for (let i = 0; i < 3; i++) {
				const a = base + i + j * 4;
				this.indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
			}
	}

	private stops(lo: number, hi: number, inset: number, spread: number) {
		const middle = (lo + hi) / 2;
		const inner = Math.min(inset, (hi - lo) / 2);
		return [lo - spread, Math.min(lo + inner, middle), Math.max(hi - inner, middle), hi + spread];
	}

	build() {
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
		geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 4));
		geometry.setIndex(this.indices);
		geometry.computeBoundingSphere();
		return geometry;
	}
}

const FURNITURE_TONES: [RegExp, number][] = [
	[/bed|mattress|crib/i, TINTS.mist],
	[/sofa|couch|armchair|chair|ottoman/i, TINTS.sage],
	[/table|desk|dresser|nightstand|counter|island|bench|tv|media/i, TINTS.sand],
	[/wardrobe|closet|shelf|shelves|bookcase|cabinet|fridge|refrigerator|pantry/i, TINTS.peach],
	[/bath|tub|shower|toilet|sink|vanity|washer|dryer/i, TINTS.lilac],
	[/stove|oven|range|cooktop|dishwasher/i, TINTS.butter]
];
const FURNITURE_FALLBACK = [TINTS.sage, TINTS.sand, TINTS.mist, TINTS.peach, TINTS.lilac, TINTS.butter];

function furnitureTone(item: { id: string; name: string }) {
	const label = `${item.name} ${item.id}`;
	const known = FURNITURE_TONES.find(([pattern]) => pattern.test(label));
	if (known) return shade(known[1], 0.86);
	let hash = 0;
	for (const char of item.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return shade(FURNITURE_FALLBACK[hash % FURNITURE_FALLBACK.length], 0.86);
}

/** Where a room's label goes: its area-weighted middle if that falls inside it, otherwise the middle of its largest rectangle. */
function roomMiddle(room: Room): [number, number] {
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
 * A home as a dollhouse: the roof off, every room's floor tinted, walls with real holes where the doors and windows
 * are, and the furniture. Everything is in the solver's coordinates (metres; x east, y up, z south; the origin at the
 * footprint's north-west floor corner), so the scene and the solver agree with no conversion.
 *
 * Outside walls are 0.2 m thick and built outside the footprint, inside walls 0.1 m centred on their line, both floor
 * to ceiling. Each opening is its clear frame exactly; its jambs and head sit around it. Sashes, panels and leaves
 * move so the part left open is the solver's open region at the same amount (see `openingPanels`).
 *
 * Once a frame, `update` fades an outside wall that stands between the camera and the rooms, and cuts the inside
 * walls down to 1.1 m when the camera looks down from high enough, so every room shows. The top-down view cuts every
 * wall to a low outline with its openings as gaps.
 */
export class Dollhouse {
	readonly group = new Group();
	readonly roomAnchors: { id: string; name: string; position: Vector3 }[];
	/** The floor, and the furniture while it is shown. A raycaster ignores `visible`, so hidden things leave this list. */
	readonly pickables: Object3D[] = [];

	private readonly exteriorCut: CutUniform;
	private readonly interiorCut: CutUniform;
	private readonly clearCut: number;
	private readonly walls: WallView[] = [];
	private readonly outside: WallView[] = [];
	private readonly corners: Corner[] = [];
	private readonly openings: OpeningView[] = [];
	private readonly parts: MovingPart[] = [];
	private readonly floor: Mesh;
	private readonly furniture: Mesh | null = null;
	private readonly furnitureShadows: Mesh | null = null;
	private readonly shadowTexture: DataTexture;
	private topDown = false;
	private cutaway = false;
	private readonly eye = new Vector3();
	private readonly look = new Vector3();
	private readonly toEye = new Vector3();

	constructor(
		private readonly plan: HomePlan,
		options: { furniture: boolean; tint: number }
	) {
		const { ceiling } = plan;
		this.clearCut = ceiling + 0.01;
		this.exteriorCut = { value: this.clearCut };
		this.interiorCut = { value: this.clearCut };
		this.shadowTexture = softRectTexture();

		const wall = color(COLORS.wall);
		const cap = color(COLORS.cap);
		const runs = wallRuns(plan);
		const indoor = { wall: cutClay(0xffffff, this.interiorCut, { vertexColors: true }), frame: cutClay(0xffffff, this.interiorCut, { vertexColors: true }), glass: this.glass(this.interiorCut) };
		const indoorBoxes = { wall: new Boxes(), frame: new Boxes(), glass: new Boxes() };
		const indoorView = this.view(null, indoor);

		for (const run of runs) {
			const exterior = run.out !== 0;
			const materials = exterior ? { wall: cutClay(0xffffff, this.exteriorCut, { vertexColors: true }), frame: cutClay(0xffffff, this.exteriorCut, { vertexColors: true }), glass: this.glass(this.exteriorCut) } : indoor;
			const boxes = exterior ? { wall: new Boxes(), frame: new Boxes(), glass: new Boxes() } : indoorBoxes;
			const view = exterior ? this.view(run, materials) : indoorView;
			const cut = exterior ? this.exteriorCut : this.interiorCut;
			const t = run.thickness / 2;

			// The wall itself, less a hole for every frame.
			const layouts = frameLayouts(run, ceiling);
			for (const piece of wallPieces(run.from, run.to, ceiling, layouts.map((l) => l.hole))) {
				// A piece under a window shows until the plan cut, so the window is a gap in the plan.
				const range: [number, number] = [piece.under ? PLAN_WALL + 0.005 : piece.y0, 1e4];
				addOnWall(boxes.wall, run, piece.u0, piece.u1, piece.y0, piece.y1, -t, t, wall, cap, range);
			}

			// A run-local frame for the parts that move: x along the wall (u), y up, z across it (n).
			const local = new Group();
			if (run.axis === 'x') local.position.set(0, 0, run.at);
			else {
				local.position.set(run.at, 0, 0);
				local.rotation.y = -Math.PI / 2;
			}
			this.group.add(local);

			for (const { spec, frame, hole, members } of layouts) {
				const pale = color(COLORS.frame);
				for (const m of members) addOnWall(boxes.frame, run, m.u0, m.u1, m.y0, m.y1, -t - LIP, t + LIP, pale, pale, [m.y0, 1e4]);
				if (exterior && hole.y0 > 0.02) {
					// A little sill outside, under the frame.
					const out = run.out * t;
					addOnWall(boxes.frame, run, hole.u0 - 0.025, hole.u1 + 0.025, hole.y0 - 0.03, hole.y0, Math.min(out, out + run.out * 0.05), Math.max(out, out + run.out * 0.05), pale, pale, [hole.y0 - 0.03, 1e4]);
				}
				if (spec.kind === 'double-hung' || spec.kind === 'casement') {
					// In the plan a window is a thin line in its gap; it only shows once the walls are cut that low.
					addOnWall(boxes.frame, run, frame.u0, frame.u1, 0, 0.11, -0.012, 0.012, pale, pale, [-1, PLAN_WALL + 0.005]);
				}

				const swing = spec.kind === 'door' ? doorSwing(plan, run, spec) : 1;
				const opening: OpeningView = { spec, run, swing, parts: [] };
				openingPanels(spec, spec.open ?? 0, run, swing).forEach((panel, index) => {
					if (!panel.moving) {
						const put = (target: 'frame' | 'glass', u0: number, u1: number, y0: number, y1: number, n0: number, n1: number) =>
							addOnWall(boxes[target], run, u0, u1, y0, y1, n0, n1, pale, pale, [panel.rect.y0, 1e4]);
						sash(panel.rect, panel.n0, panel.n1, spec.kind === 'sliding-door' ? 0.06 : 0.045, put);
						return;
					}
					const part = this.movingPart(panel, index, materials, cut, spec.kind === 'sliding-door' ? 0.06 : 0.045);
					local.add(part.holder);
					opening.parts.push(part);
					this.parts.push(part);
					view.meshes.push(...part.meshes.filter((mesh) => mesh.material !== materials.glass));
					view.glassMeshes.push(...part.meshes.filter((mesh) => mesh.material === materials.glass));
				});
				this.openings.push(opening);
			}

			if (exterior) this.finish(view, boxes);
		}
		this.finish(indoorView, indoorBoxes);

		// Corner posts, each shown while either of its walls is.
		const t = EXTERIOR_WALL;
		const [north, east, south, west] = this.outside;
		const posts: [number, number, WallView, WallView][] = [
			[-t, -t, north, west],
			[plan.width, -t, north, east],
			[plan.width, plan.depth, south, east],
			[-t, plan.depth, south, west]
		];
		for (const [x, z, a, b] of posts) {
			const boxes = new Boxes();
			boxes.add(x, x + t, 0, ceiling, z, z + t, wall, cap);
			const material = cutClay(0xffffff, this.exteriorCut, { vertexColors: true });
			const mesh = new Mesh(boxes.build(), material);
			this.group.add(mesh);
			this.corners.push({ material, mesh, walls: [a, b], fade: 1 });
		}

		this.floor = this.buildFloor(options.tint);
		this.pickables.push(this.floor);
		if (plan.furniture.length) {
			this.furniture = this.buildFurniture();
			this.furnitureShadows = this.buildFurnitureShadows(options.tint);
		}
		this.setFurniture(options.furniture);

		this.roomAnchors = plan.rooms.map((room) => {
			const [x, z] = roomMiddle(room);
			return { id: room.id, name: room.name, position: new Vector3(x, 1.6, z) };
		});
		this.setOpenings({});
	}

	private glass(cut: CutUniform) {
		return cutClay(COLORS.glass, cut, { transparent: true, opacity: GLASS_OPACITY, depthWrite: false, roughness: 0.6 });
	}

	/** An outside wall's view, or (with no run) the one all the inside walls share. */
	private view(run: WallRun | null, materials: { wall: MeshStandardMaterial; frame: MeshStandardMaterial; glass: MeshStandardMaterial }): WallView {
		const outward = new Vector3();
		const middle = new Vector3();
		if (run) {
			const along = (run.from + run.to) / 2;
			// n is world +z on an east-west wall and world -x on a north-south one.
			if (run.axis === 'x') {
				outward.set(0, 0, run.out);
				middle.set(along, this.plan.ceiling / 2, run.at);
			} else {
				outward.set(-run.out, 0, 0);
				middle.set(run.at, this.plan.ceiling / 2, along);
			}
		}
		return { exterior: run !== null, ...materials, meshes: [], glassMeshes: [], outward, middle, fade: 1, goal: 1 };
	}

	/** Turns a wall's gathered boxes into meshes. */
	private finish(view: WallView, boxes: { wall: Boxes; frame: Boxes; glass: Boxes }) {
		for (const [key, material] of [
			['wall', view.wall],
			['frame', view.frame],
			['glass', view.glass]
		] as const) {
			if (boxes[key].empty) continue;
			const mesh = new Mesh(boxes[key].build(), material);
			this.group.add(mesh);
			(key === 'glass' ? view.glassMeshes : view.meshes).push(mesh);
		}
		for (const mesh of view.glassMeshes) mesh.renderOrder = -1;
		if (view.exterior) this.outside.push(view);
	}

	/**
	 * A sash, panel or leaf that moves, built in its wall's local frame round the point it moves about: the frame's
	 * origin for a slide, the hinge line for a swing.
	 */
	private movingPart(panel: Panel, index: number, materials: { frame: MeshStandardMaterial; glass: MeshStandardMaterial }, cut: CutUniform, bar: number): MovingPart {
		const holder = new Group();
		const frame = new Boxes();
		const glass = new Boxes();
		const pale = color(COLORS.frame);
		const { rect, motion } = panel;
		// Offsets from the holder's origin, in the wall's (u, y, n).
		let [du, dy, dn] = [0, 0, 0];
		if (motion.type === 'swing') {
			[du, dy, dn] = motion.hinge === 'vertical' ? [motion.at, rect.y0, motion.n] : [rect.u0, motion.at, motion.n];
			holder.position.set(du, dy, dn);
		}
		const put = (target: 'frame' | 'glass', u0: number, u1: number, y0: number, y1: number, n0: number, n1: number) =>
			(target === 'frame' ? frame : glass).add(u0 - du, u1 - du, y0 - dy, y1 - dy, n0 - dn, n1 - dn, pale);
		if (panel.glazed) sash(rect, panel.n0, panel.n1, bar, put);
		else frame.add(rect.u0 - du, rect.u1 - du, rect.y0 - dy, rect.y1 - dy, panel.n0 - dn, panel.n1 - dn, color(COLORS.leaf));
		const meshes: Mesh[] = [];
		if (!frame.empty) meshes.push(new Mesh(frame.build(), materials.frame));
		if (!glass.empty) meshes.push(new Mesh(glass.build(), materials.glass));
		for (const mesh of meshes) {
			if (mesh.material === materials.glass) mesh.renderOrder = -1;
			holder.add(mesh);
		}
		return { index, holder, meshes, bottom: rect.y0, cut };
	}

	private buildFloor(tint: number) {
		const { plan } = this;
		const t = EXTERIOR_WALL;
		const rooms = new Boxes();
		plan.rooms.forEach((room, n) => {
			const tone = color(ROOM_TINTS[n % ROOM_TINTS.length]);
			for (const r of room.rects) rooms.add(r.x, r.x + r.w, -FLOOR, 0, r.z, r.z + r.d, tone);
		});
		const floor = new Mesh(rooms.build(), clay(0xffffff, { vertexColors: true }));
		this.group.add(floor);

		// Under the outside walls: it shows as the threshold of an outside door.
		const sill = new Boxes();
		const under = color(COLORS.threshold);
		sill.add(-t, plan.width + t, -FLOOR, 0, -t, 0, under);
		sill.add(-t, plan.width + t, -FLOOR, 0, plan.depth, plan.depth + t, under);
		sill.add(-t, 0, -FLOOR, 0, 0, plan.depth, under);
		sill.add(plan.width, plan.width + t, -FLOOR, 0, 0, plan.depth, under);
		this.group.add(new Mesh(sill.build(), clay(0xffffff, { vertexColors: true })));

		const pad = t + LEDGE;
		const width = plan.width + 2 * pad;
		const depth = plan.depth + 2 * pad;
		const plinth = new Mesh(new RoundedBoxGeometry(width, -FLOOR - PLINTH_BOTTOM, depth, 3, 0.05), clay(shade(tint, 0.94)));
		plinth.position.set(plan.width / 2, (PLINTH_BOTTOM - FLOOR) / 2, plan.depth / 2);
		this.group.add(plinth);

		const ground = new Shadows();
		ground.add(-pad, plan.width + pad, -pad, plan.depth + pad, PLINTH_BOTTOM + 0.002, 0.2, 0.9, 1);
		const shadow = new Mesh(ground.build(), this.shadowMaterial(tint, 0.22));
		shadow.renderOrder = -2;
		this.group.add(shadow);
		return floor;
	}

	private shadowMaterial(tint: number, opacity: number) {
		return new MeshBasicMaterial({
			map: this.shadowTexture,
			color: shade(tint, 0.3),
			vertexColors: true,
			transparent: true,
			opacity,
			depthWrite: false,
			// Lifted toward the camera so it never fights the floor it lies on.
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -4
		});
	}

	private buildFurniture() {
		const pieces = this.plan.furniture.map((item) => {
			const radius = Math.min(0.045, item.w / 4, item.h / 4, item.d / 4);
			const geometry = new RoundedBoxGeometry(item.w, item.h, item.d, 2, radius);
			geometry.translate(item.x + item.w / 2, (item.y ?? 0) + item.h / 2, item.z + item.d / 2);
			const tone = furnitureTone(item);
			const count = geometry.getAttribute('position').count;
			const colors = new Float32Array(count * 3);
			for (let i = 0; i < count; i++) colors.set([tone.r, tone.g, tone.b], i * 3);
			geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
			return geometry;
		});
		const merged = mergeGeometries(pieces)!;
		for (const piece of pieces) piece.dispose();
		const mesh = new Mesh(merged, clay(0xffffff, { vertexColors: true }));
		this.group.add(mesh);
		return mesh;
	}

	private buildFurnitureShadows(tint: number) {
		const shadows = new Shadows();
		for (const item of this.plan.furniture) {
			// Something raised off the floor casts a fainter shadow.
			const lift = item.y ?? 0;
			const strength = Math.max(0, 1 - lift / 1.2);
			if (strength > 0.05) shadows.add(item.x, item.x + item.w, item.z, item.z + item.d, 0.003, 0.08, 0.16 + lift * 0.1, strength);
		}
		if (shadows.empty) return null;
		const mesh = new Mesh(shadows.build(), this.shadowMaterial(tint, 0.3));
		mesh.renderOrder = -1;
		this.group.add(mesh);
		return mesh;
	}

	/** Sets each opening to `amounts[id]` (0 to 1 of its travel), or its plan position if it is not listed. Moves its sashes, panels and leaves. */
	setOpenings(amounts: Record<string, number>) {
		for (const { spec, run, swing, parts } of this.openings) {
			if (!parts.length) continue;
			const panels = openingPanels(spec, amounts[spec.id] ?? spec.open ?? 0, run, swing);
			for (const part of parts) {
				const panel = panels[part.index];
				const { motion, rect } = panel;
				if (motion.type === 'slide') {
					part.holder.position.set(motion.along === 'u' ? motion.by : 0, motion.along === 'y' ? motion.by : 0, 0);
				} else if (motion.type === 'swing') {
					// Which side of its hinge the leaf lies on, and which way it turns to swing its free edge toward `toward`.
					if (motion.hinge === 'vertical') {
						const side = (rect.u0 + rect.u1) / 2 > motion.at ? 1 : -1;
						part.holder.rotation.set(0, -side * motion.toward * motion.angle, 0);
					} else {
						const side = (rect.y0 + rect.y1) / 2 > motion.at ? 1 : -1;
						part.holder.rotation.set(side * motion.toward * motion.angle, 0, 0);
					}
				}
				part.bottom = panelBottom(panel);
			}
		}
		this.showParts();
	}

	/** The plan view: walls cut to a low outline with the openings as gaps. The roof is already off. */
	setTopDown(on: boolean) {
		this.topDown = on;
	}

	setFurniture(on: boolean) {
		if (this.furniture) this.furniture.visible = on;
		if (this.furnitureShadows) this.furnitureShadows.visible = on;
		const listed = this.furniture ? this.pickables.indexOf(this.furniture) : -1;
		if (on && this.furniture && listed < 0) this.pickables.push(this.furniture);
		if (!on && listed >= 0) this.pickables.splice(listed, 1);
	}

	/**
	 * Once a frame: eases the outside walls toward faded or solid and the cut heights toward their goals. Returns true
	 * while anything is still easing. A `dt` of Infinity settles everything at once (reduced motion).
	 */
	update(camera: Camera, dt: number) {
		camera.getWorldPosition(this.eye);
		camera.getWorldDirection(this.look);
		const k = 1 - Math.exp(-EASE * dt);
		const elevation = Math.asin(Math.max(-1, Math.min(1, -this.look.y)));
		if (elevation > CUT_ON) this.cutaway = true;
		else if (elevation < CUT_OFF) this.cutaway = false;
		let easing = false;

		if (this.ease(this.interiorCut, this.topDown ? PLAN_WALL : this.cutaway ? CUTAWAY : this.clearCut, k)) easing = true;
		if (this.ease(this.exteriorCut, this.topDown ? PLAN_WALL : this.clearCut, k)) easing = true;

		for (const view of this.outside) {
			this.toEye.subVectors(this.eye, view.middle).normalize();
			const facing = view.outward.dot(this.toEye);
			if (this.topDown) view.goal = 1;
			else if (facing > FADE_ON) view.goal = FADED;
			else if (facing < FADE_OFF) view.goal = 1;
			if (view.fade === view.goal) continue;
			view.fade += (view.goal - view.fade) * k;
			if (Math.abs(view.goal - view.fade) < 0.004) view.fade = view.goal;
			else easing = true;
			this.applyFade(view);
		}
		for (const corner of this.corners) {
			const fade = Math.max(corner.walls[0].fade, corner.walls[1].fade);
			if (fade === corner.fade) continue;
			corner.fade = fade;
			fadeMaterial(corner.material, 1, fade, false);
			corner.mesh.renderOrder = fade < 0.999 ? FADED_ORDER : 0;
		}
		this.showParts();
		return easing;
	}

	/** Moves a cut height toward `goal`. Returns true while it is not there yet. */
	private ease(cut: CutUniform, goal: number, k: number) {
		if (cut.value === goal) return false;
		cut.value += (goal - cut.value) * k;
		if (Math.abs(goal - cut.value) >= 0.002) return true;
		cut.value = goal;
		return false;
	}

	private applyFade(view: WallView) {
		const faded = view.fade < 0.999;
		fadeMaterial(view.wall, 1, view.fade, false);
		fadeMaterial(view.frame, 1, view.fade, false);
		fadeMaterial(view.glass, GLASS_OPACITY, view.fade, true);
		for (const mesh of view.meshes) mesh.renderOrder = faded ? FADED_ORDER : 0;
		for (const mesh of view.glassMeshes) mesh.renderOrder = faded ? FADED_ORDER + 1 : -1;
	}

	/** Hides a moving part whole once the walls are cut below it. */
	private showParts() {
		for (const part of this.parts) {
			const shown = part.bottom < part.cut.value - 1e-4;
			for (const mesh of part.meshes) mesh.visible = shown;
		}
	}

	dispose() {
		this.group.removeFromParent();
		disposeTree(this.group);
		this.shadowTexture.dispose();
		this.pickables.length = 0;
	}
}

const HAIR = 0.0015;
/** Aspect ratio the framing's width assumes: a narrower Stage is framed by width with room to spare, a wider one by height. */
const ASPECT_REF = 1;

/**
 * The fit (world units at the target, as `OrbitRig` reads it) that frames `points` from this view with `margin` to
 * spare. The rig puts the camera `fit.height / 2 / tan(fov / 2)` from the target (or farther on a narrow Stage). A point
 * nearer the camera than the target looks bigger, so each point asks for the distance at which it just fits, and the
 * fit is the largest of those turned back into a size.
 */
function framing(points: [number, number, number][], yaw: number, pitch: number, fov: number, target: [number, number, number], margin: number) {
	const t = Math.tan((fov * Math.PI) / 360);
	const [cp, sp, cy, sy] = [Math.cos(pitch), Math.sin(pitch), Math.cos(yaw), Math.sin(yaw)];
	const back = [cp * sy, sp, cp * cy];
	const right = [cy, 0, -sy];
	const up = [-sp * sy, cp, -sp * cy];
	const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	let width = 0;
	let height = 0;
	for (const p of points) {
		const q = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
		const toward = dot(q, back);
		width = Math.max(width, 2 * (Math.abs(dot(q, right)) + t * ASPECT_REF * toward));
		height = Math.max(height, 2 * (Math.abs(dot(q, up)) + t * toward));
	}
	return { width: width * margin, height: height * margin };
}

/**
 * Camera framing for `OrbitRig`. The three-quarter view looks from the south-west, 38° down, at the middle of the plan
 * 0.8 m up; the top-down view looks straight down with north up. Either way the fit is worked out from the corners of
 * the whole house as this camera sees them, so any plan from a studio to a house fills the Stage at the start. Zooming
 * in stops before the camera can reach the house at the lowest pitch allowed, so it never ends up inside a wall.
 */
export function dollhouseRig(plan: HomePlan, topDown: boolean): RigSetup {
	const fov = 30;
	const target: [number, number, number] = [plan.width / 2, 0.8, plan.depth / 2];
	const pad = EXTERIOR_WALL + LEDGE;
	const top = topDown ? PLAN_WALL : plan.ceiling;
	const points: [number, number, number][] = [];
	for (const x of [-pad, plan.width + pad]) for (const y of [PLINTH_BOTTOM, top]) for (const z of [-pad, plan.depth + pad]) points.push([x, y, z]);
	const t = Math.tan((fov * Math.PI) / 360);
	if (topDown) {
		const pitch = Math.PI / 2 - HAIR;
		const fit = framing(points, 0, pitch, fov, target, 1.05);
		// The camera stays above anything that stands in the home.
		const nearest = plan.ceiling + 0.4 - target[1];
		return { yaw: 0, pitch, target, fov, fit, pitchRange: [1.2, pitch], zoomRange: [0.7, Math.max(1.2, Math.min(3, fit.height / 2 / t / nearest))] };
	}
	const yaw = (-30 * Math.PI) / 180;
	const pitch = (38 * Math.PI) / 180;
	const pitchRange: [number, number] = [0.3, 1.45];
	const fit = framing(points, yaw, pitch, fov, target, 1.06);
	// Closest the camera may come and stay outside the house at every yaw and allowed pitch: outside a cylinder round the
	// footprint, or above the walls.
	const reach = Math.hypot(plan.width / 2 + pad, plan.depth / 2 + pad) + 0.3;
	const above = plan.ceiling + 0.3 - target[1];
	const lowest = pitchRange[0];
	const crossing = Math.atan2(above, reach);
	const nearest = crossing > lowest ? Math.hypot(above, reach) : Math.min(above / Math.sin(lowest), reach / Math.cos(lowest));
	// The rig's distance is at its smallest on a wide Stage, where the height decides it.
	const zoomMax = Math.max(1.2, Math.min(3, fit.height / 2 / t / nearest));
	return { yaw, pitch, target, fov, fit, pitchRange, zoomRange: [0.6, zoomMax] };
}
