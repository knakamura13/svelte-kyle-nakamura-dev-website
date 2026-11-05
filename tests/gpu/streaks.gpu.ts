import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The streaks' particles on a real GPU (scene/air/particles.ts): the advection shader, run in WebGL2, moves them exactly along a known
 * uniform air, never through a closed face (they slide along a wall instead), and lets them out through an open window, after which
 * they fade and are born again.
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'streaks.ts');
});

interface Particle {
	born: number[];
	at: number[];
	age: number;
	life: number;
	generation: number;
	outside: number;
}

const run = (options: Record<string, unknown>) => page.evaluate((o) => (window as any).streaks.run(o), options) as Promise<{ particles: Particle[]; error: number }>;

test('in a uniform air, every streak moves by the velocity times the time, and its age counts the time', async () => {
	const velocity: [number, number, number] = [0.5, 0.12, -0.2];
	const at: [number, number, number] = [1.0, 1.0, 2.5];
	const frames = 30;
	const dt = 1 / 60;
	const { particles, error } = await run({ velocity, at, frames, dt });
	expect(error).toBe(0);
	expect(particles).toHaveLength(256);
	for (const p of particles) {
		expect(p.generation, 'born once').toBe(1);
		expect(p.born.slice(0, 3)).toEqual(at.map((x) => expect.closeTo(x, 5)));
		for (let a = 0; a < 3; a++) expect(p.at[a]).toBeCloseTo(at[a] + velocity[a] * frames * dt, 4);
		expect(p.age).toBeCloseTo(frames * dt, 4);
	}
});

test('a fast streak takes substeps, and lands where the air takes it all the same', async () => {
	// 3 m/s for 50 ms is 1.5 cells a frame: the shader splits each frame so that no substep crosses more than one face.
	const { particles } = await run({ velocity: [3, 0, 0], at: [0.55, 1.2, 2.0], frames: 10, dt: 0.05 });
	for (const p of particles) expect(p.at[0]).toBeCloseTo(0.55 + 1.5, 3);
});

test('a streak never crosses a closed face: at a wall it stops and slides along it', async () => {
	// A wall across the box at x = 2 m (faces of plane 20); the air pushes east into it and a little south.
	const { particles } = await run({ velocity: [1, 0, 0.3], at: [1.5, 1.2, 1.0], frames: 60, dt: 1 / 60, wall: 20 });
	for (const p of particles) {
		expect(p.at[0], 'held on the near side of the wall').toBeLessThan(2.0);
		expect(p.at[0], 'right up against it').toBeGreaterThan(1.95);
		expect(p.at[2], 'still carried along it').toBeCloseTo(1.3, 3);
	}
});

test('the box keeps streaks in unless an Opening is open: through a window they leave, then fade and are born again', async () => {
	// Westward air. The west side is open for z from 1.0 to 2.0 m only.
	const window: [number, number] = [10, 20];
	const shut = await run({ velocity: [-1, 0, 0], at: [0.3, 1.2, 3.0], frames: 30, dt: 1 / 60, window });
	for (const p of shut.particles) {
		expect(p.at[0], 'held inside a shut wall of the box').toBeGreaterThan(0);
		expect(p.at[0]).toBeLessThan(0.01);
	}
	const open = await run({ velocity: [-1, 0, 0], at: [0.3, 1.2, 1.5], frames: 30, dt: 1 / 60, window });
	for (const p of open.particles) {
		expect(p.at[0], 'out through the window').toBeCloseTo(0.3 - 0.5, 3);
		expect(p.outside).toBeGreaterThan(0.15);
	}
	// Outside for longer than its grace (0.3 s), a streak fades out over 0.5 s and is then born again at the birth point.
	const later = await run({ velocity: [-1, 0, 0], at: [0.3, 1.2, 1.5], frames: 90, dt: 1 / 60, window });
	for (const p of later.particles) expect(p.generation, 'born again').toBe(2);
});
