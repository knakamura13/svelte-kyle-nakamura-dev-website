import { AXIS, DECODE, ENTRY, F32, LIMITS, LINEAR, VEC2, VEC4, read, sampler, uniform, write, type KernelSource } from './common';

/**
 * What the page reads: cpu/solver.ts `measure` and `airborneMass`, and cpu/readouts.ts. Sums are written per
 * workgroup and finished on the host in double; maxima are exact in any order.
 */

/**
 * Per workgroup, two vec4: (Σ net², fluid cells, fastest face speed, Σ cell speed²) and (largest CFL speed sum,
 * Σ particulates over every cell, 0, 0). The CFL speed sum is cpu/scalars.ts `maxCfl`'s per-cell sum, settling
 * included, which sets the scalar substep count.
 */
export const measure: KernelSource = {
	name: 'measure',
	bindings: [uniform('C', 'Consts'), read('vel', VEC4), read('geo', VEC4), read('scal', VEC2), write('partials', VEC4)],
	code: `${DECODE}
var<workgroup> sums: array<vec4<f32>, 256>;
var<workgroup> extra: array<vec2<f32>, 256>;
${ENTRY} {
	${LINEAR}
	var a = vec4<f32>(0.0);
	var b = vec2<f32>(0.0);
	if (id < C.size) {
		let c = id;
		let at = decode(c);
		if (at.x < C.nx && at.y < C.ny && at.z < C.nz) {
			b.y = scal[c].y;
			let g = geo[c];
			if (g.w > 0.0) {
				let here = vel[c];
				let ux = vel[c + 1].x;
				let vy = vel[c + C.sx].y;
				let wz = vel[c + C.sxy].z;
				let net = geo[c + 1].x * ux - g.x * here.x + geo[c + C.sx].y * vy - g.y * here.y + geo[c + C.sxy].z * wz - g.z * here.z;
				let fast = max(max(max(abs(here.x), abs(ux)), max(abs(here.y), abs(vy))), max(abs(here.z), abs(wz)));
				let cu = 0.5 * (here.x + ux);
				let cv = 0.5 * (here.y + vy);
				let cw = 0.5 * (here.z + wz);
				a = vec4<f32>(net * net, 1.0, fast, cu * cu + cv * cv + cw * cw);
				b.x = max(abs(here.x), abs(ux)) + max(abs(here.y), abs(vy)) + max(abs(here.z), abs(wz)) + C.settling;
			}
		}
	}
	sums[lid] = a;
	extra[lid] = b;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			let x = sums[lid];
			let y = sums[lid + s];
			sums[lid] = vec4<f32>(x.x + y.x, x.y + y.y, max(x.z, y.z), x.w + y.w);
			let p = extra[lid];
			let q = extra[lid + s];
			extra[lid] = vec2<f32>(max(p.x, q.x), p.y + q.y);
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		partials[2u * group] = sums[0];
		partials[2u * group + 1u] = vec4<f32>(extra[0].x, extra[0].y, 0.0, 0.0);
	}
}`
};

/** The largest CFL speed sum and fastest face over every workgroup, for the scalar substep estimate: a few bytes to read back. `N.a` partials. */
export const measureFinish: KernelSource = {
	name: 'measureFinish',
	bindings: [uniform('N', 'Counts'), read('partials', VEC4), write('result', VEC4)],
	code: `var<workgroup> best: array<vec2<f32>, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lid: u32) {
	var m = vec2<f32>(0.0);
	for (var n = i32(lid); n < N.a; n = n + 256) {
		m = max(m, vec2<f32>(partials[2 * n + 1].x, partials[2 * n].z));
	}
	best[lid] = m;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			best[lid] = max(best[lid], best[lid + s]);
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		result[0] = vec4<f32>(best[0].x, best[0].y, 0.0, 0.0);
	}
}`
};

