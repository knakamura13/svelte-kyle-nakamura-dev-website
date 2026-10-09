/**
 * Throwaway harness for the airflow visualization layers (issue #30). It runs a CPU `World` on a real plan inside the
 * page, takes snapshots, and feeds the slice layer, the direction arrows and the tracer and smoke points in a plain
 * three.js scene, with a floor outline of the plan so a mirrored or transposed texture shows. Legends are drawn from
 * `legendFor` as DOM. Nothing here ships. Driven by `shoot.mjs` through `window.__init`, `__simulate` and `__setState`.
 */
import {
	BoxGeometry,
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	Group,
	LineBasicMaterial,
	LineLoop,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	Vector3,
	WebGLRenderer
} from 'three';
import { CFM, type DeviceModel } from '../../../src/lib/experiments/airflow/devices/types';
import { plans } from '../../../src/lib/experiments/airflow/homes/plans';
import { isExterior, type HomePlan } from '../../../src/lib/experiments/airflow/homes/types';
import { DirectionArrows } from '../../../src/lib/experiments/airflow/scene/arrows';
import { SmokePoints, TracerPoints } from '../../../src/lib/experiments/airflow/scene/particles';
import { SliceLayer } from '../../../src/lib/experiments/airflow/scene/sliceLayer';
import { World, type BackendFactory } from '../../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../../src/lib/experiments/airflow/solver/cpu/backend';
import type { Slice } from '../../../src/lib/experiments/airflow/solver/types';
import { blankSetup, type DeviceState, type LayerId, type Setup } from '../../../src/lib/experiments/airflow/state';
import { legendFor, type Legend, type LegendFormat, type LegendUnits } from '../../../src/lib/experiments/airflow/viz/legend';

declare global {
	interface Window {
		__init: (options?: InitOptions) => Promise<string>;
		__simulate: (seconds: number, dt?: number) => Promise<string>;
		__setState: (state: Partial<ViewState>) => Promise<Record<string, unknown>>;
		__ready: boolean;
	}
}

/** The small device models of tests/solver/world.spec.ts: the real catalog does not exist yet. */
const models: DeviceModel[] = [
	{ id: 'box', name: 'Box fan', kind: 'box-fan', body: { width: 0.5, depth: 0.15, height: 0.55 }, source: 'test', diameter: 0.45, flow: { low: 800 * CFM, medium: 1200 * CFM, high: 1600 * CFM } },
	{
		id: 'purifier',
		name: 'Purifier',
		kind: 'air-purifier',
		size: 'medium',
		body: { width: 0.3, depth: 0.3, height: 0.6 },
		source: 'test',
		cadr: { sleep: 40 * CFM, low: 80 * CFM, medium: 160 * CFM, high: 240 * CFM },
		inlet: { from: 0.1, to: 0.35 },
		outletDiameter: 0.2
	}
];
const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);

export interface InitOptions {
	plan?: HomePlan['id'];
	h?: number;
	windFrom?: number;
	windSpeed?: number;
	outdoorTemp?: number;
	indoorTemp?: number;
	openings?: Record<string, number>;
	fan?: boolean;
	purifier?: boolean;
	/** Smoke release: [x, y, z] in metres and mg of particles per minute. */
	smoke?: { at: [number, number, number]; mgPerMinute: number } | null;
	tracers?: number;
	smokeParticles?: number;
	/** ppm that reads as thick smoke. */
	dense?: number;
}

export interface ViewState {
	layer: LayerId;
	sensitivity: number;
	sliceHeight: number;
	tracers: boolean;
	smoke: boolean;
	topDown: boolean;
	theme: 'light' | 'dark';
	units: 'imperial' | 'metric';
	baseline: number;
	labels: 'compass' | 'all' | 'none';
	/** Hide the slice (to see the particles and the outline alone). */
	slice: boolean;
	/** Pixel ratio of the canvas. */
	pixelRatio: number;
	/** Camera azimuth around the plan, degrees from south, positive toward west; the three-quarter view is 28. */
	azimuth: number;
}

