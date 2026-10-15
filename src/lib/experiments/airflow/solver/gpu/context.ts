import { GpuSolverError } from './errors';
import { moduleCode, type Binding, type KernelSource } from './shaders/common';
import { FLOW_KERNELS } from './shaders/flow';
import { PARTICLE_KERNELS } from './shaders/particles';
import { PRESSURE_KERNELS } from './shaders/pressure';
import { READOUT_KERNELS } from './shaders/readouts';
import { SCALAR_KERNELS } from './shaders/scalars';
import { navigatorGpu, type Gpu, type GpuAdapter, type GpuAdapterInfo, type GpuBindGroupLayout, type GpuComputePipeline, type GpuDevice, type GpuDeviceLostInfo } from './webgpu';

export const ALL_KERNELS: KernelSource[] = [...FLOW_KERNELS, ...PRESSURE_KERNELS, ...SCALAR_KERNELS, ...READOUT_KERNELS, ...PARTICLE_KERNELS];

export interface CompiledKernel {
	name: string;
	pipeline: GpuComputePipeline;
	layout: GpuBindGroupLayout;
	bindings: Binding[];
}

/**
 * Compiles every kernel and builds its pipeline. A kernel the compiler rejects (its `getCompilationInfo()` has an
 * error) or whose pipeline fails rejects with a `shader` error carrying the compiler's messages.
 */
export async function compileKernels(device: GpuDevice, kernels: KernelSource[]) {
	device.pushErrorScope('validation');
	const modules = kernels.map((kernel) => ({ kernel, module: device.createShaderModule({ label: kernel.name, code: moduleCode(kernel) }) }));
	const failures: string[] = [];
	for (const { kernel, module } of modules) {
		const info = await module.getCompilationInfo();
		for (const message of info.messages) if (message.type === 'error') failures.push(`${kernel.name} ${message.lineNum}:${message.linePos} ${message.message}`);
	}
	if (failures.length) {
		await device.popErrorScope();
		throw new GpuSolverError('shader', `A solver kernel did not compile (${failures.length} error${failures.length === 1 ? '' : 's'}).`, failures.join('\n'));
	}
	let pipelines: GpuComputePipeline[];
	try {
		pipelines = await Promise.all(modules.map(({ kernel, module }) => device.createComputePipelineAsync({ label: kernel.name, layout: 'auto', compute: { module, entryPoint: 'main' } })));
	} catch (error) {
		await device.popErrorScope();
		throw new GpuSolverError('shader', 'A solver kernel compiled but its pipeline could not be built.', String(error));
	}
	const validation = await device.popErrorScope();
	if (validation) throw new GpuSolverError('shader', 'A solver kernel failed validation.', validation.message);
	const compiled = new Map<string, CompiledKernel>();
	modules.forEach(({ kernel }, n) => compiled.set(kernel.name, { name: kernel.name, pipeline: pipelines[n], layout: pipelines[n].getBindGroupLayout(0), bindings: kernel.bindings }));
	return compiled;
}

export interface GpuContextOptions {
	/** The WebGPU entry point; defaults to `navigator.gpu`. */
	gpu?: Gpu;
	powerPreference?: 'low-power' | 'high-performance';
	/** Ask for timestamp queries (per-kernel timing) when the adapter offers them. */
	timestamps?: boolean;
	/** Called once if the device is lost while it is in use (not when it is disposed). */
	onLost?: (info: { reason: string; message: string }) => void;
	/** The kernels to build; the solver's own by default. Tests pass a broken one to check the failure path. */
	kernels?: KernelSource[];
}

/**
 * A WebGPU device with the solver's kernels compiled. Grids of any size share it: the auto-tuner rebuilds the solver
 * at another cell size without recompiling.
 */
export class GpuContext {
	readonly adapterInfo: GpuAdapterInfo;
	/** True from the moment the device is lost or disposed. */
	lost = false;
	lostReason = '';
	kernels = new Map<string, CompiledKernel>();
	private disposed = false;
	private readonly lostListeners = new Set<(info: { reason: string; message: string }) => void>();
	private errorsReported = 0;

	private constructor(
		readonly adapter: GpuAdapter,
		readonly device: GpuDevice,
		readonly timestamps: boolean
	) {
		const info = adapter.info ?? {};
		this.adapterInfo = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter };
	}

	static async create(options: GpuContextOptions = {}): Promise<GpuContext> {
		const gpu = options.gpu ?? navigatorGpu();
		if (!gpu) throw new GpuSolverError('no-webgpu', 'This browser does not support WebGPU.');
		let adapter: GpuAdapter | null;
		try {
			adapter = await gpu.requestAdapter({ powerPreference: options.powerPreference ?? 'high-performance' });
		} catch (error) {
			throw new GpuSolverError('no-adapter', 'WebGPU could not find a graphics adapter.', String(error));
		}
		if (!adapter) throw new GpuSolverError('no-adapter', 'WebGPU is present but offers no graphics adapter on this device.');
		const timestamps = !!options.timestamps && adapter.features.has('timestamp-query');
		let device: GpuDevice;
		try {
			device = await adapter.requestDevice({ label: 'airflow solver', requiredFeatures: timestamps ? ['timestamp-query'] : [] });
		} catch (error) {
			throw new GpuSolverError('device', 'The graphics adapter would not open a WebGPU device.', String(error));
		}
		const context = new GpuContext(adapter, device, timestamps);
		if (options.onLost) context.onLost(options.onLost);
		device.lost.then((info) => context.handleLost(info));
		device.addEventListener('uncapturederror', (event) => context.reportError(event.error.message));
		try {
			context.kernels = await compileKernels(device, options.kernels ?? ALL_KERNELS);
		} catch (error) {
			context.disposed = true;
			device.destroy();
			throw error;
		}
		if (context.lost) throw new GpuSolverError('lost', 'The graphics device was lost while the solver started.', context.lostReason);
		return context;
	}

	/** A short description for the Physics panel. */
	get description() {
		const { vendor, architecture, description, isFallbackAdapter } = this.adapterInfo;
		const name = [vendor, architecture].filter(Boolean).join(' ') || description || 'unknown adapter';
		return isFallbackAdapter ? `${name} (software)` : name;
	}

	kernel(name: string) {
		const kernel = this.kernels.get(name);
		if (!kernel) throw new Error(`No kernel ${name}.`);
		return kernel;
	}

	/** Subscribes to device loss. Returns the unsubscribe function. */
	onLost(listener: (info: { reason: string; message: string }) => void) {
		this.lostListeners.add(listener);
		return () => this.lostListeners.delete(listener);
	}

	private handleLost(info: GpuDeviceLostInfo) {
		this.lost = true;
		this.lostReason = info.message || info.reason;
		if (this.disposed) return;
		for (const listener of this.lostListeners) listener({ reason: info.reason, message: info.message });
	}

	private reportError(message: string) {
		// Validation errors mean a bug, not a device problem; say so once or twice without flooding the console.
		if (this.errorsReported++ < 3) console.error(`WebGPU solver error: ${message}`);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.lost = true;
		this.device.destroy();
	}
}
