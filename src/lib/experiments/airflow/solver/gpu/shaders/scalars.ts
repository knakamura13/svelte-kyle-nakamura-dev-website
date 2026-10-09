import { DECODE, ENTRY, F32, LINEAR, VEC2, VEC4, read, uniform, write, type KernelSource } from './common';

/**
 * Step 6 of cpu/solver.ts: cpu/scalars.ts `stepScalar` for temperature and particulates at once. The two do not
 * interact within a substep (each reads only the flow and itself), so stepping them in one kernel gives the CPU's
 * answer while reading the flow and the geometry once. The diffusivities (cpu/scalars.ts `diffusivities`) are
 * formed per cell from the eddy viscosity rather than stored.
 *
 * Each workgroup also writes its share of the particulate tally, in the order of `Tally` (inflow and outflow as
 * fluxes, m³·ppm/s, emitted, removed, deposited), for `tally` to finish.
 */
export const scalars: KernelSource = {
	name: 'scalars',
	bindings: [
		uniform('C', 'Consts'),
		uniform('S', 'Step'),
		read('scal', VEC2),
		read('vel', VEC4),
		read('geo', VEC4),
		read('nut', F32),
		read('srcsink', VEC2),
		write('next', VEC2),
		write('partials', VEC4)
	],
	code: `${DECODE}
var<workgroup> fluxes: array<vec4<f32>, 256>;
var<workgroup> deposits: array<f32, 256>;

fn diffusivity(c: i32) -> vec2<f32> {
	if (geo[c].w <= 0.0) {
		return vec2<f32>(0.0);
	}
	let n = nut[c];
	return vec2<f32>(C.alpha + n / C.prT, C.particleD + n / C.scT);
}
// The upwind value plus half a van Leer-limited slope, as in cpu/scalars.ts \`advective\`.
fn limited(up: f32, other: f32, beyond: f32, hasBeyond: bool) -> f32 {
	var face = up;
	if (hasBeyond) {
		let ahead = other - up;
		let behind = up - beyond;
		if (ahead * behind > 0.0) {
			face = face + (ahead * behind) / (ahead + behind);
		}
	}
	return face;
}
// cpu/scalars.ts \`advective\` for both scalars: m and p are the cells on the face's minus and plus sides (has* false on
// the box), fm and fp the cells beyond them.
fn advective(speed: f32, m: vec2<f32>, p: vec2<f32>, fm: vec2<f32>, fp: vec2<f32>, hasM: bool, hasP: bool, hasFm: bool, hasFp: bool) -> vec2<f32> {
	let inflow = vec2<f32>(C.extTheta, C.extC);
	if (!hasM) {
		if (speed > 0.0) {
			return speed * inflow;
		}
		return speed * p;
	}
	if (!hasP) {
		if (speed >= 0.0) {
			return speed * m;
		}
		return speed * inflow;
	}
	if (speed >= 0.0) {
		return speed * vec2<f32>(limited(m.x, p.x, fm.x, hasFm), limited(m.y, p.y, fm.y, hasFm));
	}
	return speed * vec2<f32>(limited(p.x, m.x, fp.x, hasFp), limited(p.y, m.y, fp.y, hasFp));
}
fn value(c: i32, has: bool) -> vec2<f32> {
	if (has) {
		return scal[c];
	}
	return vec2<f32>(0.0);
}
${ENTRY} {
	${LINEAR}
	// inflow, outflow (fluxes through the box), emitted, removed; deposited separately.
	var tally = vec4<f32>(0.0);
	var deposited = 0.0;
	if (id < C.size) {
		let c = id;
		let at = decode(c);
		let i = at.x;
		let j = at.y;
		let k = at.z;
		if (i < C.nx && j < C.ny && k < C.nz) {
			let g = geo[c];
			let centre = scal[c];
			if (g.w <= 0.0) {
				next[c] = centre;
			} else {
				let h = C.h;
				let area = h * h;
				let volume = h * h * h;
				let dc = diffusivity(c);
				let vc = vel[c];
				var net = vec2<f32>(0.0);
				// x faces: minus (index c) and plus (index c + 1).
				{
					let a = g.x;
					if (a > 0.0) {
						let hasM = i > 0;
						let hasFm = i > 1 && geo[c - 1].x > 0.0;
						let hasFp = i < C.nx - 1 && geo[c + 1].x > 0.0;
						let m = value(c - 1, hasM);
						var flux = advective(vc.x, m, centre, value(c - 2, hasFm), value(c + 1, hasFp), hasM, true, hasFm, hasFp);
						if (hasM) {
							flux = flux - 0.5 * (diffusivity(c - 1) + dc) * (centre - m) / h;
						}
						flux = flux * (a * area);
						net = net - flux;
						if (!hasM) {
							if (flux.y > 0.0) {
								tally.x = tally.x + flux.y;
							} else {
								tally.y = tally.y - flux.y;
							}
						}
					} else if (i == 0 && C.wall[0].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[0].y - centre.x) * 2.0 * area) / h;
					}
					let ap = geo[c + 1].x;
					if (ap > 0.0) {
						let hasP = i < C.nx - 1;
						let hasFm = i > 0 && a > 0.0;
						let hasFp = i < C.nx - 2 && geo[c + 2].x > 0.0;
						let p = value(c + 1, hasP);
						var flux = advective(vel[c + 1].x, centre, p, value(c - 1, hasFm), value(c + 2, hasFp), true, hasP, hasFm, hasFp);
						if (hasP) {
							flux = flux - 0.5 * (dc + diffusivity(c + 1)) * (p - centre) / h;
						}
						flux = flux * (ap * area);
						net = net + flux;
						if (!hasP) {
							if (flux.y > 0.0) {
								tally.y = tally.y + flux.y;
							} else {
								tally.x = tally.x - flux.y;
							}
						}
					} else if (i == C.nx - 1 && C.wall[1].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[1].y - centre.x) * 2.0 * area) / h;
					}
				}
				// y faces: settling carries particulates down through every open one, in addition to the air.
				{
					let a = g.y;
					if (a > 0.0) {
						let hasM = j > 0;
						let hasFm = j > 1 && geo[c - C.sx].y > 0.0;
						let hasFp = j < C.ny - 1 && geo[c + C.sx].y > 0.0;
						let m = value(c - C.sx, hasM);
						var flux = advective(vc.y, m, centre, value(c - 2 * C.sx, hasFm), value(c + C.sx, hasFp), hasM, true, hasFm, hasFp);
						if (hasM) {
							flux = flux - 0.5 * (diffusivity(c - C.sx) + dc) * (centre - m) / h;
							flux.y = flux.y - C.settling * centre.y;
						}
						flux = flux * (a * area);
						net = net - flux;
						if (!hasM) {
							if (flux.y > 0.0) {
								tally.x = tally.x + flux.y;
							} else {
								tally.y = tally.y - flux.y;
							}
						}
					} else if (j == 0 && C.wall[2].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[2].y - centre.x) * 2.0 * area) / h;
					}
					let ap = geo[c + C.sx].y;
					if (ap > 0.0) {
						let hasP = j < C.ny - 1;
						let hasFm = j > 0 && a > 0.0;
						let hasFp = j < C.ny - 2 && geo[c + 2 * C.sx].y > 0.0;
						let p = value(c + C.sx, hasP);
						var flux = advective(vel[c + C.sx].y, centre, p, value(c - C.sx, hasFm), value(c + 2 * C.sx, hasFp), true, hasP, hasFm, hasFp);
						if (hasP) {
							flux = flux - 0.5 * (dc + diffusivity(c + C.sx)) * (p - centre) / h;
							flux.y = flux.y - C.settling * p.y;
						}
						flux = flux * (ap * area);
						net = net + flux;
						if (!hasP) {
							if (flux.y > 0.0) {
								tally.y = tally.y + flux.y;
							} else {
								tally.x = tally.x - flux.y;
							}
						}
					} else if (j == C.ny - 1 && C.wall[3].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[3].y - centre.x) * 2.0 * area) / h;
					}
				}
				// z faces.
				{
					let a = g.z;
					if (a > 0.0) {
						let hasM = k > 0;
						let hasFm = k > 1 && geo[c - C.sxy].z > 0.0;
						let hasFp = k < C.nz - 1 && geo[c + C.sxy].z > 0.0;
						let m = value(c - C.sxy, hasM);
						var flux = advective(vc.z, m, centre, value(c - 2 * C.sxy, hasFm), value(c + C.sxy, hasFp), hasM, true, hasFm, hasFp);
						if (hasM) {
							flux = flux - 0.5 * (diffusivity(c - C.sxy) + dc) * (centre - m) / h;
						}
						flux = flux * (a * area);
						net = net - flux;
						if (!hasM) {
							if (flux.y > 0.0) {
								tally.x = tally.x + flux.y;
							} else {
								tally.y = tally.y - flux.y;
							}
						}
					} else if (k == 0 && C.wall[4].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[4].y - centre.x) * 2.0 * area) / h;
					}
					let ap = geo[c + C.sxy].z;
					if (ap > 0.0) {
						let hasP = k < C.nz - 1;
						let hasFm = k > 0 && a > 0.0;
						let hasFp = k < C.nz - 2 && geo[c + 2 * C.sxy].z > 0.0;
						let p = value(c + C.sxy, hasP);
						var flux = advective(vel[c + C.sxy].z, centre, p, value(c - C.sxy, hasFm), value(c + 2 * C.sxy, hasFp), true, hasP, hasFm, hasFp);
						if (hasP) {
							flux = flux - 0.5 * (dc + diffusivity(c + C.sxy)) * (p - centre) / h;
						}
						flux = flux * (ap * area);
						net = net + flux;
						if (!hasP) {
							if (flux.y > 0.0) {
								tally.y = tally.y + flux.y;
							} else {
								tally.x = tally.x - flux.y;
							}
						}
					} else if (k == C.nz - 1 && C.wall[5].x > 0.5) {
						net.x = net.x - (dc.x * (C.wall[5].y - centre.x) * 2.0 * area) / h;
					}
				}
				// \`net\` is what flows out of the cell minus what flows in, so the cell loses it.
				var result = centre - (S.dtau / volume) * net;
				let rates = srcsink[c];
				let added = rates.x * S.dtau;
				result.y = result.y + added;
				tally.z = added * volume;
				let purifier = rates.y;
				let deposit = C.deposition / h;
				var surfaces = 0.0;
				if (deposit > 0.0 || C.settling > 0.0) {
					surfaces = deposit * (6.0 - g.x - geo[c + 1].x - g.y - geo[c + C.sx].y - g.z - geo[c + C.sxy].z);
					surfaces = surfaces + (C.settling / h) * (1.0 - g.y);
				}
				let rate = purifier + surfaces;
				if (rate > 0.0) {
					let after = result.y / (1.0 + rate * S.dtau);
					let lost = (result.y - after) * volume;
					tally.w = (lost * purifier) / rate;
					deposited = (lost * surfaces) / rate;
					result.y = after;
				}
				next[c] = result;
			}
		}
	}
	fluxes[lid] = tally;
	deposits[lid] = deposited;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			fluxes[lid] = fluxes[lid] + fluxes[lid + s];
			deposits[lid] = deposits[lid] + deposits[lid + s];
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		partials[2u * group] = fluxes[0];
		partials[2u * group + 1u] = vec4<f32>(deposits[0], 0.0, 0.0, 0.0);
	}
}`
};