const state: ViewState = {
	layer: 'speed',
	sensitivity: 1,
	sliceHeight: 1.1,
	tracers: true,
	smoke: true,
	topDown: false,
	theme: 'light',
	units: 'imperial',
	baseline: 0,
	labels: 'compass',
	slice: true,
	pixelRatio: 1,
	azimuth: 28
};

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const labelsEl = document.getElementById('labels')!;
const legendEl = document.getElementById('legend')!;
const statusEl = document.getElementById('status')!;

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
const scene = new Scene();
const camera = new PerspectiveCamera(32, 1, 0.1, 200);
const stageTints = { light: 0xdde7ee, dark: 0x1d2824 };
scene.background = new Color(stageTints.light);

let world: World | null = null;
let plan: HomePlan | null = null;
let setup: Setup | null = null;
let slice: SliceLayer | null = null;
let arrows: DirectionArrows | null = null;
let tracerPoints: TracerPoints | null = null;
let smokePoints: SmokePoints | null = null;
let outline: Group | null = null;
let dense = 0.5;
let reference = 21;
let simulated = 0;
const furnitureAnchors: { name: string; at: Vector3 }[] = [];

const status = (text: string) => (statusEl.textContent = text);

function disposeScene() {
	slice?.dispose();
	arrows?.dispose();
	tracerPoints?.dispose();
	smokePoints?.dispose();
	for (const object of [slice?.mesh, arrows?.mesh, tracerPoints?.points, smokePoints?.points, outline]) if (object) scene.remove(object);
	outline?.traverse((object) => {
		const drawable = object as Mesh;
		drawable.geometry?.dispose();
		(drawable.material as MeshBasicMaterial | undefined)?.dispose();
	});
	world?.dispose();
}

