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

/**
 * A marker that stands at a height over a spot of the floor, as a Probe will: a head at the height (`head`, which the caller fills), a
 * thin stem down to the floor and a soft spot where it meets it, so it reads as a point in the room at that height, not a ring adrift.
 */
class Standing {
	readonly group = new Group();
	readonly head = new Group();
	private readonly stem: Mesh;

	constructor(color: number) {
		this.stem = new Mesh(new CylinderGeometry(0.005, 0.005, 1, 6), flat(color, 0.6));
		this.stem.renderOrder = RENDER_ORDER.markers;
		const foot = new Mesh(new CircleGeometry(0.06, 24), flat(color, 0.28));
		foot.rotation.x = -Math.PI / 2;
		foot.position.y = 0.004;
		foot.renderOrder = RENDER_ORDER.markers;
		this.group.add(this.stem, foot, this.head);
		this.group.visible = false;
	}

	/** Stands it over (x, z) with its head at y, or hides it for null. */
	set(point: Point3 | null) {
		this.group.visible = point !== null;
		if (!point) return;
		this.group.position.set(point.x, 0, point.z);
		this.head.position.y = point.y + LIFT;
		this.stem.scale.y = Math.max(0.01, point.y);
		this.stem.position.y = point.y / 2;
	}
}

interface PinView {
	group: Group;
	label: Label;
}

/**
 * The little things the visitor places or points at: a marker where the pointer or the keyboard cursor is reading the air, a pulsing
 * orange one where smoke is being released, and a pin with its label for each probe. Each stands on a stem from the floor up to the
 * probe and smoke height, so the height reads. Everything is flat colour, so it looks the same in both themes.
 */
export class Markers {
	readonly group = new Group();
	private readonly hoverMark: Standing;
	private readonly smokeMark: Standing;
	private readonly pins = new Map<string, PinView>();
	private pinSignature = '';
	private pulse = 0;

	constructor(private readonly labels: LabelLayer) {
		// Where the pointer reads the air: a pin's head (a dot in a ring with a white halo) at the height a Probe would be pinned at.
		const ink = flat(INK);
		const halo = flat(0xffffff, 0.75);
		this.hoverMark = new Standing(INK);
		const dot = new Mesh(new SphereGeometry(0.03, 14, 8), ink);
		dot.renderOrder = RENDER_ORDER.markers;
		this.hoverMark.head.add(ring(0.125, 0.15, halo), ring(0.1, 0.125, ink), dot);

		// Where smoke is released: an orange ring that pulses round a core, at the same height.
		const orange = flat(SMOKE, 0.9);
		this.smokeMark = new Standing(SMOKE);
		const core = new Mesh(new SphereGeometry(0.045, 16, 10), orange);
		core.renderOrder = RENDER_ORDER.markers;
		this.smokeMark.head.add(ring(0.1, 0.13, orange), core);
		this.group.add(this.hoverMark.group, this.smokeMark.group);
	}

	/** Where the pointer or cursor is reading, or null to hide the marker. The point is at the probe and smoke height. */
	setHover(point: Point3 | null) {
		this.hoverMark.set(point);
	}

	/** Where smoke is being released, or null. */
	setSmoke(point: Point3 | null) {
		this.smokeMark.set(point);
	}

	/** Whether anything here is moving by itself, so the Stage keeps drawing: smoke pulses while it is released. */
	get animating() {
		return this.smokeMark.group.visible;
	}

	/** Once a frame. */
	update(dt: number, reducedMotion: boolean) {
		if (!this.smokeMark.group.visible) return;
		this.pulse += dt;
		const scale = reducedMotion ? 1.1 : 1 + 0.35 * (0.5 + 0.5 * Math.sin(this.pulse * 5));
		this.smokeMark.head.scale.set(scale, 1, scale);
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
