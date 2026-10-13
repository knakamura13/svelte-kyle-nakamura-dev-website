import { ADVECTION_LIMIT } from '../../types';
import { AXIS, DECODE, ENTRY, F32, LIMITS, LINEAR, U32, VEC4, read, sampler, treeReduce, uniform, write, type KernelSource } from './common';

/** Kernels for steps 1 to 4 of cpu/solver.ts: eddy viscosity, the force half-steps, advection and diffusion. */

/** cpu/turbulence.ts `eddyViscosity`. Cell velocities are formed on the fly from the faces (the CPU's scratch arrays hold exactly those values). */
export const turbulence: KernelSource = {
	name: 'turbulence',
	bindings: [uniform('C', 'Consts'), read('vel', VEC4), read('geo', VEC4), write('nut', F32)],
	code: `${DECODE}
// The CPU's cellVelocity: the mean of a cell's two faces on each axis, zero in a solid cell.
fn cellVel(c: i32) -> vec3<f32> {
	if (geo[c].w <= 0.0) {
		return vec3<f32>(0.0);
	}
	let a = vel[c];
	return vec3<f32>(0.5 * (a.x + vel[c + 1].x), 0.5 * (a.y + vel[c + C.sx].y), 0.5 * (a.z + vel[c + C.sxy].z));
}
fn gradient(q: f32, qm: f32, qp: f32, minus: bool, plus: bool) -> f32 {
	if (minus && plus) {
		return (qp - qm) * (0.5 / C.h);
	}
	if (plus) {
		return (qp - q) * (1.0 / C.h);
	}
	if (minus) {
		return (q - qm) * (1.0 / C.h);
	}
	return 0.0;
}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let p = decode(id);
	if (p.x >= C.nx || p.y >= C.ny || p.z >= C.nz) {
		return;
	}
	let c = id;
	let g = geo[c];
	if (g.w <= 0.0) {
		nut[c] = 0.0;
		return;
	}
	// Air continues on a side only if the face is open and a cell lies beyond it (an opening on the box leads outdoors).
	let xm = p.x > 0 && g.x > 0.0;
	let xp = p.x < C.nx - 1 && geo[c + 1].x > 0.0;
	let ym = p.y > 0 && g.y > 0.0;
	let yp = p.y < C.ny - 1 && geo[c + C.sx].y > 0.0;
	let zm = p.z > 0 && g.z > 0.0;
	let zp = p.z < C.nz - 1 && geo[c + C.sxy].z > 0.0;
	let a = vel[c];
	let ux = vel[c + 1].x;
	let vy = vel[c + C.sx].y;
	let wz = vel[c + C.sxy].z;
	let sxx = (ux - a.x) * (1.0 / C.h);
	let syy = (vy - a.y) * (1.0 / C.h);
	let szz = (wz - a.z) * (1.0 / C.h);
	let q = vec3<f32>(0.5 * (a.x + ux), 0.5 * (a.y + vy), 0.5 * (a.z + wz));
	var mx = vec3<f32>(0.0);
	var px = vec3<f32>(0.0);
	var my = vec3<f32>(0.0);
	var py = vec3<f32>(0.0);
	var mz = vec3<f32>(0.0);
	var pz = vec3<f32>(0.0);
	if (xm) {
		mx = cellVel(c - 1);
	}
	if (xp) {
		px = cellVel(c + 1);
	}
	if (ym) {
		my = cellVel(c - C.sx);
	}
	if (yp) {
		py = cellVel(c + C.sx);
	}
	if (zm) {
		mz = cellVel(c - C.sxy);
	}
	if (zp) {
		pz = cellVel(c + C.sxy);
	}
	let sxy = 0.5 * (gradient(q.x, my.x, py.x, ym, yp) + gradient(q.y, mx.y, px.y, xm, xp));
	let sxz = 0.5 * (gradient(q.x, mz.x, pz.x, zm, zp) + gradient(q.z, mx.z, px.z, xm, xp));
	let syz = 0.5 * (gradient(q.y, mz.y, pz.y, zm, zp) + gradient(q.z, my.z, py.z, ym, yp));
	let magnitude = sqrt(2.0 * (sxx * sxx + syy * syy + szz * szz) + 4.0 * (sxy * sxy + sxz * sxz + syz * syz));
	let speed = sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
	var shearLength = C.maxLength;
	if (speed < C.maxLength * magnitude) {
		shearLength = speed / magnitude;
	}
	let value = C.shear * speed * shearLength;
	nut[c] = select(C.nutMax, value, value < C.nutMax);
}`
};

