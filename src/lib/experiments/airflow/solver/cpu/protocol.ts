import type { BackendUpdate, FieldState, Snapshot, SnapshotRequest } from '../backend';
import type { SolverConfig } from '../types';

/**
 * What the page and the solver's Web Worker say to each other (proxy.ts is the page's side, host.ts the worker's). Messages
 * are copied between the threads, except the big arrays in a reply, which move. A request that wants an answer carries an
 * `id` and gets a reply with the same one. The worker handles requests in the order they arrive, so a snapshot asked for
 * after ten steps shows the flow after those ten.
 */
export type WorkerRequest =
	| { type: 'create'; id: number; config: SolverConfig; initial?: { theta?: number; particulates?: number } }
	| { type: 'step'; dt: number }
	| { type: 'update'; change: BackendUpdate }
	| { type: 'configureParticles'; options: { tracers: number; smoke: number; scale: number; seed?: number } }
	| { type: 'stepParticles'; dt: number }
	| { type: 'snapshot'; id: number; request: SnapshotRequest }
	| { type: 'samplePoints'; id: number; points: Float32Array }
	| { type: 'readFields'; id: number }
	| { type: 'writeFields'; fields: FieldState };

export type WorkerReply =
	| { type: 'created'; id: number; fluidCells: number }
	/** One per `step` request, once the step is done: how the page knows how many are unfinished. */
	| { type: 'stepped' }
	/** One per `stepParticles` request. */
	| { type: 'particlesStepped' }
	| { type: 'snapshot'; id: number; snapshot: Snapshot }
	| { type: 'samplePoints'; id: number; values: Float32Array }
	| { type: 'fields'; id: number; fields: FieldState }
	/** A request failed. With an `id` that one request did, and without, the solver is no longer usable. */
	| { type: 'failed'; id?: number; message: string };

/** The reply with the given `type`. */
export type Reply<T extends WorkerReply['type']> = Extract<WorkerReply, { type: T }>;

/** The buffers behind `arrays` that can move to the other thread instead of being copied: whole buffers, each once. */
export function transferList(...arrays: (ArrayBufferView | null | undefined)[]): ArrayBuffer[] {
	const buffers = new Set<ArrayBuffer>();
	for (const array of arrays) {
		const { buffer } = array ?? {};
		if (array && buffer instanceof ArrayBuffer && array.byteOffset === 0 && array.byteLength === buffer.byteLength) buffers.add(buffer);
	}
	return [...buffers];
}

export const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));
