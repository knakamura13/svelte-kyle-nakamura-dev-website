import { UNIFORM_STRUCTS } from '../layout';

/**
 * How kernels are written. Each kernel is one WGSL module with one entry point, `main`, and declares exactly the
 * bindings it uses, in a list the host also uses to build its bind group (so a binding can never be declared in the
 * shader and forgotten on the host, or the reverse). Every kernel stays within WebGPU's default of 8 storage buffers
 * per stage; uniforms are separate.
 *
 * Storage layout, all in the padded layout of grid.ts (index i + sx·j + sxy·k):
 *   vel, quantity, pred, next   vec4 per index: (u, v, w, 0). Packing the three face arrays into one is what keeps
 *                                advection and the scalar transport within 8 bindings, and lets one thread handle
 *                                the u, v and w faces that share an index.
 *   geo                         vec4: (au, av, aw, cell) where cell is room + 1 for air and −(room + 1) for solid,
 *                                so `w > 0` is the fluid mask and |w| − 1 the room.
 *   scal, scalNext              vec2: (θ, particulates).
 *   srcsink                     vec2: (release rate, ppm/s; purifier removal rate, 1/s).
 *   coef (one per level)        vec4: (cx, cy, cz, rhs). The diagonal is the sum of the six conductances, recomputed
 *                                where it is needed rather than stored: those six values are read anyway.
 *   p (one per level), nut      f32.
 */
export interface Binding {
	name: string;
	/** `uniform` takes a struct from layout.ts; the others are storage arrays. */
	kind: 'uniform' | 'read' | 'write';
	type: string;
}

export interface KernelSource {
	name: string;
	bindings: Binding[];
	code: string;
}

export const uniform = (name: string, struct: string): Binding => ({ name, kind: 'uniform', type: struct });
export const read = (name: string, type: string): Binding => ({ name, kind: 'read', type });
export const write = (name: string, type: string): Binding => ({ name, kind: 'write', type });

export const VEC4 = 'array<vec4<f32>>';
export const VEC2 = 'array<vec2<f32>>';
export const F32 = 'array<f32>';
export const U32 = 'array<u32>';

/** Threads per workgroup for the kernels that walk the grid. */
export const WG = 256;

export function moduleCode(kernel: KernelSource) {
	const storage = kernel.bindings.filter((b) => b.kind !== 'uniform').length;
	if (storage > 8) throw new Error(`Kernel ${kernel.name} binds ${storage} storage buffers; WebGPU guarantees 8.`);
	const declarations = kernel.bindings
		.map((b, n) => {
			if (b.kind === 'uniform') return `@group(0) @binding(${n}) var<uniform> ${b.name}: ${b.type};`;
			return `@group(0) @binding(${n}) var<storage, ${b.kind === 'read' ? 'read' : 'read_write'}> ${b.name}: ${b.type};`;
		})
		.join('\n');
	return `${UNIFORM_STRUCTS}\n${declarations}\n\n${kernel.code}\n`;
}

/** The entry point header of a kernel with one thread per index, launched as a 2D grid of workgroups when one row is not enough. */
export const ENTRY = `@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>, @builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>)`;

/** The thread's linear index and its workgroup's, given the entry point above. */
export const LINEAR = `let id = i32(gid.x + gid.y * nwg.x * ${WG}u);
	let group = wid.x + wid.y * nwg.x;`;

/** (i, j, k) of a padded index on the fine grid. */
export const DECODE = `fn decode(t: i32) -> vec3<i32> {
	let k = t / C.sxy;
	let r = t - k * C.sxy;
	let j = r / C.sx;
	return vec3<i32>(r - j * C.sx, j, k);
}`;

/**
 * One axis of a lattice position given as an integer base plus an offset: the clamp, floor and next-point test of the
 * CPU's `sample`. Keeping the integer part out of the floating-point value keeps the position exact to f32 rounding of
 * the offset alone, however large the grid.
 */
export const AXIS = `struct Axis { i: i32, f: f32, d: i32 }
fn axisAt(base: i32, offset: f32, m: i32) -> Axis {
	let whole = floor(offset);
	var i = base + i32(whole);
	var f = offset - whole;
	if (i < 0) {
		i = 0;
		f = 0.0;
	}
	if (i >= m) {
		i = m;
		f = 0.0;
	}
	var d = 0;
	if (i < m) {
		d = 1;
	}
	return Axis(i, f, d);
}`;

/** Lattice limits of the three face arrays (the `mx, my, mz` of the CPU's `sample`). */
export const LIMITS = {
	x: ['C.nx', 'C.ny - 1', 'C.nz - 1'],
	y: ['C.nx - 1', 'C.ny', 'C.nz - 1'],
	z: ['C.nx - 1', 'C.ny - 1', 'C.nz']
} as const;

/**
 * A trilinear sampler of one lane of a vec4 array on one face lattice, `fn name(b: vec3<i32>, o: vec3<f32>) -> f32`,
 * evaluated in the CPU's order. With `limited` it returns vec3(value, smallest, largest corner) for the MacCormack clamp.
 */
export function sampler(name: string, buffer: string, lane: 'x' | 'y' | 'z', limits: readonly [string, string, string], limited = false) {
	const v = (offset: string) => `${buffer}[base${offset}].${lane}`;
	const corners = ['', ' + dx', ' + dy', ' + dx + dy', ' + dz', ' + dx + dz', ' + dy + dz', ' + dx + dy + dz'];
	const loads = corners.map((offset, n) => `\tlet v${n} = ${v(offset)};`).join('\n');
	const range = limited
		? `\n\tlet lo = min(min(min(v0, v1), min(v2, v3)), min(min(v4, v5), min(v6, v7)));\n\tlet hi = max(max(max(v0, v1), max(v2, v3)), max(max(v4, v5), max(v6, v7)));`
		: '';
	return `fn ${name}(b: vec3<i32>, o: vec3<f32>) -> ${limited ? 'vec3<f32>' : 'f32'} {
	let ax = axisAt(b.x, o.x, ${limits[0]});
	let ay = axisAt(b.y, o.y, ${limits[1]});
	let az = axisAt(b.z, o.z, ${limits[2]});
	let base = ax.i + C.sx * ay.i + C.sxy * az.i;
	let dx = ax.d;
	let dy = ay.d * C.sx;
	let dz = az.d * C.sxy;
${loads}${range}
	let c00 = v0 * (1.0 - ax.f) + v1 * ax.f;
	let c10 = v2 * (1.0 - ax.f) + v3 * ax.f;
	let c01 = v4 * (1.0 - ax.f) + v5 * ax.f;
	let c11 = v6 * (1.0 - ax.f) + v7 * ax.f;
	let value = (c00 * (1.0 - ay.f) + c10 * ay.f) * (1.0 - az.f) + (c01 * (1.0 - ay.f) + c11 * ay.f) * az.f;
	return ${limited ? 'vec3<f32>(value, lo, hi)' : 'value'};
}`;
}

/** A workgroup tree reduction of `T` values in `name`, sum or max per lane; every thread must reach it. */
export function treeReduce(name: string, op: 'sum' | 'max', size = WG) {
	const combine = op === 'sum' ? `${name}[lid] = ${name}[lid] + ${name}[lid + s];` : `${name}[lid] = max(${name}[lid], ${name}[lid + s]);`;
	return `workgroupBarrier();
	for (var s = ${size / 2}u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			${combine}
		}
		workgroupBarrier();
	}`;
}
