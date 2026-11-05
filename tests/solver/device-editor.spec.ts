import { expect, test } from '@playwright/test';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { headPosition } from '../../src/lib/experiments/airflow/devices/model';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { DeviceEditor, type EditorHost } from '../../src/lib/experiments/airflow/scene/deviceEditor';
import { DeviceMeshes } from '../../src/lib/experiments/airflow/scene/deviceMeshes';
import type { DeviceState } from '../../src/lib/experiments/airflow/state';

/**
 * The Stage's device editing with a real camera and the real meshes, in Node: three.js needs no graphics context for projection and
 * raycasting. A device is chosen by its symbol or its body, a chosen fan has a turn ring and an aim ball, and a drag of either gives
 * the bearing or tilt the pointer is at, in the solver's degrees.
 */
const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const kind = (k: DeviceModel['kind']) => DEVICE_MODELS.find((m) => m.kind === k)!;

const camera = new PerspectiveCamera(30, 1.5, 0.1, 400);
camera.position.set(6, 16, 21);
camera.lookAt(6, 0, 4);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

const ndcOf = (point: Vector3) => {
	const p = point.clone().project(camera);
	return { x: p.x, y: p.y };
};

const device = (model: DeviceModel, x: number, z: number, extra: Partial<DeviceState> = {}): DeviceState => ({
	id: 'd1',
	model: model.id,
	x,
	z,
	y: 0,
	yaw: 0,
	tilt: 0,
	power: 1,
	height: model.kind === 'pedestal-fan' && model.heightRange ? model.heightRange[0] : 0,
	oscillation: { on: false, sweep: 90, period: 8 },
	...extra
});

function setup(state: DeviceState) {
	const meshes = new DeviceMeshes(models);
	meshes.update([state], 0, 1.1, state.id);
	meshes.group.updateMatrixWorld(true);
	const floor = new Mesh(new PlaneGeometry(40, 40), new MeshBasicMaterial());
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(6, 0, 4);
	floor.updateMatrixWorld(true);
	const calls = { select: [] as (string | null)[], move: [] as [string, number, number][], turn: [] as [string, number][], aim: [] as [string, number][] };
	const host: EditorHost = {
		camera,
		devices: meshes,
		models,
		height: () => 600,
		surfaces: () => [floor],
		footprint: () => ({ width: 12, depth: 8 }),
		select: (id) => calls.select.push(id),
		move: (id, x, z) => calls.move.push([id, x, z]),
		turn: (id, yaw) => calls.turn.push([id, yaw]),
		aim: (id, tilt) => calls.aim.push([id, tilt])
	};
	const editor = new DeviceEditor(host);
	editor.update(state);
	editor.group.updateMatrixWorld(true);
	return { editor, meshes, calls };
}

