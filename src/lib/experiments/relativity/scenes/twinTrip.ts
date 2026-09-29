import {
	BoxGeometry,
	CanvasTexture,
	CapsuleGeometry,
	Group,
	MathUtils,
	Mesh,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	SphereGeometry,
	Vector3,
	type SpriteMaterial
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { formatYears } from '../format';
import { seededRandom, twinTrip, twinTripAt } from '../physics';
import { palette } from '../palette';
import { Tubes, blobShadow, clay, disposeTree, flat, glow, studio } from '../engine/kit';
import type { SceneFactory } from '../engine/types';

export interface TwinTripParams {
	/** Distance to the star, light-years. */
	distance: number;
	/** Cruising speed, as a fraction of c. */
	beta: number;
	/** What to call the star; empty for "a star". */
	destination: string;
	/** How much of the round trip is done, 0 to 1. Written by the scene while playing, and by the scrubber. */
	progress: number;
	playing: boolean;
	restart: number;
}

export type TwinTripReadout = Record<string, never>;

/** Scene units between Earth and the star. */
const SPAN = 20;
const LEFT = -SPAN / 2;
/** Animation seconds for the whole round trip, and how long to linger at the end. */
const DURATION = 18;
const LINGER = 2.4;
const HEIGHT = 1.7;
const BAR_Z = 3.4;
const MAX_TICKS = 24;

/** A small world map: pale ocean with soft green continents, drawn once. */
function earthTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 256;
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#a8c8e2';
	context.fillRect(0, 0, 512, 256);
	const random = seededRandom(11);
	context.fillStyle = '#9cc189';
	for (let i = 0; i < 26; i++) {
		const x = random() * 512;
		const y = 30 + random() * 196;
		const size = 14 + random() * 44;
		context.beginPath();
		context.ellipse(x, y, size, size * (0.45 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
		context.fill();
		context.beginPath();
		context.ellipse(x + 512, y, size, size * 0.6, 0, 0, Math.PI * 2);
		context.fill();
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

export const createTwinTrip: SceneFactory<TwinTripParams, TwinTripReadout> = (host, params) => {
	const scene = new Scene();
	studio(scene, palette.lilac, { pool: 22, grid: 50, fog: [40, 100] });
	const camera = new PerspectiveCamera(26, 1, 0.1, 300);

	const map = earthTexture();
	const earth = new Mesh(new SphereGeometry(1.7, 48, 32), clay(0xffffff, { map, roughness: 0.9 }));
	earth.position.set(LEFT, HEIGHT, 0);
	const atmosphere = glow(palette.rest, 6.5, 0.35);
	atmosphere.position.copy(earth.position);
	const star = new Mesh(new SphereGeometry(1.15, 32, 20), flat(palette.light));
	star.position.set(-LEFT, HEIGHT, 0);
	const starGlow = glow(palette.light, 8.5, 0.6);
	starGlow.position.copy(star.position);
	scene.add(earth, atmosphere, star, starGlow);

	const ship = new Group();
	const hull = new Mesh(new CapsuleGeometry(0.3, 1.1, 8, 16), clay(palette.moverClay));
	hull.rotation.z = -Math.PI / 2;
	const dome = new Mesh(new SphereGeometry(0.22, 16, 12), clay(0xffffff));
	dome.position.set(0.3, 0.2, 0);
	const wing = new Mesh(new BoxGeometry(0.4, 0.05, 0.95), clay(palette.mover));
	wing.position.x = -0.55;
	const burn = glow(palette.light, 2.6, 0);
	burn.position.x = -0.9;
	ship.add(hull, dome, wing, burn);
	ship.scale.setScalar(1.35);
	scene.add(ship);

	const lines = new Tubes(2 + MAX_TICKS, palette.lilac);
	scene.add(lines.mesh);

	// Two bars on the floor, one per twin, that grow along the road as each one ages.
	const barGeometry = new RoundedBoxGeometry(1, 0.34, 0.62, 3, 0.1);
	const earthBar = new Mesh(barGeometry, clay(palette.restClay));
	const travelerBar = new Mesh(barGeometry, clay(palette.moverClay));
	scene.add(earthBar, travelerBar, blobShadow(1.4, 0.2));

	const earthLabel = host.labels.add({ name: 'Earth', tone: 'rest' });
	const starLabel = host.labels.add({ name: 'A star', value: '4.2 ly', tone: 'light' });
	const shipLabel = host.labels.add({ name: 'Traveler', tone: 'mover' });
	const earthBarLabel = host.labels.add({ name: 'Stay-at-home twin', value: '0 yr', tone: 'rest', side: 'above' });
	const travelerBarLabel = host.labels.add({ name: 'Traveling twin', value: '0 yr', tone: 'mover', side: 'below' });
	const turnLabel = host.labels.add({ name: 'Turnaround', tone: 'plain' });

	const a = new Vector3();
	const b = new Vector3();
	let hold = 0;
	let lastRestart = params.restart;
	let spin = 0;

	function pose(dt: number) {
		if (params.playing) {
			spin += dt * 0.12;
			if (params.progress >= 1) {
				hold += dt;
				if (hold > LINGER) {
					hold = 0;
					params.progress = 0;
				}
			} else {
				hold = 0;
				params.progress = Math.min(1, params.progress + dt / DURATION);
			}
		}
		earth.rotation.y = spin;

		const trip = twinTrip(params.distance, params.beta);
		const now = twinTripAt(params.distance, params.beta, params.progress);
		const shipX = LEFT + now.along * SPAN;
		const turning = MathUtils.smoothstep(params.progress, 0.46, 0.54);
		ship.position.set(shipX, HEIGHT, 0);
		ship.rotation.y = turning * Math.PI;
		const burning = 1 - Math.abs(turning - 0.5) * 2;
		(burn.material as SpriteMaterial).opacity = params.progress > 0.44 && params.progress < 0.56 ? 0.85 * burning : 0;
		burn.scale.setScalar(2.6 + burning * 1.2);

		// The road with a tick for every light-year.
		let segments = 0;
		lines.set(segments++, a.set(LEFT, HEIGHT, 0), b.set(-LEFT, HEIGHT, 0), 0.03, palette.muted, 0.35);
		const ticks = Math.min(MAX_TICKS, Math.floor(params.distance));
		for (let i = 1; i <= ticks; i++) {
			const x = LEFT + (i / params.distance) * SPAN;
			lines.set(segments++, a.set(x, HEIGHT - 0.22, 0), b.set(x, HEIGHT + 0.22, 0), 0.03, palette.muted, 0.2);
		}

		// Each twin's age, as a bar from the same starting line: the gap between the ends is the age difference.
		const earthLength = (now.earthYears / trip.earthYears) * SPAN;
		const travelerLength = (now.travelerYears / trip.earthYears) * SPAN;
		earthBar.scale.x = Math.max(earthLength, 0.001);
		earthBar.position.set(LEFT + earthLength / 2, 0.17, BAR_Z - 0.4);
		travelerBar.scale.x = Math.max(travelerLength, 0.001);
		travelerBar.position.set(LEFT + travelerLength / 2, 0.17, BAR_Z + 0.4);
		const showGap = earthLength - travelerLength > 1.8;
		if (showGap) {
			lines.set(segments++, a.set(LEFT + travelerLength, 0.4, BAR_Z + 0.4), b.set(LEFT + earthLength, 0.4, BAR_Z - 0.4), 0.06, palette.ghost);
		}
		lines.commit(segments);

		earthLabel.position.set(LEFT, HEIGHT + 2.5, 0);
		starLabel.set(params.destination || 'A star', `${params.distance.toFixed(1)} light-years`);
		starLabel.position.set(-LEFT, HEIGHT + 2.1, 0);
		shipLabel.position.set(shipX, HEIGHT + 1, 0);
		shipLabel.enabled = Math.abs(shipX - LEFT) > 3.2 && Math.abs(shipX + LEFT) > 3.2;
		earthBarLabel.set('Stay-at-home twin', formatYears(now.earthYears));
		earthBarLabel.position.set(LEFT + earthLength, 0.35, BAR_Z - 0.4);
		const younger = now.earthYears - now.travelerYears;
		travelerBarLabel.set('Traveling twin', showGap ? `${formatYears(now.travelerYears)} · ${formatYears(younger)} younger` : formatYears(now.travelerYears));
		travelerBarLabel.position.set(LEFT + travelerLength, 0, BAR_Z + 0.4);
		turnLabel.position.set(-LEFT, HEIGHT - 2.1, 0);
		turnLabel.enabled = params.progress > 0.44 && params.progress < 0.6;

		return params.playing;
	}

	pose(0);

	return {
		scene,
		camera,
		rig: {
			yaw: 0.14,
			pitch: 0.42,
			target: [0, 0.6, 1.4],
			fit: { width: SPAN + 8.5, height: 8 },
			fov: 26,
			pitchRange: [0.04, 1.25]
		},
		update(dt) {
			if (params.restart !== lastRestart) {
				lastRestart = params.restart;
				params.progress = 0;
				hold = 0;
			}
			return pose(dt);
		},
		dispose() {
			lines.mesh.geometry.dispose();
			map.dispose();
			disposeTree(scene);
		}
	};
};