/**
 * cpu/forces.ts `fanAcceleration`: one workgroup per fan reduces the flow through its disk, then works out its push
 * from the fan curve. `fanCells` holds (cell, weight bits) for every fan back to back; `fanInfo` two vec4 per fan:
 * (normal, area) and (qMax, dpMax, first entry, entry count). `fanState` per fan: (flow, acceleration, Σweight, Σweight·axial).
 */
export const fanFlow: KernelSource = {
	name: 'fanFlow',
	bindings: [uniform('C', 'Consts'), read('vel', VEC4), read('fanCells', 'array<vec2<u32>>'), read('fanInfo', VEC4), write('fanState', VEC4)],
	code: `var<workgroup> axial: array<f32, 256>;
var<workgroup> weights: array<f32, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>) {
	let n = wid.x;
	let shape = fanInfo[2u * n];
	let curve = fanInfo[2u * n + 1u];
	let first = bitcast<u32>(curve.z);
	let count = bitcast<u32>(curve.w);
	var a = 0.0;
	var w = 0.0;
	for (var e = lid; e < count; e = e + 256u) {
		let entry = fanCells[first + e];
		let cell = i32(entry.x);
		let weight = bitcast<f32>(entry.y);
		let here = vel[cell];
		let u = 0.5 * (here.x + vel[cell + 1].x);
		let v = 0.5 * (here.y + vel[cell + C.sx].y);
		let ww = 0.5 * (here.z + vel[cell + C.sxy].z);
		a = a + weight * (u * shape.x + v * shape.y + ww * shape.z);
		w = w + weight;
	}
	axial[lid] = a;
	weights[lid] = w;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			axial[lid] = axial[lid] + axial[lid + s];
			weights[lid] = weights[lid] + weights[lid + s];
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		let total = weights[0];
		let sum = axial[0];
		var flow = 0.0;
		if (total > 0.0) {
			flow = (shape.w * sum) / total;
		}
		var acceleration = 0.0;
		if (curve.x > 0.0 && curve.y > 0.0 && total > 0.0) {
			let ratio = flow / curve.x;
			acceleration = (curve.y * (1.0 - ratio * ratio) * shape.w) / (total * (C.h * C.h * C.h) * C.rho);
		}
		fanState[n] = vec4<f32>(flow, acceleration, total, sum);
	}
}`
};

/**
 * The carried quantity of step 2: velocity plus half a step of last step's pressure gradient (cpu/forces.ts
 * `applyPressureGradient`) and, on y faces, half a step of buoyancy (`applyBuoyancy`), in the CPU's order.
 */
export const quantity: KernelSource = {
	name: 'quantity',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), read('vel', VEC4), read('geo', VEC4), read('p', F32), read('scal', 'array<vec2<f32>>'), write('out', VEC4)],
	code: `${DECODE}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let f = id;
	let at = decode(f);
	let i = at.x;
	let j = at.y;
	let k = at.z;
	let g = geo[f];
	var q = vel[f];
	if (i > 0 && i < C.nx && j < C.ny && k < C.nz && g.x > 0.0) {
		q.x = q.x - S.kgrad * (p[f] - p[f - 1]);
	}
	if (j > 0 && j < C.ny && i < C.nx && k < C.nz && g.y > 0.0) {
		q.y = q.y - S.kgrad * (p[f] - p[f - C.sx]);
	}
	if (k > 0 && k < C.nz && i < C.nx && j < C.ny && g.z > 0.0) {
		q.z = q.z - S.kgrad * (p[f] - p[f - C.sxy]);
	}
	if ((C.flags & 2u) != 0u && j > 0 && j < C.ny && i < C.nx && k < C.nz && g.y > 0.0) {
		q.y = q.y + S.kbuoy * (scal[f - C.sx].x + scal[f].x);
	}
	out[f] = q;
}`
};

/** The other half of buoyancy after advection (cpu/forces.ts `applyBuoyancy` on the advected velocity). */
export const buoyancy: KernelSource = {
	name: 'buoyancy',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), write('vel', VEC4), read('geo', VEC4), read('scal', 'array<vec2<f32>>')],
	code: `${DECODE}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let at = decode(id);
	if (at.y > 0 && at.y < C.ny && at.x < C.nx && at.z < C.nz && geo[id].y > 0.0) {
		vel[id].y = vel[id].y + S.kbuoy * (scal[id - C.sx].x + scal[id].x);
	}
}`
};

