import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';
import { WIND_PRESETS } from '../../src/lib/experiments/airflow/ui/hud/presets';

/**
 * #93's first two tests: a sealed home, and windward windows only. The two-bedroom home at the coarse grid the page's CPU fallback uses,
 * built as tests/solver/scenario-presets.spec.ts builds its worlds. The same tests run on the GPU in tests/gpu/sealed.gpu.ts.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const H = 0.2;
/** A fixed step of 0.05 s. The test checks below that the fastest air moves less than one cell in a step. */
const DT = 0.05;

const PLAN = 'two-bedroom';
/** The west facade's windows, the windward ones in the wind from 270 degrees. */
const WEST = ['dining-window', 'living-window-1', 'living-window-2'];
/** The east facade's windows, the leeward ones. */
const EAST = ['bedroom-1-window', 'bedroom-2-window'];
/** The doors inside the home, opened in the flow cases so the air can cross the whole home. */
const INTERIOR = ['bathroom-door', 'bedroom-1-door', 'bedroom-2-door'];

/** The Fresh breeze preset's speed, m/s, from the page's own wind presets. */
const FRESH = WIND_PRESETS.find((preset) => preset.id === 'fresh')!.value;

/** Every opening of the plan at `amount` (0 shut, 1 open), with the ones named in `open` set to 1. */
function openings(open: string[] = []) {
	const plan = planById(PLAN)!;
	return Object.fromEntries(plan.openings.map((o) => [o.id, open.includes(o.id) ? 1 : 0]));
}

/** The two-bedroom home in a fresh breeze from the west, at equal indoor and outdoor temperatures. */
function setup(open: string[] = []): Setup {
	return {
		...blankSetup(PLAN),
		openings: openings(open),
		conditions: { windFrom: 270, windSpeed: FRESH, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 }
	};
}

const create = (s: Setup) => World.create(s, { plans: [planById(PLAN)!], models, make, h: H });

const run = (world: World, seconds: number) => {
	for (let t = 0; t < seconds - 1e-9; t += DT) world.backend.step(DT);
};

/**
 * The flow through every opening of the plan, m³/s: `net` is positive into the home through a west or north window (and a door in
 * its wall), `peak` the largest flow through any one face of it.
 */
async function flows(world: World) {
	const fields = await world.backend.readFields();
	const { au, aw } = world.raster.geometry;
	const { h } = world.backend.grid;
	return world.raster.openings.map((opening) => {
		let net = 0;
		let peak = 0;
		for (const face of opening.faces) {
			const q = (opening.axis === 0 ? fields.u[face.index] * au[face.index] : fields.w[face.index] * aw[face.index]) * h * h;
			net += q;
			peak = Math.max(peak, Math.abs(q));
		}
		const sign = opening.facade === 'west' || opening.facade === 'north' ? 1 : -1;
		return { id: opening.spec.id, net: sign * net, peak };
	});
}

/** The net flow into the home through the named openings, m³/s. */
const inflow = (by: { id: string; net: number }[], ids: string[]) =>
	by.filter((o) => ids.includes(o.id)).reduce((sum, o) => sum + o.net, 0);

test.describe('a sealed home and windward-only windows', () => {
	test('sealed home: every window and door shut, a fresh breeze from the west: no flow passes through any opening beyond rounding', async () => {
		expect(FRESH, 'the Fresh breeze preset').toBe(10);
		const world = await create(setup());
		run(world, 30);
		const by = await flows(world);
		const diagnostics = (await world.backend.snapshot({})).diagnostics;
		const peak = Math.max(...by.map((o) => o.peak));
		const worst = by.reduce((a, b) => (b.peak > a.peak ? b : a));
		console.log(
			`sealed home: largest flow through any opening face ${peak.toExponential(2)} m³/s (${worst.id}), fastest air ${diagnostics.maxSpeed.toExponential(2)} m/s`
		);
		expect(by.length).toBeGreaterThan(0);
		// Rounding: a closed face carries nothing, so this is a float's worth at most.
		for (const o of by) expect(o.peak, `${o.id}: flow through its faces, m³/s`).toBeLessThan(1e-6);
		expect(diagnostics.maxSpeed, 'fastest air in the home, m/s').toBeLessThan(1e-3);
		// The fixed step stays under one cell at the fastest air (a Courant number under 1).
		expect(diagnostics.maxSpeed * DT, 'CFL check').toBeLessThan(H);
		world.dispose();
	});

	test('windward windows only: the same breeze, the west windows open and the east ones shut; their flow is a small fraction of the flow with the east windows open too', async () => {
		const both = await create(setup([...WEST, ...EAST, ...INTERIOR]));
		run(both, 30);
		const bothFlows = await flows(both);
		const bothIn = inflow(bothFlows, WEST);
		const bothSpeed = (await both.backend.snapshot({})).diagnostics.maxSpeed;
		both.dispose();

		const windward = await create(setup([...WEST, ...INTERIOR]));
		run(windward, 30);
		const windwardFlows = await flows(windward);
		const windwardIn = inflow(windwardFlows, WEST);
		const windwardSpeed = (await windward.backend.snapshot({})).diagnostics.maxSpeed;
		windward.dispose();

		const fraction = windwardIn / bothIn;
		console.log(
			`windward only: west windows ${windwardIn.toFixed(4)} m³/s with the east shut, ${bothIn.toFixed(4)} with the east open too: fraction ${fraction.toFixed(3)} (fastest air ${windwardSpeed.toFixed(3)} and ${bothSpeed.toFixed(3)} m/s)`
		);
		// The both-open case has to carry real flow, or the fraction says nothing.
		expect(bothIn).toBeGreaterThan(0.1);
		expect(Math.abs(fraction), 'windward-only flow as a share of the flow with the east open').toBeLessThan(0.2);
	});
});
