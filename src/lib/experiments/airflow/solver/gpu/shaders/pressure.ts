import { DECODE, ENTRY, F32, LINEAR, VEC2, VEC4, read, uniform, write, type KernelSource } from './common';

/**
 * Kernels for step 5 of cpu/solver.ts, the projection (cpu/pressure.ts). `coef` packs a level's three conductances
 * and right-hand side; the diagonal, the sum of a cell's six conductances enlarged by SHIFT, is recomputed where it is
 * used because the smoother reads those six values anyway.
 */

/** cpu/pressure.ts SHIFT: the diagonal's enlargement at rounding level. `d + d·SHIFT` rounds like the CPU's f32 store of d·(1 + SHIFT). */
const SHIFT = '1e-7';
/** cpu/pressure.ts U_REGULAR and STALL. */
const U_REGULAR = '0.05';
const STALL = '0.01';

/** The diagonal of cell c of a level, and whether the cell is in the system at all (`dg > 0` in the CPU). */
const DIAGONAL = (coef: string, sx: string, sxy: string) => `fn diagonal(c: i32) -> f32 {
	let e = ${coef}[c];
	let sum = e.x + ${coef}[c + 1].x + e.y + ${coef}[c + ${sx}].y + e.z + ${coef}[c + ${sxy}].z;
	if (sum > 0.0) {
		return sum + sum * ${SHIFT};
	}
	return 0.0;
}`;

/**
 * The fine level's conductances (cpu/pressure.ts `assemble`, first loop): a face between two cells conducts a·h·dt/ρ
 * if either cell is air; faces on the box conduct nothing until the exterior kernel sets openings. Also the cell's
 * flux imbalance, the right-hand side.
 */
export const assemble: KernelSource = {
	name: 'assemble',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), read('geo', VEC4), read('vel', VEC4), write('coef', VEC4)],
	code: `${DECODE}
${ENTRY} {
	${LINEAR}
	if (id >= C.size) {
		return;
	}
	let c = id;
	let at = decode(c);
	let i = at.x;
	let j = at.y;
	let k = at.z;
	let g = geo[c];
	let here = g.w > 0.0 && i < C.nx && j < C.ny && k < C.nz;
	var cx = 0.0;
	var cy = 0.0;
	var cz = 0.0;
	if (i > 0 && i < C.nx && j < C.ny && k < C.nz && (here || geo[c - 1].w > 0.0)) {
		cx = g.x * S.kcond;
	}
	if (j > 0 && j < C.ny && i < C.nx && k < C.nz && (here || geo[c - C.sx].w > 0.0)) {
		cy = g.y * S.kcond;
	}
	if (k > 0 && k < C.nz && i < C.nx && j < C.ny && (here || geo[c - C.sxy].w > 0.0)) {
		cz = g.z * S.kcond;
	}
	var rhs = 0.0;
	if (here) {
		let v = vel[c];
		var divergence = 0.0;
		if (i > 0) {
			divergence = divergence - g.x * v.x;
		}
		if (i < C.nx - 1) {
			divergence = divergence + geo[c + 1].x * vel[c + 1].x;
		}
		if (j > 0) {
			divergence = divergence - g.y * v.y;
		}
		if (j < C.ny - 1) {
			divergence = divergence + geo[c + C.sx].y * vel[c + C.sx].y;
		}
		if (k > 0) {
			divergence = divergence - g.z * v.z;
		}
		if (k < C.nz - 1) {
			divergence = divergence + geo[c + C.sxy].z * vel[c + C.sxy].z;
		}
		rhs = -(C.h * C.h) * divergence;
	}
	coef[c] = vec4<f32>(cx, cy, cz, rhs);
}`
};

/**
 * Exterior openings on one side of the box (cpu/pressure.ts `assemble`, `openings`): the orifice law, or a window
 * fan's curve, linearised about the room's pressure from the last solve, becomes the face's conductance and a source
 * in the cell beside it. One dispatch per side, in the CPU's side order, so a corner cell's right-hand side gains its
 * sides' terms in the same order. `ext` holds three values per slot, `qg` the linearisation (q, slope).
 */
