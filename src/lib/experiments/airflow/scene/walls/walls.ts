import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, type Material, type Object3D } from 'three';
import { roomAt } from '../../homes/rooms';
import type { HomePlan, OpeningSpec } from '../../homes/types';
import { CutBoxes, applyCut, uncutShadow, type CutData, type Face } from '../look/boxes';
import { WALL_COLORS, paintFor, type Materials } from '../look/materials';
import { EXTERIOR_WALL, doorSwing, frameLayouts, frameSpan, openingPanels, panelBottom, wallBox, wallPieces, wallPoint, wallRuns, type Panel, type Span, type WallRun } from '../wallPieces';
import type { WallLine } from './cutaway';

/**
 * Every wall's centre line in the plan, in the order of `wallRuns`, for the cutaway rule. A run's `out` is the side across it (in n)
 * that is outdoors, and n is the line's left seen from its start to its end for both axes, so it is the line's `outdoors` as it is.
 */
export function wallLines(runs: readonly WallRun[]): WallLine[] {
	return runs.map((run) =>
		run.axis === 'x' ? { ax: run.from, az: run.at, bx: run.to, bz: run.at, outdoors: run.out } : { ax: run.at, az: run.from, bx: run.at, bz: run.to, outdoors: run.out }
	);
}

/** Skirting boards: how high, and how far proud of the wall. */
const SKIRTING = { height: 0.09, depth: 0.014 };
/** The white board at the foot of the siding outside, and how far the siding stands off the wall. */
const BASE_TRIM = { height: 0.16, depth: 0.026 };
const SIDING = 0.012;
/** Frame members stand this far proud of the wall faces, so a frame reads apart from its wall. */
const LIP = 0.012;
/** Rate of the walls' rise and fall, per second (about a third of a second to settle). */
const EASE = 9;

/** A box in the plan, metres: x east, y up, z south. */
export interface WallBox {
	min: [number, number, number];
	max: [number, number, number];
}

/** A mesh that is cut down on the processor, and the height of its frame's origin above the floor. */
interface CutMesh {
	mesh: Mesh;
	data: CutData;
	lift: number;
}

/** A sash, panel or leaf that moves. */
interface PartView {
	/** Its index in `openingPanels()`. */
	index: number;
	holder: Group;
	meshes: CutMesh[];
	/** A part that turns about a horizontal hinge cannot be cut in its own frame, so it hides once the cut is below its top. */
	hides: boolean;
	top: number;
}

interface OpeningView {
	spec: OpeningSpec;
	run: WallRun;
	swing: 1 | -1;
	parts: PartView[];
}

interface RunView {
	run: WallRun;
	meshes: CutMesh[];
	parts: PartView[];
	height: number;
	goal: number;
	applied: number;
}

/** The faces of a box on a wall that point along +n and -n: world +z and -z on an east-west wall, -x and +x on a north-south one. */
const sideFaces = (run: WallRun): { plus: Face; minus: Face } => (run.axis === 'x' ? { plus: 'pz', minus: 'nz' } : { plus: 'nx', minus: 'px' });

/**
 * The walls of a Home, as The Sims draws them: painted plaster inside, each Room's walls in its own colour, white skirting at the
 * floor, lap siding outside over a white base board, white frames with sills, glazed sashes and panels, and doors with panels and
 * brass handles that swing on their hinges. Each wall stands at a height of its own (the cutaway's), eased up and down: the walls
 * are cut by moving their vertices, so a cut wall has a real top face (the darker cap colour), its shadow is the cut wall's
 * shadow, and nothing needs a special shader. Positions are the solver's (x east, y up, z south, metres).
 */
