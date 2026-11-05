/**
 * Why the WebGPU solver could not start or stopped. The page falls back to the CPU worker on any of these, and the
 * Physics panel shows the message, so each one says what happened in words a visitor can read.
 */
export type GpuFailure =
	/** The browser has no `navigator.gpu`. */
	| 'no-webgpu'
	/** `requestAdapter()` returned null: WebGPU exists but this machine or browser offers no adapter. */
	| 'no-adapter'
	/** `requestDevice()` failed. */
	| 'device'
	/** A kernel did not compile (from `getCompilationInfo()`), or its pipeline could not be built. */
	| 'shader'
	/** The grid needs more memory, or a larger buffer, than the device allows. */
	| 'memory'
	/** The device was lost, before or during the run. */
	| 'lost';

export class GpuSolverError extends Error {
	constructor(
		readonly reason: GpuFailure,
		message: string,
		/** Compiler output or the browser's own message, for the console. */
		readonly detail?: string
	) {
		super(message);
		this.name = 'GpuSolverError';
	}
}

export const isGpuSolverError = (error: unknown): error is GpuSolverError => error instanceof GpuSolverError;
