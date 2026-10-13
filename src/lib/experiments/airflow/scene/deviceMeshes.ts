import { BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clay, disposeTree } from '$lib/experiments/engine/kit';
import { oscillatedYaw } from '../devices/model';
import type { DeviceModel, FanModel } from '../devices/types';
import type { DeviceState } from '../state';
import { RENDER_ORDER } from './sliceLayer';

/** The body's colors, and the cue that a fan is running. */
const BODY = 0x4a5651;
const FACE_ON = 0xe9eee7;
const FACE_OFF = 0xaeb6ae;
const FLOW = 0xd9822b;
const INK = 0x202a24;
const IDLE = 0x8a948f;
/** The slice plane's default height, m, and how far its symbols float above the plane so they never fight it for depth. */
const PLANE = 1.1;
const SYMBOL_LIFT = 0.03;

const DEGREES = Math.PI / 180;

/** How thick a pedestal fan's head is, m. The catalog's body size for a pedestal fan is the whole product, so its depth is no help here. */
const PEDESTAL_HEAD = 0.14;

/** How the pieces of one device are held, so a frame can move them without rebuilding. */
interface Item {
	group: Group;
	/** Everything that changes what the device is built from. */
	shape: string;
	/** The part that turns to face the airflow (the whole body of a box fan, the head of a pedestal fan), and what on it shows power. */
	head: Group;
	face: Mesh<CylinderGeometry, MeshStandardMaterial> | null;
	flow: Mesh<ConeGeometry, MeshBasicMaterial> | null;
	/** Where the device is, drawn on the slice plane, because the plane (82% opaque) hides a fan that stands below it: a ring, and an arrow the way it blows. */
	symbol: Group;
	ring: Mesh<RingGeometry, MeshBasicMaterial>;
	arrow: Mesh<BufferGeometry, MeshBasicMaterial>;
	/** Where the head's centre is above the device's base, m, and how far its front (where the air leaves) is from that centre. */
	rise: number;
	front: number;
}

/**
 * Plain stand-ins for the fans and purifiers of a setup, in the solver's axes (metres; x east, y up, z south). They are
 * not the product shots: a body of the model's real outside size, a disc where the blades are, a pole under a pedestal
 * fan's head, and a cone that points the way a running fan blows. Everything faces down the device's heading, which is
 * its local -z: `yaw` is degrees clockwise from north seen from above, `tilt` degrees up, and a pedestal fan's head
 * swings with its sweep. Matched to the setup by device id each frame; nothing is rebuilt unless the model or a pedestal
 * fan's height changed.
 */
export class DeviceMeshes {
	readonly group = new Group();
	private readonly items = new Map<string, Item>();

	constructor(private readonly models: ReadonlyMap<string, DeviceModel>) {}

	/**
	 * Adds, removes and moves the meshes to match `devices`, with `time` the simulated seconds that oscillating fans turn
	 * by, and `planeY` the height of the slice plane, m, where each device's symbol is drawn.
	 */
	update(devices: readonly DeviceState[], time: number, planeY = PLANE) {
		const present = new Set<string>();
		for (const device of devices) {
			const model = this.models.get(device.model);
			if (!model) continue;
			present.add(device.id);
			const shape = `${model.id}|${model.kind === 'pedestal-fan' ? device.height : 0}`;
			let item = this.items.get(device.id);
			if (item && item.shape !== shape) {
				this.drop(device.id);
				item = undefined;
			}
			if (!item) {
				item = this.build(device, model, shape);
				this.items.set(device.id, item);
				this.group.add(item.group);
			}
			this.pose(item, device, model, time, planeY);
		}
		for (const id of [...this.items.keys()]) if (!present.has(id)) this.drop(id);
	}

