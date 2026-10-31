import { expect, test } from '@playwright/test';
import { MEASURE, MEASURE_DEPTH, measureSteps, type Steppable } from '../../src/lib/experiments/airflow/sim/calibrate';

/**
 * The warm-up's measurement of a step (sim/calibrate.ts), on made-up backends and a made-up clock, so what it measures is known: a
 * backend that works in the background (the GPU, the worker) finishes a step every `ms` of the clock while it has any, and one in
 * the page takes `ms` of the clock inside `step`.
 */

/** A clock the test moves, and a pause that moves it by `tick` ms (the 2 ms the real pause waits, or more on a busy page). */
function clock(tick = 2) {
	let now = 0;
	return { now: () => now, advance: (ms: number) => (now += ms), pause: (after: () => void) => async () => (now += tick, after()) };
}

/**
 * A backend whose steps queue, as the GPU's do, at most `limit` unfinished, finishing one every `ms` of the clock. Its first `heavy`
 * steps cost `heavier` times as much, as the GPU's first steps do, sent before any speed has been read back.
 */
function background(ms: number, limit: number, time: ReturnType<typeof clock>, heavy = 0, heavier = 1) {
	const costs: number[] = [];
	let busy = 0;
	let last = time.now();
	const backend: Steppable & { sent: number; settle(): void } = {
		sent: 0,
		maxInFlight: limit,
		get stepsInFlight() {
			return costs.length;
		},
		step() {
			costs.push(backend.sent < heavy ? ms * heavier : ms);
			backend.sent++;
		},
		settle() {
			busy += time.now() - last;
			last = time.now();
			while (costs.length && busy >= costs[0]) busy -= costs.shift()!;
			if (!costs.length) busy = 0;
		}
	};
	return backend;
}

