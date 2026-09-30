import {
	BoxGeometry,
	CapsuleGeometry,
	CylinderGeometry,
	Group,
	MathUtils,
	Mesh,
	PerspectiveCamera,
	Scene,
	SphereGeometry,
	Vector3,
	type MeshBasicMaterial
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { palette } from '../palette';
import { Fader, Tubes, blobShadow, clay, disposeTree, flat, glow, shade, studio } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface LightSpeedParams {
	/** Ship speed relative to the station, as a fraction of c. */
	beta: number;
	/** Draws the pulse Newton's arithmetic would predict. */
	ghost: boolean;
	playing: boolean;
	restart: number;
}

export type LightSpeedReadout = Record<string, never>;

/** Scene units per light-second, and light-seconds from the station to the finish line. */
const LIGHT_SECOND = 3.6;
const DISTANCE = 4;
const FINISH = DISTANCE * LIGHT_SECOND;
/** Animation seconds per light-second. */
const SLOWDOWN = 0.75;
const LEAD = 0.7;
/** Animation seconds from the shot until the pulse is well past the finish line. */
const RUN = (DISTANCE + 1.2) * SLOWDOWN;
const HOLD = 1.4;
const CYCLE = LEAD + RUN + HOLD;
const FADE = 0.4;
const LANE = 1.5;

export const createLightSpeed: SceneFactory<LightSpeedParams, LightSpeedReadout> = (host, params) => {
	const scene = new Scene();
	studio(scene, palette.cream, { pool: 24, grid: 60, fog: [40, 120] });
	const camera = new PerspectiveCamera(26, 1, 0.1, 300);
	const fader = new Fader(scene, camera, palette.cream);

	const road = new Mesh(new RoundedBoxGeometry(1, 0.06, 2.8, 2, 0.02), clay(shade(palette.cream, 0.9)));
	road.scale.x = FINISH + 12;
	road.position.set(FINISH / 2 - 1, 0.03, 0);
	scene.add(road);

	const ruler = new Tubes(DISTANCE + 4, palette.cream);
	scene.add(ruler.mesh);
	const a = new Vector3();
	const b = new Vector3();
	for (let i = 0; i <= DISTANCE + 1; i++) {
		ruler.set(i, a.set(i * LIGHT_SECOND, 0.07, 1.6), b.set(i * LIGHT_SECOND, 0.07, 2.2), 0.045, i === 0 ? palette.ink : palette.muted, 0.15);
	}
	ruler.commit(DISTANCE + 2);

	// The station stands at the start of the road.
	const station = new Group();
	const tower = new Mesh(new CylinderGeometry(0.22, 0.34, 2.6, 16), clay(palette.restClay));
	tower.position.y = 1.3;
	const beacon = new Mesh(new SphereGeometry(0.34, 20, 14), clay(0xffffff));
	beacon.position.y = 2.85;
	station.add(tower, beacon, blobShadow(1.1));
	station.position.set(0, 0, -1.9);
	scene.add(station);

	const gate = new Group();
	const postGeometry = new CylinderGeometry(0.1, 0.1, 2.8, 12);
	const postMaterial = clay(palette.restClay);
	for (const sz of [-1, 1]) {
		const post = new Mesh(postGeometry, postMaterial);
		post.position.set(0, 1.4, sz * 1.6);
		gate.add(post);
	}
	const bar = new Mesh(new BoxGeometry(0.16, 0.16, 3.4), postMaterial);
	bar.position.y = 2.8;
	const curtain = new Mesh(new BoxGeometry(0.03, 2.6, 3.2), flat(palette.light, { transparent: true, opacity: 0.1, depthWrite: false }));
	curtain.position.y = 1.4;
	gate.add(bar, curtain);
	gate.position.x = FINISH;
	scene.add(gate);

	const ship = new Group();
	const hull = new Mesh(new CapsuleGeometry(0.4, 1.5, 8, 18), clay(palette.moverClay));
	hull.rotation.z = -Math.PI / 2;
	const dome = new Mesh(new SphereGeometry(0.3, 18, 14), clay(0xffffff));
	dome.position.set(0.35, 0.3, 0);
	const fin = new BoxGeometry(0.5, 0.06, 1.3);
	const wing = new Mesh(fin, clay(palette.mover));
	wing.position.set(-0.75, 0, 0);
	ship.add(hull, dome, wing);
	scene.add(ship);
	const shipShadow = blobShadow(2.2, 0.3);
	scene.add(shipShadow);

	const pulse = new Group();
	pulse.add(new Mesh(new SphereGeometry(0.34, 24, 16), flat(palette.light)), glow(palette.light, 2.2, 0.7));
	scene.add(pulse);
	const ghost = new Group();
	ghost.add(new Mesh(new SphereGeometry(0.52, 24, 16), flat(palette.ghost, { transparent: true, opacity: 0.4, depthWrite: false })));
	scene.add(ghost);

	const trails = new Tubes(2, palette.cream);
	scene.add(trails.mesh);

	const stationLabel = host.labels.add({ name: 'Station', tone: 'rest' });
	const shipLabel = host.labels.add({ name: 'Ship', value: '0.80 c', tone: 'mover', side: 'below' });
	const pulseLabel = host.labels.add({ name: 'Light pulse', value: 'c', tone: 'light' });
	const ghostLabel = host.labels.add({ name: 'Newton’s guess', value: '1.80 c', tone: 'ghost', side: 'below' });
	const finishLabel = host.labels.add({ name: 'Finish line', tone: 'plain' });
	const scaleLabel = host.labels.add({ name: '1 light-second', tone: 'plain', side: 'below' });

	let clock = 0;
	let lastRestart = params.restart;
	let flash = 0;
	let arrived = false;

	function pose(dt: number) {
		if (params.playing) {
			clock += dt;
			if (clock >= CYCLE) {
				clock -= CYCLE;
				arrived = false;
			}
		}
		// World time in station seconds: the pulse leaves the ship at t = 0, when the ship passes the station.
		const t = (clock - LEAD) / SLOWDOWN;
		const shipX = params.beta * LIGHT_SECOND * t;
		const pulseX = LIGHT_SECOND * Math.max(t, 0);
		const ghostX = (1 + params.beta) * LIGHT_SECOND * Math.max(t, 0);
		ship.position.set(shipX, LANE, 0);
		shipShadow.position.set(shipX, 0.06, 0);

		const fired = t >= 0;
		pulse.visible = fired && pulseX < FINISH + 3.4;
		pulse.position.set(pulseX, LANE, 0);
		const showGhost = params.ghost && fired && ghostX < FINISH + 5;
		ghost.visible = showGhost;
		ghost.position.set(ghostX, LANE, 0);

		if (!arrived && pulseX >= FINISH) {
			arrived = true;
			flash = 1;
		}
		flash = Math.max(0, flash - dt * 1.6);
		(curtain.material as MeshBasicMaterial).opacity = 0.1 + 0.55 * flash;

		trails.set(0, a.set(0, LANE, 0), b.set(pulseX, LANE, 0), 0.035, palette.light, 0.1);
		trails.set(1, a.set(0, LANE + 0.02, 0), b.set(ghostX, LANE + 0.02, 0), 0.03, palette.ghost, 0.35);
		trails.commit(fired ? (showGhost ? 2 : 1) : 0);

		fader.set(1 - Math.min(MathUtils.smoothstep(clock, 0, FADE), 1 - MathUtils.smoothstep(clock, CYCLE - FADE, CYCLE)));

		stationLabel.position.set(0, 4.7, -2.4);
		shipLabel.position.set(shipX, LANE - 0.75, 0);
		shipLabel.setValue(`${params.beta.toFixed(2)} c`);
		ghostLabel.setValue(`${(1 + params.beta).toFixed(2)} c`);
		pulseLabel.position.set(pulseX, LANE + 0.7, 0);
		ghostLabel.position.set(ghostX, LANE - 0.8, 0);
		const apart = pulseX - shipX > 3.4;
		pulseLabel.enabled = pulse.visible && apart;
		ghostLabel.enabled = showGhost && ghostX - shipX > 4;
		shipLabel.enabled = Math.abs(shipX) < FINISH + 4;
		finishLabel.position.set(FINISH, 4.6, 0);
		scaleLabel.position.set(LIGHT_SECOND * 1.5, 0.05, 2.2);

		return params.playing || flash > 0;
	}

	pose(0);

	return {
		scene,
		camera,
		rig: {
			yaw: -0.5,
			pitch: 0.45,
			target: [FINISH / 2, 1.1, 0],
			fit: { width: FINISH + 8, height: 5.4 },
			fov: 26,
			pitchRange: [0.04, 1.2]
		},
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				clock = 0;
				arrived = false;
			}
			return pose(dt);
		},
		dispose() {
			for (const tubes of [ruler, trails]) tubes.mesh.geometry.dispose();
			disposeTree(scene);
		}
	};
};
