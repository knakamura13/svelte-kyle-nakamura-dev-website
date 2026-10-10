/**
 * Does the closest the rig lets the camera come ever put it inside the house? Checks every plan, a sweep of yaws and of
 * the allowed pitches, and several Stage aspect ratios, with the zoom at its maximum. Throwaway QA, run with:
 *
 *   node_modules/.bin/esbuild scripts/airflow-qa/dollhouse/zoomcheck.ts --bundle --platform=node --format=esm --alias:\$lib=./src/lib --outfile=<tmp>/zoomcheck.mjs && node <tmp>/zoomcheck.mjs
 */
import { plans } from '$lib/experiments/airflow/homes/plans';
import { dollhouseRig } from '$lib/experiments/airflow/scene/dollhouse';

let violations = 0;
for (const plan of plans) {
	for (const topDown of [false, true]) {
		const rig = dollhouseRig(plan, topDown);
		const t = Math.tan((rig.fov * Math.PI) / 360);
		const zoomMax = rig.zoomRange![1];
		const [lo, hi] = rig.pitchRange!;
		let worst = Infinity;
		for (const aspect of [0.49, 1, 1.6, 2.4]) {
			const distance = Math.max(rig.fit.height / 2 / t, rig.fit.width / 2 / (t * aspect)) / zoomMax;
			for (let yaw = 0; yaw < 360; yaw += 2) {
				for (let pitch = lo; pitch <= hi + 1e-9; pitch += 0.05) {
					const p = topDown ? hi : pitch;
					const y = (yaw * Math.PI) / 180;
					const x = rig.target[0] + distance * Math.cos(p) * Math.sin(y);
					const h = rig.target[1] + distance * Math.sin(p);
					const z = rig.target[2] + distance * Math.cos(p) * Math.cos(y);
					const inside = x > -0.2 && x < plan.width + 0.2 && z > -0.2 && z < plan.depth + 0.2 && h < plan.ceiling;
					if (inside) {
						violations++;
						if (violations < 6) console.log(`INSIDE ${plan.id} topDown=${topDown} aspect=${aspect} yaw=${yaw} pitch=${p.toFixed(2)} distance=${distance.toFixed(2)}`);
					}
					worst = Math.min(worst, Math.hypot(x - rig.target[0], h - rig.target[1], z - rig.target[2]));
				}
			}
		}
		console.log(`${plan.id} ${topDown ? 'top-down' : 'three-quarter'}: fit ${rig.fit.width.toFixed(1)} x ${rig.fit.height.toFixed(1)} m, zoom range ${rig.zoomRange!.map((v) => v.toFixed(2)).join('..')}, closest camera ${worst.toFixed(1)} m from the target`);
	}
}
console.log(violations ? `${violations} positions are inside the house` : 'no allowed camera position is inside the house');
