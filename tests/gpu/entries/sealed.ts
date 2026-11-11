/*
 * Browser side of sealed.gpu.ts: the two-bedroom home in a fresh breeze from the west, built on GpuBackend and stepped for 30 s, with
 * the flow through every opening read back. The same cases tests/solver/sealed-home.spec.ts runs on the CPU.
 */
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { plans, planById } from '$lib/experiments/airflow/homes/plans';
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { blankSetup, type Setup } from '$lib/experiments/airflow/state';
import { WIND_PRESETS } from '$lib/experiments/airflow/ui/hud/presets';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
let shared: GpuContext | null = null;

const PLAN = 'two-bedroom';
const WEST = ['dining-window', 'living-window-1', 'living-window-2'];
const EAST = ['bedroom-1-window', 'bedroom-2-window'];
const INTERIOR = ['bathroom-door', 'bedroom-1-door', 'bedroom-2-door'];
/** The same fixed step as the CPU spec. */
const DT = 0.05;
const SECONDS = 30;

/** Every opening shut, with the ones named in `open` open. */
function openings(open: string[]) {
	return Object.fromEntries(planById(PLAN)!.openings.map((o) => [o.id, open.includes(o.id) ? 1 : 0]));
}

function setupFor(open: string[]): Setup {
	const fresh = WIND_PRESETS.find((preset) => preset.id === 'fresh')!.value;
	return {
		...blankSetup(PLAN),
		openings: openings(open),
		conditions: { windFrom: 270, windSpeed: fresh, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 }
	};
}

const CASES: Record<string, string[]> = {
	sealed: [],
	windward: [...WEST, ...INTERIOR],
	both: [...WEST, ...EAST, ...INTERIOR]
};

/**
 * Runs one case at cell size `h` and returns the net flow into the home through each opening, m³/s (positive into a west or north
 * opening), the largest flow through any face of each, and the fastest air at the end.
 */
async function run(name: string, h: number) {
	const open = CASES[name];
	if (!open) throw new Error(`No case called ${name}.`);
	const make: BackendFactory = async (config, initial) => GpuBackend.create({ ...config }, initial, (shared ??= await GpuContext.create()));
	const world = await World.create(setupFor(open), { plans, models, make, h });
	const kind = world.backend.kind;
	const steps = Math.round(SECONDS / DT);
	for (let n = 0; n < steps; n++) world.backend.step(DT);
	const fields = await world.backend.readFields();
	const { au, aw } = world.raster.geometry;
	const cell = world.backend.grid.h;
	const by = world.raster.openings.map((opening) => {
		let net = 0;
		let peak = 0;
		for (const face of opening.faces) {
			const q = (opening.axis === 0 ? fields.u[face.index] * au[face.index] : fields.w[face.index] * aw[face.index]) * cell * cell;
			net += q;
			peak = Math.max(peak, Math.abs(q));
		}
		const sign = opening.facade === 'west' || opening.facade === 'north' ? 1 : -1;
		return { id: opening.spec.id, net: sign * net, peak };
	});
	const maxSpeed = (await world.backend.snapshot({})).diagnostics.maxSpeed;
	const cells = world.backend.grid.cells;
	world.dispose();
	return {
		kind,
		cells,
		by,
		maxSpeed,
		finite: by.every((o) => Number.isFinite(o.net) && Number.isFinite(o.peak)) && Number.isFinite(maxSpeed)
	};
}

(window as any).sealed = { run };
(window as any).harnessReady = true;
