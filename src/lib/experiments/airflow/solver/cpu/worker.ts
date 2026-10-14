import { SolverHost } from './host';
import type { WorkerReply, WorkerRequest } from './protocol';

/**
 * The Web Worker that runs the CPU solver where the page has no WebGPU. `sim/backends.ts` starts it; `proxy.ts` is the
 * page's end of the conversation. This file touches only the two members of the worker's global scope it needs, so the
 * DOM types the rest of the project is checked against are not mixed with the worker library's.
 */
const scope = self as unknown as {
	postMessage(message: WorkerReply, transfer?: ArrayBuffer[]): void;
	onmessage: ((event: { data: WorkerRequest }) => void) | null;
};

const host = new SolverHost((reply, transfer) => scope.postMessage(reply, transfer ?? []));
scope.onmessage = (event) => host.handle(event.data);
