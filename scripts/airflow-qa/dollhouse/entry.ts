/**
 * Throwaway browser harness for the dollhouse scene (issue #30). It renders `Dollhouse` the way the Stage controller
 * will: one WebGLRenderer, a camera framed by `OrbitRig` from `dollhouseRig`, the kit's studio lights. Playwright
 * drives it through `window.__setState` (see `shoot.mjs`). Not shipped: nothing under src/ imports this.
 */
import { CircleGeometry, Color, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { studio } from '$lib/experiments/engine/kit';
import { OrbitRig } from '$lib/experiments/engine/rig';
import type { RigSetup } from '$lib/experiments/engine/types';
import { plans, planById } from '$lib/experiments/airflow/homes/plans';
import type { PlanId } from '$lib/experiments/airflow/homes/types';
import { Dollhouse, dollhouseRig } from '$lib/experiments/airflow/scene/dollhouse';
import { frameSpan, wallPoint, wallRuns } from '$lib/experiments/airflow/scene/wallPieces';

const TINTS: Record<string, number> = { sage: 0xe1e9d9, sand: 0xf4e9d8, cream: 0xf0e3cf, peach: 0xf1dfcd, butter: 0xf5e1bb, mist: 0xdde7ee, lilac: 0xe6ddf0 };

export interface State {
	plan: PlanId;
	/** Plan view, from straight above. */
	topDown?: boolean;
	/** Degrees; override the framing's yaw and pitch (yaw 0 looks north from the south, 180 looks south from the north). */
	yaw?: number;
	pitch?: number;
	/** 0 to 1 of travel for every opening (a number), or per opening id. */
	openings?: number | Record<string, number>;
	furniture?: boolean;
	tint?: keyof typeof TINTS;
	/** Frame this opening close up, from `side` ('in' looks at it from the room, 'out' from outdoors), `swing` degrees round from square on. */
	focus?: string;
	side?: 'in' | 'out';
	swing?: number;
	/** World metres the close-up fits. */
	span?: number;
	/** Looks at this world point (x, y, z) instead of the plan's middle, `span` metres across. */
	target?: [number, number, number];
}

declare global {
	interface Window {
		__ready: boolean;
		__setState: (state: State) => Promise<void>;
		__debug: () => unknown;
		__plans: unknown;
	}
}

const stage = document.getElementById('stage')!;
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default' });
stage.append(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(30, 1, 0.1, 300);
let lit = false;
let current: { id: PlanId; tint: string; house: Dollhouse; furniture: boolean } | null = null;
let last: { cutaway: unknown } | null = null;

function light(tint: number) {
	if (lit) return;
	lit = true;
	studio(scene, tint, { pool: 22, fog: [40, 100] });
	// The studio's floor pool sits at y = -0.004, which is inside the dollhouse; the plinth runs to -0.16, so a ground plane goes below it.
	for (const child of scene.children) if (child instanceof Mesh && child.geometry instanceof CircleGeometry) child.position.y = -0.17;
}

function framing(state: State): RigSetup {
	const plan = planById(state.plan)!;
	const base = dollhouseRig(plan, !!state.topDown);
	const setup: RigSetup = { ...base };
	if (state.yaw !== undefined) setup.yaw = (state.yaw * Math.PI) / 180;
	if (state.pitch !== undefined) setup.pitch = (state.pitch * Math.PI) / 180;
	if (state.focus) {
		const run = wallRuns(plan).find((r) => r.openings.some((o) => o.id === state.focus));
		if (!run) throw new Error(`No opening "${state.focus}" in ${plan.id}`);
		const spec = run.openings.find((o) => o.id === state.focus)!;
		const [x, z] = wallPoint(run, spec.placement.center, 0);
		const frame = frameSpan(spec);
		setup.target = [x, (frame.y0 + frame.y1) / 2, z];
		// Outward, in world x and z. An inside wall has no outdoors: take its +n side as "out".
		const out = run.axis === 'x' ? [0, run.out || 1] : [-(run.out || 1), 0];
		const sign = state.side === 'out' ? 1 : -1;
		setup.yaw = Math.atan2(sign * out[0], sign * out[1]) + ((state.swing ?? 25) * Math.PI) / 180;
		setup.pitch = ((state.pitch ?? 40) * Math.PI) / 180;
		const span = state.span ?? 3.2;
		setup.fit = { width: span, height: span };
		setup.pitchRange = [0.05, 1.5];
		setup.zoomRange = [0.3, 3];
	}
	if (state.target && !state.focus) {
		setup.target = state.target;
		const span = state.span ?? 3.2;
		setup.fit = { width: span, height: span };
		setup.pitchRange = [0.05, 1.5];
		setup.zoomRange = [0.3, 3];
	}
	return setup;
}

async function setState(state: State) {
	const plan = planById(state.plan);
	if (!plan) throw new Error(`No plan "${state.plan}"`);
	const tintName = state.tint ?? 'mist';
	const tint = TINTS[tintName];
	light(tint);
	(scene.background as Color).set(tint);
	scene.fog?.color.set(tint);
	const furniture = state.furniture ?? true;
	if (!current || current.id !== plan.id || current.tint !== tintName) {
		if (current) current.house.dispose();
		const house = new Dollhouse(plan, { furniture, tint });
		scene.add(house.group);
		current = { id: plan.id, tint: tintName, house, furniture };
	}
	const { house } = current;
	house.setFurniture(furniture);
	house.setTopDown(!!state.topDown);
	const amounts =
		typeof state.openings === 'number' ? Object.fromEntries(plan.openings.map((o) => [o.id, state.openings as number])) : (state.openings ?? {});
	house.setOpenings(amounts);

	const width = window.innerWidth;
	const height = window.innerHeight;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setSize(width, height, false);
	const rig = new OrbitRig(camera, framing(state), () => false);
	rig.setAspect(width / height);
	rig.update(1 / 60, false);
	// What the Stage does each frame: settle the dollhouse at the camera, then draw.
	house.update(camera, Infinity);
	renderer.render(scene, camera);
	last = { cutaway: null };
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

window.__setState = setState;
window.__plans = plans.map((plan) => ({ id: plan.id, width: plan.width, depth: plan.depth, openings: plan.openings.map((o) => ({ id: o.id, kind: o.kind, placement: o.placement, anchor: o.anchor })) }));
window.__debug = () => {
	if (!current) return null;
	const inner = current.house as unknown as {
		exteriorCut: { value: number };
		interiorCut: { value: number };
		cutaway: boolean;
		outside: { fade: number; goal: number; outward: { x: number; z: number } }[];
	};
	return {
		camera: camera.position.toArray(),
		exteriorCut: inner.exteriorCut.value,
		interiorCut: inner.interiorCut.value,
		cutaway: inner.cutaway,
		outside: inner.outside.map((v) => ({ outward: [v.outward.x, v.outward.z], fade: v.fade, goal: v.goal })),
		info: renderer.info.render,
		last
	};
};
window.__ready = true;
