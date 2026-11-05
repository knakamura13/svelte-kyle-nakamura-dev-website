/** The 3D world under the HUD, as the HUD's parts need it from the page. Browser only. */

/** Whether a point of the window shows the world (the Stage), not a panel of the HUD over it. */
export function overWorld(x: number, y: number): boolean {
	const element = document.elementFromPoint(x, y);
	return !!element?.closest('.stage-view');
}

/** Puts the keyboard's focus on the 3D view, where the arrow keys move the camera, or the cursor of the Probe and Smoke tools. */
export function focusWorld() {
	document.querySelector<HTMLElement>('.stage-view')?.focus();
}