export const exterior: KernelSource = {
	name: 'exterior',
	bindings: [uniform('C', 'Consts'), uniform('B', 'Side'), read('ext', F32), read('p', F32), read('geo', VEC4), write('coef', VEC4), write('qg', VEC2)],
	code: `fn lane(v: vec4<f32>, axis: i32) -> f32 {
	if (axis == 0) {
		return v.x;
	}
	if (axis == 1) {
		return v.y;
	}
	return v.z;
}
${ENTRY} {
	${LINEAR}
	if (id >= B.na * B.nb) {
		return;
	}
	let slot = id;
	let a = slot % B.na;
	let b = slot / B.na;
	let face = B.base + B.strideA * a + B.strideB * b;
	let cell = face - B.shift;
	let open = lane(geo[face], B.axis);
	var q = 0.0;
	var slope = 0.0;
	if (open > 0.0 && geo[cell].w > 0.0) {
		let at = 3 * (B.slotBase + slot);
		let pressure = p[cell];
		let delta = ext[at] - pressure;
		let fanSpeed = ext[at + 1];
		let fanRise = ext[at + 2];
		var speed: f32;
		if (fanSpeed == 0.0 || fanRise <= 0.0) {
			speed = C.cd * sqrt((2.0 * abs(delta)) / C.rho) * sign(delta);
			slope = (C.cd * C.cd) / (C.rho * max(abs(speed), ${U_REGULAR}));
		} else {
			let s = sign(fanSpeed);
			let root = sqrt(max(1.0 + (s * delta) / fanRise, 0.0));
			speed = fanSpeed * root;
			slope = abs(fanSpeed) / (2.0 * fanRise * max(root, ${STALL}));
		}
		let flowArea = open * (C.h * C.h);
		var e = coef[face];
		if (B.axis == 0) {
			e.x = flowArea * slope;
		} else if (B.axis == 1) {
			e.y = flowArea * slope;
		} else {
			e.z = flowArea * slope;
		}
		coef[face] = e;
		q = speed + slope * pressure;
		var r = coef[cell];
		r.w = r.w + flowArea * q;
		coef[cell] = r;
	}
	qg[B.slotBase + slot] = vec2<f32>(q, slope);
}`
};

/**
 * The operator one level up (cpu/pressure.ts `coarsen`): a coarse face sums the fine faces across it that exist (an
 * odd fine size leaves the last coarse cell one fine cell wide), divided by the coarsening factor for an interior
 * face. The right-hand-side lane is left zero; restriction fills it.
 */
export const coarsen: KernelSource = {
	name: 'coarsen',
	bindings: [uniform('L', 'Level'), read('fine', VEC4), write('coarse', VEC4)],
	code: `${ENTRY} {
	${LINEAR}
	let size = L.csxy * (L.cnz + 1);
	if (id >= size) {
		return;
	}
	let K = id / L.csxy;
	let r = id - K * L.csxy;
	let J = r / L.csx;
	let I = r - J * L.csx;
	var cx = 0.0;
	var cy = 0.0;
	var cz = 0.0;
	if (J < L.cny && K < L.cnz) {
		let face = min(I * L.fx, L.nx);
		var total = 0.0;
		for (var c = K * L.fz; c < min(K * L.fz + L.fz, L.nz); c = c + 1) {
			for (var b = J * L.fy; b < min(J * L.fy + L.fy, L.ny); b = b + 1) {
				total = total + fine[face + L.sx * b + L.sxy * c].x;
			}
		}
		cx = select(total, total / f32(L.fx), I > 0 && I < L.cnx);
	}
	if (I < L.cnx && K < L.cnz) {
		let face = min(J * L.fy, L.ny);
		var total = 0.0;
		for (var c = K * L.fz; c < min(K * L.fz + L.fz, L.nz); c = c + 1) {
			for (var a = I * L.fx; a < min(I * L.fx + L.fx, L.nx); a = a + 1) {
				total = total + fine[a + L.sx * face + L.sxy * c].y;
			}
		}
		cy = select(total, total / f32(L.fy), J > 0 && J < L.cny);
	}
	if (I < L.cnx && J < L.cny) {
		let face = min(K * L.fz, L.nz);
		var total = 0.0;
		for (var b = J * L.fy; b < min(J * L.fy + L.fy, L.ny); b = b + 1) {
			for (var a = I * L.fx; a < min(I * L.fx + L.fx, L.nx); a = a + 1) {
				total = total + fine[a + L.sx * b + L.sxy * face].z;
			}
		}
		cz = select(total, total / f32(L.fz), K > 0 && K < L.cnz);
	}
	coarse[id] = vec4<f32>(cx, cy, cz, 0.0);
}`
};