/** cpu/readouts.ts `extractSlice` for layer `N.a`: per cell of the layer, (u, v, w, speed) and (θ, particulates, fluid, 0). */
export const slice: KernelSource = {
	name: 'slice',
	bindings: [uniform('C', 'Consts'), uniform('N', 'Counts'), read('vel', VEC4), read('geo', VEC4), read('scal', VEC2), write('out', VEC4)],
	code: `${ENTRY} {
	${LINEAR}
	if (id >= C.nx * C.nz) {
		return;
	}
	let i = id % C.nx;
	let k = id / C.nx;
	let cell = i + C.sx * N.a + C.sxy * k;
	var first = vec4<f32>(0.0);
	var second = vec4<f32>(0.0);
	if (geo[cell].w > 0.0) {
		let here = vel[cell];
		let u = 0.5 * (here.x + vel[cell + 1].x);
		let v = 0.5 * (here.y + vel[cell + C.sx].y);
		let w = 0.5 * (here.z + vel[cell + C.sxy].z);
		let s = scal[cell];
		first = vec4<f32>(u, v, w, sqrt(u * u + v * v + w * w));
		second = vec4<f32>(s.x, s.y, 1.0, 0.0);
	}
	out[2 * id] = first;
	out[2 * id + 1] = second;
}`
};

/** cpu/readouts.ts `samplePoints`: velocity by the face samplers, temperature and particulates by the cell-centred one. `N.a` points. */
export const sample: KernelSource = {
	name: 'sample',
	bindings: [uniform('C', 'Consts'), uniform('N', 'Counts'), read('points', F32), read('vel', VEC4), read('scal', VEC2), write('out', F32)],
	code: `${AXIS}
${sampler('faceU', 'vel', 'x', LIMITS.x)}
${sampler('faceV', 'vel', 'y', LIMITS.y)}
${sampler('faceW', 'vel', 'z', LIMITS.z)}
fn lerp(a: vec2<f32>, b: vec2<f32>, t: f32) -> vec2<f32> {
	return a + (b - a) * t;
}
// cpu/readouts.ts cellSample, for both scalars: clamped to the cell centres, lerp in the CPU's form.
fn cellSample(x: f32, y: f32, z: f32) -> vec2<f32> {
	let gx = clamp(x / C.h - 0.5, 0.0, f32(C.nx - 1));
	let gy = clamp(y / C.h - 0.5, 0.0, f32(C.ny - 1));
	let gz = clamp(z / C.h - 0.5, 0.0, f32(C.nz - 1));
	let i = i32(floor(gx));
	let j = i32(floor(gy));
	let k = i32(floor(gz));
	let fx = gx - f32(i);
	let fy = gy - f32(j);
	let fz = gz - f32(k);
	let dx = select(0, 1, i < C.nx - 1);
	let dy = select(0, C.sx, j < C.ny - 1);
	let dz = select(0, C.sxy, k < C.nz - 1);
	let b = i + C.sx * j + C.sxy * k;
	let c00 = lerp(scal[b], scal[b + dx], fx);
	let c10 = lerp(scal[b + dy], scal[b + dx + dy], fx);
	let c01 = lerp(scal[b + dz], scal[b + dx + dz], fx);
	let c11 = lerp(scal[b + dy + dz], scal[b + dx + dy + dz], fx);
	return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
}
${ENTRY} {
	${LINEAR}
	if (id >= N.a) {
		return;
	}
	let x = points[3 * id];
	let y = points[3 * id + 1];
	let z = points[3 * id + 2];
	let g = vec3<f32>(x / C.h, y / C.h, z / C.h);
	let origin = vec3<i32>(0);
	out[5 * id] = faceU(origin, g + vec3<f32>(0.0, -0.5, -0.5));
	out[5 * id + 1] = faceV(origin, g + vec3<f32>(-0.5, 0.0, -0.5));
	out[5 * id + 2] = faceW(origin, g + vec3<f32>(-0.5, -0.5, 0.0));
	let s = cellSample(x, y, z);
	out[5 * id + 3] = s.x;
	out[5 * id + 4] = s.y;
}`
};

/** Rooms handled by one pass of the room kernel, which keeps per-thread sums in registers. */
export const ROOMS_PER_PASS = 8;
/** Cells each thread of the room kernel walks. */
export const ROOM_CELLS_PER_THREAD = 64;

