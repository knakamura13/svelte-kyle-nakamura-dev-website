import { CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';
import { disposeTree } from '$lib/experiments/engine/kit';
import type { Label, LabelLayer } from '$lib/experiments/engine/labels';
import type { ProbeReading } from '../readouts';
import type { Pin, UnitSystem } from '../state';
import { formatSpeed } from '../units';
import type { Point3 } from './deviceMath';
import { RENDER_ORDER } from './sliceLayer';

const INK = 0x202a24;
const SMOKE = 0xd9822b;
/** A marker floats this far above the slice so it never fights it for depth, m. */
const LIFT = 0.02;

/** Always transparent, even at full opacity: an opaque material is drawn before every transparent one whatever its render order, so the slice would tint it. */
const flat = (color: number, opacity = 1) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });

/** A ring lying flat in the plan. */
function ring(inner: number, outer: number, material: MeshBasicMaterial) {
	const mesh = new Mesh(new RingGeometry(inner, outer, 40), material);
	mesh.rotation.x = -Math.PI / 2;
	mesh.renderOrder = RENDER_ORDER.markers;
	return mesh;
}

interface PinView {
	group: Group;
	label: Label;
}

/**
 * The little things the visitor places or points at, drawn over the slice: a ring where the pointer or the keyboard
 * cursor is reading the air, a pulsing orange ring where smoke is being released, and a pin with its label for each
 * probe. Pins stand from the floor up to the slice, so the height they were pinned at reads. Everything is flat color, so
 * it looks the same in both themes.
 */
export class Markers {
	readonly group = new Group();
	private readonly hoverMark: Group;
	private readonly smokeMark: Group;
	private readonly pins = new Map<string, PinView>();
	private pinSignature = '';
	private pulse = 0;

	constructor(private readonly labels: LabelLayer) {
		const ink = flat(INK);
		const halo = flat(0xffffff, 0.75);
		this.hoverMark = new Group();
		const outer = ring(0.1, 0.125, ink);
		const glow = ring(0.125, 0.15, halo);
		const dot = new Mesh(new CircleGeometry(0.022, 16), ink);
		dot.rotation.x = -Math.PI / 2;
		dot.renderOrder = RENDER_ORDER.markers;
		this.hoverMark.add(glow, outer, dot);
		this.hoverMark.visible = false;

		const orange = flat(SMOKE, 0.9);
		this.smokeMark = new Group();
		this.smokeMark.add(ring(0.1, 0.13, orange));
		const core = new Mesh(new CircleGeometry(0.05, 20), orange);
		core.rotation.x = -Math.PI / 2;
		core.renderOrder = RENDER_ORDER.markers;
		this.smokeMark.add(core);
		this.smokeMark.visible = false;
		this.group.add(this.hoverMark, this.smokeMark);
	}

	/** Where the pointer or cursor is reading, or null to hide the ring. The point is on the slice plane. */
	setHover(point: Point3 | null) {
		this.hoverMark.visible = point !== null;
		if (point) this.hoverMark.position.set(point.x, point.y + LIFT, point.z);
	}

	/** Where smoke is being released, or null. */
	setSmoke(point: Point3 | null) {
		this.smokeMark.visible = point !== null;
		if (point) this.smokeMark.position.set(point.x, point.y + LIFT, point.z);
	}

	/** Whether anything here is moving by itself, so the Stage keeps drawing: smoke pulses while it is released. */
	get animating() {
		return this.smokeMark.visible;
	}

	/** Once a frame. */
	update(dt: number, reducedMotion: boolean) {
		if (!this.smokeMark.visible) return;
		this.pulse += dt;
		const scale = reducedMotion ? 1.1 : 1 + 0.35 * (0.5 + 0.5 * Math.sin(this.pulse * 5));
		this.smokeMark.scale.set(scale, 1, scale);
	}

	/**
	 * Matches the pins to the probes: one standing pin each, and a label that reads "Probe 1" and its speed (from
	 * `readings`, which arrive a few times a second, so a new pin has no number for a moment).
	 */
	syncProbes(probes: readonly Pin[], readings: readonly ProbeReading[], units: UnitSystem) {
		const signature = probes.map((p) => `${p.id}@${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join('|');
		if (signature !== this.pinSignature) {
			this.pinSignature = signature;
			for (const [id, view] of [...this.pins]) {
				if (probes.some((p) => p.id === id)) continue;
				this.group.remove(view.group);
				disposeTree(view.group);
				this.labels.remove(view.label);
				this.pins.delete(id);
			}
			for (const probe of probes) {
				let view = this.pins.get(probe.id);
				if (!view) {
					view = this.makePin(probe);
					this.pins.set(probe.id, view);
					this.group.add(view.group);
				}
				view.group.position.set(probe.x, 0, probe.z);
				view.label.position.set(probe.x, probe.y + 0.1, probe.z);
				// The stem reaches from the floor to the slice.
				const stem = view.group.children[0] as Mesh;
				stem.scale.y = probe.y;
				stem.position.y = probe.y / 2;
				view.group.children[1].position.y = probe.y + LIFT;
			}
		}
		for (const probe of probes) {
			const view = this.pins.get(probe.id);
			if (!view) continue;
			const reading = readings.find((r) => r.id === probe.id);
			view.label.set(`Probe ${probe.id.slice(1)}`, reading ? formatSpeed(reading.speed, units).text : '');
		}
	}

	private makePin(probe: Pin): PinView {
		const group = new Group();
		const material = flat(INK);
		const stemGeometry = new CylinderGeometry(0.006, 0.006, 1, 6);
		const stem = new Mesh(stemGeometry, material);
		stem.renderOrder = RENDER_ORDER.markers;
		const headGeometry = new SphereGeometry(0.055, 16, 10);
		const head = new Mesh(headGeometry, material);
		head.renderOrder = RENDER_ORDER.markers;
		group.add(stem, head);
		const label = this.labels.add({ name: `Probe ${probe.id.slice(1)}`, value: '', tone: 'probe', side: 'above' });
		return { group, label };
	}

	dispose() {
		for (const view of this.pins.values()) this.labels.remove(view.label);
		this.pins.clear();
		disposeTree(this.group);
		this.group.removeFromParent();
	}
}