/** The update of one cell in red-black Gauss-Seidel (cpu/pressure.ts `smooth`). */
const RELAX = `fn relax(i: i32, j: i32, k: i32) {
	let c = i + L.sx * j + L.sxy * k;
	let e = coef[c];
	let cxp = coef[c + 1].x;
	let cyp = coef[c + L.sx].y;
	let czp = coef[c + L.sxy].z;
	let total = e.x + cxp + e.y + cyp + e.z + czp;
	if (total <= 0.0) {
		return;
	}
	let d = total + total * ${SHIFT};
	var sum = e.w;
	if (i > 0) {
		sum = sum + e.x * p[c - 1];
	}
	if (i < L.nx - 1) {
		sum = sum + cxp * p[c + 1];
	}
	if (j > 0) {
		sum = sum + e.y * p[c - L.sx];
	}
	if (j < L.ny - 1) {
		sum = sum + cyp * p[c + L.sx];
	}
	if (k > 0) {
		sum = sum + e.z * p[c - L.sxy];
	}
	if (k < L.nz - 1) {
		sum = sum + czp * p[c + L.sxy];
	}
	p[c] = sum / d;
}`;

/** One colour of one sweep: thread n is the n-th cell of colour `L.colour`, row by row. */
export const smooth: KernelSource = {
	name: 'smooth',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), write('p', F32)],
	code: `${RELAX}
${ENTRY} {
	${LINEAR}
	let half = (L.nx + 1) / 2;
	if (id >= half * L.ny * L.nz) {
		return;
	}
	let row = id / half;
	let j = row % L.ny;
	let k = row / L.ny;
	let i = 2 * (id - row * half) + ((L.colour + j + k) & 1);
	if (i >= L.nx) {
		return;
	}
	relax(i, j, k);
}`
};

/**
 * The coarsest level's sweeps (cpu/pressure.ts `vcycle` at the last level) in one workgroup: the level has at most
 * 256 cells, so each thread owns one, and a storage barrier between colours stands in for a dispatch boundary.
 * Replaces 2·sweeps dispatches with one.
 */
export const coarsest: KernelSource = {
	name: 'coarsest',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), write('p', F32)],
	code: `${RELAX}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lid: u32) {
	let t = i32(lid);
	let cells = L.nx * L.ny * L.nz;
	let i = t % L.nx;
	let j = (t / L.nx) % L.ny;
	let k = t / (L.nx * L.ny);
	for (var s = 0; s < L.sweeps; s = s + 1) {
		for (var colour = 0; colour < 2; colour = colour + 1) {
			if (t < cells && ((i + j + k) & 1) == colour) {
				relax(i, j, k);
			}
			storageBarrier();
		}
	}
}`
};

/**
 * The residual of a level restricted to the next (cpu/pressure.ts `residualOf` and the restriction in `vcycle`), in
 * one pass: each coarse cell sums the residuals of the fine cells it aggregates, in the order the CPU adds them, and
 * starts its correction at zero.
 */