/**
 * cpu/readouts.ts `roomStats` for rooms N.a + 1 to N.a + N.b: per room, (cells, Σ speed, Σ θ, Σ particulates,
 * Σ inflow speed·open fraction) per workgroup. The host scales by the cell volume and face area and finishes in double.
 */
export const rooms: KernelSource = {
	name: 'rooms',
	bindings: [uniform('C', 'Consts'), uniform('N', 'Counts'), read('vel', VEC4), read('geo', VEC4), read('scal', VEC2), write('partials', F32)],
	code: `${DECODE}
const STRIDE: i32 = ${ROOMS_PER_PASS * 5};
var<workgroup> shared: array<array<f32, ${ROOMS_PER_PASS * 5}>, 64>;
fn roomOf(c: i32) -> i32 {
	return i32(abs(geo[c].w)) - 1;
}
@compute @workgroup_size(64)
fn main(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
	let group = i32(wid.x + wid.y * nwg.x);
	var acc: array<f32, ${ROOMS_PER_PASS * 5}>;
	for (var n = 0; n < STRIDE; n = n + 1) {
		acc[n] = 0.0;
	}
	let start = group * 64 * ${ROOM_CELLS_PER_THREAD};
	for (var m = 0; m < ${ROOM_CELLS_PER_THREAD}; m = m + 1) {
		let c = start + m * 64 + i32(lid);
		if (c >= C.size) {
			break;
		}
		let at = decode(c);
		let i = at.x;
		let j = at.y;
		let k = at.z;
		if (i >= C.nx || j >= C.ny || k >= C.nz) {
			continue;
		}
		let g = geo[c];
		if (g.w <= 0.0) {
			continue;
		}
		let r = i32(g.w) - 1;
		let slot = r - 1 - N.a;
		if (r == 0 || slot < 0 || slot >= N.b) {
			continue;
		}
		let here = vel[c];
		let ux = vel[c + 1].x;
		let vy = vel[c + C.sx].y;
		let wz = vel[c + C.sxy].z;
		let u = 0.5 * (here.x + ux);
		let v = 0.5 * (here.y + vy);
		let w = 0.5 * (here.z + wz);
		let s = scal[c];
		// Flow into this cell across each face that leads out of the room.
		var inflow = 0.0;
		if (g.x > 0.0 && (i == 0 || roomOf(c - 1) != r) && here.x > 0.0) {
			inflow = inflow + here.x * g.x;
		}
		let apx = geo[c + 1].x;
		if (apx > 0.0 && (i == C.nx - 1 || roomOf(c + 1) != r) && -ux > 0.0) {
			inflow = inflow + -ux * apx;
		}
		if (g.y > 0.0 && (j == 0 || roomOf(c - C.sx) != r) && here.y > 0.0) {
			inflow = inflow + here.y * g.y;
		}
		let apy = geo[c + C.sx].y;
		if (apy > 0.0 && (j == C.ny - 1 || roomOf(c + C.sx) != r) && -vy > 0.0) {
			inflow = inflow + -vy * apy;
		}
		if (g.z > 0.0 && (k == 0 || roomOf(c - C.sxy) != r) && here.z > 0.0) {
			inflow = inflow + here.z * g.z;
		}
		let apz = geo[c + C.sxy].z;
		if (apz > 0.0 && (k == C.nz - 1 || roomOf(c + C.sxy) != r) && -wz > 0.0) {
			inflow = inflow + -wz * apz;
		}
		let o = 5 * slot;
		acc[o] = acc[o] + 1.0;
		acc[o + 1] = acc[o + 1] + sqrt(u * u + v * v + w * w);
		acc[o + 2] = acc[o + 2] + s.x;
		acc[o + 3] = acc[o + 3] + s.y;
		acc[o + 4] = acc[o + 4] + inflow;
	}
	for (var n = 0; n < STRIDE; n = n + 1) {
		shared[lid][n] = acc[n];
	}
	workgroupBarrier();
	if (i32(lid) < STRIDE) {
		var total = 0.0;
		for (var t = 0; t < 64; t = t + 1) {
			total = total + shared[t][lid];
		}
		partials[group * STRIDE + i32(lid)] = total;
	}
}`
};

export const READOUT_KERNELS = [measure, measureFinish, slice, sample, rooms];
void VEC2;
