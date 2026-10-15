import { BoxGeometry, BufferGeometry, ConeGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Plane, Raycaster, RingGeometry, SphereGeometry, Vector2, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { DeviceModel } from '../devices/types';
import { headPosition } from '../devices/model';
import { LIMITS, type DeviceState } from '../state';
import { tiltFromPointer, yawFromPointer, type Point3 } from './deviceMath';
import { DeviceMeshes } from './deviceMeshes';
import { pointOnSurface } from './pick';
import { RENDER_ORDER } from './sliceLayer';

/**
 * Choosing, moving, turning and aiming devices on the Stage with a pointer, and the ghost a device dragged from the Dock's tray
 * leaves where it would land. The geometry is in deviceMath.ts and pick.ts; this holds the meshes for the handles and works out what
 * a pointer is over. It calls back into the page for everything that changes the setup, so nothing here owns state.
 *
 * A device is chosen by clicking its symbol on the slice (the disc inside its ring, or its body). A chosen box or pedestal fan shows
 * two handles, drawn over everything so the slice does not hide them: a ring round it that turns it to face the pointer, and a ball on
 * a vertical arc that aims it up and down. Purifiers and window fans have neither (a purifier blows up, a window fan faces out of its
 * window) and are only moved.
 */

/** What a press can take hold of: a device to move, or one of the two handles of the chosen one. */
export interface Grab {
	part: 'body' | 'turn' | 'tilt';
	id: string;
}

export interface EditorHost {
	camera: PerspectiveCamera;
	devices: DeviceMeshes;
	models: ReadonlyMap<string, DeviceModel>;
	/** The Stage's height in pixels, so the handles keep a size a finger can hold whatever the zoom. */
	height(): number;
	/** The floor and the furniture, which a dragged device stands on, and the footprint of the home. */
	surfaces(): readonly Object3D[];
	footprint(): { width: number; depth: number };
	select(id: string | null): void;
	move(id: string, x: number, z: number): void;
	turn(id: string, yaw: number): void;
	aim(id: string, tilt: number): void;
}

const ACCENT = 0x276b42;
const REFUSED = 0xc0392b;
/** The handles are at least this many pixels across on screen, and never smaller than this in metres. */
const HANDLE_PIXELS = 34;
const MIN_RING = 0.5;
const ON_TOP = RENDER_ORDER.markers + 6;

const UP = new Vector3(0, 1, 0);
const overlay = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });

export class DeviceEditor {
	readonly group = new Group();
	private readonly raycaster = new Raycaster();
	private readonly ndc = new Vector2();
	private readonly flat = new Plane(new Vector3(0, 1, 0), 0);
	private readonly point = new Vector3();

	private readonly handles = new Group();
	/** The visible ring and the wider invisible one that takes the press, the aim ball and its larger target, and the arc it rides. */
	private readonly ring = new Mesh(new RingGeometry(0.9, 1, 64), overlay(ACCENT, 0.9));
	private readonly ringTarget = new Mesh(new RingGeometry(0.72, 1.18, 48), new MeshBasicMaterial({ visible: false }));
	private readonly marker = new Mesh(new ConeGeometry(0.16, 0.4, 14), overlay(ACCENT));
	private readonly ball = new Mesh(new SphereGeometry(0.11, 16, 12), overlay(ACCENT));
	private readonly ballTarget = new Mesh(new SphereGeometry(0.26, 8, 6), new MeshBasicMaterial({ visible: false }));
	private readonly arc: Line;

	private readonly ghost = new Group();
	private readonly ghostBox: Mesh<BoxGeometry, MeshBasicMaterial>;
	private readonly ghostRing: Mesh<RingGeometry, MeshBasicMaterial>;
	private ghostShape = '';

	/** What is being dragged, and for a body the offset from the pointer's point to the device's centre, so it does not jump to the pointer. */
	private drag: { grab: Grab; offset: { x: number; z: number } } | null = null;
	/** The size the handles were last drawn at: the ring radius, m. */
	private radius = MIN_RING;