export class WallsView {
	readonly group = new Group();
	readonly runs: readonly WallRun[];
	readonly lines: WallLine[];
	/**
	 * One invisible box over each Opening's frame, its `userData.opening` the Opening's id: something to point at to choose a door
	 * or a window. A raycaster finds hidden meshes too.
	 */
	readonly openingTargets: Object3D[] = [];
	private readonly views: RunView[] = [];
	/** The solid parts of the walls (each less its frames' holes), full height, with the index of the wall each belongs to. */
	private readonly solids: (WallBox & { wall: number })[] = [];
	/** Each Opening's wall, by index, and the top of its frame, m. */
	private readonly openingWalls = new Map<string, { wall: number; top: number }>();
	private readonly posts: { meshes: CutMesh[]; walls: [number, number]; applied: number }[] = [];
	private readonly openings: OpeningView[] = [];
	private readonly targetMaterial = new MeshBasicMaterial({ visible: false });
	/** Every cut mesh casts the sun's shadow as it was built, so a wall the cutaway drops still shades its room (`uncutShadow`). */
	private readonly shadow = uncutShadow();
	/** Something that casts a shadow moved (a door swung, a sash slid) since the scene last asked: the shadow map is stale. */
	shadowsChanged = true;
	/** The standing boxes as of the walls' heights now, or null once a height has moved (`standingBoxes`). */
	private standing: WallBox[] | null = null;

	constructor(
		private readonly plan: HomePlan,
		private readonly materials: Materials
	) {
		this.runs = wallRuns(plan);
		this.lines = wallLines(this.runs);
		for (const run of this.runs) this.views.push(this.buildRun(run, this.views.length));
		this.buildPosts();
	}

	/** The paint of the Room on one side of a wall at `u` along it, or the outside's colour. */
	private paintAt(run: WallRun, u: number, side: 1 | -1): { color: Color; outside: boolean } {
		const [x, z] = wallPoint(run, u, side * (run.thickness / 2 + 0.05));
		const room = roomAt(this.plan, x, z);
		if (!room) return { color: WALL_COLORS.outside, outside: true };
		return { color: paintFor(room), outside: false };
	}