/** A flat strip of `thickness` metres along a segment on the floor, so walls read at any pixel ratio. */
function strip(x0: number, z0: number, x1: number, z1: number, thickness: number, y: number, color: number, opacity = 1) {
	const length = Math.hypot(x1 - x0, z1 - z0);
	const mesh = new Mesh(new PlaneGeometry(length, thickness), new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
	mesh.rotation.x = -Math.PI / 2;
	mesh.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
	mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
	mesh.renderOrder = 1;
	return mesh;
}

/** The plan's floor, rooms, walls, furniture footprints and window markers: everything the texture must line up with. */
function buildOutline(home: HomePlan, openings: Record<string, number>) {
	const group = new Group();
	furnitureAnchors.length = 0;
	const floor = new Mesh(new PlaneGeometry(home.width, home.depth), new MeshBasicMaterial({ color: 0xf6f4ee, transparent: true, opacity: 0.55, depthWrite: false }));
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(home.width / 2, 0, home.depth / 2);
	floor.renderOrder = -2;
	group.add(floor);
	// A 1 m grid on the floor, with whole metres labelled by their lines being a touch darker every 5.
	const grid: number[] = [];
	for (let x = 1; x < home.width; x++) grid.push(x, 0.003, 0, x, 0.003, home.depth);
	for (let z = 1; z < home.depth; z++) grid.push(0, 0.003, z, home.width, 0.003, z);
	const gridGeometry = new BufferGeometry();
	gridGeometry.setAttribute('position', new Float32BufferAttribute(grid, 3));
	const gridLines = new LineSegments(gridGeometry, new LineBasicMaterial({ color: 0x7d8a85, transparent: true, opacity: 0.22 }));
	gridLines.renderOrder = -1;
	group.add(gridLines);
	// Exterior walls and partitions.
	const wall = 0x2b3532;
	group.add(strip(-0.04, 0, home.width + 0.04, 0, 0.1, 0.01, wall), strip(-0.04, home.depth, home.width + 0.04, home.depth, 0.1, 0.01, wall));
	group.add(strip(0, 0, 0, home.depth, 0.1, 0.01, wall), strip(home.width, 0, home.width, home.depth, 0.1, 0.01, wall));
	for (const w of home.walls) group.add(w.axis === 'x' ? strip(w.from, w.at, w.to, w.at, 0.07, 0.01, 0x55625d) : strip(w.at, w.from, w.at, w.to, 0.07, 0.01, 0x55625d));
	// Furniture footprints, in red so a hole in the slice can be matched to a piece, and a stronger red for the tall pieces.
	for (const item of home.furniture) {
		const tall = (item.y ?? 0) + item.h;
		const geometry = new BufferGeometry();
		const [x0, x1, z0, z1] = [item.x, item.x + item.w, item.z, item.z + item.d];
		geometry.setAttribute('position', new Float32BufferAttribute([x0, 0.02, z0, x1, 0.02, z0, x1, 0.02, z1, x0, 0.02, z1], 3));
		const color = tall >= 1.5 ? 0xb3261e : tall >= 0.7 ? 0xd2691e : 0xc9a227;
		const loop = new LineLoop(geometry, new LineBasicMaterial({ color }));
		loop.renderOrder = 2;
		group.add(loop);
		furnitureAnchors.push({ name: `${item.name} ${tall.toFixed(2)}`, at: new Vector3(item.x + item.w / 2, 0.02, item.z + item.d / 2) });
	}
	// Openings: a coloured bar on the wall, green when open (any amount), grey when shut.
	for (const o of home.openings) {
		const open = (openings[o.id] ?? o.open ?? 0) > 0;
		const color = open ? 0x1b9e50 : 0x8a948f;
		const p = o.placement;
		const half = o.width / 2;
		if (isExterior(p)) {
			const along = p.facade === 'north' || p.facade === 'south';
			const line = p.facade === 'north' || p.facade === 'west' ? 0 : along ? home.depth : home.width;
			group.add(along ? strip(p.center - half, line, p.center + half, line, 0.2, 0.02, color) : strip(line, p.center - half, line, p.center + half, 0.2, 0.02, color));
		} else {
			group.add(p.axis === 'x' ? strip(p.center - half, p.at, p.center + half, p.at, 0.14, 0.02, color) : strip(p.at, p.center - half, p.at, p.center + half, 0.14, 0.02, color));
		}
	}
	return group;
}

export async function init(options: InitOptions = {}) {
	disposeScene();
	const id = options.plan ?? 'two-bedroom';
	plan = plans.find((p) => p.id === id) ?? null;
	if (!plan) throw new Error(`no plan ${id}`);
	const s = blankSetup(plan.id);
	reference = options.indoorTemp ?? 21;
	s.conditions = { windFrom: options.windFrom ?? 270, windSpeed: options.windSpeed ?? 6, outdoorTemp: options.outdoorTemp ?? 14, indoorTemp: reference, outdoorPm25: 0 };
	s.openings = options.openings ?? { 'dining-window': 1, 'living-window-1': 1, 'living-window-2': 1, 'bedroom-1-window': 1, 'bedroom-2-window': 1, 'bedroom-1-door': 1, 'bedroom-2-door': 1, 'bathroom-door': 1 };
	const devices: DeviceState[] = [];
	if (options.fan) devices.push({ id: 'fan', model: 'box', x: 2.1, z: 4.0, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } });
	if (options.purifier) devices.push({ id: 'pur', model: 'purifier', x: 2.4, z: 7.0, y: 0, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } });
	s.devices = devices;
	setup = s;
	world = await World.create(s, { plans, models: new Map(models.map((m) => [m.id, m])), make, h: options.h ?? 0.15 });
	dense = options.dense ?? 0.5;
	world.backend.configureParticles({ tracers: options.tracers ?? 9000, smoke: options.smokeParticles ?? 9000, scale: dense, seed: 7 });
	const smoke = options.smoke === undefined ? { at: [2.4, 1.1, 5.2] as [number, number, number], mgPerMinute: 20 } : options.smoke;
	if (smoke) world.emit({ x: smoke.at[0], y: smoke.at[1], z: smoke.at[2] }, smoke.mgPerMinute / 60);
	simulated = 0;

	slice = new SliceLayer(plan.width, plan.depth);
	arrows = new DirectionArrows(plan.width, plan.depth);
	tracerPoints = new TracerPoints(options.tracers ?? 9000);
	smokePoints = new SmokePoints(options.smokeParticles ?? 9000);
	outline = buildOutline(plan, s.openings);
	scene.add(outline, slice.mesh, arrows.mesh, tracerPoints.points, smokePoints.points);
	const { nx, ny, nz } = world.backend.grid;
	return `plan ${plan.id} ${plan.width} x ${plan.depth} m, grid ${nx} x ${ny} x ${nz} at h = ${world.backend.grid.h}, ${world.backend.fluidCells} fluid cells, backend ${world.backend.kind}`;
}

