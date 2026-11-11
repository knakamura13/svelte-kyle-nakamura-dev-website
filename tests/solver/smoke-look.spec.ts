import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Color, Fog, Scene } from 'three';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan, type Raster } from '../../src/lib/experiments/airflow/homes/rasterize';
import { puffWeights } from '../../src/lib/experiments/airflow/scene/air/birth';
import { roomAverages, smokeExcess, volumeRooms, withSmoke } from '../../src/lib/experiments/airflow/scene/air/excess';
import { SMOKE_LOOK, smokeBounds } from '../../src/lib/experiments/airflow/scene/air/smokeVolume';
import { Lighting, SUN } from '../../src/lib/experiments/airflow/scene/look/lighting';
import { SMOKY_DAY, hazeAt, smokyDay, throughLayer } from '../../src/lib/experiments/airflow/scene/look/smokyDay';
import { roomStats } from '../../src/lib/experiments/airflow/solver/cpu/readouts';
import { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { FLOW_STRIDE, SCALAR_STRIDE, extractVolume, volumeSpec, type Volume } from '../../src/lib/experiments/airflow/solver/volume';
import { ppmFromUgPerM3 } from '../../src/lib/experiments/airflow/units';

/**
 * How smoke is drawn (#94): indoors only the PM2.5 above each Room's average (`scene/air/excess.ts`), so smoke spread evenly draws
 * nothing and a release on top of it draws as it would in clean air; outdoors the sky and the far lawn haze over by the visibility
 * the outdoor PM2.5 gives, and the sun dims and warms (`scene/look/smokyDay.ts`, figures in
 * `docs/research/airflow/smoke-and-visibility.md`).
 */

const H = 0.15;
const SMOKY = ppmFromUgPerM3(150);

/** A still volume of `raster`'s own grid whose PM2.5 is `ppm(x, y, z)` at each cell centre of air. */
function volumeOf(raster: Raster, ppm: (x: number, y: number, z: number) => number): Volume {
	const spec = volumeSpec(raster.spec, Infinity);
	const cells = spec.nx * spec.ny * spec.nz;
	const flow = new Float32Array(FLOW_STRIDE * cells);
	const scalars = new Float32Array(SCALAR_STRIDE * cells);
	const grid = new Grid(raster.spec);
	for (let k = 0, n = 0; k < spec.nz; k++)
		for (let j = 0; j < spec.ny; j++)
			for (let i = 0; i < spec.nx; i++, n++) {
				if (!raster.geometry.fluid[grid.index(i, j, k)]) continue;
				flow[FLOW_STRIDE * n + 3] = 1;
				scalars[SCALAR_STRIDE * n + 1] = ppm((i + 0.5) * H, (j + 0.5) * H, (k + 0.5) * H);
			}
	return { ...spec, flow, scalars };
}

/** The two-bedroom's PM2.5 on the solver's own grid, as a field over it, and the volume a coarser read of it makes. */
function coarseRead(raster: Raster, ppm: (x: number, y: number, z: number) => number, budget: number) {
	const grid = new Grid(raster.spec);
	const particulates = new Float32Array(grid.size);
	const theta = new Float32Array(grid.size);
	const zero = { u: new Float32Array(grid.size), v: new Float32Array(grid.size), w: new Float32Array(grid.size) };
	for (let k = 0; k < raster.spec.nz; k++)
		for (let j = 0; j < raster.spec.ny; j++)
			for (let i = 0; i < raster.spec.nx; i++) particulates[grid.index(i, j, k)] = ppm((i + 0.5) * H, (j + 0.5) * H, (k + 0.5) * H);
	const volume = extractVolume(grid, raster.geometry, zero, theta, particulates, volumeSpec(raster.spec, budget));
	return { grid, volume, particulates, theta, zero };
}

test.describe('the smoke that is drawn indoors', () => {
	const raster = rasterizePlan(planById('two-bedroom')!, H, { furniture: true });

	test('smoke spread evenly through the home draws nothing: no box to march, no puffs, no smoke in any cell', () => {
		const even = volumeOf(raster, () => SMOKY);
		const rooms = volumeRooms(even, raster);
		const excess = smokeExcess(even, rooms);
		expect(Math.max(...excess), 'the most smoke drawn in any cell, ppm').toBe(0);
		const drawn = withSmoke(even, excess);
		expect(smokeBounds([drawn])).toBeNull();
		expect(puffWeights(drawn, raster, SMOKE_LOOK.dense, SMOKE_LOOK.decades).total).toBe(0);
		// The PM2.5 itself is untouched: the Smoke overlay and the probes read it.
		expect(even.scalars[SCALAR_STRIDE * excess.findIndex((_, n) => even.flow[FLOW_STRIDE * n + 3] > 0) + 1]).toBe(Math.fround(SMOKY));
		// It was drawn before: the same field as the volume once saw it.
		expect(smokeBounds([even])).not.toBeNull();
	});

	test('smoke at a different level in each room, each spread evenly, draws nothing either', () => {
		const rooms = volumeRooms(volumeOf(raster, () => 0), raster);
		const level = new Map<number, number>();
		const nx1 = raster.spec.nx + 1;
		const nxy1 = (raster.spec.nx + 1) * (raster.spec.ny + 1);
		const roomAt = (x: number, y: number, z: number) => raster.geometry.room[Math.floor(x / H) + nx1 * Math.floor(y / H) + nxy1 * Math.floor(z / H)];
		const volume = volumeOf(raster, (x, y, z) => {
			const r = roomAt(x, y, z);
			if (!level.has(r)) level.set(r, SMOKY * (0.2 + 0.3 * level.size));
			return level.get(r)!;
		});
		expect(level.size, 'rooms with their own level').toBeGreaterThan(3);
		const excess = smokeExcess(volume, rooms);
		expect(Math.max(...excess)).toBe(0);
	});

	test('a release on top of a smoky room draws as the same release does in clean air', () => {
		const burst = (x: number, y: number, z: number) => (Math.hypot(x - 2.4, y - 1.2, z - 4.2) < 0.45 ? 0.6 : 0);
		const clean = volumeOf(raster, burst);
		const smoky = volumeOf(raster, (x, y, z) => SMOKY + burst(x, y, z));
		const rooms = volumeRooms(clean, raster);
		const inClean = smokeExcess(clean, rooms);
		const onSmoke = smokeExcess(smoky, rooms);
		let core = 0;
		let apart = 0;
		for (let n = 0; n < onSmoke.length; n++) {
			apart = Math.max(apart, Math.abs(onSmoke[n] - inClean[n]));
			if (inClean[n] > 0.5) core++;
		}
		// The Room's average takes in the release too, by the same amount in both, so the two differ by nothing but rounding.
		expect(apart, 'the most the two differ in any cell, ppm').toBeLessThan(1e-6);
		expect(core, 'cells in the release’s core').toBeGreaterThan(20);
		expect(smokeBounds([withSmoke(smoky, onSmoke)])).toEqual(smokeBounds([withSmoke(clean, inClean)]));
	});

	test('each Room’s average is the Physics panel’s, from a volume coarser than the solver’s grid', () => {
		// Smoke that varies across the home, through the doorways too.
		const field = (x: number, y: number, z: number) => SMOKY * (1 + 0.5 * Math.sin(x * 1.3) + 0.2 * y + 0.1 * Math.cos(z));
		const { grid, volume, particulates, theta, zero } = coarseRead(raster, field, 8_000);
		expect(volume.sx * volume.sy * volume.sz, 'solver cells to a volume cell').toBeGreaterThan(1);
		const averages = roomAverages(volume, volumeRooms(volume, raster));
		const panel = roomStats(grid, raster.geometry, zero, theta, particulates);
		// A volume cell that straddles two Rooms at a doorway is shared by its air in each, which leaves each average within 1%.
		panel.forEach((room, r) => expect(Math.abs(averages[r + 1] / room.particulates - 1), `room ${raster.roomNames[r]}`).toBeLessThan(0.01));
	});
});

test.describe('a smoky day outside', () => {
	test('the visibility is the Koschmieder range of the sourced extinction: about 5.8 km at the Smoky preset', () => {
		const day = smokyDay(150, SUN.elevation);
		expect(day.extinction).toBeCloseTo(SMOKY_DAY.massExtinction * 150e-6, 12);
		expect(day.visibility / 1000).toBeCloseTo(5.8, 1);
		// A 4 m room of it dims what is behind it by about 0.3%, which is why the volume leaves even smoke out.
		expect(1 - Math.exp(-day.extinction * 4)).toBeCloseTo(0.0027, 4);
		expect(smokyDay(0, SUN.elevation).visibility).toBe(Infinity);
	});

	test('the sun dims and warms with the outdoor PM2.5, and the sky’s light grows with what the smoke scatters down', () => {
		const clean = smokyDay(0, SUN.elevation);
		expect(clean.sun).toEqual([1, 1, 1]);
		expect(clean.sky).toBe(1);
		let last = clean;
		for (const pm of [5, 35, 150, 350]) {
			const day = smokyDay(pm, SUN.elevation);
			expect(day.sun[1], `${pm} µg/m³: dimmer`).toBeLessThan(last.sun[1]);
			expect(day.sun[0] / day.sun[2], `${pm} µg/m³: warmer (red over blue)`).toBeGreaterThan(last.sun[0] / last.sun[2]);
			expect(day.sky).toBeGreaterThan(last.sky);
			last = day;
		}
		const smoky = smokyDay(150, SUN.elevation);
		expect(smoky.sun[1]).toBeCloseTo(0.27, 2);
		expect(smoky.sun.map((s) => +s.toFixed(2))).toEqual([0.33, 0.27, 0.17]);
	});

	test('the sky is hazed through the smoke’s depth at each elevation: half straight up and all of it at the horizon at 150 µg/m³', () => {
		const day = smokyDay(150, SUN.elevation);
		expect(throughLayer(day.depth[1], 90)).toBeCloseTo(0.51, 2);
		expect(throughLayer(day.depth[1], 10)).toBeLessThan(0.03);
		expect(throughLayer(day.depth[1], 0)).toBeLessThan(1e-6);
		// The far lawn: the clean fog, and the smoke over what it leaves, a few percent more at the lawn's edge.
		expect(hazeAt(90, 34, 150, 0)).toBeCloseTo(56 / 116, 9);
		expect(hazeAt(90, 34, 150, day.extinction) - hazeAt(90, 34, 150, 0)).toBeCloseTo(0.03, 2);
	});

	test('clean air leaves the light exactly as it was, and the smoke goes as it came', () => {
		const scene = new Scene();
		const lighting = new Lighting(scene);
		const snapshot = () => {
			const fill = scene.children.find((c) => c.type === 'HemisphereLight') as unknown as { color: Color; groundColor: Color; intensity: number };
			const fog = scene.fog as Fog;
			const haze = scene.getObjectByName('sky-haze')!;
			return JSON.stringify({
				sun: lighting.sun.color.toArray(),
				intensity: lighting.sun.intensity,
				fill: [fill.color.toArray(), fill.groundColor.toArray(), fill.intensity],
				fog: [fog.color.toArray(), fog.near, fog.far],
				haze: haze.visible
			});
		};
		const before = snapshot();
		expect(JSON.parse(before).haze).toBe(false);
		lighting.setSmoke(0);
		expect(snapshot()).toBe(before);
		lighting.setSmoke(150);
		const smoky = JSON.parse(snapshot());
		expect(smoky.haze).toBe(true);
		expect(smoky.sun[2]).toBeLessThan(JSON.parse(before).sun[2] * 0.2);
		expect(smoky.fog[2], 'the fog reaches its end sooner').toBeLessThan(150);
		lighting.setSmoke(0);
		expect(snapshot()).toBe(before);
		lighting.dispose();
	});

	test('the explainer gives the visibility and the room’s dimming the code works out', () => {
		const explainer = readFileSync(resolve(import.meta.dirname, '../../src/lib/experiments/airflow/ui/Explainer.svelte'), 'utf8').replace(/\s+/g, ' ');
		const day = smokyDay(150, SUN.elevation);
		expect(explainer).toContain(`about ${Math.round(day.visibility / 1000)}&nbsp;km at 150&nbsp;µg/m³`);
		expect(explainer).toContain(`dims a 4&nbsp;m room by about ${(100 * (1 - Math.exp(-day.extinction * 4))).toFixed(1)}&nbsp;%`);
		expect(explainer).toContain(`${SMOKY_DAY.massExtinction}&nbsp;m² for each gram`);
	});
});
