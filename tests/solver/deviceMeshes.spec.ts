import { expect, test } from '@playwright/test';
import { Box3, Vector3, type CylinderGeometry, type Mesh, type Object3D } from 'three';
import { DEVICE_MODELS, FAN_MODELS, PURIFIER_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { aimVector, headPosition, oscillatedYaw } from '../../src/lib/experiments/airflow/devices/model';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import { deviceInputs } from '../../src/lib/experiments/airflow/devices/solver';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { DeviceMeshes } from '../../src/lib/experiments/airflow/scene/deviceMeshes';
import { windowSeat } from '../../src/lib/experiments/airflow/scene/deviceMath';
import { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import type { DeviceState } from '../../src/lib/experiments/airflow/state';

/**
 * The devices the world draws must point and sit where the solver's fans do: a fan the page draws facing
 * east but pushing north would be a lie. These compare what is drawn (`headPose`) with what `devices/solver.ts` reads
 * (`aimVector`, `headPosition`, `oscillatedYaw`), and a purifier's drawn intake and outlet with the cells the solver
 * cleans and blows through.
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

test.describe('a purifier stand-in', () => {
	const raster = rasterizePlan(plan, 0.05, { furniture: false });
	const { h, sx, sxy } = new Grid(raster.spec);
	/** The centre of a cell, in the scene's axes. */
	const centreOf = (cell: number) => new Vector3(((cell % sx) + 0.5) * h, (Math.floor((cell % sxy) / sx) + 0.5) * h, (Math.floor(cell / sxy) + 0.5) * h);

	for (const model of PURIFIER_MODELS) {
		test(`${model.name} draws its intake where the solver cleans the air and its outlet where the solver's jet leaves, at every yaw`, () => {
			const meshes = new DeviceMeshes(models);
			for (const yaw of [0, 90, 37.5, 200]) {
				const device = placed(model.id, { yaw });
				meshes.update([device], 0);
				const item = meshes.group.children.find((c) => c.userData.deviceId === device.id)!;
				item.updateMatrixWorld(true);
				const inlet = item.getObjectByName('purifier-inlet') as Mesh;
				const outlet = item.getObjectByName('purifier-outlet') as Mesh<CylinderGeometry>;
				const { sinks, fans, fanIndex } = deviceInputs({ devices: [device], models, raster, fluid: AIR, time: 0 });

				// The intake: drawn over the solver's band of the body's height, and filled by the cells it cleans, in the band's
				// own frame, which turns with the body. A cell counts when its centre is within half a cell of the body.
				const drawn = new Box3().setFromObject(inlet);
				expect(drawn.min.y, `the band's foot at yaw ${yaw}`).toBeCloseTo(device.y + model.inlet.from, 6);
				expect(drawn.max.y, `the band's top at yaw ${yaw}`).toBeCloseTo(device.y + model.inlet.to, 6);
				inlet.geometry.computeBoundingBox();
				const band = inlet.geometry.boundingBox!;
				const cells = [...sinks[0].cells].map((cell) => inlet.worldToLocal(centreOf(cell)));
				expect(cells.length, 'more than the one cell a band thinner than a cell falls back to').toBeGreaterThan(1);
				const margin = { x: h / 2, y: 0, z: h / 2 };
				for (const axis of ['x', 'y', 'z'] as const) {
					const along = cells.map((p) => p[axis]);
					expect(Math.max(...along), `inside the band on +${axis} at yaw ${yaw}`).toBeLessThanOrEqual(band.max[axis] + margin[axis] + 1e-6);
					expect(Math.min(...along), `inside the band on -${axis} at yaw ${yaw}`).toBeGreaterThanOrEqual(band.min[axis] - margin[axis] - 1e-6);
					expect(Math.max(...along), `reaching the band's +${axis} side at yaw ${yaw}`).toBeGreaterThan(band.max[axis] - h);
					expect(Math.min(...along), `reaching the band's -${axis} side at yaw ${yaw}`).toBeLessThan(band.min[axis] + h);
				}

				// The outlet: the solver's jet blows straight up out of the drawn outlet, as wide as it, whatever the yaw.
				const jet = fans[fanIndex.get(device.id)!];
				const radius = outlet.geometry.parameters.radiusTop;
				const axis = outlet.getWorldPosition(new Vector3());
				const face = new Box3().setFromObject(outlet).max.y;
				expect(jet.normal).toEqual([0, 1, 0]);
				expect(jet.area, `as wide as the drawn outlet at yaw ${yaw}`).toBeCloseTo(Math.PI * radius ** 2, 9);
				const centroid = new Vector3();
				let weight = 0;
				jet.cells.forEach((cell, n) => {
					const p = centreOf(cell);
					expect(Math.hypot(p.x - axis.x, p.z - axis.z), 'within the outlet and its one-cell soft edge').toBeLessThan(radius + h / 2);
					centroid.addScaledVector(p, jet.cellWeight[n]);
					weight += jet.cellWeight[n];
				});
				centroid.divideScalar(weight);
				expect(Math.hypot(centroid.x - axis.x, centroid.z - axis.z), `centred on the outlet at yaw ${yaw}`).toBeLessThan(h / 2);
				expect(centroid.y, 'leaving from the outlet’s face').toBeGreaterThan(face);
				expect(centroid.y, 'within a disc’s thickness of it').toBeLessThan(face + 0.1);
			}
			meshes.dispose();
		});
	}
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
