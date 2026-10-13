import { expect, test } from '@playwright/test';
import { Vector3, type Object3D } from 'three';
import { DEVICE_MODELS, FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { aimVector, headPosition, oscillatedYaw } from '../../src/lib/experiments/airflow/devices/model';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { DeviceMeshes } from '../../src/lib/experiments/airflow/scene/deviceMeshes';
import { windowSeat } from '../../src/lib/experiments/airflow/scene/deviceMath';
import type { DeviceState } from '../../src/lib/experiments/airflow/state';

/**
 * The stand-ins for devices in the dollhouse must point and sit where the solver's fans do: a fan the page draws facing
 * east but pushing north would be a lie. These compare what is drawn (`headPose`) with what `devices/solver.ts` reads
 * (`aimVector`, `headPosition`, `oscillatedYaw`).
 */

const models = new Map<string, DeviceModel>(DEVICE_MODELS.map((m) => [m.id, m]));
const plan = planById('two-bedroom')!;

function placed(modelId: string, patch: Partial<DeviceState> = {}): DeviceState {
	const made = newDevice(plan, models.get(modelId)!, []);
	if (!('device' in made)) throw new Error(made.reason);
	return { ...made.device, power: 1, ...patch };
}

const close = (a: ArrayLike<number>, b: ArrayLike<number>, digits = 6) => {
	for (let n = 0; n < 3; n++) expect(a[n], `axis ${n}`).toBeCloseTo(b[n], digits);
};

test.describe('a fan stand-in', () => {
	for (const model of FAN_MODELS.filter((m) => m.kind !== 'window-fan')) {
		test(`${model.name} blows where the solver's fan does, from where it does, at every yaw and tilt`, () => {
			const meshes = new DeviceMeshes(models);
			for (const yaw of [0, 90, 180, 270, 37.5]) {
				for (const tilt of [-20, 0, 45]) {
					const device = placed(model.id, { yaw, tilt });
					meshes.update([device], 0);
					const pose = meshes.headPose(device.id)!;
					close(pose.forward.toArray(), aimVector(yaw, tilt));
					close(pose.position.toArray(), headPosition(model, device));
				}
			}
			meshes.dispose();
		});
	}

	test('an oscillating pedestal fan turns its head with the sweep, as the solver does', () => {
		const model = FAN_MODELS.find((m) => m.kind === 'pedestal-fan')!;
		const device = placed(model.id, { yaw: 180, oscillation: { on: true, sweep: 80, period: 8 } });
		const meshes = new DeviceMeshes(models);
		for (const time of [0, 2, 4, 6, 7.3]) {
			meshes.update([device], time);
			close(meshes.headPose(device.id)!.forward.toArray(), aimVector(oscillatedYaw(device, time), 0));
		}
		expect(oscillatedYaw(device, 2), 'a quarter period is the widest swing').toBeCloseTo(180 + 40, 6);
		meshes.dispose();
	});

	test('a window fan faces into the home, and one set to blow out faces the other way', () => {
		const model = FAN_MODELS.find((m) => m.kind === 'window-fan')!;
		const window = plan.openings.find((o) => o.id === 'bedroom-1-window')!;
		const seat = windowSeat(plan, window);
		const device = placed(model.id, { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, opening: window.id, intake: true });
		const meshes = new DeviceMeshes(models);
		meshes.update([device], 0);
		close(meshes.headPose(device.id)!.forward.toArray(), aimVector(seat.yaw, 0));
		meshes.update([{ ...device, intake: false }], 0);
		const inward = aimVector(seat.yaw, 0);
		close(meshes.headPose(device.id)!.forward.toArray(), [-inward[0], 0, -inward[2]]);
		close(meshes.headPose(device.id)!.position.toArray(), headPosition(model, device));
		meshes.dispose();
	});
});

test.describe('the set of stand-ins', () => {
	test('follows the setup: added, moved, rebuilt for a new model or pedestal height, and removed', () => {
		const meshes = new DeviceMeshes(models);
		const box = placed('air-king-9723');
		const pedestal = placed('air-king-9119', { x: 3, z: 3 });
		meshes.update([box, pedestal], 0);
		expect(meshes.group.children).toHaveLength(2);
		expect(meshes.group.children.map((c) => c.userData.deviceId).sort()).toEqual([box.id, pedestal.id].sort());

		const before = meshes.group.children.find((c) => c.userData.deviceId === box.id);
		meshes.update([{ ...box, x: 1, z: 1 }, pedestal], 0);
		expect(meshes.group.children.find((c) => c.userData.deviceId === box.id), 'moving does not rebuild').toBe(before);
		expect(before!.position.x).toBe(1);

		const pedestalBefore = meshes.group.children.find((c) => c.userData.deviceId === pedestal.id);
		meshes.update([box, { ...pedestal, height: pedestal.height + 0.2 }], 0);
		expect(meshes.group.children.find((c) => c.userData.deviceId === pedestal.id), 'a new height rebuilds the pole').not.toBe(pedestalBefore);
		expect(meshes.headPose(pedestal.id)!.position.y).toBeCloseTo(pedestal.height + 0.2, 6);

		meshes.update([box], 0);
		expect(meshes.headPose(pedestal.id)).toBeNull();
		expect(meshes.group.children).toHaveLength(1);
		meshes.update([], 0);
		expect(meshes.group.children).toHaveLength(0);
	});

	test('a device whose model is not in the catalog is left out instead of breaking the frame', () => {
		const meshes = new DeviceMeshes(models);
		meshes.update([{ ...placed('air-king-9723'), model: 'no-such-model' }], 0);
		expect(meshes.group.children).toHaveLength(0);
	});

	test('a fan that is off shows no airflow cone, and one that is on shows a longer cone the harder it runs', () => {
		const meshes = new DeviceMeshes(models);
		const device = placed('air-king-9723', { power: 0 });
		const cone = () => {
			const head = meshes.group.children[0].children[0];
			return head.children.find((c) => (c as { geometry?: { type?: string } }).geometry?.type === 'ConeGeometry')!;
		};
		meshes.update([device], 0);
		expect(cone().visible).toBe(false);
		meshes.update([{ ...device, power: 1 / 3 }], 0);
		const low = cone().scale.y;
		expect(cone().visible).toBe(true);
		meshes.update([{ ...device, power: 1 }], 0);
		expect(cone().scale.y).toBeGreaterThan(low);
		meshes.dispose();
		expect(meshes.group.children).toHaveLength(0);
	});
});

test.describe('a device’s symbol on the slice', () => {
	/** The symbol group of a device and its arrow, as drawn. */
	const symbolOf = (meshes: DeviceMeshes, id: string) => {
		const item = meshes.group.children.find((c) => c.userData.deviceId === id)!;
		const symbol = item.children.find((c) => c.userData.symbol)!;
		const arrow = symbol.children[2] as Object3D;
		item.updateMatrixWorld(true);
		return { symbol, arrow };
	};

	test('rides the slice plane wherever the plane is, whatever the device stands on', () => {
		const meshes = new DeviceMeshes(models);
		const fan = placed('air-king-9723', { y: 0.4 });
		for (const plane of [0.3, 1.1, 2.0]) {
			meshes.update([fan], 0, plane);
			const { symbol } = symbolOf(meshes, fan.id);
			expect(symbol.getWorldPosition(new Vector3()).y, `plane at ${plane} m`).toBeCloseTo(plane + 0.03, 6);
		}
		meshes.update([fan], 0);
		expect(symbolOf(meshes, fan.id).symbol.getWorldPosition(new Vector3()).y, 'the plane defaults to 1.1 m').toBeCloseTo(1.13, 6);
	});

	test('sits inside the home for a window fan, which stands on the wall line where the wall would hide the ring, and on the fan for every other', () => {
		const meshes = new DeviceMeshes(models);
		const window = plan.openings.find((o) => o.id === 'bedroom-1-window')!;
		const seat = windowSeat(plan, window);
		const windowFan = placed(FAN_MODELS.find((m) => m.kind === 'window-fan')!.id, { x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, opening: window.id, intake: true });
		const box = placed('air-king-9723', { x: 3, z: 3, yaw: 90 });
		meshes.update([windowFan, box], 0);
		const place = (id: string) => symbolOf(meshes, id).symbol.getWorldPosition(new Vector3());
		const inward = aimVector(seat.yaw, 0);
		expect(place(windowFan.id).x).toBeCloseTo(seat.x + 0.32 * inward[0], 6);
		expect(place(windowFan.id).z).toBeCloseTo(seat.z + 0.32 * inward[2], 6);
		expect(place(box.id).x).toBeCloseTo(3, 6);
		expect(place(box.id).z).toBeCloseTo(3, 6);
		// An exhaust fan faces out, but it still stands in the same window, so its symbol stays inside the home.
		meshes.update([{ ...windowFan, intake: false }, box], 0);
		expect(place(windowFan.id).x).toBeCloseTo(seat.x + 0.32 * inward[0], 6);
		expect(place(windowFan.id).z).toBeCloseTo(seat.z + 0.32 * inward[2], 6);
	});

	test('has an arrow that points the way the fan blows in the plan, and follows an oscillating head', () => {
		const meshes = new DeviceMeshes(models);
		const pedestal = placed('air-king-9119', { yaw: 90, oscillation: { on: true, sweep: 80, period: 8 } });
		for (const time of [0, 2, 5]) {
			meshes.update([pedestal], time);
			const { arrow } = symbolOf(meshes, pedestal.id);
			// The arrow's tip is toward its local -z, so the tip's direction in the plan is the heading.
			const tip = new Vector3(0, 0, -1).transformDirection(arrow.parent!.matrixWorld);
			const heading = aimVector(oscillatedYaw(pedestal, time), 0);
			expect(tip.x, `x at ${time} s`).toBeCloseTo(heading[0], 6);
			expect(tip.z, `z at ${time} s`).toBeCloseTo(heading[2], 6);
		}
	});

	test('shows the arrow only while the fan runs, and greys the ring while it is off', () => {
		const meshes = new DeviceMeshes(models);
		const fan = placed('air-king-9723', { power: 0 });
		meshes.update([fan], 0);
		expect(symbolOf(meshes, fan.id).arrow.visible).toBe(false);
		const ring = () => (symbolOf(meshes, fan.id).symbol.children[1] as unknown as { material: { color: { getHex(): number } } }).material.color.getHex();
		const off = ring();
		meshes.update([{ ...fan, power: 1 }], 0);
		expect(symbolOf(meshes, fan.id).arrow.visible).toBe(true);
		expect(ring(), 'the ring is a different colour once it runs').not.toBe(off);
	});
});
