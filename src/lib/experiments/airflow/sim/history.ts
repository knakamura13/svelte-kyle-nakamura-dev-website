import type { Slice } from '../solver/types';

/** Seconds of simulated time a time-averaged speed covers. */
export const AVERAGE_WINDOW = 10;
/** Seconds of simulated time between samples kept for it. */
export const AVERAGE_INTERVAL = 0.5;

/** The mean of a value over the last `AVERAGE_WINDOW` simulated seconds, sampled every `AVERAGE_INTERVAL`. */
export class RollingMean {
	private readonly values: number[] = [];
	private lastTime = -Infinity;
	private readonly capacity = Math.round(AVERAGE_WINDOW / AVERAGE_INTERVAL);

	/** Offers a sample at simulated time `time`; it is kept only if an interval has passed since the last one. */
	push(time: number, value: number) {
		if (time - this.lastTime < AVERAGE_INTERVAL - 1e-9) return;
		this.lastTime = time;
		this.values.push(value);
		if (this.values.length > this.capacity) this.values.shift();
	}

	/** The mean of what has been kept, or null before at least two seconds of samples exist (one sample is a reading, not an average). */
	get mean() {
		return this.values.length * AVERAGE_INTERVAL >= 2 ? this.values.reduce((a, b) => a + b, 0) / this.values.length : null;
	}

	clear() {
		this.values.length = 0;
		this.lastTime = -Infinity;
	}
}

/** Speeds of the slice over the last `AVERAGE_WINDOW` seconds, so any point on it can report its own time average. */
export class SliceHistory {
	private readonly frames: Float32Array[] = [];
	private lastTime = -Infinity;
	private layer = -1;
	private readonly capacity = Math.round(AVERAGE_WINDOW / AVERAGE_INTERVAL);
	private width = 0;
	private depth = 0;
	private h = 0;

	/** Offers a slice at simulated time `time`. A different layer or size starts the history over. */
	push(time: number, slice: Slice) {
		const layer = Math.round(slice.y / slice.h);
		if (layer !== this.layer || slice.nx !== this.width || slice.nz !== this.depth) {
			this.frames.length = 0;
			this.lastTime = -Infinity;
			this.layer = layer;
			this.width = slice.nx;
			this.depth = slice.nz;
			this.h = slice.h;
		}
		if (time - this.lastTime < AVERAGE_INTERVAL - 1e-9) return;
		this.lastTime = time;
		this.frames.push(slice.speed.slice());
		if (this.frames.length > this.capacity) this.frames.shift();
	}

	/** Mean speed at (x, z) metres over the kept frames, bilinear in space, or null before two seconds of history. */
	averageAt(x: number, z: number) {
		if (this.frames.length * AVERAGE_INTERVAL < 2) return null;
		const gx = Math.min(this.width - 1, Math.max(0, x / this.h - 0.5));
		const gz = Math.min(this.depth - 1, Math.max(0, z / this.h - 0.5));
		const i = Math.min(this.width - 2, Math.floor(gx));
		const k = Math.min(this.depth - 2, Math.floor(gz));
		const fx = this.width > 1 ? gx - i : 0;
		const fz = this.depth > 1 ? gz - k : 0;
		const i1 = Math.min(this.width - 1, i + 1);
		const k1 = Math.min(this.depth - 1, k + 1);
		let sum = 0;
		for (const frame of this.frames) {
			const a = frame[i + this.width * k] * (1 - fx) + frame[i1 + this.width * k] * fx;
			const b = frame[i + this.width * k1] * (1 - fx) + frame[i1 + this.width * k1] * fx;
			sum += a * (1 - fz) + b * fz;
		}
		return sum / this.frames.length;
	}

	clear() {
		this.frames.length = 0;
		this.lastTime = -Infinity;
		this.layer = -1;
	}
}