	private buildRun(run: WallRun, index: number): RunView {
		const { ceiling } = this.plan;
		const { materials } = this;
		const t = run.thickness / 2;
		const faces = sideFaces(run);
		const wall = new CutBoxes(materials.metres('plaster'));
		const trim = new CutBoxes(1);
		const glass = new CutBoxes(1);
		const siding = new CutBoxes(materials.metres('siding'));
		const box = (target: CutBoxes, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, options: Parameters<CutBoxes['add']>[6] = {}) => {
			const { x0, x1, z0, z1 } = wallBox(run, u0, u1, n0, n1);
			target.add(x0, x1, y0, y1, z0, z1, options);
		};

		// The wall less a hole for every frame, each face in the paint of the Room it faces, the top in the cap colour.
		const layouts = frameLayouts(run, ceiling);
		for (const piece of wallPieces(run.from, run.to, ceiling, layouts.map((l) => l.hole))) {
			const solid = wallBox(run, piece.u0, piece.u1, -t, t);
			this.solids.push({ wall: index, min: [solid.x0, piece.y0, solid.z0], max: [solid.x1, piece.y1, solid.z1] });
			const mid = (piece.u0 + piece.u1) / 2;
			const plus = this.paintAt(run, mid, 1);
			const minus = this.paintAt(run, mid, -1);
			const end = plus.outside ? minus.color : plus.color;
			const along: Face[] = run.axis === 'x' ? ['px', 'nx'] : ['pz', 'nz'];
			box(wall, piece.u0, piece.u1, piece.y0, piece.y1, -t, t, {
				colors: { [faces.plus]: plus.color, [faces.minus]: minus.color, [along[0]]: end, [along[1]]: end, py: WALL_COLORS.cap, ny: WALL_COLORS.cap }
			});
			for (const [side, paint] of [
				[1, plus],
				[-1, minus]
			] as const) {
				const [n0, n1] = side > 0 ? [t, t] : [-t, -t];
				if (paint.outside) {
					// Siding over the outside face, with a white board at its foot.
					box(siding, piece.u0, piece.u1, Math.max(piece.y0, BASE_TRIM.height), piece.y1, side > 0 ? n0 : n0 - SIDING, side > 0 ? n1 + SIDING : n1, { colors: WALL_COLORS.outside, bottom: piece.y0 });
					if (piece.y0 < 1e-6) box(trim, piece.u0, piece.u1, 0, BASE_TRIM.height, side > 0 ? n0 : n0 - BASE_TRIM.depth, side > 0 ? n1 + BASE_TRIM.depth : n1, { colors: WALL_COLORS.trim });
				} else if (piece.y0 < 1e-6) box(trim, piece.u0, piece.u1, 0, SKIRTING.height, side > 0 ? n0 : n0 - SKIRTING.depth, side > 0 ? n1 + SKIRTING.depth : n1, { colors: WALL_COLORS.trim });
			}
		}

		// A run-local frame for the parts that move: x along the wall (u), y up, z across it (n).
		const local = new Group();
		if (run.axis === 'x') local.position.set(0, 0, run.at);
		else {
			local.position.set(run.at, 0, 0);
			local.rotation.y = -Math.PI / 2;
		}
		this.group.add(local);

		const view: RunView = { run, meshes: [], parts: [], height: ceiling, goal: ceiling, applied: ceiling };
		for (const { spec, frame, hole, members } of layouts) {
			this.openingWalls.set(spec.id, { wall: index, top: spec.sill + spec.height });
			const door = spec.kind === 'door' || spec.kind === 'sliding-door';
			for (const m of members) box(trim, m.u0, m.u1, m.y0, m.y1, -t - LIP, t + LIP, { colors: WALL_COLORS.trim });
			if (!door && hole.y0 > 0.02) {
				// A sill outside (or on the far side of an inside window) and a narrow stool inside.
				const out = run.out === 0 ? 1 : run.out;
				const outer: [number, number] = out > 0 ? [t, t + 0.06] : [-t - 0.06, -t];
				const inner: [number, number] = out > 0 ? [-t - 0.035, -t] : [t, t + 0.035];
				box(trim, hole.u0 - 0.04, hole.u1 + 0.04, hole.y0 - 0.035, hole.y0, outer[0], outer[1], { colors: WALL_COLORS.trim });
				box(trim, hole.u0 - 0.02, hole.u1 + 0.02, hole.y0 - 0.025, hole.y0, inner[0], inner[1], { colors: WALL_COLORS.trim });
			}
			const swing = spec.kind === 'door' ? doorSwing(this.plan, run, spec) : 1;
			const opening: OpeningView = { spec, run, swing, parts: [] };
			openingPanels(spec, spec.open ?? 0, run, swing).forEach((panel, index) => {
				const bar = spec.kind === 'sliding-door' ? 0.06 : 0.05;
				if (!panel.moving) {
					sash(panel.rect, panel.n0, panel.n1, bar, (target, u0, u1, y0, y1, n0, n1) => box(target === 'frame' ? trim : glass, u0, u1, y0, y1, n0, n1, { colors: WALL_COLORS.trim, bottom: panel.rect.y0 }));
					return;
				}
				const part = this.movingPart(spec, panel, index, run);
				local.add(part.holder);
				opening.parts.push(part);
				view.parts.push(part);
			});
			this.openings.push(opening);
			this.addTarget(run, spec, frame);
		}

		for (const [boxes, material] of [
			[wall, materials.plaster],
			[trim, materials.trim],
			[glass, materials.glass],
			[siding, materials.siding]
		] as const) {
			if (boxes.empty) continue;
			const { geometry, cut } = boxes.build();
			const mesh = new Mesh(geometry, material);
			mesh.castShadow = material !== materials.glass;
			mesh.receiveShadow = true;
			if (mesh.castShadow) mesh.customDepthMaterial = this.shadow;
			if (material === materials.glass) mesh.renderOrder = 2;
			this.group.add(mesh);
			view.meshes.push({ mesh, data: cut, lift: 0 });
		}
		return view;
	}

