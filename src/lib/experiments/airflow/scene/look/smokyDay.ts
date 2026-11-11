import { BackSide, Color, Mesh, NormalBlending, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * A smoky day outside (#94): the outdoor PM2.5 hazes the sky and the far lawn by the visibility it gives, and dims and warms the sun.
 * The figures and their sources are in `docs/research/airflow/smoke-and-visibility.md`. Clean air (0 µg/m³) changes nothing.
 *
 * The smoke is taken as mixed evenly through the daytime mixed layer, `SMOKY_DAY.layer` deep, with the mass extinction of aged
 * wildfire smoke. Across the ground it takes out light as e^(−b·d), b the extinction coefficient, so the visibility (Koschmieder,
 * 2% contrast) is 3.912/b: 5.8 km at the Smoky preset's 150 µg/m³. Up through the layer at elevation e the optical depth is
 * τ/sin e, τ the layer's depth straight up: the sun, 31 degrees up, keeps 27% of its light at 150 µg/m³, less in blue than in red
 * (the Ångström exponent), and the sky keeps half its own light straight up and none at the horizon, where it is all smoke.
 */
export const SMOKY_DAY = {
	/** Mass extinction of aged wildfire smoke at 550 nm, m²/g: scattering 4.0 and absorption 0.5 (Reid et al. 2005). */
	massExtinction: 4.5,
	/** How deep the smoke is taken to be, m: the top of the typical daytime mixed layer (Seidel et al. 2012). */
	layer: 1000,
	/** How extinction falls with wavelength, the Ångström exponent: the middle of AERONET's range for smoke, 1.0 to 2.3. */
	angstrom: 1.7,
	/** The wavelengths the scene's red, green and blue stand for, nm. */
	wavelengths: [610, 550, 465] as readonly [number, number, number],
	/** −ln of the eye's contrast threshold, 2%: visibility is this over the extinction coefficient. */
	koschmieder: 3.912,
	/**
	 * How much the sky's light (the fill and the environment) grows for each share of the sun the smoke takes out. Smoke scatters about
	 * nine tenths of what it takes out of the beam, mostly forward, and half of it is taken to reach the ground; the direct sun on level
	 * ground is about 1.4 times the sky's light and the fill in this scene. 0.5 × 1.4.
	 */
	skyGain: 0.7,
	/**
	 * The colour the smoke gives the sky where it hides it, linear, at the sky's brightness: a dull, warm grey, darker than the clear
	 * horizon (0.58, 0.51, 0.45), so a smoky sky is a gloom rather than a glow.
	 */
	haze: new Color(0.44, 0.38, 0.31),
	/** The haze darkens as the smoke thickens: its brightness at a sky that keeps nothing straight up, against 1 at a clear one. */
	hazeDark: 0.55,
	/** The lowest elevation a line of sight is taken at, degrees: under it the plane layer would make the smoke endlessly deep. */
	lowest: 2
} as const;

/** What a smoky day does to the light and the view. */
export interface SmokyDay {
	/** Outdoor PM2.5, µg/m³. */
	pm25: number;
	/** Extinction coefficient at 550 nm, per metre, and the visibility it gives, m (Infinity in clean air). */
	extinction: number;
	visibility: number;
	/** The smoke's optical depth straight up, in red, green and blue. */
	depth: [number, number, number];
	/** The share of the sun's direct light that reaches the ground, in red, green and blue. */
	sun: [number, number, number];
	/** How much the sky's light (the fill and the environment) is scaled. */
	sky: number;
	/** The colour of the smoke where it hides the sky, linear. */
	haze: Color;
}

/** The share of light along a line of sight at `elevation` degrees that gets through a layer of optical depth `depth` straight up. */
export function throughLayer(depth: number, elevation: number) {
	const sine = Math.sin((Math.max(SMOKY_DAY.lowest, elevation) * Math.PI) / 180);
	return Math.exp(-depth / sine);
}

/** A smoky day at `pm25` µg/m³ outdoors, with the sun `sunElevation` degrees up. */
export function smokyDay(pm25: number, sunElevation: number): SmokyDay {
	const pm = Math.max(0, pm25);
	// µg/m³ to g/m³.
	const extinction = SMOKY_DAY.massExtinction * pm * 1e-6;
	const [, green] = SMOKY_DAY.wavelengths;
	const depth = SMOKY_DAY.wavelengths.map((nm) => extinction * SMOKY_DAY.layer * (nm / green) ** -SMOKY_DAY.angstrom) as [number, number, number];
	const sun = depth.map((tau) => throughLayer(tau, sunElevation)) as [number, number, number];
	const zenith = Math.exp(-depth[1]);
	return {
		pm25: pm,
		extinction,
		visibility: extinction > 0 ? SMOKY_DAY.koschmieder / extinction : Infinity,
		depth,
		sun,
		sky: 1 + SMOKY_DAY.skyGain * (1 - sun[1]),
		haze: SMOKY_DAY.haze.clone().multiplyScalar(SMOKY_DAY.hazeDark + (1 - SMOKY_DAY.hazeDark) * zenith)
	};
}

/**
 * The share of the view that is smoke at `distance` metres along the ground, where a clean day's linear fog from `near` to `far`
 * already hides `1 − (far − d)/(far − near)` of it: the clean fog, and the smoke over what it leaves.
 */
export function hazeAt(distance: number, near: number, far: number, extinction: number) {
	const clean = Math.min(1, Math.max(0, (distance - near) / (far - near)));
	return 1 - (1 - clean) * Math.exp(-extinction * distance);
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vWorld;

void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uDepth;
uniform vec3 uHaze;
uniform float uLowest;
varying vec3 vWorld;

void main() {
	vec3 direction = normalize(vWorld - cameraPosition);
	// Through the layer at this elevation the sky keeps exp(-depth / sin e) of its light and the smoke's haze takes the rest.
	float keeps = exp(-uDepth.g / max(direction.y, uLowest));
	gl_FragColor = vec4(uHaze, 1.0 - keeps);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

/**
 * The smoke over the sky: a dome round the Home, drawn over the background and behind everything else (the lawn and the Home stand in
 * front of it), as the haze's colour at the share of the sky the smoke hides. It is shown only while there is smoke outside.
 */
export class SkyHaze {
	readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

	constructor(radius = 300) {
		const material = new ShaderMaterial({
			vertexShader: DOME_VERTEX,
			fragmentShader: DOME_FRAGMENT,
			uniforms: {
				uDepth: { value: new Vector3() },
				uHaze: { value: new Color() },
				uLowest: { value: Math.sin((SMOKY_DAY.lowest * Math.PI) / 180) }
			},
			side: BackSide,
			transparent: true,
			depthWrite: false,
			blending: NormalBlending,
			fog: false
		});
		this.mesh = new Mesh(new SphereGeometry(radius, 48, 24), material);
		this.mesh.name = 'sky-haze';
		// Behind every other see-through thing, and never left out by the camera's frustum.
		this.mesh.renderOrder = -1000;
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
	}

	/** Centres the dome on the Home. */
	place(centre: Vector3) {
		this.mesh.position.copy(centre);
	}

	set(day: SmokyDay) {
		const { uniforms } = this.mesh.material;
		this.mesh.visible = day.pm25 > 0;
		(uniforms.uDepth.value as Vector3).set(...day.depth);
		(uniforms.uHaze.value as Color).copy(day.haze);
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}
