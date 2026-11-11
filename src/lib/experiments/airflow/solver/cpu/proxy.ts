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
 * Fewest steps the page may leave unfinished with the worker (`FlowBackend.maxInFlight`). Two keep it busy: the next step is already
 * waiting when it finishes one, and a snapshot asked for now is not behind more than two steps. The page leaves it more only when its
 * steps are quick enough that it works through them all within a drawn frame (`stepTime`), so the picture is not made later than a frame.
 */
export const WORKER_MAX_IN_FLIGHT = 2;

/** How often the watchdog looks at the worker, ms. */
export const WATCHDOG_TICK = 500;
/** A tick that comes this much later than the last one, ms, came after the machine slept or the page was held up, and the silence before it is not counted. */
export const WATCHDOG_LATE = 2.5 * WATCHDOG_TICK;
/** How long a worker may leave what it was asked unanswered, ms, counted from ticks that came on time, before it is taken to have died. */
export const WATCHDOG_SILENCE = 8000;

/** What the watchdog keeps time with: a clock, ms, and a timer that calls `tick` every `ms` until it is cancelled. A test passes its own, to move time by hand. */
export interface WatchdogTimer {
	now(): number;
	every(ms: number, tick: () => void): () => void;
}

const systemTimer: WatchdogTimer = {
	now: () => performance.now(),
	every: (ms, tick) => {
		const timer = setInterval(tick, ms);
		return () => clearInterval(timer);
	}
};

/**
 * The CPU solver in a Web Worker, behind the backend interface (host.ts is the worker's end). Nothing here computes: every
 * call becomes a message, so a step never blocks the page, and what comes back (snapshots, samples, fields) is a promise.
 *
 * `step` returns at once, so the page cannot learn how long a step takes by timing the call. The worker says when each is
 * done instead, and `stepsInFlight` is how many it has not. Particle steps are coalesced: only one is ever in flight, and
 * those asked for meanwhile arrive as a single step of their summed time, so a worker that is behind is not buried in them.
 *
 * A worker the browser kills sends no error event: it just stops answering. A watchdog notices. While a step, a particle step or a
 * read is unanswered, it counts the time since the worker last replied, and after `WATCHDOG_SILENCE` it fails the backend as `crashed`.
 * The silence is counted only from timer ticks that come on time: a tick that comes late means the machine slept or the page was
 * held up, and then the worker was not given the time to answer either, so the count starts again.
 */
export class WorkerBackend implements FlowBackend {
	readonly kind = 'cpu';
	readonly maxInFlight = WORKER_MAX_IN_FLIGHT;
	readonly grid: Grid;
	private cells = 0;
	private unfinished = 0;
	/** How long a step takes in the worker lately, s, averaged over the last few; undefined until the first is done. */
	private seconds: number | undefined;
	private moving = false;
	private unmoved = 0;
	private nextId = 1;
	private readonly waiting = new Map<number, { resolve(reply: WorkerReply): void; reject(error: Error): void }>();
	private readonly listeners = new Set<(failure: BackendFailure) => void>();
	private failure: BackendFailure | null = null;
	/** Set when the backend has failed or been disposed: nothing is sent after that. */
	private stopped = false;
	/** How long the worker has left something unanswered, ms, counted from on-time ticks, and when the last tick came. */
	private silence = 0;
	private lastTick = 0;
	private unwatch: (() => void) | null = null;

	private constructor(
		private readonly port: WorkerPort,
		config: SolverConfig
	) {
		this.grid = new Grid(config.grid);
	}

	/**
	 * Has the worker build the solver for `config`, with the air at `initial` (as `CpuBackend`). Rejects if it cannot, and then the worker is
	 * stopped. The watchdog starts once the solver is built, so a worker script that is slow to load is not taken for a dead one.
	 */
	static async create(port: WorkerPort, config: SolverConfig, initial?: { theta?: number; particulates?: number }, { timer = systemTimer }: { timer?: WatchdogTimer } = {}) {
		const backend = new WorkerBackend(port, config);
		port.listen({ message: (reply) => backend.receive(reply), error: (message) => backend.fail('crashed', message) });
		try {
			backend.cells = (await backend.ask<'created'>((id) => ({ type: 'create', id, config, initial }))).fluidCells;
		} catch (error) {
			backend.stop(error instanceof Error ? error : new Error(describeError(error)));
			throw error;
		}
		if (!backend.stopped) {
			backend.lastTick = timer.now();
			backend.unwatch = timer.every(WATCHDOG_TICK, () => backend.tick(timer.now()));
		}
		return backend;
	}

	get fluidCells() {
		return this.cells;
	}

	get stepsInFlight() {
		return this.unfinished;
	}

	get stepTime() {
		return this.seconds;
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
		this.silence = 0;
		switch (reply.type) {
			case 'stepped':
				this.unfinished = Math.max(0, this.unfinished - 1);
				this.seconds = this.seconds === undefined ? reply.ms / 1000 : 0.8 * this.seconds + 0.2 * (reply.ms / 1000);
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

	/** The watchdog's look at the worker, at `now`, ms. */
	private tick(now: number) {
		const gap = now - this.lastTick;
		this.lastTick = now;
		const waiting = this.unfinished > 0 || this.moving || this.waiting.size > 0;
		if (!waiting || gap > WATCHDOG_LATE) {
			this.silence = 0;
			return;
		}
		this.silence += gap;
		if (this.silence >= WATCHDOG_SILENCE) this.fail('crashed', `The solver worker stopped answering: nothing came back from it for ${Math.round(this.silence / 1000)} seconds.`);
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
		this.unwatch?.();
		this.unwatch = null;
		const waiting = [...this.waiting.values()];
		this.waiting.clear();
		for (const waiter of waiting) waiter.reject(reason);
		this.port.terminate();
	}
}
