/**
 * The part of the WebGPU API the solver uses. TypeScript's DOM library has no WebGPU types and the project does not
 * depend on @webgpu/types, so these are declared here, module-local (not global), so adding that package later
 * cannot conflict with them.
 */

export interface GpuAdapterInfo {
	vendor?: string;
	architecture?: string;
	device?: string;
	description?: string;
	isFallbackAdapter?: boolean;
}

export interface GpuSupportedLimits {
	readonly [name: string]: number;
}

export interface GpuFeatures {
	has(name: string): boolean;
}

export interface Gpu {
	requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GpuAdapter | null>;
}

export interface GpuAdapter {
	readonly features: GpuFeatures;
	readonly limits: GpuSupportedLimits;
	readonly info?: GpuAdapterInfo;
	readonly isFallbackAdapter?: boolean;
	requestDevice(descriptor?: { label?: string; requiredFeatures?: string[]; requiredLimits?: Record<string, number> }): Promise<GpuDevice>;
}

export interface GpuDeviceLostInfo {
	readonly reason: 'unknown' | 'destroyed';
	readonly message: string;
}

export interface GpuError {
	readonly message: string;
}

export interface GpuBuffer {
	readonly size: number;
	readonly mapState?: 'unmapped' | 'pending' | 'mapped';
	mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
	getMappedRange(offset?: number, size?: number): ArrayBuffer;
	unmap(): void;
	destroy(): void;
}

export interface GpuCompilationMessage {
	readonly type: 'error' | 'warning' | 'info';
	readonly message: string;
	readonly lineNum: number;
	readonly linePos: number;
}

export interface GpuShaderModule {
	getCompilationInfo(): Promise<{ readonly messages: readonly GpuCompilationMessage[] }>;
}

export interface GpuBindGroupLayout {
	readonly label?: string;
}

export interface GpuComputePipeline {
	getBindGroupLayout(index: number): GpuBindGroupLayout;
}

export interface GpuBindGroup {
	readonly label?: string;
}

export interface GpuQuerySet {
	destroy(): void;
}

export interface GpuComputePassEncoder {
	setPipeline(pipeline: GpuComputePipeline): void;
	setBindGroup(index: number, group: GpuBindGroup): void;
	dispatchWorkgroups(x: number, y?: number, z?: number): void;
	end(): void;
}

export interface GpuCommandBuffer {
	readonly label?: string;
}

export interface GpuCommandEncoder {
	beginComputePass(descriptor?: { label?: string; timestampWrites?: { querySet: GpuQuerySet; beginningOfPassWriteIndex?: number; endOfPassWriteIndex?: number } }): GpuComputePassEncoder;
	copyBufferToBuffer(source: GpuBuffer, sourceOffset: number, destination: GpuBuffer, destinationOffset: number, size: number): void;
	clearBuffer(buffer: GpuBuffer, offset?: number, size?: number): void;
	resolveQuerySet(querySet: GpuQuerySet, firstQuery: number, queryCount: number, destination: GpuBuffer, destinationOffset: number): void;
	finish(): GpuCommandBuffer;
}

export interface GpuQueue {
	submit(buffers: GpuCommandBuffer[]): void;
	writeBuffer(buffer: GpuBuffer, offset: number, data: ArrayBufferView | ArrayBuffer, dataOffset?: number, size?: number): void;
	onSubmittedWorkDone(): Promise<void>;
}

export interface GpuDevice {
	readonly features: GpuFeatures;
	readonly limits: GpuSupportedLimits;
	readonly queue: GpuQueue;
	readonly lost: Promise<GpuDeviceLostInfo>;
	createBuffer(descriptor: { label?: string; size: number; usage: number; mappedAtCreation?: boolean }): GpuBuffer;
	createShaderModule(descriptor: { label?: string; code: string }): GpuShaderModule;
	createComputePipelineAsync(descriptor: { label?: string; layout: 'auto'; compute: { module: GpuShaderModule; entryPoint: string } }): Promise<GpuComputePipeline>;
	createBindGroup(descriptor: { label?: string; layout: GpuBindGroupLayout; entries: { binding: number; resource: { buffer: GpuBuffer; offset?: number; size?: number } }[] }): GpuBindGroup;
	createCommandEncoder(descriptor?: { label?: string }): GpuCommandEncoder;
	createQuerySet(descriptor: { type: 'timestamp'; count: number }): GpuQuerySet;
	pushErrorScope(filter: 'validation' | 'out-of-memory' | 'internal'): void;
	popErrorScope(): Promise<GpuError | null>;
	addEventListener(type: 'uncapturederror', listener: (event: { error: GpuError }) => void): void;
	destroy(): void;
}

/** GPUBufferUsage flags. The global object exists only where WebGPU does, so the values are spelled out. */
export const BufferUsage = {
	MAP_READ: 0x0001,
	MAP_WRITE: 0x0002,
	COPY_SRC: 0x0004,
	COPY_DST: 0x0008,
	UNIFORM: 0x0040,
	STORAGE: 0x0080,
	QUERY_RESOLVE: 0x0200
} as const;

/** GPUMapMode flags. */
export const MapMode = { READ: 0x0001, WRITE: 0x0002 } as const;

/** The browser's WebGPU entry point, if it has one. */
export function navigatorGpu(): Gpu | undefined {
	if (typeof navigator === 'undefined') return undefined;
	return (navigator as Navigator & { gpu?: Gpu }).gpu ?? undefined;
}