/**
 * Finishes one substep's tally in one workgroup and adds it to this step's slot of the log, which the host reads back
 * and accumulates in double. The fluxes become masses by the substep's length, as in cpu/scalars.ts. `N.a` partials.
 */
export const tally: KernelSource = {
	name: 'tally',
	bindings: [uniform('S', 'Step'), uniform('N', 'Counts'), read('partials', VEC4), write('log', VEC4)],
	code: `var<workgroup> fluxes: array<vec4<f32>, 256>;
var<workgroup> deposits: array<f32, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lid: u32) {
	var sum = vec4<f32>(0.0);
	var deposited = 0.0;
	for (var n = i32(lid); n < N.a; n = n + 256) {
		sum = sum + partials[2 * n];
		deposited = deposited + partials[2 * n + 1].x;
	}
	fluxes[lid] = sum;
	deposits[lid] = deposited;
	workgroupBarrier();
	for (var s = 128u; s > 0u; s = s >> 1u) {
		if (lid < s) {
			fluxes[lid] = fluxes[lid] + fluxes[lid + s];
			deposits[lid] = deposits[lid] + deposits[lid + s];
		}
		workgroupBarrier();
	}
	if (lid == 0u) {
		let total = fluxes[0];
		let at = 2u * S.slot;
		log[at] = log[at] + vec4<f32>(total.x * S.dtau, total.y * S.dtau, total.z, total.w);
		log[at + 1u] = log[at + 1u] + vec4<f32>(deposits[0], 0.0, 0.0, 0.0);
	}
}`
};

export const SCALAR_KERNELS = [scalars, tally];
void F32;
