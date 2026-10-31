import { Color, DoubleSide, MeshStandardMaterial, Vector2, type ColorRepresentation, type Material, type Texture } from 'three';
import type { LookAssets, PbrMaps } from './assets';
import { TEXTURE_METRES, TextureSet, type TextureName } from './textures';

/**
 * The Home's surfaces: physically based materials, warm and clean, a little toy-like, as The Sims draws a house. Walls are painted
 * plaster whose colour is per vertex (each Room has its paint), so all the walls of a Home share one material; trims are satin white
 * paint; floors are laminate or tile; glass is thin, cool and reflective. With the CC0 maps (`assets.ts`) the plaster, the floors and
 * the lawn use them, colour in sRGB and `arm` feeding ambient occlusion, roughness and metalness; without them (a test in Node, or a
 * fetch that failed) the procedural textures stand in.
 */

/** Paint for each kind of Room, by the words its name or id holds; walls outside take the cladding instead. */
const PAINTS: [RegExp, number][] = [
	[/living/i, 0xf0e2cc],
	[/dining/i, 0xeddcc2],
	[/kitchen/i, 0xf3ecdf],
	[/bath/i, 0xe2ebea],
	[/laundry/i, 0xe6ebe6],
	[/bedroom-1|bedroom 1|primary/i, 0xdfe6d6],
	[/bedroom-2|bedroom 2/i, 0xe7e0e6],
	[/bedroom/i, 0xe1e5d8],
	[/hall|entry|corridor/i, 0xeee6d8],
	[/studio|main/i, 0xf0e4d0],
	[/loft|office|study/i, 0xe7e1d2]
];
const PAINT_FALLBACK = 0xeee6d8;

export function paintFor(room: { id: string; name: string } | undefined): Color {
	const label = room ? `${room.id} ${room.name}` : '';
	const found = PAINTS.find(([pattern]) => pattern.test(label));
	return new Color(found ? found[1] : PAINT_FALLBACK);
}

export type FloorKind = 'wood-floor' | 'stone-tile' | 'bath-tile';

/** Which floor each kind of Room has: laminate in the living rooms, bedrooms and halls, tiles in the kitchens, bathrooms and laundry. */
export function floorFor(room: { id: string; name: string }): FloorKind {
	const label = `${room.id} ${room.name}`;
	if (/bath|toilet|wc|laundry/i.test(label)) return 'bath-tile';
	if (/kitchen|entry|mud/i.test(label)) return 'stone-tile';
	return 'wood-floor';
}

/** The colours the walls are built with. */
export const WALL_COLORS = {
	/** The top of a cut wall, and of a standing one seen from above: a warm, darker band, so the plan reads. */
	cap: new Color(0x9a8a76),
	/** Outside, under the siding. */
	outside: new Color(0xf2ede4),
	/** Satin white trim, and a front door's colour. */
	trim: new Color(0xf8f5ef),
	frontDoor: new Color(0x3d6866),
	door: new Color(0xf3eee6),
	foundation: new Color(0xa49d92)
};

/** How many metres one repeat of each CC0 map covers: the laminate's planks are about 20 cm wide, the tiles 30 cm. */
const PBR_METRES = { laminate: 2.2, tiles: 1.3, bathTiles: 0.9, wall: 2.5, grass: 2.2 } as const;

export class Materials {
	readonly textures: TextureSet;
	private readonly made = new Map<string, Material>();
	private readonly owned: Texture[] = [];

	constructor(
		private readonly anisotropy: number,
		private readonly assets: LookAssets | null = null
	) {
		this.textures = new TextureSet(anisotropy);
		if (assets) {
			for (const maps of [assets.laminate, assets.tiles, assets.wall]) for (const map of [maps.color, maps.normal, maps.arm]) map.anisotropy = anisotropy;
			for (const map of [assets.grass.color, assets.grass.normal, assets.grass.roughness]) map.anisotropy = anisotropy;
		}
	}

	private once<T extends Material>(key: string, make: () => T): T {
		let material = this.made.get(key) as T | undefined;
		if (!material) {
			material = make();
			this.made.set(key, material);
		}
		return material;
	}

	/** The metres a texture repeats over, for building geometry with world-space coordinates. */
	metres(name: TextureName) {
		if (this.assets && name === 'plaster') return PBR_METRES.wall;
		return TEXTURE_METRES[name];
	}

	/** The metres a floor's map repeats over. */
	floorMetres(kind: FloorKind) {
		if (!this.assets) return TEXTURE_METRES[kind];
		return kind === 'wood-floor' ? PBR_METRES.laminate : kind === 'stone-tile' ? PBR_METRES.tiles : PBR_METRES.bathTiles;
	}

	get lawnMetres() {
		return this.assets ? PBR_METRES.grass : TEXTURE_METRES.grass;
	}

	/**
	 * A Poly Haven set as a material: the colour map tinted by `tint` and divided by the map's own mean, so the paint is the colour
	 * the surface reads as and the map only adds its grain.
	 */
	private pbr(maps: PbrMaps, tint: Color, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) {
		const color = new Color(tint.r / Math.max(maps.mean.r, 0.02), tint.g / Math.max(maps.mean.g, 0.02), tint.b / Math.max(maps.mean.b, 0.02));
		return new MeshStandardMaterial({
			color,
			map: maps.color,
			normalMap: maps.normal,
			aoMap: maps.arm,
			roughnessMap: maps.arm,
			metalnessMap: maps.arm,
			roughness: 1,
			metalness: 1,
			...extra
		});
	}

