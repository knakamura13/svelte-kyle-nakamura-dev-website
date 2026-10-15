import type { FieldState, Snapshot } from '../backend';
import type { SolverConfig } from '../types';
import { CpuBackend } from './backend';
import { describeError, transferList, type WorkerReply, type WorkerRequest } from './protocol';

/** Sends a reply to the page; the buffers in `transfer` move instead of being copied. */
export type Post = (reply: WorkerReply, transfer?: ArrayBuffer[]) => void;

/** Builds the solver for a `create` request. The CPU reference, unless a test passes one that fails. */
export type MakeSolver = (config: SolverConfig, initial?: { theta?: number; particulates?: number }) => CpuBackend;

/**
 * The worker's side of the protocol: holds the CPU solver and carries out what the page asks, in order. It does not touch
 * the worker's global scope, so a test can run it in Node behind a message channel; worker.ts connects it to the real one.
 */
export class SolverHost {
	private backend: CpuBackend | null = null;

	constructor(
		private readonly post: Post,
		private readonly make: MakeSolver = (config, initial) => new CpuBackend(config, initial)
	) {}

	handle(request: WorkerRequest) {
		try {
			switch (request.type) {
				case 'create':
					this.backend = this.make(request.config, request.initial);
					this.post({ type: 'created', id: request.id, fluidCells: this.backend.fluidCells });
					break;
				case 'step':
					this.solver().step(request.dt);
					this.post({ type: 'stepped' });
					break;
				case 'update':
					this.solver().update(request.change);
					break;
				case 'configureParticles':
					this.solver().configureParticles(request.options);
					break;
				case 'stepParticles':
					this.solver().stepParticles(request.dt);
					this.post({ type: 'particlesStepped' });
					break;
				case 'writeFields':
					this.solver().writeFields(request.fields);
					break;
				case 'snapshot':
					this.answer(request.id, this.solver().snapshot(request.request), (snapshot) => [{ type: 'snapshot', id: request.id, snapshot }, snapshotBuffers(snapshot)]);
					break;
				case 'samplePoints':
					this.answer(request.id, this.solver().samplePoints(request.points), (values) => [{ type: 'samplePoints', id: request.id, values }, transferList(values)]);
					break;
				case 'readFields':
					this.answer(request.id, this.solver().readFields(), (fields) => [{ type: 'fields', id: request.id, fields }, fieldBuffers(fields)]);
					break;
			}
		} catch (error) {
			this.fail('id' in request ? request.id : undefined, error);
		}
	}

	private solver() {
		if (!this.backend) throw new Error('The solver has not been created.');
		return this.backend;
	}

	/** The solver's reads are promises (the GPU's are real reads back), so the reply goes out when each one settles. */
	private answer<T>(id: number, work: Promise<T>, reply: (value: T) => [WorkerReply, ArrayBuffer[]]) {
		work.then((value) => this.post(...reply(value))).catch((error) => this.fail(id, error));
	}

	private fail(id: number | undefined, error: unknown) {
		try {
			this.post({ type: 'failed', id, message: describeError(error) });
		} catch {
			// The page has gone, and nothing is left to tell.
		}
	}
}

/** Every array in a snapshot is a fresh copy the solver does not keep, so all of them can move. */
function snapshotBuffers({ slice, tracers, smoke, fanFlow }: Snapshot) {
	return transferList(slice?.u, slice?.v, slice?.w, slice?.speed, slice?.theta, slice?.particulates, slice?.fluid, tracers, smoke, fanFlow);
}

function fieldBuffers({ u, v, w, p, theta, particulates }: FieldState) {
	return transferList(u, v, w, p, theta, particulates);
}
