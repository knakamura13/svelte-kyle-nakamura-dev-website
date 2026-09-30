import { CylinderGeometry, Group, MathUtils, Mesh, PerspectiveCamera, Scene, SphereGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gamma, lightClockHalfTick } from '../physics';
import { palette } from '../palette';
import { Tubes, blobShadow, clay, disposeTree, flat, glow, setOpacity, shade, studio, triangle } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface LightClockParams {
	/** Speed of the moving clock, as a fraction of c. */
	beta: number;
	playing: boolean;
	/** Draws the right triangle behind the photon's current half-tick. */
	geometry: boolean;
	/** Bumped by the Restart button. */
	restart: number;
}

export interface LightClockReadout {
	restTicks: number;
	movingTicks: number;
}

/** Gap between the mirrors, scene units. */
const HEIGHT = 1.5;
/** Seconds of animation for one tick of the stationary clock. Light is slowed a lot to be watchable. */
const TICK = 1.6;
/** The photon's speed, scene units per second: two mirror gaps per stationary tick. */
const PHOTON_SPEED = (2 * HEIGHT) / TICK;
const PLATE = 0.11;
const TOP = PLATE + HEIGHT;
const REST_Z = -2.7;
const MOVING_Z = 1.9;
const MAX_SEGMENTS = 26;
/** Half the length of the moving clock's run when it slides less than a tick across the Stage. */
const MIN_HALF_RUN = 3.4;

const bounceY = (index: number) => (index % 2 === 0 ? PLATE : TOP);

function buildClock(color: number) {
	const group = new Group();
	const material = clay(color);
	const plate = new RoundedBoxGeometry(0.95, PLATE, 0.62, 3, 0.04);
	const bottom = new Mesh(plate, material);
	bottom.position.y = PLATE / 2;
	const top = new Mesh(plate, material);
	top.position.y = TOP + PLATE / 2;
	group.add(bottom, top);

	const post = new CylinderGeometry(0.026, 0.026, HEIGHT + PLATE, 10);
	const postMaterial = clay(0xffffff);
	for (const sx of [-1, 1])
		for (const sz of [-1, 1]) {
			const mesh = new Mesh(post, postMaterial);
			mesh.position.set(sx * 0.4, PLATE + HEIGHT / 2, sz * 0.25);
			group.add(mesh);
		}

	const photon = new Mesh(new SphereGeometry(0.11, 24, 16), flat(palette.light));
	const halo = glow(palette.light, 1.1, 0.65);
	photon.add(halo);
	group.add(photon, blobShadow(0.95));
	return { group, photon, halo, material };
}

