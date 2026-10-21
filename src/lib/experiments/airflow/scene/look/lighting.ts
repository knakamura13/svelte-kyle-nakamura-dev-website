import { Color, DirectionalLight, Euler, Fog, HemisphereLight, MathUtils, Vector3, type Scene, type Texture } from 'three';
import type { Quality } from './quality';

/**
 * The light of the world: late afternoon. A low, warm sun from the west-south-west (the side the default wind comes from, so it
 * shines in at the living room windows), with soft shadows fitted to the Home; the CC0 sky (Kloppenheim 06, a low sun in a clear,
 * hazy sky) as the background and, through PMREM, as the ambient light and the reflections; and a warm haze that takes the lawn into
 * the sky at the horizon. Everything here is in the solver's axes (metres; x east, y up, z south).
 */

/** Where the sun is: the compass bearing it shines from, degrees, its height above the horizon, its colour and its strength. */
export const SUN = { bearing: 248, elevation: 31, color: 0xffd7ad, intensity: 3.1 } as const;

/** The sky's own sun is at this bearing in the image (`u` 0.613 of the equirectangular map, found by decoding it), degrees. */
const SKY_SUN_BEARING = 130.7;

/** How bright the sky is drawn and how much it lights the Home. */
const SKY = { background: 0.62, environment: 0.42 } as const;

/** The haze at the horizon, linear: the sky's own colour a few degrees up, so the lawn fades into it. */
const HAZE = new Color(0.93, 0.83, 0.72);

/** The direction toward the sun, a unit vector. */
export function sunDirection(bearing: number = SUN.bearing, elevation: number = SUN.elevation): Vector3 {
	const b = MathUtils.degToRad(bearing);
	const e = MathUtils.degToRad(elevation);
	// A bearing is clockwise from north (-z); x is east.
	return new Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
}

export class Lighting {
	readonly sun: DirectionalLight;
	private readonly fill: HemisphereLight;
	private readonly centre = new Vector3();

	constructor(private readonly scene: Scene) {
		this.sun = new DirectionalLight(SUN.color, SUN.intensity);
		this.sun.name = 'sun';
		this.sun.castShadow = true;
		this.sun.shadow.bias = -0.00025;
		this.sun.shadow.normalBias = 0.025;
		scene.add(this.sun, this.sun.target);
		// Warm bounce from the floors and the lawn and a soft sky, under the sky's own light, so the rooms read warm and no shadow goes dead.
		this.fill = new HemisphereLight(0xffe8cc, 0xd0a070, 0.75);
		scene.add(this.fill);
		scene.fog = new Fog(HAZE.clone().multiplyScalar(SKY.background), 34, 150);
		scene.background = new Color(0xcfd9df);
	}

	/**
	 * The sky: `sky` (equirectangular, linear) as the background, and `environment` (its PMREM) for the ambient light and the
	 * reflections. Both are turned so the sky's sun stands where the sun light comes from.
	 */
	setSky(sky: Texture, environment: Texture) {
		const { scene } = this;
		scene.background = sky;
		scene.environment = environment;
		scene.backgroundIntensity = SKY.background;
		scene.environmentIntensity = SKY.environment;
		scene.backgroundBlurriness = 0;
		// The renderer looks an equirectangular sky up with the world direction turned by minus this rotation; the sun in the image is at
		// SKY_SUN_BEARING, so turning by the difference puts it at the sun's bearing (a bearing is clockwise seen from above, a positive
		// turn about y is counterclockwise).
		const turn = MathUtils.degToRad(SKY_SUN_BEARING - SUN.bearing);
		scene.backgroundRotation = new Euler(0, turn, 0);
		scene.environmentRotation = new Euler(0, turn, 0);
	}

	/**
	 * Fits the sun's shadow to a Home and the trees round it: an orthographic box round a sphere that holds them, so every metre of the
	 * shadow map is spent where shadows fall.
	 */
	fit(bounds: { width: number; depth: number; ceiling: number }, margin = 8) {
		this.centre.set(bounds.width / 2, 0, bounds.depth / 2);
		const radius = Math.hypot(bounds.width / 2 + margin, bounds.depth / 2 + margin);
		const direction = sunDirection();
		this.sun.position.copy(this.centre).addScaledVector(direction, radius + 20);
		this.sun.target.position.copy(this.centre);
		this.sun.target.updateMatrixWorld();
		const camera = this.sun.shadow.camera;
		camera.left = -radius;
		camera.right = radius;
		camera.top = radius;
		camera.bottom = -radius;
		camera.near = 1;
		camera.far = 2 * radius + 40;
		camera.updateProjectionMatrix();
		this.sun.shadow.needsUpdate = true;
	}

	setQuality(quality: Quality) {
		const shadows = quality.shadows;
		this.sun.castShadow = !!shadows;
		if (!shadows) return;
		if (this.sun.shadow.mapSize.x !== shadows.size) {
			this.sun.shadow.mapSize.set(shadows.size, shadows.size);
			this.sun.shadow.map?.dispose();
			this.sun.shadow.map = null;
		}
		this.sun.shadow.radius = shadows.radius;
	}

	dispose() {
		this.sun.shadow.map?.dispose();
		this.scene.remove(this.sun, this.sun.target, this.fill);
	}
}
