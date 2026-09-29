import {
	BoxGeometry,
	Color,
	EdgesGeometry,
	Group,
	InstancedMesh,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Scene,
	SphereGeometry,
	Vector3
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { formatMicroseconds } from '../format';
import { MUON_HEIGHT_M, gamma, muonDecayLength, muonTrip, seededRandom } from '../physics';
import { palette } from '../palette';
import { Fader, Tubes, blobShadow, clay, disposeTree, flat, glow, shade, studio } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface MuonsParams {
	/** Muon speed as a fraction of c. */
	beta: number;
	/** Whether time dilation and length contraction exist. Off is the "what if" that shows why they are needed. */
	relativity: boolean;
	playing: boolean;
	restart: number;
}

export interface MuonsReadout {
	/** Muons that have reached the ground so far in this shower. */
	landed: number;
}

export const MUON_COUNT = 300;
/** Draw that decides whether the highlighted muon survives. */
const HERO_DRAW = 0.02;

const HEIGHT = 10;
const FOOT = 3.6;
const TALL_X = -3.6;
const SHORT_X = 3.7;
/** Animation seconds a muon takes to fall the whole way, how long the shower is staggered over, and the pause at the end. */
const FALL = 5.5;
const SPREAD = 3.5;
const HERO_START = 0.6;
const POP = 0.55;
const CYCLE = SPREAD + FALL + 2.4;

export const createMuons: SceneFactory<MuonsParams, MuonsReadout> = (host, params, readout) => {
	const scene = new Scene();
	studio(scene, palette.peach, { pool: 16, fog: [40, 100] });
	const camera = new PerspectiveCamera(26, 1, 0.1, 300);
	const fader = new Fader(scene, camera, palette.peach);

	const floor = new Mesh(new RoundedBoxGeometry(13.2, 0.4, 5.6, 3, 0.08), clay(shade(palette.sage, 0.97)));
	floor.position.set(0, -0.2, 0);
	scene.add(floor, blobShadow(8, 0.16));

	// Two columns of atmosphere: the ground's view at full height, and the muon's view, squashed.
	const unit = new BoxGeometry(1, 1, 1);
	const edges = new EdgesGeometry(unit);
	const glass = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false });
	const outline = new LineBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.32 });
	const column = (x: number) => {
		const group = new Group();
		group.add(new Mesh(unit, glass), new LineSegments(edges, outline));
		group.position.x = x;
		group.scale.set(FOOT, 1, FOOT);
		scene.add(group);
		return group;
	};
	const tall = column(TALL_X);
	const short = column(SHORT_X);
	tall.scale.y = HEIGHT;

	const pad = new Mesh(new RoundedBoxGeometry(FOOT, 0.14, FOOT, 2, 0.05), clay(palette.moverClay));
	pad.position.set(TALL_X, 0.07, 0);
	scene.add(pad);

	// The shower. Each muon draws its own fate once, so it decays at the same place on every loop.
	const random = seededRandom(5);
	const startOffset = new Float32Array(MUON_COUNT);
	const px = new Float32Array(MUON_COUNT);
	const pz = new Float32Array(MUON_COUNT);
	const draw = new Float32Array(MUON_COUNT);
	for (let i = 0; i < MUON_COUNT; i++) {
		startOffset[i] = random() * SPREAD;
		px[i] = TALL_X + (random() - 0.5) * FOOT * 0.9;
		pz[i] = (random() - 0.5) * FOOT * 0.9;
		draw[i] = random();
	}
	const falling = new InstancedMesh(new SphereGeometry(0.1, 10, 8), flat(palette.muon), MUON_COUNT);
	const puffs = new InstancedMesh(new SphereGeometry(1, 12, 8), flat(0xffffff), MUON_COUNT);
	falling.frustumCulled = puffs.frustumCulled = false;
	scene.add(falling, puffs);

	const hero = { tall: new Group(), short: new Group() };
	for (const group of [hero.tall, hero.short]) {
		group.add(new Mesh(new SphereGeometry(0.24, 24, 16), flat(palette.muon)), glow(palette.muon, 2, 0.6));
		scene.add(group);
	}
	const heroPuff = new Mesh(new SphereGeometry(1, 16, 12), flat(palette.ghost, { transparent: true, opacity: 0.6, depthWrite: false }));
	heroPuff.visible = false;
	scene.add(heroPuff);

	const rulers = new Tubes(2, palette.peach);
	scene.add(rulers.mesh);

	const tallLabel = host.labels.add({ name: 'Ground’s view', value: '15 km', tone: 'rest' });
	const shortLabel = host.labels.add({ name: 'Muon’s view', value: '1.5 km', tone: 'muon' });
	const heroLabel = host.labels.add({ name: 'Muon’s clock', value: '0.0 μs', tone: 'muon', side: 'right' });
	const groundClockLabel = host.labels.add({ name: 'Ground clock', value: '0.0 μs', tone: 'rest', side: 'right' });
		const detectorLabel = host.labels.add({ name: 'Reached the ground', value: `0 of ${MUON_COUNT}`, tone: 'mover', side: 'below' });

	const matrix = new Matrix4();
	const color = new Color();
	const tint = new Color(palette.peach);
	const decay = new Color(palette.ghost);
	const landing = new Color(palette.mover);
	const a = new Vector3();
	const b = new Vector3();
	let clock = 0;
	let lastRestart = params.restart;
	let contraction = 1;
	let landed = -1;

	function pose(dt: number) {
		if (params.playing) {
			clock += dt;
			if (clock >= CYCLE) clock -= CYCLE;
		}
		const dilated = params.relativity;
		const g = dilated ? gamma(params.beta) : 1;
		const meanLength = muonDecayLength(params.beta, dilated);
		const trip = muonTrip(params.beta);
		const targetContraction = 1 / g;
		contraction += (targetContraction - contraction) * (host.reducedMotion() ? 1 : 1 - Math.exp(-dt * 6));
		if (Math.abs(targetContraction - contraction) < 0.0005) contraction = targetContraction;
		const shortHeight = HEIGHT * contraction;
		short.scale.y = shortHeight;
		tall.position.y = HEIGHT / 2;
		short.position.y = shortHeight / 2;

		let count = 0;
		for (let i = 0; i < MUON_COUNT; i++) {
			// How far down the column this muon has gone, and how far it gets: a muon whose draw is u decays after -length·ln(u).
			const progress = (clock - startOffset[i]) / FALL;
			const reach = (-meanLength * Math.log(draw[i])) / MUON_HEIGHT_M;
			const survivor = reach >= 1;
			const stop = Math.min(reach, 1);
			const flying = progress >= 0 && progress < stop;
			const sincePop = (progress - stop) * FALL;
			if (flying) {
				falling.setMatrixAt(i, matrix.makeTranslation(px[i], HEIGHT * (1 - progress), pz[i]));
			} else falling.setMatrixAt(i, matrix.makeScale(0, 0, 0));

			if (progress >= stop && sincePop < POP) {
				const t = sincePop / POP;
				const size = (survivor ? 0.12 : 0.07) + t * (survivor ? 0.42 : 0.24);
				matrix.makeScale(size, size, size).setPosition(px[i], HEIGHT * (1 - stop), pz[i]);
				puffs.setMatrixAt(i, matrix);
				puffs.setColorAt(i, color.copy(survivor ? landing : decay).lerp(tint, t * t));
			} else puffs.setMatrixAt(i, matrix.makeScale(0, 0, 0));
			if (survivor && progress >= 1) count++;
		}
		falling.instanceMatrix.needsUpdate = true;
		puffs.instanceMatrix.needsUpdate = true;
		if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
		if (count !== landed) {
			landed = count;
			readout.landed = count;
			detectorLabel.setValue(`${count} of ${MUON_COUNT}`);
		}

		// One muon, followed in both views. It decays where its draw says it does.
		const heroReach = (-meanLength * Math.log(HERO_DRAW)) / MUON_HEIGHT_M;
		const heroProgress = MathUtils.clamp((clock - HERO_START) / FALL, 0, 1);
		const heroStop = Math.min(heroReach, 1);
		const journey = Math.min(heroProgress, heroStop);
		const heroAlive = heroProgress < heroStop || heroReach >= 1;
		const heroSincePop = (heroProgress - heroStop) * FALL;
		const started = clock >= HERO_START;
		hero.tall.visible = started && heroAlive;
		hero.short.visible = started && heroAlive;
		hero.tall.position.set(TALL_X, HEIGHT * (1 - journey), 0);
		hero.short.position.set(SHORT_X, shortHeight * (1 - journey), 0);
		const popping = heroReach < 1 && heroProgress >= heroStop && heroSincePop < POP * 1.6;
		heroPuff.visible = popping;
		if (popping) {
			const t = heroSincePop / (POP * 1.6);
			heroPuff.position.set(TALL_X, HEIGHT * (1 - heroStop), 0);
			heroPuff.scale.setScalar(0.3 + t * 0.9);
			(heroPuff.material as MeshBasicMaterial).opacity = 0.6 * (1 - t);
		}

		// Rulers show each column's height.
		rulers.set(0, a.set(TALL_X - FOOT / 2 - 0.5, 0, FOOT / 2), b.set(TALL_X - FOOT / 2 - 0.5, HEIGHT, FOOT / 2), 0.035, palette.muted, 0.2);
		rulers.set(1, a.set(SHORT_X + FOOT / 2 + 0.5, 0, FOOT / 2), b.set(SHORT_X + FOOT / 2 + 0.5, shortHeight, FOOT / 2), 0.035, palette.muted, 0.2);
		rulers.commit(2);

		const kilometres = MUON_HEIGHT_M / 1000;
		tallLabel.position.set(TALL_X, HEIGHT + 0.4, 0);
		tallLabel.setValue(`${kilometres} km tall`);
		shortLabel.position.set(SHORT_X, shortHeight + 0.4, 0);
		shortLabel.setValue(`${(kilometres * contraction).toFixed(1)} km tall`);

		// Without relativity there is one clock; with it, the muon's own clock runs slow against the ground's.
		const muonNow = (dilated ? trip.muonSeconds : trip.groundSeconds) * journey;
		const groundNow = trip.groundSeconds * journey;
		const showClocks = started && (heroAlive || heroReach < 1);
		groundClockLabel.position.set(TALL_X + FOOT / 2 + 0.3, HEIGHT * 0.72, 0);
		groundClockLabel.setValue(formatMicroseconds(groundNow));
		groundClockLabel.enabled = showClocks;
		heroLabel.position.set(TALL_X + FOOT / 2 + 0.3, HEIGHT * 0.72 - 1.15, 0);
		heroLabel.setValue(formatMicroseconds(muonNow));
		heroLabel.enabled = showClocks;
		detectorLabel.position.set(TALL_X, 0, FOOT / 2);
		fader.set(1 - Math.min(MathUtils.smoothstep(clock, 0, 0.4), 1 - MathUtils.smoothstep(clock, CYCLE - 0.4, CYCLE)));

		return params.playing || Math.abs(targetContraction - contraction) > 0.0005;
	}

	pose(0);

	return {
		scene,
		camera,
		rig: {
			yaw: 0.28,
			pitch: 0.24,
			target: [0, 5.3, 0],
			fit: { width: 15.5, height: 14.4 },
			fov: 26,
			pitchRange: [0.03, 1.2]
		},
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				clock = 0;
			}
			return pose(dt);
		},
		dispose() {
			for (const mesh of [falling, puffs]) mesh.geometry.dispose();
			rulers.mesh.geometry.dispose();
			unit.dispose();
			edges.dispose();
			glass.dispose();
			outline.dispose();
			disposeTree(scene);
		}
	};
};