/**
 * cpu/forces.ts `applyFans`, conflict-free: one thread per face index that any fan pushes, adding the pushes of every
 * fan that covers it in fan order (the order the CPU adds them in). `fanIndex` lists those indices, `fanStart` where
 * each one's entries begin, and `fanEntries` holds (fan | axis << 16, weight bits). Counts.a is how many indices there are.
 */
export const applyFans: KernelSource = {
	name: 'applyFans',
	bindings: [uniform('S', 'Step'), uniform('N', 'Counts'), read('fanIndex', U32), read('fanStart', U32), read('fanEntries', 'array<vec2<u32>>'), read('fanState', VEC4), write('vel', VEC4)],
	code: `${ENTRY} {
	${LINEAR}
	if (id >= N.a) {
		return;
	}
	let u = u32(id);
	let index = i32(fanIndex[u]);
	var value = vel[index];
	for (var e = fanStart[u]; e < fanStart[u + 1u]; e = e + 1u) {
		let entry = fanEntries[e];
		let fan = entry.x & 0xffffu;
		let axis = entry.x >> 16u;
		let k = S.half * fanState[fan].y;
		if (k == 0.0) {
			continue;
		}
		let push = k * bitcast<f32>(entry.y);
		if (axis == 0u) {
			value.x = value.x + push;
		} else if (axis == 1u) {
			value.y = value.y + push;
		} else {
			value.z = value.z + push;
		}
	}
	vel[index] = value;
}`
};

/** The carrier samplers for advection: u, v and w of the divergence-free velocity on their own lattices. */
const CARRIER = [sampler('carrierU', 'vel', 'x', LIMITS.x), sampler('carrierV', 'vel', 'y', LIMITS.y), sampler('carrierW', 'vel', 'z', LIMITS.z)].join('\n');

/**
 * The midpoint backtrace of cpu/advect.ts for a face at index b of the lattice with offsets o (0 or ½ per axis):
 * returns dtg times the velocity at the midpoint, so the departure point is b − that and the MacCormack forward point b + that.
 */
const BACKTRACE = `fn backtrace(b: vec3<i32>, o: vec3<f32>) -> vec3<f32> {
	let cu = carrierU(b, o + vec3<f32>(0.0, -0.5, -0.5));
	let cv = carrierV(b, o + vec3<f32>(-0.5, 0.0, -0.5));
	let cw = carrierW(b, o + vec3<f32>(-0.5, -0.5, 0.0));
	let hw = o - vec3<f32>(0.5 * S.dtg * cu, 0.5 * S.dtg * cv, 0.5 * S.dtg * cw);
	let mu = carrierU(b, hw + vec3<f32>(0.0, -0.5, -0.5));
	let mv = carrierV(b, hw + vec3<f32>(-0.5, 0.0, -0.5));
	let mw = carrierW(b, hw + vec3<f32>(-0.5, -0.5, 0.0));
	return vec3<f32>(S.dtg * mu, S.dtg * mv, S.dtg * mw);
}`;

const OFFSETS = { x: 'vec3<f32>(0.0, 0.5, 0.5)', y: 'vec3<f32>(0.5, 0.0, 0.5)', z: 'vec3<f32>(0.5, 0.5, 0.0)' } as const;
const VALID = { x: 'at.y < C.ny && at.z < C.nz', y: 'at.x < C.nx && at.z < C.nz', z: 'at.x < C.nx && at.y < C.ny' } as const;

/**
 * cpu/advect.ts `advectVelocity`, first pass: the semi-Lagrangian value at each face's departure point. With the
 * MacCormack correction off this is the result. One thread does the u, v and w faces of one index.
 */
export const advectBack: KernelSource = {
	name: 'advectBack',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), read('vel', VEC4), read('phi', VEC4), read('geo', VEC4), write('out', VEC4)],
	code: `${DECODE}
${AXIS}
${CARRIER}
${sampler('phiU', 'phi', 'x', LIMITS.x)}
${sampler('phiV', 'phi', 'y', LIMITS.y)}
${sampler('phiW', 'phi', 'z', LIMITS.z)}
${BACKTRACE}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let at = decode(id);
	let g = geo[id];
	var result = vec4<f32>(0.0);
	if (${VALID.x} && g.x > 0.0) {
		result.x = phiU(at, -backtrace(at, ${OFFSETS.x}));
	}
	if (${VALID.y} && g.y > 0.0) {
		result.y = phiV(at, -backtrace(at, ${OFFSETS.y}));
	}
	if (${VALID.z} && g.z > 0.0) {
		result.z = phiW(at, -backtrace(at, ${OFFSETS.z}));
	}
	out[id] = result;
}`
};