	/** Painted plaster: the colour is per vertex (paint, or the cap), the map a faint plaster grain with a touch of relief. */
	get plaster() {
		return this.once('plaster', () => {
			if (this.assets)
				return this.pbr(this.assets.wall, new Color(1, 1, 1), {
					vertexColors: true,
					normalScale: new Vector2(0.55, 0.55),
					aoMapIntensity: 0.6,
					// Paint is a little glossier than raw plaster.
					roughness: 0.92
				});
			return new MeshStandardMaterial({
				vertexColors: true,
				map: this.textures.get('plaster'),
				bumpMap: this.textures.data('plaster'),
				bumpScale: 1.2,
				roughness: 0.94,
				metalness: 0
			});
		});
	}

	/** Painted lap siding, outside. */
	get siding() {
		return this.once('siding', () => new MeshStandardMaterial({ vertexColors: true, map: this.textures.get('siding'), bumpMap: this.textures.data('siding'), bumpScale: 2, roughness: 0.82 }));
	}

	/** Satin paint on the frames, sills, skirting and doors; the colour is per vertex. */
	get trim() {
		return this.once('trim', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }));
	}

	get glass() {
		return this.once(
			'glass',
			() =>
				new MeshStandardMaterial({
					color: 0xd8e8ef,
					roughness: 0.04,
					metalness: 0.1,
					transparent: true,
					opacity: 0.2,
					depthWrite: false,
					envMapIntensity: 2.2,
					side: DoubleSide
				})
		);
	}

	/** Brushed brass, for handles. */
	get brass() {
		return this.once('brass', () => new MeshStandardMaterial({ color: 0xc9a86a, metalness: 1, roughness: 0.32 }));
	}

	/** Matte dark metal, for hinges, legs and lamp stems. */
	get iron() {
		return this.once('iron', () => new MeshStandardMaterial({ color: 0x2c2b29, metalness: 0.7, roughness: 0.45 }));
	}

	floor(name: FloorKind) {
		return this.once(`floor:${name}`, () => {
			if (this.assets) {
				if (name === 'wood-floor') return this.pbr(this.assets.laminate, new Color(0xc49b70), { normalScale: new Vector2(0.7, 0.7), roughness: 0.85 });
				if (name === 'stone-tile') return this.pbr(this.assets.tiles, new Color(0xdccfb9), { normalScale: new Vector2(0.8, 0.8), roughness: 0.7 });
				return this.pbr(this.assets.tiles, new Color(0xe6e6e1), { normalScale: new Vector2(0.8, 0.8), roughness: 0.55 });
			}
			const roughness = name === 'wood-floor' ? 0.48 : name === 'stone-tile' ? 0.36 : 0.22;
			return new MeshStandardMaterial({ map: this.textures.get(name), roughness, metalness: 0 });
		});
	}

	get paving() {
		return this.once('paving', () => new MeshStandardMaterial({ map: this.textures.get('paving'), color: 0xf2ece2, roughness: 0.88 }));
	}

	/** The lawn: the grass maps, or the procedural grass. `look/outside.ts` breaks its repeat up. */
	get grass() {
		return this.once('grass', () => {
			if (this.assets) {
				const { grass } = this.assets;
				const tint = new Color(0x86a055);
				return new MeshStandardMaterial({
					color: new Color(tint.r / grass.mean.r, tint.g / grass.mean.g, tint.b / grass.mean.b),
					map: grass.color,
					normalMap: grass.normal,
					normalScale: new Vector2(0.8, 0.8),
					roughnessMap: grass.roughness,
					roughness: 1,
					metalness: 0
				});
			}
			return new MeshStandardMaterial({ map: this.textures.get('grass'), roughness: 1, metalness: 0 });
		});
	}

	/** Concrete: the foundation and the steps, the plaster mottle in grey. */
	get concrete() {
		return this.once('concrete', () => new MeshStandardMaterial({ color: WALL_COLORS.foundation, map: this.textures.get('plaster'), roughness: 0.95 }));
	}

	/** Upholstery in a colour, over the fine weave. */
	fabric(color: ColorRepresentation) {
		const key = `fabric:${new Color(color).getHexString()}`;
		return this.once(key, () => new MeshStandardMaterial({ color, map: this.textures.get('weave'), roughness: 0.96, metalness: 0 }));
	}

	/** Wood in a stain, over the grain. */
	wood(color: ColorRepresentation, roughness = 0.58) {
		const key = `wood:${new Color(color).getHexString()}:${roughness}`;
		return this.once(key, () => new MeshStandardMaterial({ color, map: this.textures.get('grain'), roughness, metalness: 0 }));
	}

	/** A plain painted or lacquered surface. */
	paint(color: ColorRepresentation, roughness = 0.5, metalness = 0) {
		const key = `paint:${new Color(color).getHexString()}:${roughness}:${metalness}`;
		return this.once(key, () => new MeshStandardMaterial({ color, roughness, metalness }));
	}

	/** Keeps a texture made for one of these materials, to free with them. */
	own(texture: Texture) {
		this.owned.push(texture);
		return texture;
	}

	dispose() {
		for (const material of this.made.values()) material.dispose();
		this.made.clear();
		for (const texture of this.owned) texture.dispose();
		this.owned.length = 0;
		this.textures.dispose();
	}
}
