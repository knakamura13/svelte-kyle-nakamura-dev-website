import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { BAD_FPS, BAD_KEEP, CELL_SIZES, GOOD_FPS, MAX_CELLS, START_BUDGET, WARMUP, WINDOW, Tuner, cellsOf, type BackendKind, type FrameSample } from '../../src/lib/experiments/airflow/sim/tuner';

/**
 * The tuner's decisions, with made-up frames: a device is a function from the cells of the grid to how fast the page draws and how
 * much of real time the solver keeps up with, and the loop does what the session does, rebuilding at the size it is told to.
 */

const plan = (id: string) => plans.find((p) => p.id === id)!;
const studio = plan('studio');
const house = plan('house');
const twoBedroom = plan('two-bedroom');

interface Perf {
	fps: number;
	rate: number | null;
	paused?: boolean;
}

/** A device that holds `capacity` cells: fine up to it, and past it both the frame rate and the solver's share of real time fall in proportion. */
const device = (capacity: number) => (cells: number): Perf => (cells <= capacity ? { fps: 60, rate: 1 } : { fps: Math.max(2, (60 * capacity) / cells), rate: capacity / cells });

interface Change {
	at: number;
	size: number;
	cells: number;
}

/** Runs `seconds` of drawn frames against `perf`. Returns every size the world had, with when it started and the messages the tuner gave. */
function drive(tuner: Tuner, home: typeof house, seconds: number, perf: (cells: number, t: number) => Perf, from = 0) {
	const sizes: Change[] = [];
	const messages: string[] = [];
	let h = tuner.pick(home);
	sizes.push({ at: from, size: h, cells: cellsOf(home, h) });
	let t = from;
	while (t < from + seconds) {
		const cells = cellsOf(home, h);
		const { fps, rate, paused = false } = perf(cells, t);
		const dt = 1 / fps;
		t += dt;
		const retune = tuner.observe({ dt, rate, paused });
		if (retune) {
			messages.push(retune.message);
			h = tuner.pick(home);
			expect(h, 'the world is rebuilt at the size the tuner named').toBe(retune.size);
			sizes.push({ at: t, size: h, cells: cellsOf(home, h) });
		}
	}
	return { sizes, messages, t };
}