	/** An invisible box over an Opening's frame, to point at. */
	private addTarget(run: WallRun, spec: OpeningSpec, frame: Span) {
		const t = run.thickness / 2 + 0.06;
		const { x0, x1, z0, z1 } = wallBox(run, frame.u0, frame.u1, -t, t);
		const target = new Mesh(new BoxGeometry(x1 - x0, frame.y1 - frame.y0, z1 - z0), this.targetMaterial);
		target.position.set((x0 + x1) / 2, (frame.y0 + frame.y1) / 2, (z0 + z1) / 2);
		target.userData.opening = spec.id;
		target.visible = false;
		this.group.add(target);
		this.openingTargets.push(target);
	}

	/**
	 * A sash, panel or leaf that moves, built in its wall's local frame round the point it moves about: the frame's origin for a
	 * slide, the hinge line for a swing. A door is a leaf with two raised panels on each face and a brass handle each side.
	 */
	private movingPart(spec: OpeningSpec, panel: Panel, index: number, run: WallRun): PartView {
		const { materials } = this;
		const holder = new Group();
		const frame = new CutBoxes(1);
		const glass = new CutBoxes(1);
		const leaf = new CutBoxes(1);
		const handles = new CutBoxes(1);
		const { rect, motion } = panel;
		let [du, dy, dn] = [0, 0, 0];
		if (motion.type === 'swing') {
			[du, dy, dn] = motion.hinge === 'vertical' ? [motion.at, rect.y0, motion.n] : [rect.u0, motion.at, motion.n];
			holder.position.set(du, dy, dn);
		}
		const put = (target: CutBoxes, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, colors: Color = WALL_COLORS.trim) =>
			target.add(u0 - du, u1 - du, y0 - dy, y1 - dy, n0 - dn, n1 - dn, { colors, bottom: rect.y0 - dy });
		if (panel.glazed) sash(rect, panel.n0, panel.n1, spec.kind === 'sliding-door' ? 0.06 : 0.05, (target, u0, u1, y0, y1, n0, n1) => put(target === 'frame' ? frame : glass, u0, u1, y0, y1, n0, n1));
		else {
			const front = isExterior(run) ;
			const color = front ? WALL_COLORS.frontDoor : WALL_COLORS.door;
			put(leaf, rect.u0, rect.u1, rect.y0, rect.y1, panel.n0, panel.n1, color);
			// Two raised panels on each face, an upper and a lower, in the leaf's colour (the light picks them out).
			const width = rect.u1 - rect.u0;
			const margin = Math.min(0.12, width * 0.16);
			const lower: [number, number] = [rect.y0 + 0.14, rect.y0 + (rect.y1 - rect.y0) * 0.44];
			const upper: [number, number] = [rect.y0 + (rect.y1 - rect.y0) * 0.5, rect.y1 - 0.14];
			for (const [y0, y1] of [lower, upper]) {
				put(leaf, rect.u0 + margin, rect.u1 - margin, y0, y1, panel.n1, panel.n1 + 0.008, color);
				put(leaf, rect.u0 + margin, rect.u1 - margin, y0, y1, panel.n0 - 0.008, panel.n0, color);
			}
			// The handle sits near the free edge, the side away from the hinge.
			if (motion.type === 'swing' && motion.hinge === 'vertical') {
				const free = Math.abs(rect.u0 - motion.at) > Math.abs(rect.u1 - motion.at) ? rect.u0 + 0.07 : rect.u1 - 0.07;
				for (const [n0, n1] of [
					[panel.n1, panel.n1 + 0.055],
					[panel.n0 - 0.055, panel.n0]
				])
					put(handles, free - 0.06, free + 0.06, rect.y0 + 0.98, rect.y0 + 1.02, n0, n1, new Color(1, 1, 1));
			}
		}
		const meshes: CutMesh[] = [];
		const lift = motion.type === 'swing' ? dy : 0;
		for (const [boxes, material] of [
			[frame, materials.trim],
			[glass, materials.glass],
			[leaf, materials.trim],
			[handles, materials.brass]
		] as const) {
			if (boxes.empty) continue;
			const { geometry, cut } = boxes.build();
			const mesh = new Mesh(geometry, material as Material);
			mesh.castShadow = material !== materials.glass;
			mesh.receiveShadow = true;
			if (mesh.castShadow) mesh.customDepthMaterial = this.shadow;
			if (material === materials.glass) mesh.renderOrder = 2;
			mesh.userData.opening = spec.id;
			holder.add(mesh);
			meshes.push({ mesh, data: cut, lift });
		}
		const hides = motion.type === 'swing' && motion.hinge === 'horizontal';
		return { index, holder, meshes, hides, top: rect.y1 };
	}

