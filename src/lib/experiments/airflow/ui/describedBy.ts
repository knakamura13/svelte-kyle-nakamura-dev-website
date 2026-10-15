/**
 * Names the text that describes the slider or switch inside `node`, by `aria-describedby`, so a screen reader reads it after the
 * control's name and value: the line under a slider that says how much of its frame a window opens, or that a new starting temperature
 * starts the air over. The shared RangeField and Switch take no such prop, and the sentence belongs to the control, so the Dock's groups
 * tie it on here. `ids` is one id, or several separated by spaces; `node` holds one control.
 */
export function describedBy(node: HTMLElement, ids: string) {
	const control = () => node.querySelector('input');
	control()?.setAttribute('aria-describedby', ids);
	return {
		update(next: string) {
			control()?.setAttribute('aria-describedby', next);
		},
		destroy() {
			control()?.removeAttribute('aria-describedby');
		}
	};
}
