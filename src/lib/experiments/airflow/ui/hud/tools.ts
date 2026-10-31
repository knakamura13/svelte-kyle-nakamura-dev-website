import type { LayerId, OverlayId, PointerMode, Quality, Tool, WallMode } from '../../state';

/**
 * The HUD's fixed menus as data: the tools in the rail, the overlays, the wall modes and the quality tiers, with what each says. A
 * tool also sets `View.mode`, the mode a finger and the keyboard follow on the 3D view (`scene/input.ts`), so the touch and key
 * behaviour of a tool is the one the old Look, Probe and Emit toggle gave.
 */

export interface ToolInfo {
	id: Tool;
	label: string;
	/** What a finger and the keys do on the 3D view while this tool is chosen. */
	mode: PointerMode;
	/** The tooltip's second line: what a click does. */
	hint: string;
	/** Said once, politely, when the tool is chosen. */
	announce: string;
}

export const TOOLS: readonly ToolInfo[] = [
	{
		id: 'select',
		label: 'Select',
		mode: 'look',
		hint: 'Click a window, door, fan or probe to change it.',
		announce: 'Select tool. Click a window, door, fan or probe to change it, or choose one from the Inspector.'
	},
	{
		id: 'build',
		label: 'Build',
		mode: 'look',
		hint: 'Drag a fan or purifier from the catalog into a room.',
		announce: 'Build tool. The catalog is open: drag a fan or purifier into a room, or press one to add it.'
	},
	{
		id: 'probe',
		label: 'Probe',
		mode: 'probe',
		hint: 'Click the air to pin a probe that reads it.',
		announce: 'Probe tool. Click the air to pin a probe. With the keyboard, move the cursor in the 3D view with the arrow keys and press Enter.'
	},
	{
		id: 'smoke',
		label: 'Smoke',
		mode: 'emit',
		hint: 'Press and hold on the air to release smoke.',
		announce: 'Smoke tool. Press and hold on the air to release smoke. With the keyboard, move the cursor in the 3D view and press Enter to start or stop.'
	}
];

export const toolInfo = (id: Tool) => TOOLS.find((tool) => tool.id === id) ?? TOOLS[0];

export interface OverlayInfo {
	id: OverlayId;
	label: string;
	/** The palette layer whose scale and words it uses (the slice's old layers); null for Off. */
	layer: LayerId | null;
}

export const OVERLAYS: readonly OverlayInfo[] = [
	{ id: 'off', label: 'Off', layer: null },
	{ id: 'speed', label: 'Air speed', layer: 'speed' },
	{ id: 'temperature', label: 'Temperature', layer: 'temperature' },
	{ id: 'smoke', label: 'Smoke', layer: 'particulates' }
];

/** The overlay that shows a slice layer: Direction has no overlay of its own and shows as Air speed. */
export const overlayOfLayer = (layer: LayerId): Exclude<OverlayId, 'off'> => (layer === 'temperature' ? 'temperature' : layer === 'particulates' ? 'smoke' : 'speed');

export const WALL_MODES: readonly { id: WallMode; label: string; hint: string }[] = [
	{ id: 'up', label: 'Walls up', hint: 'Every wall at full height.' },
	{ id: 'cutaway', label: 'Cutaway', hint: 'Walls between you and the room drop low.' },
	{ id: 'down', label: 'Walls down', hint: 'Every wall low, to see the whole home.' }
];

export const QUALITIES: readonly { id: Quality; label: string }[] = [
	{ id: 'auto', label: 'Auto' },
	{ id: 'low', label: 'Low' },
	{ id: 'medium', label: 'Medium' },
	{ id: 'high', label: 'High' }
];