/**
 * Second pass: advect the first pass's result forward again, halve the round trip's error, and bound the result to a
 * share `ADVECTION_LIMIT` of the way from the semi-Lagrangian value to the extremes of the eight values the departure
 * point was interpolated from (Selle et al. 2008), as cpu/advect.ts does.
 */
export const advectCorrect: KernelSource = {
	name: 'advectCorrect',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), read('vel', VEC4), read('phi', VEC4), read('pred', VEC4), read('geo', VEC4), write('out', VEC4)],
	code: `${DECODE}
${AXIS}
${CARRIER}
${sampler('phiU', 'phi', 'x', LIMITS.x, true)}
${sampler('phiV', 'phi', 'y', LIMITS.y, true)}
${sampler('phiW', 'phi', 'z', LIMITS.z, true)}
${sampler('predU', 'pred', 'x', LIMITS.x)}
${sampler('predV', 'pred', 'y', LIMITS.y)}
${sampler('predW', 'pred', 'z', LIMITS.z)}
${BACKTRACE}
fn corrected(back: vec3<f32>, here: f32, forward: f32) -> f32 {
	let value = back.x + 0.5 * (here - forward);
	let ceiling = back.x + ${ADVECTION_LIMIT.toFixed(6)} * (back.z - back.x);
	let floor = back.x - ${ADVECTION_LIMIT.toFixed(6)} * (back.x - back.y);
	return select(select(value, ceiling, value > ceiling), floor, value < floor);
}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let at = decode(id);
	let g = geo[id];
	let here = phi[id];
	var result = vec4<f32>(0.0);
	if (${VALID.x} && g.x > 0.0) {
		let d = backtrace(at, ${OFFSETS.x});
		result.x = corrected(phiU(at, -d), here.x, predU(at, d));
	}
	if (${VALID.y} && g.y > 0.0) {
		let d = backtrace(at, ${OFFSETS.y});
		result.y = corrected(phiV(at, -d), here.y, predV(at, d));
	}
	if (${VALID.z} && g.z > 0.0) {
		let d = backtrace(at, ${OFFSETS.z});
		result.z = corrected(phiW(at, -d), here.z, predW(at, d));
	}
	out[id] = result;
}`
};

/**
 * cpu/diffuse.ts `diffuseVelocity`: one explicit substep of ∇·(ν_eff ∇u) for all three components of an index.
 * `C.side[s]` is (free-slip, wall velocity) for side s, which sets a wall's ghost value.
 */
