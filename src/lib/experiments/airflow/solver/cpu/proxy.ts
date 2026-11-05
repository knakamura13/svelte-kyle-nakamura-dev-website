import type { BackendFailure, BackendUpdate, FieldState, FlowBackend, Snapshot, SnapshotRequest } from '../backend';
import { Grid } from '../grid';
import type { SolverConfig } from '../types';
import { describeError, type Reply, type WorkerReply, type WorkerRequest } from './protocol';

/** The page's end of a connection to the solver's Web Worker: `portOfWorker` makes one from a `Worker`, and a test can make one from a message channel. */
export interface WorkerPort {
	postMessage(message: WorkerRequest): void;
	/** Says where replies go, and where to report that the worker itself failed (it threw outside a request, or never started). */
	listen(handlers: { message(reply: WorkerReply): void; error(message: string): void }): void;
	/** Stops the worker. Nothing more arrives from it. */
	terminate(): void;
}

export function portOfWorker(worker: Worker): WorkerPort {
	return {
		postMessage: (message) => worker.postMessage(message),
		listen: ({ message, error }) => {
			worker.onmessage = (event: MessageEvent<WorkerReply>) => message(event.data);
			worker.onerror = (event) => error(event.message || 'The solver worker failed.');
			worker.onmessageerror = () => error('The solver worker sent something the page could not read.');
		},
		terminate: () => worker.terminate()
	};
}

/** Particle steps the page asks for while the worker is still on the last one are added together, up to this much simulated time, s. */
const MAX_PARTICLE_STEP = 0.1;
/**
 * Most steps the page leaves unfinished with the worker (`FlowBackend.maxInFlight`). Two keep it busy: the next step is already
 * waiting when it finishes one, and a snapshot asked for now is not behind more than two steps. More would only make the picture late.
 */
export const WORKER_MAX_IN_FLIGHT = 2;

/**
 * The CPU solver in a Web Worker, behind the backend interface (host.ts is the worker's end). Nothing here computes: every
 * call becomes a message, so a step never blocks the page, and what comes back (snapshots, samples, fields) is a promise.
 *
 * `step` returns at once, so the page cannot learn how long a step takes by timing the call. The worker says when each is
 * done instead, and `stepsInFlight` is how many it has not. Particle steps are coalesced: only one is ever in flight, and
 * those asked for meanwhile arrive as a single step of their summed time, so a worker that is behind is not buried in them.
 */
export class WorkerBackend implements FlowBackend {
	readonly kind = 'cpu';
	readonly maxInFlight = WORKER_MAX_IN_FLIGHT;
	readonly grid: Grid;
	private cells = 0;
	private unfinished = 0;
	private moving = false;
	private unmoved = 0;
	private nextId = 1;
	private readonly waiting = new Map<number, { resolve(reply: WorkerReply): void; reject(error: Error): void }>();
	private readonly listeners = new Set<(failure: BackendFailure) => void>();
	private failure: BackendFailure | null = null;
	/** Set when the backend has failed or been disposed: nothing is sent after that. */
	private stopped = false;

	private constructor(
		private readonly port: WorkerPort,
		config: SolverConfig
	) {
		this.grid = new Grid(config.grid);
	}

	/** Has the worker build the solver for `config`, with the air at `initial` (as `CpuBackend`). Rejects if it cannot, and then the worker is stopped. */
	static async create(port: WorkerPort, config: SolverConfig, initial?: { theta?: number; particulates?: number }) {
		const backend = new WorkerBackend(port, config);
		port.listen({ message: (reply) => backend.receive(reply), error: (message) => backend.fail('crashed', message) });
		try {
			backend.cells = (await backend.ask<'created'>((id) => ({ type: 'create', id, config, initial }))).fluidCells;
		} catch (error) {
			backend.stop(error instanceof Error ? error : new Error(describeError(error)));
			throw error;
		}
		return backend;
	}

	get fluidCells() {
		return this.cells;
	}

