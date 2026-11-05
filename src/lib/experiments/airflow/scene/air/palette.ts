import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import type { LayerId } from '../../state';
import { LUT_SIZE, PALETTES, isCyclic } from '../../viz/palettes';

/** A layer's palette as a texture for the overlays' shaders (`PALETTE_GLSL`): 256 × 1 RGBA8, linearly filtered, wrapping only for the direction loop. */
export function paletteTexture(layer: LayerId) {
	const texture = new DataTexture(PALETTES[layer], LUT_SIZE, 1, RGBAFormat, UnsignedByteType);
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.wrapS = isCyclic(layer) ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}