	/** The outside corners: a white corner board the height of the taller of its two walls. */
	private buildPosts() {
		const { plan, materials } = this;
		const t = EXTERIOR_WALL;
		const index = (id: string) => this.runs.findIndex((run) => run.id === id);
		const corners: [number, number, string, string][] = [
			[-t, -t, 'north', 'west'],
			[plan.width, -t, 'north', 'east'],
			[plan.width, plan.depth, 'south', 'east'],
			[-t, plan.depth, 'south', 'west']
		];
		for (const [x, z, a, b] of corners) {
			const boxes = new CutBoxes(1);
			const proud = BASE_TRIM.depth;
			boxes.add(x - (x < 0 ? proud : 0), x + t + (x < 0 ? 0 : proud), 0, plan.ceiling, z - (z < 0 ? proud : 0), z + t + (z < 0 ? 0 : proud), { colors: { all: WALL_COLORS.trim, py: WALL_COLORS.cap } });
			const { geometry, cut } = boxes.build();
			const mesh = new Mesh(geometry, materials.trim);
			mesh.castShadow = mesh.receiveShadow = true;
			mesh.customDepthMaterial = this.shadow;
			this.group.add(mesh);
			this.posts.push({ meshes: [{ mesh, data: cut, lift: 0 }], walls: [index(a), index(b)], applied: plan.ceiling });
		}
	}

	/** Sets each Opening to `amounts[id]` (0 to 1 of its travel), or its plan position if it is not listed: moves its sashes, panels and leaves. */
	setOpenings(amounts: Record<string, number>) {
		for (const { spec, run, swing, parts } of this.openings) {
			if (!parts.length) continue;
			const panels = openingPanels(spec, amounts[spec.id] ?? spec.open ?? 0, run, swing);
			for (const part of parts) {
				const panel = panels[part.index];
				const { motion, rect } = panel;
				if (motion.type === 'slide') part.holder.position.set(motion.along === 'u' ? motion.by : 0, motion.along === 'y' ? motion.by : 0, 0);
				else if (motion.type === 'swing') {
					if (motion.hinge === 'vertical') {
						const side = (rect.u0 + rect.u1) / 2 > motion.at ? 1 : -1;
						part.holder.rotation.set(0, -side * motion.toward * motion.angle, 0);
					} else {
						const side = (rect.y0 + rect.y1) / 2 > motion.at ? 1 : -1;
						part.holder.rotation.set(side * motion.toward * motion.angle, 0, 0);
					}
				}
				part.top = Math.max(rect.y1, panelBottom(panel) + (rect.y1 - rect.y0));
				// A sash that slides up or down moves its own frame's origin, so its cut changes with it.
				if (motion.type === 'slide') for (const mesh of part.meshes) mesh.lift = part.holder.position.y;
			}
		}
		// Every moving part is cut again at its wall's height.
		for (const view of this.views) this.cutParts(view, view.height);
		this.shadowsChanged = true;
	}

	/** The height each wall should stand at, m, in the order of `runs`. */
	setGoals(heights: readonly number[]) {
		heights.forEach((height, n) => {
			if (this.views[n]) this.views[n].goal = height;
		});
	}

	/** The height each wall stands at now, m. */
	get heights(): number[] {
		return this.views.map((view) => view.height);
	}

	/**
	 * The walls as they stand now, for picking: each solid part of a wall (its doors and windows are holes) as a box as high as its wall
	 * stands, so a ray stops at a full-height wall and passes over one that is cut away. The scene asks every frame (the compass letters,
	 * the strips on cut walls' caps), so the boxes are kept until a wall's height moves.
	 */
	standingBoxes(): readonly WallBox[] {
		if (this.standing) return this.standing;
		const boxes: WallBox[] = [];
		for (const solid of this.solids) {
			const top = Math.min(solid.max[1], this.views[solid.wall]?.height ?? solid.max[1]);
			if (top <= solid.min[1] + 1e-3) continue;
			boxes.push({ min: solid.min, max: [solid.max[0], top, solid.max[2]] });
		}
		this.standing = boxes;
		return boxes;
	}