export const restrict: KernelSource = {
	name: 'restrict',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), read('p', F32), write('coarse', VEC4), write('coarseP', F32)],
	code: `${DIAGONAL('coef', 'L.sx', 'L.sxy')}
fn residual(i: i32, j: i32, k: i32) -> f32 {
	let c = i + L.sx * j + L.sxy * k;
	let d = diagonal(c);
	if (d <= 0.0) {
		return 0.0;
	}
	let e = coef[c];
	var sum = d * p[c];
	if (i > 0) {
		sum = sum - e.x * p[c - 1];
	}
	if (i < L.nx - 1) {
		sum = sum - coef[c + 1].x * p[c + 1];
	}
	if (j > 0) {
		sum = sum - e.y * p[c - L.sx];
	}
	if (j < L.ny - 1) {
		sum = sum - coef[c + L.sx].y * p[c + L.sx];
	}
	if (k > 0) {
		sum = sum - e.z * p[c - L.sxy];
	}
	if (k < L.nz - 1) {
		sum = sum - coef[c + L.sxy].z * p[c + L.sxy];
	}
	return e.w - sum;
}
${ENTRY} {
	${LINEAR}
	if (id >= L.cnx * L.cny * L.cnz) {
		return;
	}
	let I = id % L.cnx;
	let J = (id / L.cnx) % L.cny;
	let K = id / (L.cnx * L.cny);
	var total = 0.0;
	for (var k = K * L.fz; k < min(K * L.fz + L.fz, L.nz); k = k + 1) {
		for (var j = J * L.fy; j < min(J * L.fy + L.fy, L.ny); j = j + 1) {
			for (var i = I * L.fx; i < min(I * L.fx + L.fx, L.nx); i = i + 1) {
				total = total + residual(i, j, k);
			}
		}
	}
	let cc = I + L.csx * J + L.csxy * K;
	coarse[cc].w = total;
	coarseP[cc] = 0.0;
}`
};

/** The coarse correction added to every fine cell in the system (cpu/pressure.ts `vcycle`, prolongation). */
export const prolong: KernelSource = {
	name: 'prolong',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), write('p', F32), read('coarseP', F32)],
	code: `${DIAGONAL('coef', 'L.sx', 'L.sxy')}
${ENTRY} {
	${LINEAR}
	if (id >= L.nx * L.ny * L.nz) {
		return;
	}
	let i = id % L.nx;
	let j = (id / L.nx) % L.ny;
	let k = id / (L.nx * L.ny);
	let c = i + L.sx * j + L.sxy * k;
	if (diagonal(c) > 0.0) {
		p[c] = p[c] + coarseP[i / L.fx + L.csx * (j / L.fy) + L.csxy * (k / L.fz)];
	}
}`
};

/** Partial sums of the pressure over the cells in the system, and their count, per workgroup (cpu/pressure.ts `removeMean`). */
export const meanPartials: KernelSource = {
	name: 'meanPartials',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), read('p', F32), write('partials', VEC2)],
	code: `${DIAGONAL('coef', 'L.sx', 'L.sxy')}
var<workgroup> sums: array<vec2<f32>, 256>;
${ENTRY} {
	${LINEAR}
	var value = vec2<f32>(0.0);
	if (id < L.nx * L.ny * L.nz) {
		let i = id % L.nx;
		let j = (id / L.nx) % L.ny;
		let k = id / (L.nx * L.ny);
		let c = i + L.sx * j + L.sxy * k;
		if (diagonal(c) > 0.0) {
			value = vec2<f32>(p[c], 1.0);
		}
	}
	sums[lid] = value;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			sums[lid] = sums[lid] + sums[lid + s];
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		partials[group] = sums[0];
	}
}`
};

