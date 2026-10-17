/* Browser side of snapshots.gpu.ts: GPU snapshots read back while the setup changes under them. */
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { plans } from '$lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import type { Snapshot } from '$lib/experiments/airflow/solver/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { blankSetup, type DeviceState, type Setup } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
let shared: GpuContext | null = null;
const gpu: BackendFactory = async (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, (shared ??= await GpuContext.create()));

const boxFan = DEVICE_MODELS.find((m) => m.kind === 'box-fan')!;
const fan = (id: string, x: number, z: number): DeviceState =>
	({ id, model: boxFan.id, x, z, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }) as DeviceState;

/** The two-bedroom with `count` box fans (0 to 3) standing in the living room. */
function withFans(count: number): Setup {
	const setup = blankSetup('two-bedroom');
	setup.devices = [fan('f1', 2.4, 5.4), fan('f2', 3.6, 3.0), fan('f3', 1.8, 2.4)].slice(0, count);
	return setup;
}

/**
 * Fans come and go while snapshots are on their way back, as a visitor adding a fan to a running page does: each round asks for a
 * snapshot (slice, rooms, volume and particles), changes the number of fans before the read is back, steps, and only then awaits it.
 * Every snapshot must resolve, with one flow per fan the backend had when it was asked, all of them finite.
 */
async function fansComeAndGo(rounds: number) {
	const world = await World.create(withFans(0), { plans, models, make: gpu, h: 0.15 });
	world.backend.configureParticles({ tracers: 200, smoke: 100, scale: 0.3, seed: 1 });
	const counts = [0, 1, 3, 2, 0, 2, 1, 3, 0];
	const results: { asked: number; got: number; finite: boolean; error?: string }[] = [];
	let fans = 0;
	for (let round = 0; round < rounds; round++) {
		const asked = fans;
		let pending: Promise<Snapshot>;
		try {
			pending = world.backend.snapshot({ sliceY: 1.1, rooms: true, volume: true, particles: true });
		} catch (error) {
			results.push({ asked, got: -1, finite: false, error: `asking threw: ${error}` });
			continue;
		}
		fans = counts[(round + 1) % counts.length];
		world.apply(withFans(fans), round * 0.05);
		for (let n = 0; n < 3; n++) world.backend.step(0.02);
		world.backend.stepParticles(1 / 60);
		try {
			const shot = await pending;
			results.push({ asked, got: shot.fanFlow.length, finite: Array.from(shot.fanFlow).every(Number.isFinite) && Number.isFinite(shot.diagnostics.maxSpeed) });
		} catch (error) {
			results.push({ asked, got: -1, finite: false, error: String(error) });
		}
	}
	// And once the changes stop, the flows are the fans' own: a running box fan moves air.
	for (let n = 0; n < 20; n++) world.backend.step(0.02);
	const settled = await world.backend.snapshot({});
	world.dispose();
	return { results, settled: { expected: fans, fans: settled.fanFlow.length, flows: Array.from(settled.fanFlow) } };
}

(window as any).snapshots = { fansComeAndGo };
(window as any).harnessReady = true;