	/**
	 * How high an Opening's wall stands now, m, when that is lower than the top of its frame (cut away, or down), so the Opening is not
	 * whole and is chosen by what is left of it (`selection.ts`); null while its wall stands whole.
	 */
	openingCut(id: string): number | null {
		const found = this.openingWalls.get(id);
		const height = found ? this.views[found.wall]?.height : undefined;
		return found && height !== undefined && height < found.top - 0.01 ? height : null;
	}

	/** Once a frame: eases every wall toward its height (all at once when `instant`). Returns true while any is still moving. */
	update(dt: number, instant: boolean): boolean {
		const k = instant ? 1 : 1 - Math.exp(-EASE * dt);
		let easing = false;
		for (const view of this.views) {
			if (view.height !== view.goal) {
				view.height += (view.goal - view.height) * k;
				if (Math.abs(view.goal - view.height) < 0.002) view.height = view.goal;
				else easing = true;
				this.standing = null;
			}
			if (Math.abs(view.height - view.applied) > 0.0005 || (view.height === view.goal && view.applied !== view.goal)) {
				view.applied = view.height;
				for (const mesh of view.meshes) applyCut(mesh.mesh.geometry, mesh.data, view.height, mesh.lift);
				this.cutParts(view, view.height);
			}
		}
		for (const post of this.posts) {
			const height = Math.max(...post.walls.map((n) => this.views[n]?.height ?? this.plan.ceiling));
			if (height === post.applied) continue;
			post.applied = height;
			for (const mesh of post.meshes) applyCut(mesh.mesh.geometry, mesh.data, height, mesh.lift);
		}
		return easing;
	}

	private cutParts(view: RunView, height: number) {
		for (const part of view.parts) {
			if (part.hides) {
				const shown = height > part.top - 1e-3;
				for (const mesh of part.meshes) mesh.mesh.visible = shown;
				continue;
			}
			for (const mesh of part.meshes) applyCut(mesh.mesh.geometry, mesh.data, height, mesh.lift);
		}
	}

	dispose() {
		this.group.removeFromParent();
		this.group.traverse((object) => {
			const mesh = object as Mesh;
			if (mesh.isMesh) mesh.geometry.dispose();
		});
		this.targetMaterial.dispose();
		this.shadow.dispose();
		this.openingTargets.length = 0;
	}
}

const isExterior = (run: WallRun) => run.out !== 0;

/**
 * A sash or sliding panel: a frame of four bars round a pane, in whatever space `put` draws into. The pane runs a little into
 * the bars, so no seam of light shows round it.
 */
function sash(rect: Span, n0: number, n1: number, bar: number, put: (target: 'frame' | 'glass', u0: number, u1: number, y0: number, y1: number, n0: number, n1: number) => void) {
	const b = Math.min(bar, (rect.u1 - rect.u0) / 4, (rect.y1 - rect.y0) / 4);
	put('frame', rect.u0, rect.u0 + b, rect.y0, rect.y1, n0, n1);
	put('frame', rect.u1 - b, rect.u1, rect.y0, rect.y1, n0, n1);
	put('frame', rect.u0 + b, rect.u1 - b, rect.y0, rect.y0 + b, n0, n1);
	put('frame', rect.u0 + b, rect.u1 - b, rect.y1 - b, rect.y1, n0, n1);
	const mid = (n0 + n1) / 2;
	put('glass', rect.u0 + b * 0.6, rect.u1 - b * 0.6, rect.y0 + b * 0.6, rect.y1 - b * 0.6, mid - 0.003, mid + 0.003);
}

/** The clear frame of an Opening, re-exported for the Home's thresholds. */
export { frameSpan };
