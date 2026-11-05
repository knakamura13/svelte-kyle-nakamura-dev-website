/* Browser side of massbalance.gpu.ts: the particulate mass balance of tests/solver/massBalanceScenario.ts, run through World on GpuBackend. */
import type { BackendFactory } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { runBalance, type BalanceOptions } from '../../solver/massBalanceScenario';

/* eslint-disable @typescript-eslint/no-explicit-any */

let shared: GpuContext | null = null;
/** As the page makes it (sim/backends.ts): the config as World gives it, on one shared device. */
const gpu: BackendFactory = async (config, initial) => GpuBackend.create(config, initial, (shared ??= await GpuContext.create()));

(window as any).balance = { run: (options: Omit<BalanceOptions, 'make'>) => runBalance({ ...options, make: gpu }) };
(window as any).harnessReady = true;