export const diffuse: KernelSource = {
	name: 'diffuse',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), read('vel', VEC4), read('geo', VEC4), read('nut', F32), write('out', VEC4)],
	code: `${DECODE}
fn ghost(side: i32, component: i32, value: f32) -> f32 {
	let condition = C.side[side];
	if (condition.x > 0.5) {
		return value;
	}
	var wall = condition.y;
	if (component == 1) {
		wall = condition.z;
	} else if (component == 2) {
		wall = condition.w;
	}
	return 2.0 * wall - value;
}
// One tangential axis of a face: neighbours across open faces, a part-open face blending the neighbour with the
// centre's mirror image by its open fraction, a box side giving its ghost. openLo/openHi are the open fractions of the
// two cells' faces on that axis (minus side), openLoP/openHiP the plus side's.
fn tangential(centre: f32, minusValue: f32, plusValue: f32, openLo: f32, openHi: f32, openLoP: f32, openHiP: f32, position: i32, cells: i32, side: i32, component: i32) -> f32 {
	var plus: f32;
	var minus: f32;
	if (position + 1 < cells) {
		let through = 0.5 * (openLoP + openHiP);
		plus = through * plusValue - (1.0 - through) * centre;
	} else {
		plus = ghost(side + 1, component, centre);
	}
	if (position > 0) {
		let through = 0.5 * (openLo + openHi);
		minus = through * minusValue - (1.0 - through) * centre;
	} else {
		minus = ghost(side, component, centre);
	}
	return plus + minus - 2.0 * centre;
}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let f = id;
	let at = decode(f);
	let i = at.x;
	let j = at.y;
	let k = at.z;
	let here = vel[f];
	let g = geo[f];
	var result = vec4<f32>(0.0);
	let kd = S.kdiff;
	// u: normal axis x, tangential y then z.
	if (j < C.ny && k < C.nz && g.x > 0.0) {
		if (i == 0 || i == C.nx) {
			result.x = here.x;
		} else {
			let lo = f - 1;
			let centre = here.x;
			let faceNu = C.nu + 0.5 * (nut[lo] + nut[f]);
			var plusY = 0.0;
			var minusY = 0.0;
			var plusZ = 0.0;
			var minusZ = 0.0;
			if (j + 1 < C.ny) {
				plusY = vel[f + C.sx].x;
			}
			if (j > 0) {
				minusY = vel[f - C.sx].x;
			}
			if (k + 1 < C.nz) {
				plusZ = vel[f + C.sxy].x;
			}
			if (k > 0) {
				minusZ = vel[f - C.sxy].x;
			}
			let normal = (C.nu + nut[f]) * (vel[f + 1].x - centre) - (C.nu + nut[lo]) * (centre - vel[f - 1].x);
			let around = tangential(centre, minusY, plusY, geo[lo].y, g.y, geo[lo + C.sx].y, geo[f + C.sx].y, j, C.ny, 2, 0) +
				tangential(centre, minusZ, plusZ, geo[lo].z, g.z, geo[lo + C.sxy].z, geo[f + C.sxy].z, k, C.nz, 4, 0);
			result.x = centre + kd * (normal + faceNu * around);
		}
	}
	// v: normal axis y, tangential z then x.
	if (i < C.nx && k < C.nz && g.y > 0.0) {
		if (j == 0 || j == C.ny) {
			result.y = here.y;
		} else {
			let lo = f - C.sx;
			let centre = here.y;
			let faceNu = C.nu + 0.5 * (nut[lo] + nut[f]);
			var plusZ = 0.0;
			var minusZ = 0.0;
			var plusX = 0.0;
			var minusX = 0.0;
			if (k + 1 < C.nz) {
				plusZ = vel[f + C.sxy].y;
			}
			if (k > 0) {
				minusZ = vel[f - C.sxy].y;
			}
			if (i + 1 < C.nx) {
				plusX = vel[f + 1].y;
			}
			if (i > 0) {
				minusX = vel[f - 1].y;
			}
			let normal = (C.nu + nut[f]) * (vel[f + C.sx].y - centre) - (C.nu + nut[lo]) * (centre - vel[f - C.sx].y);
			let around = tangential(centre, minusZ, plusZ, geo[lo].z, g.z, geo[lo + C.sxy].z, geo[f + C.sxy].z, k, C.nz, 4, 1) +
				tangential(centre, minusX, plusX, geo[lo].x, g.x, geo[lo + 1].x, geo[f + 1].x, i, C.nx, 0, 1);
			result.y = centre + kd * (normal + faceNu * around);
		}
	}
	// w: normal axis z, tangential x then y.
	if (i < C.nx && j < C.ny && g.z > 0.0) {
		if (k == 0 || k == C.nz) {
			result.z = here.z;
		} else {
			let lo = f - C.sxy;
			let centre = here.z;
			let faceNu = C.nu + 0.5 * (nut[lo] + nut[f]);
			var plusX = 0.0;
			var minusX = 0.0;
			var plusY = 0.0;
			var minusY = 0.0;
			if (i + 1 < C.nx) {
				plusX = vel[f + 1].z;
			}
			if (i > 0) {
				minusX = vel[f - 1].z;
			}
			if (j + 1 < C.ny) {
				plusY = vel[f + C.sx].z;
			}
			if (j > 0) {
				minusY = vel[f - C.sx].z;
			}
			let normal = (C.nu + nut[f]) * (vel[f + C.sxy].z - centre) - (C.nu + nut[lo]) * (centre - vel[f - C.sxy].z);
			let around = tangential(centre, minusX, plusX, geo[lo].x, g.x, geo[lo + 1].x, geo[f + 1].x, i, C.nx, 0, 2) +
				tangential(centre, minusY, plusY, geo[lo].y, g.y, geo[lo + C.sx].y, geo[f + C.sx].y, j, C.ny, 2, 2);
			result.z = centre + kd * (normal + faceNu * around);
		}
	}
	out[f] = result;
}`
};

export const FLOW_KERNELS = [turbulence, fanFlow, quantity, buoyancy, applyFans, advectBack, advectCorrect, diffuse];
void treeReduce;