/** The partial sums finished in one workgroup, with compensated (Kahan) addition so a large grid's mean keeps its digits. `N.a` partials. */
export const meanFinish: KernelSource = {
	name: 'meanFinish',
	bindings: [uniform('N', 'Counts'), read('partials', VEC2), write('mean', F32)],
	code: `var<workgroup> sums: array<vec2<f32>, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lid: u32) {
	var sum = 0.0;
	var lost = 0.0;
	var count = 0.0;
	for (var n = i32(lid); n < N.a; n = n + 256) {
		let value = partials[n];
		let y = value.x - lost;
		let t = sum + y;
		lost = (t - sum) - y;
		sum = t;
		count = count + value.y;
	}
	sums[lid] = vec2<f32>(sum, count);
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			sums[lid] = sums[lid] + sums[lid + s];
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		let total = sums[0];
		mean[0] = select(0.0, total.x / total.y, total.y > 0.0);
	}
}`
};

/** Shifts the pressure of every cell in the system by the mean. */
export const meanSubtract: KernelSource = {
	name: 'meanSubtract',
	bindings: [uniform('L', 'Level'), read('coef', VEC4), write('p', F32), read('mean', F32)],
	code: `${DIAGONAL('coef', 'L.sx', 'L.sxy')}
${ENTRY} {
	${LINEAR}
	if (id >= L.nx * L.ny * L.nz) {
		return;
	}
	let i = id % L.nx;
	let j = (id / L.nx) % L.ny;
	let k = id / (L.nx * L.ny);
	let c = i + L.sx * j + L.sxy * k;
	if (diagonal(c) > 0.0) {
		p[c] = p[c] - mean[0];
	}
}`
};

/**
 * cpu/pressure.ts `project`: faces between two cells lose the pressure gradient, walls stay still, and exterior
 * openings take the speed their linearised law gives for the new pressure. `C.sideBase` locates each side's slots in `qg`.
 */
export const project: KernelSource = {
	name: 'project',
	bindings: [uniform('C', 'Consts'), uniform('S', 'Step'), write('vel', VEC4), read('geo', VEC4), read('p', F32), read('qg', VEC2)],
	code: `${DECODE}
fn base(side: i32) -> i32 {
	return C.sideBase[side / 4][side % 4];
}
fn opening(side: i32, slot: i32, pressure: f32) -> f32 {
	let law = qg[base(side) + slot];
	return law.x - law.y * pressure;
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
	let g = geo[f];
	var v = vel[f];
	if (j < C.ny && k < C.nz) {
		if (g.x <= 0.0) {
			v.x = 0.0;
		} else if (i > 0 && i < C.nx) {
			v.x = v.x - S.kgrad * (p[f] - p[f - 1]);
		} else if (i == 0) {
			v.x = opening(0, j + C.ny * k, p[f]);
		} else {
			v.x = -opening(1, j + C.ny * k, p[f - 1]);
		}
	}
	if (i < C.nx && k < C.nz) {
		if (g.y <= 0.0) {
			v.y = 0.0;
		} else if (j > 0 && j < C.ny) {
			v.y = v.y - S.kgrad * (p[f] - p[f - C.sx]);
		} else if (j == 0) {
			v.y = opening(2, i + C.nx * k, p[f]);
		} else {
			v.y = -opening(3, i + C.nx * k, p[f - C.sx]);
		}
	}
	if (i < C.nx && j < C.ny) {
		if (g.z <= 0.0) {
			v.z = 0.0;
		} else if (k > 0 && k < C.nz) {
			v.z = v.z - S.kgrad * (p[f] - p[f - C.sxy]);
		} else if (k == 0) {
			v.z = opening(4, i + C.nx * j, p[f]);
		} else {
			v.z = -opening(5, i + C.nx * j, p[f - C.sxy]);
		}
	}
	vel[f] = v;
}`
};

export const PRESSURE_KERNELS = [assemble, exterior, coarsen, smooth, coarsest, restrict, prolong, meanPartials, meanFinish, meanSubtract, project];
