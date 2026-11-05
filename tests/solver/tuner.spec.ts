import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { STEP_BUDGET, budgetFor } from '../../src/lib/experiments/airflow/sim/calibrate';
import { BAD_FPS, CELL_SIZES, GOOD_FPS, HOLD, MAX_CELLS, START_BUDGET, WARMUP, WINDOW, Tuner, cellsOf, type BackendKind, type FrameSample } from '../../src/lib/experiments/airflow/sim/tuner';

/**
 * The tuner's decisions, with made-up devices: the warm-up's measurement is a step's cost at the grid it was taken on, and the frames
 * after it come from a function of the grid's cells, as fast as the page draws and as much of real time as the solver keeps up with.
 * The loop does what the session does: it rebuilds at the size it is told to.
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

/** What the warm-up measures on a GPU like this M3 Max: 0.4 ms a step and 6 ns a cell (two-bedroom at 7.5 cm, 3.6 ms). `speed` scales it: 2 is a GPU half as fast. */
const gpuStep = (cells: number, speed = 1) => ({ cells, ms: (0.4 + 6e-6 * cells) * speed, steps: 100 });

interface Change {
	at: number;
	size: number;
	cells: number;
}

/** Runs `seconds` of drawn frames against `perf`, from `from`. Returns every size the world had, with when it started, and the messages the tuner gave. */
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

