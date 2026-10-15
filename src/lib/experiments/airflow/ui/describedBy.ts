/**
 * Names the text that describes the slider inside `node`, by `aria-describedby`, so a screen reader reads it after the slider's name
 * and value: the line under a slider that says how much of its frame a window opens, or that a new starting temperature starts the air
 * over. The shared RangeField takes no such prop, and the sentence belongs to the slider, so the Dock's groups tie it on here. `ids`
 * is one id, or several separated by spaces.
 */
export function describedBy(node: HTMLElement, ids: string) {
	const slider = () => node.querySelector('input[type="range"]');
	slider()?.setAttribute('aria-describedby', ids);
	return {
		update(next: string) {
			slider()?.setAttribute('aria-describedby', next);
		},
		destroy() {
			slider()?.removeAttribute('aria-describedby');
		}
	};
}
