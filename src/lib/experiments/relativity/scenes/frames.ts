import {
	BoxGeometry,
	CapsuleGeometry,
	CylinderGeometry,
	Group,
	InstancedMesh,
	MathUtils,
	Matrix4,
	Mesh,
	PerspectiveCamera,
	Scene,
	SphereGeometry,
	Vector3
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { palette } from '../palette';
import { Fader, Tubes, blobShadow, clay, disposeTree, shade, studio } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface FramesParams {
	/** Which frame the camera rides in. */
	view: 'train' | 'platform';
	/** Train speed relative to the platform, m/s. */
	speed: number;
	playing: boolean;
	restart: number;
}

export type FramesReadout = Record<string, never>;

const GRAVITY = 9.8;
/** Where the ball leaves the hand, and how far above that it climbs, metres. */
const HAND = 1.65;
const RISE = 1.4;
const LAUNCH = Math.sqrt(2 * GRAVITY * RISE);
/** Seconds the ball is in the air. */
export const FLIGHT = (2 * LAUNCH) / GRAVITY;
/** The animation runs at this fraction of real speed, so an arc has time to be watched. */
const SLOW = 0.5;
const LEAD = 0.7;
const TAIL = 0.9;
const AIR = FLIGHT / SLOW;
const CYCLE = LEAD + AIR + TAIL;
const FADE = 0.4;
const BALL_Z = 0.55;
const SEGMENTS = 44;
const CAR_LENGTH = 6;

const ballHeight = (s: number) => HAND + LAUNCH * s - 0.5 * GRAVITY * s * s;

function buildCar() {
	const car = new Group();
	const body = clay(palette.moverClay);
	const floor = new Mesh(new RoundedBoxGeometry(CAR_LENGTH, 0.18, 2.3, 3, 0.05), body);
	floor.position.y = 0.75;
	const roof = new Mesh(new RoundedBoxGeometry(CAR_LENGTH, 0.14, 2.3, 3, 0.05), body);
	roof.position.y = 3.4;
	car.add(floor, roof);

	const post = new CylinderGeometry(0.06, 0.06, 2.65, 10);
	const postMaterial = clay(0xffffff);
	for (const sx of [-1, 0, 1])
		for (const sz of [-1, 1]) {
			const mesh = new Mesh(post, postMaterial);
			mesh.position.set(sx * (CAR_LENGTH / 2 - 0.1), 2.075, sz * 1.05);
			car.add(mesh);
		}

	const wheels: Mesh[] = [];
	const wheel = new CylinderGeometry(0.34, 0.34, 0.14, 24);
	const wheelMaterial = clay(palette.ink);
	for (const sx of [-1, 1])
		for (const sz of [-1, 1]) {
			const mesh = new Mesh(wheel, wheelMaterial);
			mesh.rotation.x = Math.PI / 2;
			mesh.position.set(sx * 1.9, 0.4, sz * 0.75);
			wheels.push(mesh);
			car.add(mesh);
		}

	const skin = clay(0xf1c9a5);
	const passenger = new Group();
	const torso = new Mesh(new CapsuleGeometry(0.27, 0.62, 6, 14), clay(palette.rest));
	torso.position.y = 1.5;
	const head = new Mesh(new SphereGeometry(0.22, 20, 16), skin);
	head.position.y = 2.25;
	const arm = new Mesh(new CapsuleGeometry(0.07, 0.5, 4, 8), skin);
	arm.position.set(0, 1.85, 0.3);
	arm.rotation.x = 1.05;
	passenger.add(torso, head, arm);
	car.add(passenger, blobShadow(3.6, 0.28));
	return { car, wheels };
}

export const createFrames: SceneFactory<FramesParams, FramesReadout> = (host, params) => {
	const scene = new Scene();
	studio(scene, palette.sage, { pool: 34, fog: [46, 120] });
	const camera = new PerspectiveCamera(26, 1, 0.1, 300);
	const fader = new Fader(scene, camera, palette.sage);

	// The ground: sleepers, rails, and a platform with lamp posts. Nothing here ever moves.
	const sleepers = new InstancedMesh(new BoxGeometry(0.3, 0.1, 2.2), clay(shade(palette.sage, 0.62)), 121);
	const rails = new BoxGeometry(140, 0.1, 0.1);
	const railMaterial = clay(0x9aa39c);
	const posts = new InstancedMesh(new CylinderGeometry(0.07, 0.07, 2.4, 10), clay(palette.rest), 21);
	const lamps = new InstancedMesh(new SphereGeometry(0.2, 16, 12), clay(0xffffff, { emissive: palette.light, emissiveIntensity: 0.25 }), 21);
	const matrix = new Matrix4();
	for (let i = 0; i < 121; i++) sleepers.setMatrixAt(i, matrix.makeTranslation(i - 60, 0.05, 0));
	for (let i = 0; i < 21; i++) {
		posts.setMatrixAt(i, matrix.makeTranslation((i - 10) * 6, 1.4, -3.4));
		lamps.setMatrixAt(i, matrix.makeTranslation((i - 10) * 6, 2.7, -3.4));
	}
	const platform = new Mesh(new RoundedBoxGeometry(140, 0.4, 2.6, 2, 0.04), clay(0xcdd6ea));
	platform.position.set(0, 0.2, -3.4);
	const railA = new Mesh(rails, railMaterial);
	railA.position.set(0, 0.2, 0.75);
	const railB = railA.clone();
	railB.position.z = -0.75;
	scene.add(sleepers, posts, lamps, platform, railA, railB);

	const { car, wheels } = buildCar();
	scene.add(car);

	const ball = new Mesh(new SphereGeometry(0.22, 24, 16), clay(palette.light, { roughness: 0.45, emissive: palette.light, emissiveIntensity: 0.25 }));
	car.add(ball);
	const carTrail = new Tubes(SEGMENTS, palette.sage);
	car.add(carTrail.mesh);
	const groundTrail = new Tubes(SEGMENTS, palette.sage);
	scene.add(groundTrail.mesh);

	const trainLabel = host.labels.add({ name: 'Train', tone: 'mover' });
	const platformLabel = host.labels.add({ name: 'Platform', tone: 'rest' });
	const pathLabel = host.labels.add({ name: 'Seen from the train', value: 'Straight up and down', tone: 'mover' });

	let clock = 0;
	let lastRestart = params.restart;
	let blend = params.view === 'train' ? 1 : 0;
	let carX = 0;
	let fitWidth = 19;
	const a = new Vector3();
	const b = new Vector3();

	const groundX = (s: number) => params.speed * (s - FLIGHT / 2);

	function pose(dt: number) {
		if (params.playing) {
			clock += dt;
			if (clock >= CYCLE) clock -= CYCLE;
		}
		const airborne = MathUtils.clamp((clock - LEAD) / AIR, 0, 1);
		const s = airborne * FLIGHT;
		const v = params.speed;
		// Mid-flight the train is level with the middle of the platform.
		carX = v * SLOW * (clock - (LEAD + AIR / 2));
		car.position.x = carX;
		for (const wheel of wheels) wheel.rotation.y = -carX / 0.34;

		ball.position.set(0, ballHeight(s), BALL_Z);
		const alpha = 1 - Math.max(MathUtils.smoothstep(clock, CYCLE - FADE, CYCLE), 1 - MathUtils.smoothstep(clock, 0, FADE));
		fader.set(1 - alpha);

		// Each frame's own view of the ball's path: a vertical line from the train, an arc from the platform.
		const inTrain = params.view === 'train';
		const steps = Math.ceil(airborne * SEGMENTS);
		for (let i = 0; i < steps; i++) {
			const s0 = (i / SEGMENTS) * FLIGHT;
			const s1 = Math.min((i + 1) / SEGMENTS, airborne) * FLIGHT;
			carTrail.set(i, a.set(0, ballHeight(s0), BALL_Z), b.set(0, ballHeight(s1), BALL_Z), 0.06, palette.mover);
			groundTrail.set(i, a.set(groundX(s0), ballHeight(s0), BALL_Z), b.set(groundX(s1), ballHeight(s1), BALL_Z), 0.06, palette.rest);
		}
		carTrail.commit(inTrain ? steps : 0);
		groundTrail.commit(inTrain ? 0 : steps);

		const target = inTrain ? 1 : 0;
		blend += (target - blend) * (host.reducedMotion() ? 1 : 1 - Math.exp(-dt * 5));
		if (Math.abs(target - blend) < 0.002) blend = target;
		const wide = 10 + 1.25 * v * FLIGHT;
		fitWidth += (MathUtils.lerp(wide, 10, blend) - fitWidth) * (host.reducedMotion() ? 1 : 1 - Math.exp(-dt * 5));

		trainLabel.position.set(carX, 3.75, 0);
		platformLabel.position.set(-fitWidth * 0.32, 0.7, -3.4);
		platformLabel.enabled = blend < 0.9;
		pathLabel.set(inTrain ? 'Seen from the train' : 'Seen from the platform', inTrain ? 'Straight up and down' : 'A curve');
		pathLabel.setTone(inTrain ? 'mover' : 'rest');
		pathLabel.position.set(inTrain ? carX : 0, HAND + RISE + 0.55, BALL_Z);
		pathLabel.enabled = airborne > 0.08 && airborne < 1;

		return params.playing || Math.abs(target - blend) > 0.002 || Math.abs(MathUtils.lerp(wide, 10, blend) - fitWidth) > 0.01;
	}

	pose(0);

	return {
		scene,
		camera,
		rig: {
			yaw: 0.3,
			pitch: 0.3,
			target: [0, 1.5, 0],
			fit: { width: 19, height: 4.8 },
			fov: 26,
			pitchRange: [0.03, 1.2]
		},
		fit: () => ({ width: fitWidth, height: 4.8 }),
		focus: () => [blend * carX, 1.5, 0],
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				clock = 0;
			}
			return pose(dt);
		},
		dispose() {
			for (const tubes of [carTrail, groundTrail]) tubes.mesh.geometry.dispose();
			disposeTree(scene);
		}
	};
};