	get stepsInFlight() {
		return this.unfinished;
	}

	onFailure(listener: (failure: BackendFailure) => void) {
		if (this.failure) {
			const failure = this.failure;
			queueMicrotask(() => listener(failure));
			return () => {};
		}
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	step(dt: number) {
		if (this.stopped) return;
		this.unfinished++;
		this.send({ type: 'step', dt });
	}

	update(change: BackendUpdate) {
		this.send({ type: 'update', change });
	}

	configureParticles(options: { tracers: number; smoke: number; scale: number; seed?: number }) {
		this.unmoved = 0;
		this.send({ type: 'configureParticles', options });
	}

	stepParticles(dt: number) {
		this.unmoved = Math.min(this.unmoved + dt, MAX_PARTICLE_STEP);
		this.moveParticles();
	}

	private moveParticles() {
		if (this.moving || this.unmoved <= 0 || this.stopped) return;
		const dt = this.unmoved;
		this.unmoved = 0;
		this.moving = true;
		this.send({ type: 'stepParticles', dt });
	}

	async snapshot(request: SnapshotRequest): Promise<Snapshot> {
		return (await this.ask<'snapshot'>((id) => ({ type: 'snapshot', id, request }))).snapshot;
	}

	async samplePoints(points: Float32Array) {
		return (await this.ask<'samplePoints'>((id) => ({ type: 'samplePoints', id, points }))).values;
	}

	async readFields(): Promise<FieldState> {
		return (await this.ask<'fields'>((id) => ({ type: 'readFields', id }))).fields;
	}

	writeFields(fields: FieldState) {
		this.send({ type: 'writeFields', fields });
	}

	dispose() {
		this.stop(new Error('The simulation was stopped.'));
	}

	private send(message: WorkerRequest) {
		if (this.stopped) return;
		try {
			this.port.postMessage(message);
		} catch (error) {
			this.fail('crashed', `The solver worker could not be sent a message: ${describeError(error)}`);
		}
	}

	private ask<T extends WorkerReply['type']>(message: (id: number) => WorkerRequest): Promise<Reply<T>> {
		if (this.stopped) return Promise.reject(new Error(this.failure?.message ?? 'The simulation was stopped.'));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.waiting.set(id, { resolve: resolve as (reply: WorkerReply) => void, reject });
			this.send(message(id));
		});
	}

	private receive(reply: WorkerReply) {
		if (this.stopped) return;
		switch (reply.type) {
			case 'stepped':
				this.unfinished = Math.max(0, this.unfinished - 1);
				return;
			case 'particlesStepped':
				this.moving = false;
				this.moveParticles();
				return;
			case 'failed':
				if (reply.id === undefined) this.fail('crashed', reply.message);
				else this.settle(reply.id, (waiter) => waiter.reject(new Error(reply.message)));
				return;
			default:
				this.settle(reply.id, (waiter) => waiter.resolve(reply));
		}
	}

	private settle(id: number, act: (waiter: { resolve(reply: WorkerReply): void; reject(error: Error): void }) => void) {
		const waiter = this.waiting.get(id);
		if (!waiter) return;
		this.waiting.delete(id);
		act(waiter);
	}

	/** The worker stopped on its own. Whoever is waiting is told, and so is whoever listens for failure. */
	private fail(reason: BackendFailure['reason'], message: string) {
		if (this.stopped) return;
		this.failure = { reason, message };
		this.stop(new Error(message));
		for (const listener of [...this.listeners]) listener(this.failure);
		this.listeners.clear();
	}

	/** Ends the connection: what was asked and not answered is rejected with `reason`, and the worker is terminated. */
	private stop(reason: Error) {
		if (this.stopped) return;
		this.stopped = true;
		this.unfinished = 0;
		const waiting = [...this.waiting.values()];
		this.waiting.clear();
		for (const waiter of waiting) waiter.reject(reason);
		this.port.terminate();
	}
}
