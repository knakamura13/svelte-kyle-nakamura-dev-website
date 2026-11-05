import type { Grid } from '../grid';
import type { Geometry } from '../types';
import { sample, type Velocity } from './advect';

/** A small, seedable generator: 32-bit xorshift, uniform in [0, 1). */
export function seededRandom(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};
}

/** How long a particle drifts before it is put somewhere else, s. Staggered, so they do not all vanish together. */
const LIFETIME: [number, number] = [6, 12];
/** Tries a smoke particle gets to find a spot with smoke when it is respawned. */
const TRIES = 8;

/**
 * The little dots that make the flow visible: tracers drift with the air through the whole room, and smoke
 * particles drift too but only show where there are particulates. Each is four numbers, x, y, z in metres and a
 * fourth: the local air speed for a tracer, the local particulate concentration for a smoke particle.
 */
export class Particles {
	readonly tracers: Float32Array;
	readonly smoke: Float32Array;
	private readonly tracerAge: Float32Array;
	private readonly smokeAge: Float32Array;
	private readonly random: () => number;
	/** Every cell the air can occupy, to pick respawn places from. */
	private readonly places: Uint32Array;
	private readonly velocity = new Float64Array(3);

	constructor(
		private readonly grid: Grid,
		private readonly geometry: Geometry,
		tracers: number,
		smoke: number,
		seed = 1
	) {
		this.random = seededRandom(seed);
		this.tracers = new Float32Array(4 * tracers);
		this.smoke = new Float32Array(4 * smoke);
		this.tracerAge = new Float32Array(tracers);
		this.smokeAge = new Float32Array(smoke);
		const { nx, ny, nz, sx, sxy } = grid;
		const places: number[] = [];
		for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (geometry.fluid[i + sx * j + sxy * k]) places.push(i + sx * j + sxy * k);
		this.places = Uint32Array.from(places);
		for (let n = 0; n < tracers; n++) this.place(this.tracers, n, this.tracerAge);
		for (let n = 0; n < smoke; n++) this.place(this.smoke, n, this.smokeAge);
	}

	/** Puts particle `n` in a random cell of air, with a random age so the population stays mixed. */
	private place(array: Float32Array, n: number, ages: Float32Array, cell = this.places[Math.floor(this.random() * this.places.length)]) {
		const { sx, sxy, h } = this.grid;
		const i = cell % sx;
		const j = Math.floor((cell % sxy) / sx);
		const k = Math.floor(cell / sxy);
		array[4 * n] = (i + this.random()) * h;
		array[4 * n + 1] = (j + this.random()) * h;
		array[4 * n + 2] = (k + this.random()) * h;
		array[4 * n + 3] = 0;
		ages[n] = this.random() * (LIFETIME[1] - LIFETIME[0]) * 0.5;
	}

	private flowAt(vel: Velocity, x: number, y: number, z: number) {
		const { nx, ny, nz, sx, sxy, h } = this.grid;
		const gx = x / h;
		const gy = y / h;
		const gz = z / h;
		this.velocity[0] = sample(vel.u, sx, sxy, nx, ny - 1, nz - 1, gx, gy - 0.5, gz - 0.5);
		this.velocity[1] = sample(vel.v, sx, sxy, nx - 1, ny, nz - 1, gx - 0.5, gy, gz - 0.5);
		this.velocity[2] = sample(vel.w, sx, sxy, nx - 1, ny - 1, nz, gx - 0.5, gy - 0.5, gz);
	}

	private cellAt(x: number, y: number, z: number) {
		const { nx, ny, nz, sx, sxy, h } = this.grid;
		const i = Math.floor(x / h);
		const j = Math.floor(y / h);
		const k = Math.floor(z / h);
		return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + sx * j + sxy * k;
	}

	/** Moves every particle along the flow for `dt` seconds (midpoint rule). `scale` is the particulate concentration, ppm, that counts as dense smoke. */
	step(dt: number, vel: Velocity, particulates: Float32Array, scale: number) {
		this.advance(this.tracers, this.tracerAge, dt, vel, (n, cell, array, ages) => {
			array[4 * n + 3] = Math.hypot(this.velocity[0], this.velocity[1], this.velocity[2]);
			void cell;
			void ages;
		});
		this.advance(this.smoke, this.smokeAge, dt, vel, (n, cell, array) => {
			array[4 * n + 3] = cell >= 0 ? particulates[cell] : 0;
		});
		// A smoke particle that has drifted out of the smoke, or lived its life, tries to reappear where there is some.
		const { places } = this;
		for (let n = 0; n < this.smoke.length / 4; n++) {
			const here = this.smoke[4 * n + 3];
			if (here > 0.02 * scale && this.smokeAge[n] < LIFETIME[1]) continue;
			let found = false;
			for (let t = 0; t < TRIES && !found; t++) {
				const cell = places[Math.floor(this.random() * places.length)];
				if (this.random() * scale < particulates[cell]) {
					this.place(this.smoke, n, this.smokeAge, cell);
					this.smoke[4 * n + 3] = particulates[cell];
					this.smokeAge[n] = this.random() * (LIFETIME[1] - LIFETIME[0]);
					found = true;
				}
			}
			if (!found) {
				this.smoke[4 * n + 3] = 0;
				this.smokeAge[n] = 0;
			}
		}
	}

	private advance(
		array: Float32Array,
		ages: Float32Array,
		dt: number,
		vel: Velocity,
		after: (n: number, cell: number, array: Float32Array, ages: Float32Array) => void
	) {
		const { h } = this.grid;
		const limit = [this.grid.nx * h, this.grid.ny * h, this.grid.nz * h];
		for (let n = 0; n < array.length / 4; n++) {
			let x = array[4 * n];
			let y = array[4 * n + 1];
			let z = array[4 * n + 2];
			this.flowAt(vel, x, y, z);
			const mx = x + 0.5 * dt * this.velocity[0];
			const my = y + 0.5 * dt * this.velocity[1];
			const mz = z + 0.5 * dt * this.velocity[2];
			this.flowAt(vel, mx, my, mz);
			x += dt * this.velocity[0];
			y += dt * this.velocity[1];
			z += dt * this.velocity[2];
			ages[n] += dt;
			const cell = this.cellAt(x, y, z);
			if (cell < 0 || !this.geometry.fluid[cell] || x > limit[0] || y > limit[1] || z > limit[2]) {
				this.place(array, n, ages);
				ages[n] = 0;
				after(n, this.cellAt(array[4 * n], array[4 * n + 1], array[4 * n + 2]), array, ages);
				continue;
			}
			if (array === this.tracers && ages[n] > LIFETIME[0] + this.random() * (LIFETIME[1] - LIFETIME[0])) {
				this.place(array, n, ages);
				ages[n] = 0;
				continue;
			}
			array[4 * n] = x;
			array[4 * n + 1] = y;
			array[4 * n + 2] = z;
			after(n, cell, array, ages);
		}
	}
}
