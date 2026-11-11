/* Browser side of gusts.gpu.ts: issue 92's gusty room (tests/solver/gustyRoom.ts) on GpuBackend. */
import type { BackendFactory } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { compare, quasiSteadyRatio, runMinute } from '../../solver/gustyRoom';

/* eslint-disable @typescript-eslint/no-explicit-any */

let shared: GpuContext | null = null;
const make: BackendFactory = async (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, (shared ??= await GpuContext.create()));

async function run() {
	const gusty = await runMinute(make, true);
	const steady = await runMinute(make, false);
	return { kind: gusty.kind, ...compare(gusty, steady), expected: quasiSteadyRatio() };
}

(window as any).gusts = { run };
(window as any).harnessReady = true;