export const createLightClock: SceneFactory<LightClockParams, LightClockReadout> = (host, params, readout) => {
	const scene = new Scene();
	studio(scene, palette.mist, { pool: 18, grid: 44, fog: [28, 80] });

	const rest = buildClock(palette.restClay);
	rest.group.position.set(0, 0, REST_Z);
	const moving = buildClock(palette.moverClay);
	moving.group.position.z = MOVING_Z;
	scene.add(rest.group, moving.group);

	const restPath = new Tubes(2, palette.mist);
	const zigzag = new Tubes(MAX_SEGMENTS, palette.mist);
	const legs = new Tubes(3, palette.mist);
	scene.add(restPath.mesh, zigzag.mesh, legs.mesh);

	const restLabel = host.labels.add({ name: 'Stationary clock', value: '0 ticks', tone: 'rest' });
	const movingLabel = host.labels.add({ name: 'Moving clock', value: '0 ticks', tone: 'mover', side: 'below' });
	const heightLabel = host.labels.add({ name: 'L', side: 'left' });
	const slideLabel = host.labels.add({ name: 'v·Δt/2', tone: 'mover', side: 'above' });
	const pathLabel = host.labels.add({ name: 'c·Δt/2', tone: 'light', side: 'above' });

	let restPhase = 0;
	let movingPhase = 0;
	let half = MIN_HALF_RUN;
	let x = -0.55 * half;
	let restFlash = 0;
	let movingFlash = 0;
	let lastRestart = params.restart;
	let lastRestTick = 0;
	let lastMovingTick = 0;

	const points = Array.from({ length: MAX_SEGMENTS + 2 }, () => new Vector3());
	const start = new Vector3();
	const end = new Vector3();
	const corner = new Vector3();
	const from = new Vector3();

	const tickText = (n: number) => `${n} ${n === 1 ? 'tick' : 'ticks'}`;

	function pose(dt: number) {
		const g = gamma(params.beta);
		const speed = params.beta * PHOTON_SPEED;
		// How far the clock slides during one half-tick: the triangle's base, from the tested physics.
		const { slide } = lightClockHalfTick(params.beta, HEIGHT);
		const targetHalf = Math.max(MIN_HALF_RUN, 1.1 * slide);
		half += (targetHalf - half) * (1 - Math.exp(-dt * 4));

		if (params.playing) {
			restPhase += dt / TICK;
			movingPhase += dt / (g * TICK);
			x += speed * dt;
			if (x > half) x -= 2 * half;
		}
		const restTick = Math.floor(restPhase);
		const movingTick = Math.floor(movingPhase);
		if (restTick > lastRestTick) restFlash = 1;
		if (movingTick > lastMovingTick) movingFlash = 1;
		lastRestTick = restTick;
		lastMovingTick = movingTick;
		restFlash = Math.max(0, restFlash - dt * 3.5);
		movingFlash = Math.max(0, movingFlash - dt * 3.5);
		rest.material.emissive.set(palette.light).multiplyScalar(restFlash * 0.5);
		moving.material.emissive.set(palette.light).multiplyScalar(movingFlash * 0.5);

		if (readout.restTicks !== restTick) readout.restTicks = restTick;
		if (readout.movingTicks !== movingTick) readout.movingTicks = movingTick;
		restLabel.setValue(tickText(restTick));
		movingLabel.setValue(tickText(movingTick));

		// Zoomed out for fast clocks, so the photon and the lines are drawn thicker to stay visible.
		const scale = Math.min(1.5, Math.max(1, half / 3.6));
		for (const clock of [rest, moving]) {
			clock.photon.scale.setScalar(scale);
			clock.halo.scale.setScalar(1.1 * scale);
		}
		const radius = 0.028 * scale;

		// The stationary photon goes straight up and down.
		rest.photon.position.y = PLATE + HEIGHT * triangle(restPhase);
		restPath.set(0, start.set(0, PLATE, REST_Z), end.set(0, TOP, REST_Z), radius * 0.8, palette.rest, 0.35);
		// A thin line marks where the moving clock runs.
		restPath.set(1, start.set(-half - 0.9, 0.01, MOVING_Z), end.set(half + 0.9, 0.01, MOVING_Z), radius * 0.55, shade(palette.mist, 0.82));
		restPath.commit(2);

		// The moving clock slides along, fading in and out at the ends of its run.
		const opacity = MathUtils.smoothstep(half - Math.abs(x), 0, 1.5);
		moving.group.position.x = x;
		moving.photon.position.y = PLATE + HEIGHT * triangle(movingPhase);
		setOpacity(moving.group, opacity);

		// The photon's zigzag, rebuilt from the current speed so it reshapes as the slider moves.
		const bounce = Math.floor(movingPhase * 2);
		const xBounce = x - slide * (movingPhase * 2 - bounce);
		let count = 0;
		points[count++].set(x, moving.photon.position.y, MOVING_Z);
		for (let back = 0; back < MAX_SEGMENTS && bounce - back >= 0; back++) {
			const px = xBounce - back * slide;
			const py = bounceY(bounce - back);
			if (px <= -half) {
				// The run began inside this segment: end the line at the run's left edge.
				const last = points[count - 1];
				const t = (last.x + half) / Math.max(last.x - px, 1e-6);
				points[count++].set(-half, MathUtils.lerp(last.y, py, t), MOVING_Z);
				break;
			}
			points[count++].set(px, py, MOVING_Z);
		}
		for (let i = 0; i < count - 1; i++) {
			zigzag.set(i, points[i], points[i + 1], radius, palette.light, Math.min(0.8, i * 0.06));
		}
		zigzag.commit(Math.max(0, count - 1));

		// The right triangle behind this half-tick: the clock's height, the distance it slides, the photon's path.
		const showLegs = params.geometry && opacity > 0.2;
		if (showLegs) {
			const rising = bounce % 2 === 0;
			start.set(xBounce, bounceY(bounce), MOVING_Z);
			end.set(xBounce + slide, bounceY(bounce + 1), MOVING_Z);
			// The right angle sits under the end of a rising half-tick and under the start of a falling one.
			corner.set(rising ? end.x : start.x, PLATE + 0.02, MOVING_Z);
			from.set(start.x, PLATE + 0.02, MOVING_Z);
			legs.set(0, corner, rising ? end : start, radius * 1.5, palette.ink);
			legs.set(1, rising ? from : corner, rising ? corner : end, radius * 1.5, palette.mover);
			legs.set(2, start, end, radius * 1.15, palette.light);
			legs.commit(3);
			heightLabel.position.set(corner.x, (PLATE + TOP) / 2, MOVING_Z);
			slideLabel.position.set((start.x + end.x) / 2, PLATE, MOVING_Z);
			pathLabel.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, MOVING_Z);
		} else legs.commit(0);
		// A small triangle has no room for its labels.
		const roomy = showLegs && slide > 1;
		for (const label of [heightLabel, slideLabel, pathLabel]) label.enabled = roomy;

		restLabel.position.set(0, TOP + PLATE + 0.35, REST_Z);
		movingLabel.position.set(x, -0.1, MOVING_Z);
		movingLabel.enabled = opacity > 0.35;

		return params.playing || restFlash > 0 || movingFlash > 0 || Math.abs(targetHalf - half) > 0.01;
	}

	pose(0);
	const fit = () => ({ width: 2 * half + 2.6, height: 6 });

	return {
		scene,
		camera: new PerspectiveCamera(24, 1, 0.1, 300),
		rig: { yaw: 0.14, pitch: 0.42, target: [0, 0.85, 0], fit: fit(), fov: 24, pitchRange: [0.04, 1.3] },
		fit,
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				restPhase = movingPhase = 0;
				lastRestTick = lastMovingTick = 0;
				x = -0.55 * half;
			}
			return pose(dt);
		},
		dispose() {
			for (const tubes of [restPath, zigzag, legs]) tubes.mesh.geometry.dispose();
			disposeTree(scene);
		}
	};
};