test.describe('choosing and handling a device on the Stage', () => {
	test('a press on the symbol on the slice, inside or on its ring, and on the body takes the device; empty floor takes nothing', () => {
		const fan = kind('box-fan');
		const state = device(fan, 3, 4);
		const { editor } = setup(state);
		// The disc inside the ring, at the slice's height (1.1 m).
		expect(editor.grabAt(ndcOf(new Vector3(3, 1.13, 4)), null)).toEqual({ part: 'body', id: 'd1' });
		expect(editor.grabAt(ndcOf(new Vector3(3.15, 1.13, 4.1)), null)).toEqual({ part: 'body', id: 'd1' });
		// The body, low down.
		expect(editor.grabAt(ndcOf(new Vector3(3, 0.25, 4)), null)).toEqual({ part: 'body', id: 'd1' });
		// Open floor well away from it.
		expect(editor.grabAt(ndcOf(new Vector3(8, 0, 5)), null)).toBeNull();
	});

	test('a chosen box or pedestal fan has a ring that turns it and a ball that aims it; a purifier and a window fan have neither', () => {
		for (const [model, handles] of [
			[kind('box-fan'), true],
			[kind('pedestal-fan'), true],
			[kind('air-purifier'), false],
			[kind('window-fan'), false]
		].filter(([m]) => m !== undefined) as [DeviceModel, boolean][]) {
			const state = device(model, 3, 4);
			const { editor } = setup(state);
			expect(editor.showingHandles, model.name).toBe(handles);
			expect(DeviceEditor.hasHandles(model)).toBe(handles);
		}
		const none = setup(device(kind('box-fan'), 3, 4));
		none.editor.update(null);
		expect(none.editor.showingHandles, 'nothing chosen, no handles').toBe(false);
	});

	test('the ring turns the device to face the pointer: east is 90, south 180, west 270, north 0', () => {
		for (const model of [kind('box-fan'), kind('pedestal-fan')]) {
			const state = device(model, 3, 4, { yaw: 30 });
			const { editor, calls } = setup(state);
			const head = new Vector3(...headPosition(model, state));
			const r = editor.handleRadius;
			// A point on the ring, east of the head: the press takes the turn handle.
			const east = head.clone().add(new Vector3(r, 0, 0));
			const grab = editor.grabAt(ndcOf(east), state.id);
			expect(grab, `${model.name}: the ring`).toEqual({ part: 'turn', id: 'd1' });
			editor.dragTo(grab!, ndcOf(east), 'start', state);
			for (const [dx, dz, bearing] of [
				[r, 0, 90],
				[0, r, 180],
				[-r, 0, 270],
				[0, -r, 0]
			]) {
				calls.turn.length = 0;
				editor.dragTo(grab!, ndcOf(head.clone().add(new Vector3(dx, 0, dz))), 'move', state);
				expect(calls.turn, `${model.name} to ${bearing}`).toHaveLength(1);
				const got = calls.turn[0][1];
				expect(Math.min(Math.abs(got - bearing), 360 - Math.abs(got - bearing)), `${model.name} to ${bearing}: ${got}`).toBeLessThan(1);
			}
			editor.dragTo(grab!, ndcOf(east), 'end', state);
			calls.turn.length = 0;
			editor.dragTo(grab!, ndcOf(east), 'move', state);
			expect(calls.turn, 'after the drag ends, moves do nothing').toEqual([]);
		}
	});

	test('the ball aims the device: its tilt follows the pointer up and down the arc, within the limits', () => {
		const fan = kind('box-fan');
		const state = device(fan, 3, 4, { yaw: 90, tilt: 10 });
		const { editor, calls } = setup(state);
		const head = new Vector3(...headPosition(fan, state));
		const r = editor.handleRadius;
		const onArc = (tilt: number) => {
			const climb = (tilt * Math.PI) / 180;
			// Yaw 90 faces east.
			return head.clone().add(new Vector3(Math.cos(climb) * r, Math.sin(climb) * r, 0));
		};
		const grab = editor.grabAt(ndcOf(onArc(10)), state.id);
		expect(grab).toEqual({ part: 'tilt', id: 'd1' });
		editor.dragTo(grab!, ndcOf(onArc(10)), 'start', state);
		for (const tilt of [-30, 0, 25, 50]) {
			calls.aim.length = 0;
			editor.dragTo(grab!, ndcOf(onArc(tilt)), 'move', state);
			expect(calls.aim, `to ${tilt}`).toHaveLength(1);
			expect(Math.abs(calls.aim[0][1] - tilt), `to ${tilt}: ${calls.aim[0][1]}`).toBeLessThan(3);
		}
		// Past the ends it stops at the limits (the experience clamps too).
		calls.aim.length = 0;
		editor.dragTo(grab!, ndcOf(onArc(85)), 'move', state);
		expect(calls.aim[0][1]).toBeLessThanOrEqual(60 + 1e-9);
	});

	test('dragging the body moves the device by the pointer’s travel across the floor, keeping where it was held', () => {
		const fan = kind('box-fan');
		const state = device(fan, 3, 4);
		const { editor, calls } = setup(state);
		// Held 0.2 m east of its centre, at floor level.
		const held = new Vector3(3.2, 0, 4);
		const grab = editor.grabAt(ndcOf(new Vector3(3.2, 0.25, 4)), null);
		expect(grab).toEqual({ part: 'body', id: 'd1' });
		editor.dragTo(grab!, ndcOf(held), 'start', state);
		expect(calls.select).toEqual(['d1']);
		editor.dragTo(grab!, ndcOf(new Vector3(5.2, 0, 6)), 'move', state);
		expect(calls.move).toHaveLength(1);
		const [id, x, z] = calls.move[0];
		expect(id).toBe('d1');
		expect(x).toBeCloseTo(5.0, 1);
		expect(z).toBeCloseTo(6.0, 1);
	});

	test('the ghost of a device dragged in from the tray shows where it would land, and nothing when it is not being dragged', () => {
		const fan = kind('box-fan');
		const { editor } = setup(device(fan, 3, 4));
		editor.setGhost({ model: fan.id, x: 6, y: 0.75, z: 2, ok: true });
		expect(editor.group.children.find((c) => c.position.x === 6 && c.visible)).toBeDefined();
		editor.setGhost(null);
		expect(editor.group.children.every((c) => !(c.position.x === 6 && c.visible))).toBe(true);
	});
});