export async function simulate(seconds: number, dt = 0.1) {
	if (!world) throw new Error('init first');
	const started = performance.now();
	const steps = Math.round(seconds / dt);
	for (let n = 0; n < steps; n++) {
		world.backend.step(dt);
		world.backend.stepParticles(dt);
		simulated += dt;
		if (n % 5 === 4) {
			status(`simulating ${simulated.toFixed(1)} s`);
			await new Promise((resolve) => setTimeout(resolve));
		}
	}
	const { diagnostics } = await world.backend.snapshot({});
	const took = (performance.now() - started) / 1000;
	const text = `simulated ${simulated.toFixed(1)} s in ${took.toFixed(1)} s (${((took / steps) * 1000).toFixed(0)} ms per step): max speed ${diagnostics.maxSpeed.toFixed(2)} m/s, divergence ${diagnostics.divergence.toExponential(2)}, cfl ${diagnostics.cfl.toFixed(2)}, smoke in air ${diagnostics.mass.inAir.toFixed(3)} mg`;
	status(text);
	return text;
}

function formats(): { format: LegendFormat; units: LegendUnits } {
	const imperial = state.units === 'imperial';
	const nice = (v: number) => String(Number(v.toPrecision(3)));
	return {
		units: imperial ? { speed: 2.23694, temperature: { scale: 1.8, offset: reference * 1.8 + 32 } } : { speed: 1, temperature: { scale: 1, offset: reference } },
		format: {
			speed: (mps) => (imperial ? `${nice(mps * 2.23694)} mph` : `${nice(mps)} m/s`),
			temperature: (theta) => (imperial ? `${nice(theta * 1.8 + reference * 1.8 + 32)} °F` : `${nice(theta + reference)} °C`),
			// ppm by mass times the air's density (1.204 kg/m³) is mg/m³ of particles.
			particulates: (ppm) => {
				const ug = ppm * 1204;
				return `${nice(ppm)} ppm · ${ug >= 1000 ? `${nice(ug / 1000)} mg/m³` : `${nice(ug)} µg/m³`}`;
			}
		}
	};
}

function renderLegend(legend: Legend) {
	const tick = (t: { label: string; at: number }, extra = '') => `<div class="tick ${extra}" style="left:${(t.at * 100).toFixed(2)}%">${t.label}</div>`;
	const ticks = legend.ticks.map((t, i) => tick(t, i === 0 ? 'first' : i === legend.ticks.length - 1 ? 'last' : '')).join('');
	const mid = legend.midpoint ? tick(legend.midpoint, 'mid') : '';
	let wheel = '';
	if (legend.wheel) {
		const size = 130;
		const rings = legend.wheel.rings.map((r) => `<div class="ring" style="width:${(r.at * 100).toFixed(1)}%;height:${(r.at * 100).toFixed(1)}%"></div><div class="ringlabel" style="top:${(50 - (r.at * 100) / 2).toFixed(1)}%">${r.label}</div>`).join('');
		const points = legend.wheel.headings.map((h) => {
			const a = (h.bearing * Math.PI) / 180;
			return `<div class="compass" style="left:${(size / 2 + Math.sin(a) * (size / 2 + 11)).toFixed(1)}px;top:${(size / 2 - Math.cos(a) * (size / 2 + 11)).toFixed(1)}px">${h.label}</div>`;
		});
		wheel = `<div class="wheel"><div class="disc" style="background:${legend.wheel.background}"></div>${rings}${points.join('')}</div>`;
	}
	legendEl.innerHTML = `<div class="legend"><div class="scale"><h2>${legend.title}</h2><div class="bar" style="background:${legend.gradient}"></div><div class="ticks">${ticks}${mid}</div></div>${wheel}</div>`;
}

const tmp = new Vector3();

function placeLabels() {
	labelsEl.textContent = '';
	if (!plan || state.labels === 'none') return;
	const w = stage.clientWidth;
	const h = stage.clientHeight;
	const put = (text: string, at: Vector3, cls = '') => {
		tmp.copy(at).project(camera);
		if (tmp.z > 1) return;
		const span = document.createElement('span');
		span.textContent = text;
		span.className = cls;
		span.style.left = `${((tmp.x + 1) / 2) * w}px`;
		span.style.top = `${((1 - tmp.y) / 2) * h}px`;
		labelsEl.append(span);
	};
	const m = 0.55;
	put('N', new Vector3(plan.width / 2, 0, -m), 'compass');
	put('S', new Vector3(plan.width / 2, 0, plan.depth + m), 'compass');
	put('W', new Vector3(-m, 0, plan.depth / 2), 'compass');
	put('E', new Vector3(plan.width + m, 0, plan.depth / 2), 'compass');
	if (state.labels === 'all') for (const a of furnitureAnchors) put(a.name, a.at);
}

