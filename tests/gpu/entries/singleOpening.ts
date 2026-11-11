/* Browser side of single-opening.gpu.ts: the one-window room of tests/solver/singleOpening.ts on GpuBackend. */
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { averageExchange, singleOpening, type BackendMaker } from '../../solver/singleOpening';

/* eslint-disable @typescript-eslint/no-explicit-any */

let shared: GpuContext | null = null;
const make: BackendMaker = async (config, initial) => GpuBackend.create({ ...config }, initial, (shared ??= await GpuContext.create()));

async function run(h: number, isothermal: boolean) {
	const room = await singleOpening(make, h, isothermal);
	const result = await averageExchange(room, 10, 0.05, 5);
	const g = room.backend.grid;
	const kind = room.backend.kind;
	room.backend.dispose();
	return { ...result, formula: room.formula, kind, cells: `${g.nx}x${g.ny}x${g.nz}` };
}

(window as any).singleOpening = { run };
(window as any).harnessReady = true;
