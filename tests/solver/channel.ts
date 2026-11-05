import { SolverHost, type MakeSolver } from '../../src/lib/experiments/airflow/solver/cpu/host';
import type { WorkerReply, WorkerRequest } from '../../src/lib/experiments/airflow/solver/cpu/protocol';
import type { WorkerPort } from '../../src/lib/experiments/airflow/solver/cpu/proxy';

/** A worker whose solver runs in this thread, joined to the page's side by a real message channel, and what a test can do to it. */
export interface TestWorker {
	port: WorkerPort;
	/** Every request the page sent, in order. */
	sent: WorkerRequest[];
	terminated: boolean;
	/** Holds the worker's replies back, as a slow worker does, or lets them through again. */
	hold(on: boolean): void;
	/** The worker fails outside any request, as a script error in it would. */
	crash(message: string): void;
}

/**
 * Messages cross it as they cross to a Web Worker: copied by structured clone (so a request that cannot be cloned throws
 * here too), queued and handled in order, with the transferred buffers of a reply detached on the sending side.
 * `terminate` closes the channel, which a test must do (dispose the backend) or its process stays open.
 */
export function inMemoryWorker(make?: MakeSolver): TestWorker {
	const { port1, port2 } = new MessageChannel();
	let handlers: Parameters<WorkerPort['listen']>[0] | null = null;
	let holding = false;
	const held: WorkerReply[] = [];

	const host = new SolverHost((reply, transfer) => port2.postMessage(reply, transfer ?? []), make);
	port2.onmessage = (event) => host.handle(event.data as WorkerRequest);
	port1.onmessage = (event) => {
		if (holding) held.push(event.data as WorkerReply);
		else handlers?.message(event.data as WorkerReply);
	};

	const worker: TestWorker = {
		sent: [],
		terminated: false,
		port: {
			postMessage(message) {
				worker.sent.push(message);
				if (!worker.terminated) port1.postMessage(message);
			},
			listen(next) {
				handlers = next;
			},
			terminate() {
				worker.terminated = true;
				port1.close();
				port2.close();
			}
		},
		hold(on) {
			holding = on;
			if (!on) for (const reply of held.splice(0)) handlers?.message(reply);
		},
		crash(message) {
			handlers?.error(message);
		}
	};
	return worker;
}

/** Waits until `done` is true, polling, and says what it waited for if it never is. */
export async function until(done: () => boolean, what: string, timeout = 10_000) {
	const deadline = Date.now() + timeout;
	while (!done()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
}
