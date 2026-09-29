import {
	BoxGeometry,
	BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	InstancedMesh,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Matrix4,
	Mesh,
	PerspectiveCamera,
	Quaternion,
	Scene,
	SphereGeometry,
	TorusGeometry,
	Vector3
} from 'three';
import { gravityRate } from '../physics';
import { palette } from '../palette';
import { blobShadow, clay, disposeTree, flat, shade, studio } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface GravityParams {
	/** Distance of the probe clock from the mass, in Schwarzschild radii. */
	radius: number;
	playing: boolean;
	restart: number;
}

export interface GravityReadout {
	farTicks: number;
	probeTicks: number;
}

/** The sheet spans 1 to this many Schwarzschild radii; one radius is one scene unit. */
export const OUTER = 12;
const RIM = 4.2;
const DEPTH = 0.55;
const RINGS = 44;
const SEGMENTS = 84;
/** Seconds the far clock's hand takes to go once round: one tick. */
const TICK = 2.4;

/** Height of the sheet at radius r: the classic embedding of space around a mass, deepest at the horizon. */
const sheetHeight = (r: number) => RIM - DEPTH * (2 * Math.sqrt(OUTER - 1) - 2 * Math.sqrt(Math.max(r - 1, 0)));
const slope = (r: number) => DEPTH / Math.sqrt(Math.max(r - 1, 0.02));

function buildSheet() {
	const positions: number[] = [];
	const indices: number[] = [];
	const radii: number[] = [];
	for (let j = 0; j <= RINGS; j++) radii.push(1 + (OUTER - 1) * Math.pow(j / RINGS, 1.8));
	for (const r of radii) {
		for (let k = 0; k <= SEGMENTS; k++) {
			const theta = (k / SEGMENTS) * Math.PI * 2;
			positions.push(r * Math.cos(theta), sheetHeight(r), r * Math.sin(theta));
		}
	}
	const row = SEGMENTS + 1;
	for (let j = 0; j < RINGS; j++)
		for (let k = 0; k < SEGMENTS; k++) {
			const a = j * row + k;
			indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
		}
	const sheet = new BufferGeometry();
	sheet.setAttribute('position', new Float32BufferAttribute(positions, 3));
	sheet.setIndex(indices);
	sheet.computeVertexNormals();

	// Grid lines: every fourth ring and every sixth spoke.
	const lines: number[] = [];
	const at = (j: number, k: number) => {
		const i = (j * row + k) * 3;
		return [positions[i], positions[i + 1] + 0.012, positions[i + 2]];
	};
	for (let j = 0; j <= RINGS; j += 4)
		for (let k = 0; k < SEGMENTS; k++) lines.push(...at(j, k), ...at(j, k + 1));
	for (let k = 0; k < SEGMENTS; k += 6)
		for (let j = 0; j < RINGS; j++) lines.push(...at(j, k), ...at(j + 1, k));
	const grid = new BufferGeometry();
	grid.setAttribute('position', new Float32BufferAttribute(lines, 3));
	return { sheet, grid };
}

function buildClock(tone: number) {
	const group = new Group();
	const face = new Mesh(new CylinderGeometry(0.9, 0.9, 0.14, 44), clay(0xffffff));
	const rim = new Mesh(new TorusGeometry(0.9, 0.05, 10, 44), clay(tone));
	rim.rotation.x = Math.PI / 2;
	rim.position.y = 0.06;
	const ticks = new InstancedMesh(new BoxGeometry(0.05, 0.03, 0.14), clay(palette.muted), 12);
	const matrix = new Matrix4();
	const quaternion = new Quaternion();
	for (let i = 0; i < 12; i++) {
		const angle = (i / 12) * Math.PI * 2;
		quaternion.setFromAxisAngle(new Vector3(0, 1, 0), -angle);
		matrix.compose(new Vector3(Math.sin(angle) * 0.68, 0.08, Math.cos(angle) * 0.68), quaternion, new Vector3(1, 1, 1));
		ticks.setMatrixAt(i, matrix);
	}
	const hand = new Group();
	const stick = new Mesh(new BoxGeometry(0.09, 0.05, 0.62), clay(tone));
	stick.position.z = 0.26;
	hand.add(stick);
	hand.position.y = 0.11;
	const cap = new Mesh(new SphereGeometry(0.1, 14, 10), clay(palette.ink));
	cap.position.y = 0.1;
	group.add(face, rim, ticks, hand, cap);
	return { group, hand };
}

