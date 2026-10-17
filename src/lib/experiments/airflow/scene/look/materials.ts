import { Color, DoubleSide, MeshStandardMaterial, type ColorRepresentation, type Material } from 'three';
import { TEXTURE_METRES, TextureSet, type TextureName } from './textures';

/**
 * The Home's surfaces: physically based materials over the procedural textures, warm and clean, a little toy-like, as The Sims
 * draws a house. Walls are painted plaster whose colour is per vertex (each Room has its paint), so all the walls of a Home share
 * one material; trims are satin white paint; floors are oak boards or tile; glass is thin, cool and reflective.
 */

/** Paint for each kind of Room, by the words its name or id holds; walls outside take the cladding instead. */
const PAINTS: [RegExp, number][] = [
	[/living/i, 0xeee2cf],
	[/dining/i, 0xeadcc6],
	[/kitchen/i, 0xf1ebdf],
	[/bath/i, 0xdfe8ea],
	[/bedroom-1|bedroom 1/i, 0xdce4d6],
	[/bedroom-2|bedroom 2/i, 0xe1dfe9],
	[/bedroom/i, 0xdde2d8],
	[/hall|entry|corridor/i, 0xebe5da],
	[/studio|main/i, 0xeee4d3],
	[/loft|office|study/i, 0xe4e0d4]
];
const PAINT_FALLBACK = 0xece6da;

export function paintFor(room: { id: string; name: string } | undefined): Color {
	const label = room ? `${room.id} ${room.name}` : '';
	const found = PAINTS.find(([pattern]) => pattern.test(label));
	return new Color(found ? found[1] : PAINT_FALLBACK);
}

/** Which floor each kind of Room has. */
export function floorFor(room: { id: string; name: string }): 'wood-floor' | 'stone-tile' | 'bath-tile' {
	const label = `${room.id} ${room.name}`;
	if (/bath|toilet|wc|laundry/i.test(label)) return 'bath-tile';
	if (/kitchen|entry|mud/i.test(label)) return 'stone-tile';
	return 'wood-floor';
}

/** The colours the walls are built with. */
export const WALL_COLORS = {
	/** The top of a cut wall, and of a standing one seen from above: a warm, darker band, so the plan reads. */
	cap: new Color(0x8a7d6c),
	/** Outside, under the siding. */
	outside: new Color(0xf4f1ea),
	/** Satin white trim, and a front door's colour. */
	trim: new Color(0xf8f6f1),
	frontDoor: new Color(0x2f5a5c),
	door: new Color(0xf3efe8),
	foundation: new Color(0x9b968d)
};

export class Materials {
	readonly textures: TextureSet;
	private readonly made = new Map<string, Material>();

	constructor(anisotropy: number) {
		this.textures = new TextureSet(anisotropy);
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
		return TEXTURE_METRES[name];
	}

	/** Painted plaster: the colour is per vertex (paint, or the cap), the texture a faint mottle with a touch of relief. */
	get plaster() {
		return this.once(
			'plaster',
			() =>
				new MeshStandardMaterial({
					vertexColors: true,
					map: this.textures.get('plaster'),
					bumpMap: this.textures.data('plaster'),
					bumpScale: 1.2,
					roughness: 0.94,
					metalness: 0
				})
		);
	}

	/** Painted lap siding, outside. */
	get siding() {
		return this.once('siding', () => new MeshStandardMaterial({ vertexColors: true, map: this.textures.get('siding'), bumpMap: this.textures.data('siding'), bumpScale: 2, roughness: 0.82 }));
	}

	/** Satin paint on the frames, sills, skirting and doors; the colour is per vertex. */
	get trim() {
		return this.once('trim', () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 }));
	}

	get glass() {
		return this.once(
			'glass',
			() =>
				new MeshStandardMaterial({
					color: 0xd5e6ee,
					roughness: 0.03,
					metalness: 0.15,
					transparent: true,
					opacity: 0.22,
					depthWrite: false,
					envMapIntensity: 2.6,
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

	floor(name: 'wood-floor' | 'stone-tile' | 'bath-tile') {
		const roughness = name === 'wood-floor' ? 0.48 : name === 'stone-tile' ? 0.36 : 0.22;
		return this.once(`floor:${name}`, () => new MeshStandardMaterial({ map: this.textures.get(name), roughness, metalness: 0 }));
	}

	get paving() {
		return this.once('paving', () => new MeshStandardMaterial({ map: this.textures.get('paving'), roughness: 0.9 }));
	}

	get grass() {
		return this.once('grass', () => new MeshStandardMaterial({ map: this.textures.get('grass'), roughness: 1, metalness: 0 }));
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

	dispose() {
		for (const material of this.made.values()) material.dispose();
		this.made.clear();
		this.textures.dispose();
	}
}