test.describe('measuring a step', () => {
	test('a backend that works in the background is kept at its limit, and a step costs the time over the steps it finished', async () => {
		for (const [ms, limit] of [
			[3.7, 8],
			[0.6, 8],
			[25, 2]
		]) {
			const time = clock();
			const backend = background(ms, limit, time);
			let deepest = 0;
			const measured = await measureSteps(backend, {
				dt: 0.05,
				now: time.now,
				pause: time.pause(() => {
					backend.settle();
					deepest = Math.max(deepest, backend.stepsInFlight!);
				})
			});
			expect(measured.ms, `${ms} ms a step`).toBeGreaterThan(0.9 * ms);
			expect(measured.ms).toBeLessThan(1.15 * ms);
			expect(measured.steps).toBeGreaterThanOrEqual(MEASURE.steps);
			expect(measured.sent, 'every step it was sent is counted, for the simulated time it covers').toBe(backend.sent);
			// No deeper than the page leaves it: a GPU's steps grow heavier the older its reading of the air's speed is, and that is older the deeper its queue.
			expect(deepest, 'never more than a few unfinished, nor more than its limit').toBeLessThanOrEqual(Math.min(limit, MEASURE_DEPTH));
		}
	});

	test('the first steps, which run before any speed has been read back and cost three times as much, are not counted', async () => {
		const time = clock();
		const backend = background(3.7, 8, time, MEASURE_DEPTH, 3);
		const measured = await measureSteps(backend, { dt: 0.05, now: time.now, pause: time.pause(() => backend.settle()) });
		expect(measured.ms).toBeGreaterThan(0.9 * 3.7);
		expect(measured.ms).toBeLessThan(1.15 * 3.7);
		// The same on a GPU four times slower, whose heavy first steps outlast the time the measurement leaves out at the start.
		const slow = clock();
		const crawling = background(15, 8, slow, MEASURE_DEPTH, 3);
		const four = await measureSteps(crawling, { dt: 0.05, now: slow.now, pause: slow.pause(() => crawling.settle()) });
		expect(four.ms).toBeGreaterThan(0.9 * 15);
		expect(four.ms).toBeLessThan(1.15 * 15);
	});

	test('a GPU that is slow for a while (raising its clocks, lent to another program) is measured by its fastest stretch, not dragged down by the slow one', async () => {
		const time = clock();
		// Twice as slow for the first 350 ms of the clock, then itself: 4 ms a step.
		const costs: number[] = [];
		let busy = 0;
		let last = 0;
		const backend: Steppable & { settle(): void } = {
			maxInFlight: 8,
			get stepsInFlight() {
				return costs.length;
			},
			step() {
				costs.push(time.now() < 350 ? 8 : 4);
			},
			settle() {
				busy += time.now() - last;
				last = time.now();
				while (costs.length && busy >= costs[0]) busy -= costs.shift()!;
				if (!costs.length) busy = 0;
			}
		};
		const measured = await measureSteps(backend, { dt: 0.05, now: time.now, pause: time.pause(() => backend.settle()) });
		expect(measured.ms).toBeGreaterThan(0.9 * 4);
		expect(measured.ms, 'what a step costs once the device is itself').toBeLessThan(1.1 * 4);
	});

	test('a look that comes late (a hidden tab, a busy page) is not counted as the backend being slow; one that never has a clean stretch fails', async () => {
		// Every fortieth look is a second late: the backend sat idle for most of it.
		let looks = 0;
		let now = 0;
		const backend = background(3.7, 8, { now: () => now, advance: () => 0, pause: () => async () => {} });
		const measured = await measureSteps(backend, {
			dt: 0.05,
			now: () => now,
			pause: async () => {
				now += ++looks % 40 === 0 ? 1000 : 2;
				backend.settle();
			}
		});
		expect(measured.ms, 'the step, not the idling').toBeLessThan(1.15 * 3.7);

		const hidden = clock(1000);
		const asleep = background(3.7, 8, hidden);
		await expect(measureSteps(asleep, { dt: 0.05, now: hidden.now, pause: hidden.pause(() => asleep.settle()) })).rejects.toThrow(/held up/);
	});

	test('it takes about half a second on a device that keeps up, and a slow one is given enough steps to be measured, within its limit', async () => {
		const fast = clock();
		const quick = background(3.7, 8, fast);
		await measureSteps(quick, { dt: 0.05, now: fast.now, pause: fast.pause(() => quick.settle()) });
		expect(fast.now() / 1000, 'seconds').toBeGreaterThanOrEqual(MEASURE.discard + MEASURE.seconds);
		expect(fast.now() / 1000).toBeLessThan(MEASURE.discard + MEASURE.seconds + 0.05);

		const slow = clock();
		const crawling = background(120, 2, slow);
		const measured = await measureSteps(crawling, { dt: 0.05, now: slow.now, pause: slow.pause(() => crawling.settle()) });
		expect(measured.ms).toBeCloseTo(120, -1);
		expect(slow.now() / 1000, 'it waits for twelve steps rather than judge on three').toBeGreaterThan(MEASURE.steps * 0.12);
		expect(slow.now() / 1000).toBeLessThanOrEqual(MEASURE.limit + 0.01);
	});

	test('a backend in the page is timed step by step, and the pauses between steps are not counted', async () => {
		const time = clock(5);
		let sent = 0;
		const backend: Steppable = {
			step() {
				sent++;
				time.advance(4);
			}
		};
		const measured = await measureSteps(backend, { dt: 0.05, now: time.now, pause: time.pause(() => {}) });
		expect(measured.ms).toBeCloseTo(4, 6);
		expect(measured.sent).toBe(sent);
	});

	test('it stops as soon as it is no longer wanted, and a backend that finishes nothing is an error, not a cost of zero', async () => {
		const time = clock();
		const backend = background(3, 8, time);
		let wanted = true;
		const stopped = measureSteps(backend, {
			dt: 0.05,
			now: time.now,
			alive: () => wanted,
			pause: time.pause(() => {
				backend.settle();
				if (time.now() > 100) wanted = false;
			})
		});
		await expect(stopped).rejects.toThrow(/stopped/);
		expect(time.now(), 'at once').toBeLessThan(110);

		const stuck = clock(50);
		const dead = background(Infinity, 8, stuck);
		await expect(measureSteps(dead, { dt: 0.05, now: stuck.now, pause: stuck.pause(() => dead.settle()) })).rejects.toThrow(/no step/);
		expect(stuck.now() / 1000, 'it gives up at its limit').toBeLessThanOrEqual(MEASURE.limit + 0.06);
	});

	test('it says how far it has got, and ends at all of it', async () => {
		const time = clock();
		const backend = background(3.7, 8, time);
		const shares: number[] = [];
		await measureSteps(backend, { dt: 0.05, now: time.now, pause: time.pause(() => backend.settle()), progress: (share) => shares.push(share) });
		expect(shares.every((share, n) => n === 0 || share >= shares[n - 1])).toBe(true);
		expect(shares.at(-1)).toBe(1);
		expect(shares[0]).toBeLessThan(0.1);
	});
});