	constructor(private readonly host: EditorHost) {
		this.ring.rotation.x = this.ringTarget.rotation.x = -Math.PI / 2;
		const points: number[] = [];
		for (let tilt = LIMITS.tilt.min; tilt <= LIMITS.tilt.max; tilt += 3) {
			const climb = (tilt * Math.PI) / 180;
			points.push(0, Math.sin(climb), -Math.cos(climb));
		}
		const curve = new BufferGeometry();
		curve.setAttribute('position', new Float32BufferAttribute(points, 3));
		this.arc = new Line(curve, new LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
		for (const mesh of [this.ring, this.marker, this.ball, this.arc]) mesh.renderOrder = ON_TOP;
		this.handles.add(this.ring, this.ringTarget, this.marker, this.ball, this.ballTarget, this.arc);
		this.handles.visible = false;

		this.ghostBox = new Mesh(new BoxGeometry(1, 1, 1), overlay(ACCENT, 0.5));
		this.ghostRing = new Mesh(new RingGeometry(0.2, 0.3, 32), overlay(ACCENT, 0.9));
		this.ghostRing.rotation.x = -Math.PI / 2;
		for (const mesh of [this.ghostBox, this.ghostRing]) mesh.renderOrder = ON_TOP;
		this.ghost.add(this.ghostBox, this.ghostRing);
		this.ghost.visible = false;
		this.group.add(this.handles, this.ghost);
	}

	/** How far from the device's head the handles sit, m, as drawn now: the ring's radius, which the aim ball's arc shares. */
	get handleRadius() {
		return this.radius;
	}

	/** Whether the handles are showing. */
	get showingHandles() {
		return this.handles.visible;
	}

	/** Which devices get handles: a fan that can be turned and aimed. */
	static hasHandles(model: DeviceModel | undefined) {
		return model?.kind === 'box-fan' || model?.kind === 'pedestal-fan';
	}

	private aimRay(at: { x: number; y: number }) {
		this.ndc.set(at.x, at.y);
		this.raycaster.setFromCamera(this.ndc, this.host.camera);
		return this.raycaster.ray;
	}

	/** What a press at `at` (normalized device coordinates) takes hold of: a handle of the chosen device first, then any device. */
	grabAt(at: { x: number; y: number }, chosen: string | null): Grab | null {
		this.aimRay(at);
		if (chosen && this.handles.visible) {
			this.handles.updateMatrixWorld(true);
			// The aim ball is smaller than the ring and may sit on it, so it is tried first.
			if (this.raycaster.intersectObject(this.ballTarget, false).length) return { part: 'tilt', id: chosen };
			if (this.raycaster.intersectObject(this.ringTarget, false).length) return { part: 'turn', id: chosen };
		}
		const hit = this.raycaster.intersectObject(this.host.devices.group, true)[0];
		const id = hit ? DeviceMeshes.deviceOf(hit.object) : null;
		return id ? { part: 'body', id } : null;
	}

	/** Starts, follows and ends a drag of what `grabAt` returned. */
	dragTo(grab: Grab, at: { x: number; y: number }, phase: 'start' | 'move' | 'end', device: DeviceState | undefined) {
		if (!device) return;
		if (phase === 'end') {
			this.drag = null;
			return;
		}
		if (phase === 'start') {
			this.host.select(grab.id);
			const under = grab.part === 'body' ? pointOnSurface(this.host.camera, at, this.host.footprint(), this.host.surfaces()) : null;
			this.drag = { grab, offset: under ? { x: device.x - under.x, z: device.z - under.z } : { x: 0, z: 0 } };
			return;
		}
		const drag = this.drag;
		if (!drag || drag.grab.id !== grab.id) return;
		const ray = this.aimRay(at);
		const model = this.host.models.get(device.model);
		if (grab.part === 'body') {
			const under = pointOnSurface(this.host.camera, at, this.host.footprint(), this.host.surfaces());
			if (under) this.host.move(grab.id, under.x + drag.offset.x, under.z + drag.offset.z);
		} else if (grab.part === 'turn' && model) {
			// The ring lies at the head's height: where the pointer meets that plane is the way to face.
			const head = headPosition(model, device);
			this.flat.constant = -head[1];
			if (ray.intersectPlane(this.flat, this.point)) this.host.turn(grab.id, yawFromPointer({ x: device.x, z: device.z }, { x: this.point.x, z: this.point.z }));
		} else if (grab.part === 'tilt' && model) {
			const head = headPosition(model, device);
			const tilt = tiltFromPointer({ x: head[0], y: head[1], z: head[2] } as Point3, device.yaw, this.radius, { origin: ray.origin, direction: ray.direction });
			this.host.aim(grab.id, tilt);
		}
	}

	/** Puts the handles on the chosen device, sized so they stay about the same on screen however far the camera is. Call once a frame. */
	update(device: DeviceState | null | undefined) {
		const model = device ? this.host.models.get(device.model) : undefined;
		const show = !!device && DeviceEditor.hasHandles(model);
		this.handles.visible = show;
		if (!show || !device || !model) return;
		const [x, y, z] = headPosition(model, device);
		const camera = this.host.camera;
		const metresPerPixel = (2 * camera.position.distanceTo(new Vector3(x, y, z)) * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.host.height());
		const r = Math.max(MIN_RING, HANDLE_PIXELS * metresPerPixel);
		this.radius = r;
		this.handles.position.set(x, y, z);
		this.ring.scale.setScalar(r);
		this.ringTarget.scale.setScalar(r);
		this.arc.scale.setScalar(r);
		const heading = (device.yaw * Math.PI) / 180;
		const forward = new Vector3(Math.sin(heading), 0, -Math.cos(heading));
		// The ring's marker sits just outside it where the device faces, pointing that way (a cone's axis is +y).
		this.marker.quaternion.setFromUnitVectors(UP, forward);
		this.marker.position.copy(forward).multiplyScalar(r * 1.14);
		this.marker.scale.setScalar(Math.max(1, r / MIN_RING));
		this.arc.rotation.y = -heading;
		// The aim ball rides the arc at the device's tilt.
		const climb = (device.tilt * Math.PI) / 180;
		const flat = Math.cos(climb) * r;
		this.ball.position.set(forward.x * flat, Math.sin(climb) * r, forward.z * flat);
		this.ballTarget.position.copy(this.ball.position);
		this.ball.scale.setScalar(Math.max(1, r / MIN_RING));
		this.ballTarget.scale.setScalar(Math.max(1, r / MIN_RING));
	}

	/** Draws a translucent stand-in where a device dragged from the tray would land: green where it can go, red where it cannot (with no spot yet, at the pointer). */
	setGhost(drag: { model: string; x: number; y: number; z: number; ok: boolean } | null) {
		const model = drag ? this.host.models.get(drag.model) : undefined;
		this.ghost.visible = !!drag && !!model;
		if (!drag || !model) return;
		const { width, depth, height } = model.body;
		const shape = `${model.id}`;
		if (shape !== this.ghostShape) {
			this.ghostShape = shape;
			this.ghostBox.scale.set(width, height, depth);
		}
		this.ghost.position.set(drag.x, drag.y, drag.z);
		this.ghostBox.position.y = height / 2;
		const color = drag.ok ? ACCENT : REFUSED;
		this.ghostBox.material.color.set(color);
		this.ghostRing.material.color.set(color);
		this.ghostRing.position.y = 0.02;
	}

	dispose() {
		this.group.removeFromParent();
		for (const mesh of [this.ring, this.ringTarget, this.marker, this.ball, this.ballTarget, this.ghostBox, this.ghostRing]) {
			mesh.geometry.dispose();
			(mesh.material as MeshBasicMaterial).dispose();
		}
		this.arc.geometry.dispose();
		(this.arc.material as LineBasicMaterial).dispose();
	}
}