	private build(device: DeviceState, model: DeviceModel, shape: string): Item {
		const group = new Group();
		group.userData.deviceId = device.id;
		const head = new Group();
		group.add(head);
		const body = clay(BODY);
		const { width, depth, height } = model.body;
		let face: Item['face'] = null;
		let flow: Item['flow'] = null;
		let rise = height / 2;
		let front = depth / 2;

		if (model.kind === 'air-purifier') {
			head.add(new Mesh(new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.05, width / 4)), body));
			// The clean air leaves by a round outlet on top.
			const outlet = new Mesh(new CylinderGeometry(model.outletDiameter / 2, model.outletDiameter / 2, 0.012, 24), clay(FACE_OFF));
			outlet.position.y = height / 2 + 0.006;
			head.add(outlet);
		} else if (model.kind === 'pedestal-fan') {
			rise = device.height;
			front = PEDESTAL_HEAD / 2;
			const base = new Mesh(new CylinderGeometry(0.2, 0.22, 0.035, 28), body);
			base.position.y = 0.0175;
			const pole = new Mesh(new CylinderGeometry(0.018, 0.018, Math.max(0.1, device.height), 10), body);
			pole.position.y = Math.max(0.1, device.height) / 2;
			group.add(base, pole);
			// The head is a short drum whose axis is the airflow: the cylinder's own axis turned to lie along local z.
			const drum = new Mesh(new CylinderGeometry(model.diameter / 2 + 0.02, model.diameter / 2 + 0.02, PEDESTAL_HEAD, 32), body);
			drum.rotation.x = Math.PI / 2;
			head.add(drum);
		} else {
			// A box fan, or a window fan, a box of the model's real size with its blades on the front.
			head.add(new Mesh(new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.04, depth / 3)), body));
		}

		if (model.kind !== 'air-purifier') {
			const fan = model as FanModel;
			face = new Mesh(new CylinderGeometry(fan.diameter / 2, fan.diameter / 2, 0.012, 32), clay(FACE_ON));
			face.rotation.x = Math.PI / 2;
			face.position.z = -(front + 0.004);
			head.add(face);
		}
		// What a running fan or purifier blows: a cone that leaves the front (the top, for a purifier) and grows with power.
		flow = new Mesh(new ConeGeometry(0.07, 1, 20), new MeshBasicMaterial({ color: FLOW, transparent: true, opacity: 0.85, depthWrite: false }));
		flow.renderOrder = RENDER_ORDER.markers;
		flow.rotation.x = -Math.PI / 2;
		if (model.kind === 'air-purifier') {
			flow.rotation.x = 0;
			flow.position.y = height / 2;
		} else flow.position.z = -front;
		head.add(flow);

		// The symbol on the slice: a ring round the device with a white halo, and an arrow that points the way it blows.
		const symbol = new Group();
		symbol.userData.symbol = true;
		const translucent = (color: number, opacity: number) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });
		const halo = new Mesh(new RingGeometry(0.2, 0.28, 32), translucent(0xffffff, 0.8));
		const ring = new Mesh(new RingGeometry(0.22, 0.26, 32), translucent(INK, 0.95));
		halo.rotation.x = ring.rotation.x = -Math.PI / 2;
		const wedge = new BufferGeometry();
		// Flat in the plan, its tip toward the front (-z), outside the ring.
		wedge.setAttribute('position', new Float32BufferAttribute([-0.08, 0, -0.3, 0.08, 0, -0.3, 0, 0, -0.48], 3));
		const arrow = new Mesh(wedge, translucent(FLOW, 0.95));
		for (const mesh of [halo, ring, arrow]) mesh.renderOrder = RENDER_ORDER.markers;
		symbol.add(halo, ring, arrow);
		group.add(symbol);
		return { group, shape, head, face, flow, rise, front, symbol, ring, arrow };
	}

	private pose(item: Item, device: DeviceState, model: DeviceModel, time: number, planeY: number) {
		const { group, head, face, flow, symbol } = item;
		group.position.set(device.x, device.y, device.z);
		head.position.y = item.rise;
		const on = device.power > 0.005;
		// The symbol rides the slice plane, whatever the device stands on.
		symbol.position.y = planeY - device.y + SYMBOL_LIFT;
		item.ring.material.color.set(on ? INK : IDLE);
		if (model.kind === 'air-purifier') {
			// A purifier stands upright and blows up whatever its yaw, so its symbol has no arrow.
			group.rotation.y = -device.yaw * DEGREES;
			head.rotation.set(0, 0, 0);
			item.arrow.visible = false;
		} else {
			// Yaw about the vertical, then tilt up about the head's own side-to-side axis. A window fan's yaw faces into the home,
			// so one set to blow out turns its front the other way.
			const yaw = oscillatedYaw(device, time) + (model.kind === 'window-fan' && device.intake === false ? 180 : 0);
			head.rotation.order = 'YXZ';
			head.rotation.set(device.tilt * DEGREES, -yaw * DEGREES, 0);
			symbol.rotation.y = -yaw * DEGREES;
			item.arrow.visible = on;
		}
		face?.material.color.set(on ? FACE_ON : FACE_OFF);
		if (flow) {
			flow.visible = on;
			// A cone's origin is its middle, so it is moved half its length out and turned so its tip leads.
			const length = 0.12 + 0.4 * Math.min(1, device.power);
			flow.scale.set(1 + 0.4 * device.power, length, 1 + 0.4 * device.power);
			const reach = length / 2 + 0.03;
			if (model.kind === 'air-purifier') flow.position.y = model.body.height / 2 + reach;
			else flow.position.z = -(item.front + reach);
		}
	}

	/**
	 * Where a device's head is and which way it blows, in the scene's axes, as drawn now: for handles, and to check that
	 * what is drawn is what the solver pushes. A purifier blows up. Null for a device that is not in the scene.
	 */
	headPose(id: string): { position: Vector3; forward: Vector3 } | null {
		const item = this.items.get(id);
		if (!item) return null;
		item.group.updateMatrixWorld(true);
		const position = item.head.getWorldPosition(new Vector3());
		const purifier = item.flow !== null && item.face === null;
		const forward = purifier ? new Vector3(0, 1, 0) : new Vector3(0, 0, -1).transformDirection(item.head.matrixWorld);
		return { position, forward };
	}

	private drop(id: string) {
		const item = this.items.get(id);
		if (!item) return;
		this.group.remove(item.group);
		disposeTree(item.group);
		this.items.delete(id);
	}

	dispose() {
		for (const id of [...this.items.keys()]) this.drop(id);
		this.group.removeFromParent();
	}
}
