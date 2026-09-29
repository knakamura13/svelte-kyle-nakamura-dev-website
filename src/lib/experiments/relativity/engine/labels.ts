import { Vector3, type Camera } from 'three';

export type LabelTone = 'rest' | 'mover' | 'light' | 'ghost' | 'muon' | 'plain';

export interface LabelOptions {
	name: string;
	value?: string;
	tone?: LabelTone;
	/** Which side of its point the label sits on. */
	side?: 'above' | 'below' | 'right' | 'left';
}

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

	constructor(
		private readonly side: NonNullable<LabelOptions['side']>,
		options: LabelOptions
	) {
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

	/** Places the label at pixel (x, y) inside a Stage of `width` × `height`, never past its edges. */
	place(x: number, y: number, width: number, height: number) {
		this.reveal();
		if (!this.measured) {
			this.width = this.el.offsetWidth;
			this.height = this.el.offsetHeight;
			this.measured = true;
		}
		const gap = 10;
		const pad = 6;
		let left = x - this.width / 2;
		let top = y - this.height - gap;
		if (this.side === 'below') top = y + gap;
		else if (this.side === 'right') {
			left = x + gap;
			top = y - this.height / 2;
		} else if (this.side === 'left') {
			left = x - this.width - gap;
			top = y - this.height / 2;
		}
		left = Math.min(Math.max(left, pad), Math.max(pad, width - this.width - pad));
		top = Math.min(Math.max(top, pad), Math.max(pad, height - this.height - pad));
		this.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
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

	/** Moves every label to where its point currently projects. Call after rendering. */
	update(camera: Camera, width: number, height: number) {
		for (const label of this.labels) {
			if (!label.enabled) {
				label.hide();
				continue;
			}
			scratch.copy(label.position).project(camera);
			const inView = scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1.2 && Math.abs(scratch.y) < 1.2;
			if (!inView) label.hide();
			else label.place((scratch.x * 0.5 + 0.5) * width, (-scratch.y * 0.5 + 0.5) * height, width, height);
		}
	}

	dispose() {
		for (const label of this.labels) label.el.remove();
		this.labels.clear();
	}
}
