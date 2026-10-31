import { getContext, setContext } from 'svelte';
import type { Insets } from './layout';

/**
 * What the HUD's own parts share that is not the simulation's state: which panel or small menu is open, where the pointer is, and how
 * much of the window the panels cover. The simulation's state stays in `AirflowExperience`; this is only how the HUD is laid out.
 */

/** The large panels, one at a time: About (the explainer) and Advanced. */
export type HudPanel = 'about' | 'advanced' | null;

/** The small menus that drop from a button, one at a time: the Home picker, the Scenario menu, the weather's details, and the phone's View sheet. */
export type HudPopover = 'home' | 'scenario' | 'weather' | 'view' | null;

/** How much of a phone's bottom sheet shows: its peek (its title and its first row) or all of it. */
export type SheetSize = 'peek' | 'full';

export class HudUi {
	panel: HudPanel = $state(null);
	popover: HudPopover = $state(null);
	/** The Inspector, open on the right. */
	inspector = $state(false);
	/** Where the pointer is, px from the viewport's corner, and whether it is over the world rather than a panel. */
	pointer = $state({ x: -1, y: -1, over: false });
	/** A carried device that the pointer is holding down (dragged out of a card) rather than one picked up with a click. */
	held = $state(false);
	/** The phone layout: the rail is a bottom toolbar and panels are bottom sheets. */
	phone = $state(false);
	/** How much of the phone's one open sheet shows. Each sheet opens at its own size (`Hud.svelte`), and its grabber changes it. */
	sheetSize: SheetSize = $state('peek');
	/** The one invitation of the first frame, beside the Build tool, until the visitor builds or puts it away. */
	hint = $state(true);
	/** How much of the window the HUD's bars and panels cover at each edge, px, so a context menu stays in the free part. */
	insets: Insets = $state({ left: 16, right: 16, top: 16, bottom: 16 });

	/** Opens a small menu, or closes it when it is the one open. */
	toggle(popover: Exclude<HudPopover, null>) {
		this.popover = this.popover === popover ? null : popover;
	}

	open(panel: Exclude<HudPanel, null>) {
		this.panel = panel;
		this.popover = null;
	}
}

const key = Symbol('airflow-hud');
export const provideHudUi = () => setContext(key, new HudUi());
export const useHudUi = () => getContext<HudUi>(key);
