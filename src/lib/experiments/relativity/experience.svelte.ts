import { getContext, setContext } from 'svelte';
import type { SlotOptions, StageController } from './engine/controller';

const key = Symbol('relativity');

export const prefersReducedMotion = () =>
	typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * State shared by every chapter on the page: the motion preference, the one 3D engine (fetched only
 * when the first Stage is within a screen of the viewport), and the polite announcements that tell a
 * screen reader what a slider just changed.
 */
export class Experience {
	reducedMotion = $state(false);
	announcement = $state('');
	private controller: StageController | null = null;
	private loading: Promise<StageController | null> | null = null;
	/** Counts teardowns, so a download that finishes after one can tell it is no longer wanted. */
	private generation = 0;
	private announceTimer: ReturnType<typeof setTimeout> | undefined;

	/** Browser only. Returns the cleanup. */
	start() {
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (this.reducedMotion = query.matches);
		update();
		query.addEventListener('change', update);
		return () => {
			query.removeEventListener('change', update);
			clearTimeout(this.announceTimer);
			this.generation++;
			this.controller?.destroy();
			this.controller = null;
			this.loading = null;
		};
	}

	private load() {
		const generation = this.generation;
		this.loading ??= import('./engine/controller')
			.then(({ StageController }) => {
				// The visitor may have left while the engine was still downloading. Nothing would ever stop it then.
				if (generation !== this.generation) return null;
				return (this.controller = new StageController());
			})
			.catch((error) => {
				console.error('The 3D scenes could not load.', error);
				return null;
			});
		return this.loading;
	}

	/** Hands a Stage to the engine as it nears the viewport. Returns the cleanup. */
	register(view: HTMLElement, options: SlotOptions) {
		let cancelled = false;
		let unregister = () => {};
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				view.dataset.state = 'loading';
				void this.load().then((controller) => {
					if (cancelled) return;
					if (controller) unregister = controller.register(view, options);
					else view.dataset.state = 'error';
				});
			},
			{ rootMargin: '100% 0px' }
		);
		observer.observe(view);
		return () => {
			cancelled = true;
			observer.disconnect();
			unregister();
		};
	}

	/** A param changed: draw the active Stage once more. */
	wake() {
		this.controller?.invalidate();
	}

	/** Says something to a screen reader after the visitor stops changing a control. */
	announce(text: string) {
		clearTimeout(this.announceTimer);
		this.announceTimer = setTimeout(() => (this.announcement = text), 600);
	}
}

export const provideExperience = () => setContext(key, new Experience());
export const useExperience = () => getContext<Experience>(key);