function frame(aspect: number) {
	if (!plan) return;
	const { width: W, depth: D } = plan;
	const target = new Vector3(W / 2, 0.8, D / 2);
	const vfov = (camera.fov * Math.PI) / 180;
	const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
	if (state.topDown) {
		// North up, east right, whatever the aspect: fit width and depth with a margin.
		const need = Math.max(W / (2 * Math.tan(hfov / 2)), D / (2 * Math.tan(vfov / 2)));
		camera.up.set(0, 0, -1);
		camera.position.set(W / 2, need * 1.12 + 0.8, D / 2 + 0.001);
		camera.lookAt(W / 2, 0, D / 2);
	} else {
		const radius = 0.5 * Math.hypot(W, D, 3);
		const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.86;
		const azimuth = (state.azimuth * Math.PI) / 180;
		const elevation = (38 * Math.PI) / 180;
		camera.up.set(0, 1, 0);
		camera.position.set(target.x - Math.sin(azimuth) * Math.cos(elevation) * distance, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
		camera.lookAt(target);
	}
	camera.updateProjectionMatrix();
}

function summarize(snapshot: Slice) {
	let n = 0;
	const out = { air: 0, cells: snapshot.nx * snapshot.nz, speedMax: 0, speedMean: 0, thetaMin: Infinity, thetaMax: -Infinity, ppmMax: 0, ppmMin: Infinity };
	for (let i = 0; i < snapshot.speed.length; i++) {
		if (!snapshot.fluid[i]) continue;
		n++;
		out.speedMax = Math.max(out.speedMax, snapshot.speed[i]);
		out.speedMean += snapshot.speed[i];
		out.thetaMin = Math.min(out.thetaMin, snapshot.theta[i]);
		out.thetaMax = Math.max(out.thetaMax, snapshot.theta[i]);
		out.ppmMax = Math.max(out.ppmMax, snapshot.particulates[i]);
		out.ppmMin = Math.min(out.ppmMin, snapshot.particulates[i]);
	}
	out.air = n;
	out.speedMean /= Math.max(1, n);
	return out;
}

export async function setViewState(next: Partial<ViewState>) {
	if (!world || !plan || !slice || !arrows || !tracerPoints || !smokePoints) throw new Error('init first');
	Object.assign(state, next);
	document.documentElement.dataset.theme = state.theme;
	scene.background = new Color(stageTints[state.theme]);
	renderer.setPixelRatio(state.pixelRatio);
	const width = stage.clientWidth;
	const height = stage.clientHeight;
	renderer.setSize(width, height, false);
	camera.aspect = width / height;

	const snapshot = await world.backend.snapshot({ sliceY: state.sliceHeight, particles: true });
	const sliceData = snapshot.slice!;
	const options = { sensitivity: state.sensitivity, baseline: state.baseline };
	slice.mesh.visible = state.slice;
	slice.setHeight(sliceData.y);
	slice.update(sliceData, state.layer, options);
	arrows.mesh.visible = state.layer === 'direction';
	arrows.setHeight(sliceData.y);
	arrows.update(sliceData, options);
	tracerPoints.setVisible(state.tracers);
	tracerPoints.update(snapshot.tracers!, options);
	smokePoints.setVisible(state.smoke);
	smokePoints.update(snapshot.smoke!, { dense });

	const { format, units } = formats();
	const legend = legendFor(state.layer, { ...options, format, units });
	renderLegend(legend);
	frame(camera.aspect);
	renderer.render(scene, camera);
	placeLabels();
	const gl = renderer.getContext();
	const error = gl.getError();
	let shown = 0;
	if (snapshot.smoke) for (let i = 0; i < snapshot.smoke.length; i += 4) if (snapshot.smoke[i + 3] > 0) shown++;
	return {
		sliceY: sliceData.y,
		layer: state.layer,
		slice: summarize(sliceData),
		arrows: arrows.mesh.count,
		smokeParticlesWithSmoke: shown,
		glError: error,
		legendTicks: legend.ticks.map((t) => `${t.label} @${t.at.toFixed(3)}`)
	};
}

window.__init = init;
window.__simulate = simulate;
window.__setState = setViewState;
window.__ready = true;
status('ready');
