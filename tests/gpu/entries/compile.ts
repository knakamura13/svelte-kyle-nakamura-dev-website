/* Browser side of compile.gpu.ts: compiles every solver kernel on its own and reports each failure. */
import { ALL_KERNELS } from '$lib/experiments/airflow/solver/gpu/context';
import { moduleCode } from '$lib/experiments/airflow/solver/gpu/shaders/common';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface KernelReport {
	name: string;
	/** Compiler errors as `line:pos message | source line`. */
	errors: string[];
	/** createComputePipelineAsync's rejection, if any. */
	pipeline?: string;
	/** A bind group with every declared binding against the pipeline's layout, if it failed. */
	bindGroup?: string;
}

async function compileAll(): Promise<KernelReport[]> {
	const gpu = (navigator as any).gpu;
	const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
	const device = await adapter.requestDevice({ label: 'compile check' });
	const reports: KernelReport[] = [];
	for (const kernel of ALL_KERNELS) {
		const report: KernelReport = { name: kernel.name, errors: [] };
		reports.push(report);
		let code: string;
		try {
			code = moduleCode(kernel);
		} catch (error) {
			report.errors.push(String(error));
			continue;
		}
		const lines = code.split('\n');
		device.pushErrorScope('validation');
		const module = device.createShaderModule({ label: kernel.name, code });
		const info = await module.getCompilationInfo();
		for (const message of info.messages)
			if (message.type === 'error') report.errors.push(`${message.lineNum}:${message.linePos} ${message.message} | ${(lines[message.lineNum - 1] ?? '').trim()}`);
		const scope = await device.popErrorScope();
		if (!report.errors.length && scope) report.errors.push(`validation: ${scope.message}`);
		if (report.errors.length) continue;
		let pipeline: any;
		try {
			pipeline = await device.createComputePipelineAsync({ label: kernel.name, layout: 'auto', compute: { module, entryPoint: 'main' } });
		} catch (error) {
			report.pipeline = String((error as Error).message ?? error);
			continue;
		}
		// The host binds every declared binding (solver.ts), so the 'auto' layout must contain all of them.
		device.pushErrorScope('validation');
		const entries = kernel.bindings.map((binding, n) => ({
			binding: n,
			resource: {
				buffer: device.createBuffer({ size: 4096, usage: binding.kind === 'uniform' ? 0x40 | 0x8 : 0x80 | 0x8 })
			}
		}));
		device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
		const bind = await device.popErrorScope();
		if (bind) report.bindGroup = bind.message;
	}
	device.destroy();
	return reports;
}

(window as any).compileAll = compileAll;
(window as any).harnessReady = true;