/** A tuner whose warm-up measured `cost` on `home`'s probe, as the session does it. */
function measured(kind: BackendKind, home: typeof house, cost: (cells: number) => { cells: number; ms: number; steps: number }) {
	const tuner = new Tuner({ kind });
	const probe = tuner.probe(home)!;
	tuner.calibrate(cost(cellsOf(home, probe)));
	return tuner;
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
			expect(tuner.probe(house), 'no warm-up').toBeNull();
			tuner.calibrate(gpuStep(500_000));
			for (const p of plans) expect(tuner.pick(p), `${kind} ${p.id}`).toBe(CELL_SIZES[0]);
			const { sizes } = drive(tuner, house, 300, device(1));
			expect(sizes, 'it never changes').toHaveLength(1);
			expect(tuner.isSettled).toBe(true);
		}
	});

	test('the warm-up is built at the finest grid the backend allows: what a step costs there is what the choice is about', () => {
		const gpu = new Tuner({ kind: 'webgpu' });
		for (const p of plans) expect(gpu.probe(p), `the GPU warms ${p.id} up at 7.5 cm`).toBe(0.075);
		expect(cellsOf(house, 0.075)).toBeLessThanOrEqual(MAX_CELLS.webgpu);
		const cpu = new Tuner({ kind: 'cpu' });
		expect(cpu.probe(studio), 'the worker warms the studio up at 15 cm').toBe(0.15);
		expect(cpu.probe(twoBedroom), 'and the two-bedroom at 20 cm: 15 cm is past what the worker may have').toBe(0.2);
		expect(cellsOf(twoBedroom, 0.15)).toBeGreaterThan(MAX_CELLS.cpu);
		cpu.calibrate({ cells: cellsOf(twoBedroom, 0.2), ms: 20, steps: 20 });
		expect(cpu.probe(twoBedroom), 'once measured, nothing more is measured').toBeNull();
	});

	test('a GPU like this one runs every Home at the finest grid it measured, and one half as fast a size coarser', () => {
		for (const home of [studio, twoBedroom]) {
			const fast = measured('webgpu', home, (cells) => gpuStep(cells));
			expect(fast.pick(home), `${home.id} on a fast GPU`).toBe(0.075);
			expect(fast.isSettled).toBe(true);
		}
		// The house at 7.5 cm is 786,432 cells: 5.1 ms a step here, past the 4 ms the solver may take at five times real time.
		expect(measured('webgpu', house, (cells) => gpuStep(cells)).pick(house)).toBe(0.1);
		const slow = measured('webgpu', twoBedroom, (cells) => gpuStep(cells, 2));
		expect(slow.pick(twoBedroom), 'a GPU half as fast').toBe(0.1);
		const slower = measured('webgpu', twoBedroom, (cells) => gpuStep(cells, 6));
		expect(slower.pick(twoBedroom), 'and one a sixth as fast').toBe(0.15);
	});

	test('the budget is the cells whose step fits the backend’s share of real time: more for a faster step, never past the backend’s maximum', () => {
		for (const kind of ['webgpu', 'cpu'] as BackendKind[]) {
			const at = (ms: number) => budgetFor(kind, { cells: 100_000, ms });
			expect(at(1)).toBeGreaterThan(at(2));
			expect(at(2)).toBeGreaterThan(at(4));
			const { share, speed } = STEP_BUDGET[kind];
			// A step that costs exactly what is allowed is a budget of the cells measured.
			const allowed = (share * 1000 * 0.05) / speed;
			expect(budgetFor(kind, { cells: 100_000, ms: allowed }), `${kind}: a step that just fits`).toBeGreaterThanOrEqual(99_999);
			expect(budgetFor(kind, { cells: 100_000, ms: allowed })).toBeLessThanOrEqual(100_001);
		}
		const tuner = new Tuner({ kind: 'webgpu' });
		tuner.calibrate({ cells: 100_000, ms: 0.05, steps: 100 });
		expect(tuner.cellBudget, 'a device that is very fast still has the backend’s limit').toBe(MAX_CELLS.webgpu);
	});

	test('the worker keeps up with real time on the grid its warm-up picks', () => {
		// A processor like this Mac's: the two-bedroom at 20 cm in 18 ms a step, which fits the 40 ms the worker may take; 30 cm on one three times as slow.
		const fast = measured('cpu', twoBedroom, (cells) => ({ cells, ms: 18 * (cells / 28_080), steps: 20 }));
		expect(fast.pick(twoBedroom)).toBe(0.2);
		expect(fast.pick(studio), 'the studio, smaller, at 15 cm').toBe(0.15);
		const slow = measured('cpu', twoBedroom, (cells) => ({ cells, ms: 60 * (cells / 28_080), steps: 8 }));
		expect(slow.pick(twoBedroom)).toBe(0.3);
	});

	test('a warm-up that measured nothing leaves the starting guess, and the grid is still settled: nothing climbs afterwards', () => {
		const tuner = new Tuner({ kind: 'webgpu' });
		tuner.calibrate(null);
		expect(tuner.cellBudget).toBe(START_BUDGET.webgpu);
		expect(tuner.pick(twoBedroom)).toBe(0.15);
		const { sizes } = drive(tuner, twoBedroom, 300, device(1e9));
		expect(sizes, 'five minutes of frames with room to spare change nothing').toHaveLength(1);
		expect(tuner.isSettled).toBe(true);
	});

	test('a measured device never climbs: five minutes of good frames change nothing', () => {
		for (const kind of ['webgpu', 'cpu'] as BackendKind[])
			for (const home of plans) {
				const tuner = measured(kind, home, (cells) => (kind === 'webgpu' ? gpuStep(cells, 3) : { cells, ms: 30 * (cells / 28_080), steps: 20 }));
				const { sizes, messages } = drive(tuner, home, 300, device(1e9));
				expect(sizes, `${kind} ${home.id}`).toHaveLength(1);
				expect(messages).toEqual([]);
			}
	});

	test('a device that falls behind is not moved in its first minute, then steps down once by the shortfall and holds there', () => {
		const tuner = measured('webgpu', twoBedroom, (cells) => gpuStep(cells));
		expect(tuner.pick(twoBedroom)).toBe(0.075);
		// From the start the device holds only 150,000 cells: 0.075 m (532,480) is far past it.
		const { sizes, messages } = drive(tuner, twoBedroom, 600, device(150_000));
		expect(sizes[1].at, 'nothing in the first minute').toBeGreaterThanOrEqual(HOLD);
		expect(sizes[1].at, 'and soon after it').toBeLessThan(HOLD + WARMUP + WINDOW + 1);
		// The shortfall says 0.1 m (224,640) would not hold either: it goes straight to 0.15 m (66,560).
		expect(sizes.map((s) => s.size)).toEqual([0.075, 0.15]);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatch(/^Switched to a coarser grid: the page ran at \d+ frames a second\.$/);
	});

	test('a device that keeps falling behind steps down at most once a minute, and never back up to cells that failed', () => {
		const tuner = measured('webgpu', house, (cells) => gpuStep(cells));
		expect(tuner.pick(house)).toBe(0.1);
		// A device that gets slower and slower: it holds less every minute.
		const { sizes } = drive(tuner, house, 600, (cells, t) => device(Math.max(5_000, 300_000 - 1_200 * t))(cells));
		const steps = sizes.slice(1);
		expect(steps.length, 'it stepped down').toBeGreaterThanOrEqual(2);
		steps.forEach((change, n) => {
			expect(change.size, 'each change is coarser').toBeGreaterThan(sizes[n].size);
			expect(change.at - sizes[n].at, 'at least a minute after the last').toBeGreaterThanOrEqual(HOLD - 1e-6);
		});
	});

	test('the coarsest grid that is still too slow says so once and stops changing', () => {
		const tuner = measured('cpu', house, (cells) => ({ cells, ms: 35 * (cells / 41_472), steps: 20 }));
		const { sizes } = drive(tuner, house, 400, device(4_000));
		expect(sizes[sizes.length - 1].size).toBe(0.3);
		expect(tuner.note).toBe('Even the coarsest grid is too slow for this device.');
	});

	test('a device the warm-up found too slow for even the coarsest grid says so from the first frame, and only for the Homes it is too slow for', () => {
		const tuner = measured('cpu', house, (cells) => ({ cells, ms: 400, steps: 4 }));
		expect(tuner.pick(house)).toBe(0.3);
		expect(tuner.note).toBe('Even the coarsest grid is too slow for this device.');
		// The house at 0.3 m is 12,288 cells; this device holds about 4,000, which is the studio's 3,744 at 0.3 m.
		expect(tuner.pick(studio)).toBe(0.3);
		expect(tuner.note, 'the studio is not too much for it').toBeNull();
		tuner.pick(house);
		expect(tuner.note).toBe('Even the coarsest grid is too slow for this device.');
	});

	test('every message it can give is one short sentence, because on a phone it shares two lines of the status line with the cell size', () => {
		const said = new Set<string>();
		// Every way it speaks: a grid too much for the page's frame rate, one too much for the solver, a phone, and a device too slow even on the coarsest grid.
		for (const perf of [(cells: number): Perf => ({ fps: cells > 100_000 ? 12 : 60, rate: 1 }), (cells: number): Perf => ({ fps: 60, rate: cells > 100_000 ? 0.5 : 1 })]) {
			const tuner = measured('webgpu', house, (cells) => gpuStep(cells));
			for (const m of drive(tuner, house, 200, perf).messages) said.add(m);
		}
		const slow = measured('cpu', house, (cells) => ({ cells, ms: 400, steps: 4 }));
		slow.pick(house);
		said.add(slow.note!);
		said.add(new Tuner({ kind: 'webgpu', small: true }).note!);
		expect(said.size, 'four different things it can say').toBeGreaterThanOrEqual(4);
		for (const message of said) {
			expect(message.length, message).toBeLessThanOrEqual(64);
			expect(message, 'one sentence').toMatch(/^[^.]+\.$/);
		}
	});

	test('the page’s frame rate says nothing about the worker, which steps off the page’s thread; the solver keeping up does', () => {
		const slowPage = (cells: number): Perf => ({ fps: 12, rate: cells <= 30_000 ? 1 : 0.5 });
		const tuner = measured('cpu', studio, (cells) => ({ cells, ms: 25 * (cells / 29_952), steps: 20 }));
		expect(tuner.pick(studio)).toBe(0.15);
		const { sizes } = drive(tuner, studio, 300, slowPage);
		// 12 frames a second would be bad on the GPU, but the worker held real time at 0.15 m (29,952 cells).
		expect(sizes.map((s) => s.size)).toEqual([0.15]);
		const gpu = measured('webgpu', studio, (cells) => gpuStep(cells));
		const bad = drive(gpu, studio, 300, () => ({ fps: 12, rate: 1 }));
		expect(bad.sizes.map((s) => s.size)[1], 'the same frames on the GPU step down').toBeGreaterThan(0.075);
	});

	test('paused frames, frames after the tab was hidden, and a new world’s first seconds are not measured, and do not count toward the hold', () => {
		const tuner = measured('webgpu', house, (cells) => gpuStep(cells));
		tuner.pick(house);
		const frame = (over: Partial<FrameSample>) => tuner.observe({ dt: 1 / 60, rate: 1, paused: false, ...over });
		// Two minutes paused, with a frame rate that would be bad: nothing is measured, and the hold has not begun to run.
		for (let n = 0; n < 1200; n++) expect(frame({ paused: true, dt: 1 / 10, rate: 0.1 })).toBeNull();
		// A hidden tab: long gaps are skipped, not counted as slow frames, nor as time held.
		for (let n = 0; n < 100; n++) expect(frame({ dt: 4 })).toBeNull();
		// Bad frames for less than the hold: nothing.
		let verdict = null;
		let t = 0;
		for (; t < HOLD - 1; t += 1 / 20) expect(frame({ dt: 1 / 20, rate: 0.1 })).toBeNull();
		// Past the hold, the next bad window steps down.
		for (; t < HOLD + 2 * WINDOW && !verdict; t += 1 / 20) verdict = frame({ dt: 1 / 20, rate: 0.1 });
		expect(verdict?.direction).toBe('coarser');
	});

	test('a window that was mostly a hidden tab is thrown away', () => {
		const tuner = measured('webgpu', house, (cells) => gpuStep(cells));
		tuner.pick(house);
		for (let n = 0; n < (HOLD + WARMUP) * 60 + 1; n++) expect(tuner.observe({ dt: 1 / 60, rate: 1, paused: false })).toBeNull();
		// Two skipped frames for every slow one, for well over a window: slow frames mixed with a hidden tab are not a verdict.
		for (let n = 0; n < 200; n++) {
			expect(tuner.observe({ dt: 2, rate: 0.1, paused: false })).toBeNull();
			expect(tuner.observe({ dt: 2, rate: 0.1, paused: false })).toBeNull();
			expect(tuner.observe({ dt: 1 / 20, rate: 0.1, paused: false })).toBeNull();
		}
	});

	test('frames in the middle are neither good nor bad, and leave the grid as it is', () => {
		const tuner = measured('webgpu', house, (cells) => gpuStep(cells));
		const middle = () => ({ fps: (GOOD_FPS + BAD_FPS) / 2, rate: 1 }) as Perf;
		const { sizes } = drive(tuner, house, 300, middle);
		expect(sizes).toHaveLength(1);
	});

	test('the simulation held at real time counts whatever speed the clock asks for', () => {
		// At 20x a solver that does 3x real time is as good as one that does 20x: rate is capped at 1 for the verdict.
		const tuner = measured('webgpu', studio, (cells) => gpuStep(cells));
		const { sizes } = drive(tuner, studio, 300, () => ({ fps: 60, rate: 3 }));
		expect(sizes.map((s) => s.size)).toEqual([0.075]);
	});
});