export const createGravity: SceneFactory<GravityParams, GravityReadout> = (host, params, readout) => {
	const scene = new Scene();
	studio(scene, palette.butter, { pool: 20, fog: [40, 100] });
	const camera = new PerspectiveCamera(26, 1, 0.1, 300);

	const { sheet, grid } = buildSheet();
	const surface = new Mesh(
		sheet,
		clay(0xffffff, { side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
	);
	const web = new LineSegments(grid, new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.42 }));
	scene.add(surface, web);

	const floorY = sheetHeight(1);
	const mass = new Mesh(new SphereGeometry(0.98, 36, 24), clay(palette.ink, { roughness: 0.4 }));
	mass.position.y = floorY + 0.55;
	const halo = new Mesh(new TorusGeometry(1.32, 0.05, 10, 60), flat(palette.light));
	halo.rotation.x = Math.PI / 2;
	halo.position.y = floorY + 0.55;
	const shadow = blobShadow(13, 0.18);
	shadow.position.y = 0.01;
	scene.add(mass, halo, shadow);

	const far = buildClock(palette.rest);
	const probe = buildClock(palette.mover);
	scene.add(far.group, probe.group);

	const farLabel = host.labels.add({ name: 'Far away', value: '0 ticks', tone: 'rest' });
	const probeLabel = host.labels.add({ name: 'Near the mass', value: '0 ticks', tone: 'mover' });
	const massLabel = host.labels.add({ name: 'Mass', tone: 'plain', side: 'below' });

	const up = new Vector3(0, 1, 0);
	const normal = new Vector3();
	const radial = new Vector3();
	let farPhase = 0;
	let probePhase = 0;
	let probeRadius = params.radius;
	let lastRestart = params.restart;
	let farTicks = -1;
	let probeTicks = -1;

	/** Stands a clock on the sheet at `r` and angle `theta`, tilted to lie along the surface. */
	function place(clock: Group, r: number, theta: number) {
		radial.set(Math.cos(theta), 0, Math.sin(theta));
		normal.copy(radial).multiplyScalar(-slope(r)).add(up).normalize();
		clock.position.set(r * Math.cos(theta), sheetHeight(r) + 0.1, r * Math.sin(theta));
		clock.quaternion.setFromUnitVectors(up, normal);
	}

	function pose(dt: number) {
		if (params.playing) {
			farPhase += dt / TICK;
			probePhase += (dt / TICK) * gravityRate(probeRadius);
			halo.rotation.z += dt * 0.6;
		}
		const settle = params.radius - probeRadius;
		probeRadius += settle * (host.reducedMotion() ? 1 : 1 - Math.exp(-dt * 5));
		if (Math.abs(settle) < 0.002) probeRadius = params.radius;

		far.hand.rotation.y = -farPhase * Math.PI * 2;
		probe.hand.rotation.y = -probePhase * Math.PI * 2;
		place(far.group, OUTER, Math.PI * 0.92);
		place(probe.group, probeRadius, -0.62);

		const farNow = Math.floor(farPhase);
		const probeNow = Math.floor(probePhase);
		if (farNow !== farTicks) {
			farTicks = farNow;
			readout.farTicks = farNow;
			farLabel.setValue(`${farNow} ${farNow === 1 ? 'tick' : 'ticks'}`);
		}
		if (probeNow !== probeTicks) {
			probeTicks = probeNow;
			readout.probeTicks = probeNow;
			probeLabel.setValue(`${probeNow} ${probeNow === 1 ? 'tick' : 'ticks'}`);
		}
		farLabel.position.copy(far.group.position).add(new Vector3(0, 1.1, 0));
		probeLabel.position.copy(probe.group.position).add(new Vector3(0, 1.1, 0));
		massLabel.position.set(0, floorY - 0.1, 0);

		return params.playing || Math.abs(params.radius - probeRadius) > 0.002;
	}

	pose(0);
	const tint = shade(palette.butter, 1);
	void tint;

	return {
		scene,
		camera,
		rig: {
			yaw: 0.5,
			pitch: 0.52,
			target: [0, 2.6, 0],
			fit: { width: 27, height: 12.5 },
			fov: 26,
			pitchRange: [0.08, 1.35]
		},
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				farPhase = probePhase = 0;
				farTicks = probeTicks = -1;
			}
			return pose(dt);
		},
		dispose() {
			sheet.dispose();
			grid.dispose();
			disposeTree(scene);
		}
	};
};
