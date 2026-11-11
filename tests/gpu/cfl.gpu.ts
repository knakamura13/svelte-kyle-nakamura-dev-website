import { expect, test, type Page } from '@playwright/test';
import { openHarness } from './harness';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The GPU sizes each step's scalar substeps from a CFL reading it reads back without waiting (`GpuBackend.step`): every step reads one, a
 * reading more than a step old is enlarged by 1.1 a step, and with none at all a step takes the 64-substep cap. Its particulate log holds 8,192 steps, which
 * a read must take before they wrap. These run the page's own session on the real device through every state of the clock, and check what
 * the page's frame loop does with those rules (known issue 10 of the status doc, #60).
 */

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
	await openHarness(page, 'cfl.ts');
});
test.afterAll(async () => {
	await page.close();
});

/** The cap, the GPU's queue limit and the log's length, as `solver/gpu/` sets them. */
const CAP = 64;
const LIMIT = 8;
const LOG = 8192;

interface Step {
	world: number;
	phase: string;
	step: number;
	age: number | null;
	substeps: number;
	unlogged: number;
}

interface Run {
	worlds: { world: number; kind: string; cells: number; h: number; phase: string }[];
	steps: Step[];
	reads: { world: number; phase: string; took: number; maxSpeed: number }[];
	errors: string[];
}

interface Row {
	world: number;
	phase: string;
	steps: number;
	none: number;
	maxAge: number | null;
	meanAge: number | null;
	maxSubsteps: number;
	atCap: number;
	maxUnlogged: number;
	reads: number;
	maxTook: number | null;
}

/** Each world's steps and reads in each phase. */
function summarize(r: Run): Row[] {
	const rows: Row[] = [];
	for (const key of [...new Set(r.steps.map((s) => `${s.world}|${s.phase}`))]) {
		const [world, phase] = key.split('|');
		const steps = r.steps.filter((s) => `${s.world}|${s.phase}` === key);
		const reads = r.reads.filter((s) => `${s.world}|${s.phase}` === key);
		const aged = steps.filter((s) => s.age !== null).map((s) => s.age!);
		rows.push({
			world: Number(world),
			phase,
			steps: steps.length,
			none: steps.filter((s) => s.age === null).length,
			maxAge: aged.length ? Math.max(...aged) : null,
			meanAge: aged.length ? aged.reduce((a, b) => a + b, 0) / aged.length : null,
			maxSubsteps: Math.max(...steps.map((s) => s.substeps)),
			atCap: steps.filter((s) => s.substeps >= CAP).length,
			maxUnlogged: Math.max(...steps.map((s) => s.unlogged)),
			reads: reads.length,
			maxTook: reads.length ? Math.max(...reads.map((s) => s.took)) : null
		});
	}
	return rows;
}

function print(scenario: string, r: Run) {
	console.log(`${scenario}: ${r.worlds.map((w) => `world ${w.world} ${w.kind} ${w.h} m ${w.cells} cells (${w.phase})`).join(', ')}`);
	for (const row of summarize(r))
		console.log(
			`  world ${row.world} ${row.phase.padEnd(20)} steps ${String(row.steps).padStart(5)}  no reading ${row.none}  age max ${String(row.maxAge).padStart(2)} mean ${row.meanAge?.toFixed(1).padStart(4)}  substeps max ${String(row.maxSubsteps).padStart(2)}  at the cap ${row.atCap}  unlogged max ${String(row.maxUnlogged).padStart(3)}  reads ${String(row.reads).padStart(3)}  took max ${row.maxTook}`
		);
}

/**
 * What the page must do with the rules: a step goes without a reading, and so takes the cap, only as the first step of a world built from still
 * air (nothing has been read back yet, and its air has no speed to read); a world that carries another's air sizes even its first step from
 * it; every other step's reading is at most one queue old, because every step reads one back (a reading up to two queues old, when a
 * step read only once the last read was back, was enlarged 3.5 times and took the cap on air of 17 m/s at the finest grid, #104); nothing is stepped while the clock is paused; and a read takes the log long
 * before it wraps.
 */
