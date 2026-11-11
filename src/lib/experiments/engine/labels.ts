import { Vector3, type Camera } from 'three';

/**
 * Which color a label's dot takes: the value of its `data-tone`, which each Experiment's stylesheet maps
 * to a `--tone` color. A tone with no rule, such as the default `'plain'`, gets a neutral dot.
 */
export type LabelTone = string;

export interface LabelOptions {
	name: string;
	value?: string;
	tone?: LabelTone;
	/** Which side of its point the label sits on. */
	side?: 'above' | 'below' | 'right' | 'left';
	/**
	 * Labels of one group never cover one another (a Home's Room names). Each is placed in the order it was added: on its own side if it
	 * is clear of those already placed, else on the first other side that is, else it is hidden until there is room. No group: placed
	 * where it is asked, whatever is there.
	 */
	group?: string;
}

type Side = NonNullable<LabelOptions['side']>;

/** A label's box on its Stage, px. */
export interface LabelBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** The sides a label of a group tries after its own, in this order. */
const OTHER_SIDES: Side[] = ['above', 'below', 'right', 'left'];
/** Labels of a group keep at least this far apart, px. */
const GROUP_GAP = 2;

/** One HTML label, kept over a point in the scene by its LabelLayer. */
export class Label {
	readonly position = new Vector3();
	readonly el: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly valueEl: HTMLElement | null;
	private name: string;
	private value: string | undefined;
	private width = 0;
	private height = 0;
	private measured = false;
	private shown = true;
	/** Scenes switch a label off with this; the layer hides it until it is switched back on. */
	enabled = true;
	readonly group: string | undefined;

	constructor(
		private readonly side: Side,
		options: LabelOptions
	) {
		this.group = options.group;
		this.el = document.createElement('div');
		this.el.className = 'stage-label';
		this.el.dataset.tone = options.tone ?? 'plain';
		this.nameEl = document.createElement('span');
		this.nameEl.className = 'stage-label-name';
		this.nameEl.textContent = this.name = options.name;
		this.el.append(this.nameEl);
		if (options.value !== undefined) {
			this.valueEl = document.createElement('span');
			this.valueEl.className = 'stage-label-value';
			this.valueEl.textContent = this.value = options.value;
			this.el.append(this.valueEl);
		} else this.valueEl = null;
	}

	/** Only touches the DOM when the text actually changed. */
	set(name: string, value?: string) {
		if (name !== this.name) {
			this.nameEl.textContent = this.name = name;
			this.measured = false;
		}
		if (this.valueEl && value !== undefined && value !== this.value) {
			this.valueEl.textContent = this.value = value;
			this.measured = false;
		}
	}

	setTone(tone: LabelTone) {
		if (this.el.dataset.tone !== tone) this.el.dataset.tone = tone;
	}

	setValue(value: string) {
		this.set(this.name, value);
	}

	hide() {
		if (this.shown) {
			this.el.hidden = true;
			this.shown = false;
		}
	}

	private reveal() {
		if (!this.shown) {
			this.el.hidden = false;
			this.shown = true;
			this.measured = false;
		}
	}

	/** Measures the label once (again after its text changes or it comes back), shown or not. */
	private measure() {
		if (this.measured) return;
		const hidden = this.el.hidden;
		this.el.hidden = false;
		this.width = this.el.offsetWidth;
		this.height = this.el.offsetHeight;
		this.el.hidden = hidden;
		this.measured = true;
	}

	/** The box the label takes on `side` of pixel (x, y) inside a Stage of `width` × `height`, never past its edges. */
	private boxAt(x: number, y: number, width: number, height: number, side: Side): LabelBox {
		const gap = 10;
		const pad = 6;
		let left = x - this.width / 2;
		let top = y - this.height - gap;
		if (side === 'below') top = y + gap;
		else if (side === 'right') {
			left = x + gap;
			top = y - this.height / 2;
		} else if (side === 'left') {
			left = x - this.width - gap;
			top = y - this.height / 2;
		}
		left = Math.min(Math.max(left, pad), Math.max(pad, width - this.width - pad));
		top = Math.min(Math.max(top, pad), Math.max(pad, height - this.height - pad));
		return { left, top, right: left + this.width, bottom: top + this.height };
	}

	private show(box: LabelBox) {
		this.el.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`;
	}

	/** Places the label at pixel (x, y) inside a Stage of `width` × `height`, never past its edges. */
	place(x: number, y: number, width: number, height: number) {
		this.reveal();
		this.measure();
		this.show(this.boxAt(x, y, width, height, this.side));
	}

	/**
	 * Places the label at pixel (x, y) clear of `taken` (the boxes of its group placed before it): on its own side, or on the first other
	 * side that is clear. Returns the box it took, or null, and hides it, when no side is clear.
	 */
	placeClear(x: number, y: number, width: number, height: number, taken: readonly LabelBox[]): LabelBox | null {
		this.measure();
		for (const side of [this.side, ...OTHER_SIDES.filter((other) => other !== this.side)]) {
			const box = this.boxAt(x, y, width, height, side);
			if (taken.some((other) => box.left < other.right + GROUP_GAP && other.left < box.right + GROUP_GAP && box.top < other.bottom + GROUP_GAP && other.top < box.bottom + GROUP_GAP)) continue;
			this.reveal();
			this.measure();
			this.show(box);
			return box;
		}
		this.hide();
		return null;
	}
}

const scratch = new Vector3();

/** Owns the labels drawn over one Stage. */
export class LabelLayer {
	private readonly labels = new Set<Label>();

	constructor(private readonly host: HTMLElement) {}

	add(options: LabelOptions) {
		const label = new Label(options.side ?? 'above', options);
		this.labels.add(label);
		this.host.append(label.el);
		return label;
	}

	/** Takes one label off the Stage for good. */
	remove(label: Label) {
		if (this.labels.delete(label)) label.el.remove();
	}

	/** Moves every label to where its point currently projects, the labels of a group clear of one another. Call after rendering. */
	update(camera: Camera, width: number, height: number) {
		const groups = new Map<string, LabelBox[]>();
		for (const label of this.labels) {
			if (!label.enabled) {
				label.hide();
				continue;
			}
			scratch.copy(label.position).project(camera);
			const inView = scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
			const x = (scratch.x * 0.5 + 0.5) * width;
			const y = (-scratch.y * 0.5 + 0.5) * height;
			if (!inView) label.hide();
			else if (label.group === undefined) label.place(x, y, width, height);
			else {
				let taken = groups.get(label.group);
				if (!taken) groups.set(label.group, (taken = []));
				const box = label.placeClear(x, y, width, height, taken);
				if (box) taken.push(box);
			}
		}
	}

	dispose() {
		for (const label of this.labels) label.el.remove();
		this.labels.clear();
	}
}
