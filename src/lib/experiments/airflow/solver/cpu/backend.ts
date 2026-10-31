import type { BackendUpdate, FieldState, FlowBackend, Snapshot, SnapshotRequest } from '../backend';
import type { SolverConfig } from '../types';
import { extractVolume, volumeSpec, type VolumeSpec } from '../volume';
import type { Particles } from './particles';
import { CpuSolver } from './solver';

/** The CPU reference behind the backend interface. Runs wherever it is created: on the page, or inside a Web Worker. */
export class CpuBackend implements FlowBackend {
	readonly kind = 'cpu';
	readonly solver: CpuSolver;
	/** The grid the volume snapshot is averaged onto. */
	readonly volumeSpec: VolumeSpec;
	private particles: Particles | null = null;
	private particleScale = 1;

	constructor(config: SolverConfig, initial?: { theta?: number; particulates?: number }) {
		this.solver = new CpuSolver(config);
		this.solver.fill(initial?.theta ?? 0, initial?.particulates ?? 0);
		this.volumeSpec = volumeSpec(this.solver.grid);
	}

	get grid() {
		return this.solver.grid;
	}

	get fluidCells() {
		return this.solver.fluidCells;
	}

	step(dt: number) {
		this.solver.step(dt);
	}

	update(change: BackendUpdate) {
		const { geometry } = this.solver;
		const arrays = [geometry.au, geometry.av, geometry.aw];
		for (const faces of change.faces ?? []) for (let n = 0; n < faces.indices.length; n++) arrays[faces.axis][faces.indices[n]] = faces.values[n];
		if (change.exterior) this.solver.exterior = change.exterior;
		if (change.fans) this.solver.setFans(change.fans);
		if (change.emitters) this.solver.setEmitters(change.emitters);
		if (change.sinks) this.solver.setSinks(change.sinks);
	}

	configureParticles({ tracers, smoke, scale, seed }: { tracers: number; smoke: number; scale: number; seed?: number }) {
		this.particleScale = scale;
		this.particles = tracers + smoke > 0 ? this.solver.makeParticles(tracers, smoke, seed) : null;
	}

	stepParticles(dt: number) {
		this.particles?.step(dt, this.solver.vel, this.solver.c, this.particleScale);
	}

	async snapshot(request: SnapshotRequest): Promise<Snapshot> {
		return {
			diagnostics: this.solver.diagnostics(),
			slice: request.sliceY === undefined ? undefined : this.solver.slice(request.sliceY),
			tracers: request.particles && this.particles ? this.particles.tracers.slice() : undefined,
			smoke: request.particles && this.particles ? this.particles.smoke.slice() : undefined,
			rooms: request.rooms ? this.solver.rooms() : undefined,
			volume: request.volume ? this.volume() : undefined,
			fanFlow: this.solver.fanFlow.slice()
		};
	}

	/** The whole box on the volume grid: fresh arrays, so the worker can move them to the page. */
	volume() {
		const { solver } = this;
		return extractVolume(solver.grid, solver.geometry, solver.vel, solver.theta, solver.c, this.volumeSpec);
	}

	async samplePoints(points: Float32Array) {
		return this.solver.sample(points);
	}

	async readFields(): Promise<FieldState> {
		const { vel, theta, c } = this.solver;
		return { u: vel.u.slice(), v: vel.v.slice(), w: vel.w.slice(), p: this.solver.pressure.pressure.slice(), theta: theta.slice(), particulates: c.slice() };
	}

	writeFields(fields: FieldState) {
		this.solver.vel.u.set(fields.u);
		this.solver.vel.v.set(fields.v);
		this.solver.vel.w.set(fields.w);
		this.solver.pressure.pressure.set(fields.p);
		this.solver.theta.set(fields.theta);
		this.solver.c.set(fields.particulates);
	}

	dispose() {
		this.particles = null;
	}
}