function check(r: Run) {
	expect(r.errors, 'nothing went wrong').toEqual([]);
	expect(r.steps.length, 'the GPU ran').toBeGreaterThan(0);
	// A run whose air ran away would reach the cap from a reading too: what is measured here is the rule on air that behaves.
	const fastest = Math.max(...r.reads.map((read) => read.maxSpeed).filter((speed) => !Number.isNaN(speed)));
	expect(fastest, 'the air stayed in bounds').toBeLessThan(15);
	for (const world of r.worlds) {
		const steps = r.steps.filter((s) => s.world === world.world);
		const carried = world.phase.startsWith('stepped down');
		const blind = steps.filter((s) => s.age === null);
		if (carried) expect(blind, `world ${world.world} carried its air on, so every step had a reading`).toEqual([]);
		else expect(blind.map((s) => s.step), `world ${world.world}: only its first step, from still air, had no reading`).toEqual(blind.length ? [0] : []);
		const capped = steps.filter((s) => s.substeps >= CAP && s.age !== null);
		expect(capped, `world ${world.world}: no step with a reading reached the ${CAP}-substep cap`).toEqual([]);
		const later = steps.filter((s) => s.phase !== 'warm-up');
		expect(Math.max(0, ...later.map((s) => s.age ?? 0)), `world ${world.world}: a reading is never more than one queue old`).toBeLessThanOrEqual(LIMIT);
		expect(Math.max(0, ...later.map((s) => s.unlogged)), `world ${world.world}: the log is read every few dozen steps`).toBeLessThanOrEqual(64);
	}
	expect(r.steps.filter((s) => s.phase.startsWith('paused')), 'no step while the clock is paused').toEqual([]);
	for (const row of summarize(r).filter((row) => row.phase.endsWith(' 1x'))) expect(row.maxAge, `${row.phase}: at real time the reading is the last step's`).toBeLessThanOrEqual(1);
	expect(Math.max(...r.reads.map((s) => s.took)), 'no read comes near the log wrapping').toBeLessThan(LOG / 8);
}

test('the cross-ventilation Scenario, as the page runs it: running, paused, resumed, 5x, 20x, paused and resumed at 20x, a restart and a step down', async () => {
	test.setTimeout(120_000);
	const r: Run = await page.evaluate(() => (window as any).cfl.run('cross-ventilation'));
	print('cross-ventilation', r);
	check(r);
	// The warm-up's world, and a second when the warm-up picks a coarser grid and moves the air onto it; then the restart's and the step down's.
	expect(r.worlds.map((w) => w.phase).filter((phase) => phase !== 'warm-up'), 'a world for the restart and one for the step down').toEqual(['restarted at 20x', 'stepped down at 20x']);
	const rows = summarize(r);
	for (const phase of ['running 1x', 'resumed 1x', 'running 5x', 'running 20x', 'resumed 20x']) expect(rows.find((row) => row.phase === phase)?.steps, `${phase} stepped`).toBeGreaterThan(0);
});

/**
 * The fastest air the Scenarios make, on the finest grid: a window fan's jet at its own five times real time and then twenty (real time,
 * where an intake window fan ran away until issue 91, is in `window-fan-steps.gpu.ts`), and the Airmega Mighty's outlet at 7 m/s at twenty
 * times real time.
 */
for (const scenario of ['window-fan', 'clearing-smoke'])
	test(`the ${scenario} Scenario on the finest grid at 5x and 20x, paused and resumed`, async () => {
		test.setTimeout(120_000);
		const phases = [
			{ name: 'running 5x', seconds: 3, clock: { paused: false, speed: 5 } },
			{ name: 'running 20x', seconds: 5, clock: { paused: false, speed: 20 } },
			{ name: 'paused at 20x', seconds: 1, clock: { paused: true, speed: 20 } },
			{ name: 'resumed 20x', seconds: 4, clock: { paused: false, speed: 20 } }
		];
		const r: Run = await page.evaluate(([scenario, phases]) => (window as any).cfl.run(scenario, { fixedCell: 0.075, phases }), [scenario, phases] as const);
		print(scenario, r);
		check(r);
	});