test.describe('the auto-tuner', () => {
	test('the sizes are divisors of 0.6, so a Home’s box is its footprint, and every Home has a whole number of cells at each', () => {
		for (const h of CELL_SIZES) {
			expect(Math.round(0.6 / h) * h, `${h} divides 0.6`).toBeCloseTo(0.6, 9);
			for (const p of plans) {
				for (const side of [p.width, p.depth, p.ceiling]) expect(Math.abs(side / h - Math.round(side / h)), `${p.id}: ${side} m at ${h} m cells`).toBeLessThan(1e-9);
			}
		}
		expect([...CELL_SIZES]).toEqual([...CELL_SIZES].sort((a, b) => b - a));
	});

	test('a phone or a small tablet gets the coarsest grid for every Home, a note, and is never measured', () => {
		for (const kind of ['webgpu', 'cpu'] as BackendKind[]) {
			const tuner = new Tuner({ kind, small: true });
			expect(tuner.note).toMatch(/best on a laptop/i);
			for (const p of plans) expect(tuner.pick(p), `${kind} ${p.id}`).toBe(CELL_SIZES[0]);
			const { sizes } = drive(tuner, house, 120, device(1e9));
			expect(sizes, 'it never changes').toHaveLength(1);
			expect(tuner.isSettled).toBe(true);
		}
	});

	test('the first world is the finest grid that fits the starting budget of its backend', () => {
		const gpu = new Tuner({ kind: 'webgpu' });
		expect(gpu.pick(studio)).toBe(0.1);
		expect(gpu.pick(plan('one-bedroom'))).toBe(0.15);
		expect(gpu.pick(twoBedroom)).toBe(0.15);
		expect(gpu.pick(house)).toBe(0.15);
		const cpu = new Tuner({ kind: 'cpu' });
		expect(cpu.pick(house)).toBe(0.2);
		expect(cpu.pick(studio)).toBe(0.15);
		for (const kind of ['webgpu', 'cpu'] as const) {
			const tuner = new Tuner({ kind });
			for (const p of plans) expect(cellsOf(p, tuner.pick(p)), `${kind} ${p.id} stays inside the budget unless even the coarsest does not`).toBeLessThanOrEqual(Math.max(START_BUDGET[kind], cellsOf(p, CELL_SIZES[0])));
		}
	});

	test('a device with room to spare climbs one size at a time to the finest grid its backend allows, and stops', () => {
		for (const [home, finest] of [
			[studio, 0.075],
			[house, 0.075]
		] as const) {
			const tuner = new Tuner({ kind: 'webgpu' });
			const { sizes, messages } = drive(tuner, home, 120, device(1e9));
			expect(sizes[sizes.length - 1].size, `${home.id} ends on the finest size`).toBe(finest);
			expect(cellsOf(home, finest)).toBeLessThanOrEqual(MAX_CELLS.webgpu);
			const steps = sizes.map((s) => s.size);
			for (let n = 1; n < steps.length; n++) expect(steps[n], 'each try is the next finer size').toBeLessThan(steps[n - 1]);
			expect(messages.every((m) => /finer grid/.test(m))).toBe(true);
			expect(tuner.isSettled).toBe(true);
		}
		// The worker's limit is far below what the finest grids need.
		const cpu = new Tuner({ kind: 'cpu' });
		const { sizes } = drive(cpu, plan('one-bedroom'), 120, device(1e9));
		expect(sizes.map((s) => s.size)).toEqual([0.2, 0.15]);
		expect(cellsOf(plan('one-bedroom'), 0.1), 'and 0.1 m would be past it').toBeGreaterThan(MAX_CELLS.cpu);
	});

	test('a try that is too much steps back by the size of the shortfall, ends the climb, and the cells that failed are never tried again', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		const { sizes, messages } = drive(tuner, house, 300, device(150_000));
		// 0.15 m (98,304 cells) holds; 0.1 m (331,776) does not: back to 0.15 for good.
		expect(sizes.map((s) => s.size)).toEqual([0.15, 0.1, 0.15]);
		expect(messages).toHaveLength(2);
		// 0.1 m drew at 27 frames a second, which is under the bad mark, so that is what the message gives as the reason.
		expect(messages[1]).toBe('Restarted on a coarser grid: the page ran at 27 frames a second.');
		expect(tuner.isSettled).toBe(true);
		// Every change came in the first half minute, and nothing moved in the last four minutes.
		expect(sizes[sizes.length - 1].at).toBeLessThan(30);
	});

	test('it learns a budget in cells, so the next Home fits it from the first frame', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		drive(tuner, house, 120, device(150_000));
		expect(tuner.cellBudget).toBeLessThanOrEqual(150_000);
		// The studio at 0.1 m has 101,088 cells and the budget is under that, so the studio runs 0.15 m, not the 0.1 m it started at.
		expect(tuner.pick(studio)).toBe(0.15);
		expect(tuner.pick(twoBedroom)).toBe(0.15);
		expect(cellsOf(twoBedroom, tuner.pick(twoBedroom))).toBeLessThanOrEqual(tuner.cellBudget);
	});

	test('whatever the device holds, the tuner settles within half a minute on at most one size from the best that holds, and never moves again in five minutes', () => {
		for (const kind of ['webgpu', 'cpu'] as BackendKind[])
			for (const home of plans)
				for (const capacity of [3_000, 9_000, 15_000, 30_000, 60_000, 120_000, 250_000, 500_000, 2_000_000]) {
					const tuner = new Tuner({ kind });
					const { sizes } = drive(tuner, home, 300, device(capacity));
					const last = sizes[sizes.length - 1];
					const label = `${kind} ${home.id} holding ${capacity} cells: ${sizes.map((s) => s.size).join(' > ')}`;
					expect(last.at, `${label}: settles early`).toBeLessThan(60);
					expect(sizes.length, `${label}: few rebuilds`).toBeLessThanOrEqual(5);
					// The finest size that holds, within the backend's own limit, and the finest that holds well enough (a solver at 80% of real time or better is left alone).
					const finestWithin = (cells: number) => {
						const fits = CELL_SIZES.filter((h) => cellsOf(home, h) <= Math.min(cells, MAX_CELLS[kind]));
						return fits.length ? Math.min(...fits) : CELL_SIZES[0];
					};
					const place = (h: number) => CELL_SIZES.indexOf(h as (typeof CELL_SIZES)[number]);
					const got = place(last.size);
					expect(got - place(finestWithin(capacity / BAD_KEEP)), `${label}: no finer than what holds well enough`).toBeLessThanOrEqual(0);
					expect(place(finestWithin(capacity)) - got, `${label}: and no more than two sizes coarser than what holds`).toBeLessThanOrEqual(2);
				}
	});

	test('the coarsest grid that is still too slow says so once and stops changing', () => {
		const tuner = new Tuner({ kind: 'cpu' });
		const { sizes } = drive(tuner, house, 200, device(8_000));
		expect(sizes[sizes.length - 1].size).toBe(0.3);
		expect(tuner.note).toBe('Even the coarsest grid is too slow for this device.');
		expect(sizes[sizes.length - 1].at).toBeLessThan(40);
	});

	test('every message it can give is one short sentence, because on a phone it shares two lines of the status line with the cell size', () => {
		const said = new Set<string>();
		// Every way it speaks: a try that is too much for the page's frame rate, one that is too much for the solver, a good run, a phone, and a device that is too slow even on the coarsest grid.
		for (const perf of [(cells: number): Perf => ({ fps: cells > 100_000 ? 12 : 60, rate: 1 }), (cells: number): Perf => ({ fps: 60, rate: cells > 100_000 ? 0.5 : 1 }), () => ({ fps: 60, rate: 1 })]) {
			const tuner = new Tuner({ kind: 'webgpu' });
			for (const m of drive(tuner, house, 120, perf).messages) said.add(m);
		}
		const slow = new Tuner({ kind: 'cpu' });
		drive(slow, house, 200, device(8_000));
		said.add(slow.note!);
		said.add(new Tuner({ kind: 'webgpu', small: true }).note!);
		expect(said.size, 'five different things it can say').toBeGreaterThanOrEqual(5);
		for (const message of said) {
			expect(message.length, message).toBeLessThanOrEqual(64);
			expect(message, 'one sentence').toMatch(/^[^.]+\.$/);
		}
	});

	test('the page’s frame rate says nothing about the worker, which steps off the page’s thread; the solver keeping up does', () => {
		const slowPage = (cells: number): Perf => ({ fps: 12, rate: cells <= 30_000 ? 1 : 0.5 });
		const tuner = new Tuner({ kind: 'cpu' });
		const { sizes } = drive(tuner, studio, 120, slowPage);
		// 12 frames a second would be bad on the GPU, but the worker held real time at 0.15 m (29,952 cells) and the next size was past its limit anyway.
		expect(sizes.map((s) => s.size)).toEqual([0.15]);
		const gpu = new Tuner({ kind: 'webgpu' });
		const bad = drive(gpu, studio, 120, () => ({ fps: 12, rate: 1 }));
		expect(bad.sizes.map((s) => s.size)[1], 'the same frames on the GPU step down').toBeGreaterThan(0.1);
	});

	test('paused frames, frames after the tab was hidden, and the warm-up are not measured', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		tuner.pick(house);
		const frame = (over: Partial<FrameSample>) => tuner.observe({ dt: 1 / 60, rate: 1, paused: false, ...over });
		// A minute paused, with a frame rate that would be bad: nothing is measured.
		for (let n = 0; n < 3600; n++) expect(frame({ paused: true, dt: 1 / 10, rate: 0.1 })).toBeNull();
		// The first WARMUP seconds are ignored however bad they are.
		for (let n = 0; n < WARMUP * 10 - 1; n++) expect(frame({ dt: 1 / 10, rate: 0.1 })).toBeNull();
		// A hidden tab: long gaps are skipped, not counted as slow frames.
		for (let n = 0; n < 20; n++) expect(frame({ dt: 4 })).toBeNull();
		// Good frames after that make a good window, which tries the next size.
		let verdict = null;
		for (let n = 0; n < (WINDOW + WARMUP) * 60 && !verdict; n++) verdict = frame({});
		expect(verdict?.direction).toBe('finer');
	});

	test('a window that was mostly a hidden tab is thrown away', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		tuner.pick(house);
		for (let n = 0; n < WARMUP * 60 + 1; n++) expect(tuner.observe({ dt: 1 / 60, rate: 1, paused: false })).toBeNull();
		// Two skipped frames for every slow one, for well over a window: slow frames mixed with a hidden tab are not a verdict.
		for (let n = 0; n < 200; n++) {
			expect(tuner.observe({ dt: 2, rate: 0.1, paused: false })).toBeNull();
			expect(tuner.observe({ dt: 2, rate: 0.1, paused: false })).toBeNull();
			expect(tuner.observe({ dt: 1 / 20, rate: 0.1, paused: false })).toBeNull();
		}
		expect(tuner.isSettled, 'it judged nothing').toBe(false);
	});

	test('frames in the middle are neither good nor bad, and leave the grid as it is for good', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		const middle = () => ({ fps: (GOOD_FPS + BAD_FPS) / 2, rate: 1 }) as Perf;
		const { sizes } = drive(tuner, house, 120, middle);
		expect(sizes).toHaveLength(1);
		expect(tuner.isSettled).toBe(true);
		// A later good run does not move it: settled stays settled.
		const later = drive(tuner, house, 60, () => ({ fps: 60, rate: 1 }));
		expect(later.sizes).toHaveLength(1);
	});

	test('the simulation held at real time counts whatever speed the clock asks for', () => {
		// At 20x a solver that does 3x real time is as good as one that does 20x: rate is capped at 1 for the verdict.
		const tuner = new Tuner({ kind: 'webgpu' });
		const { sizes } = drive(tuner, studio, 60, () => ({ fps: 60, rate: 3 }));
		expect(sizes[sizes.length - 1].size).toBe(0.075);
	});
});
