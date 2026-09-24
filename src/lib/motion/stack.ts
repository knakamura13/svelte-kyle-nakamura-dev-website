/**
 * Brings a Stack card forward on mouse hover or keyboard focus: the card slides clear of its
 * neighbours, changes paint order, then lifts. Cancelled animations resume from the card's
 * current position. Each `.stack-card` declares `data-angle` (resting rotation, deg) and
 * `data-clear` (vertical travel, px, that clears the overlap).
 */
export function stack(stage: HTMLElement) {
	const ease = getComputedStyle(stage).getPropertyValue('--ease-stack').trim();
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const narrow = matchMedia('(max-width: 700px)');
	const cards = [...stage.querySelectorAll<HTMLElement>('.stack-card')];
	const running = new Map<HTMLElement, Animation>();
	let active: HTMLElement | null = null;
	let order = cards.length;
	let revision = 0;
	const still = () => reduced.matches || narrow.matches;

	function stop(card: HTMLElement) {
		const current = getComputedStyle(card).transform;
		running.get(card)?.cancel();
		running.delete(card);
		card.style.transform = current;
		return current;
	}
	async function move(card: HTMLElement, to: string, duration: number) {
		const from = stop(card);
		const animation = card.animate([{ transform: from }, { transform: to }], { duration, easing: ease, fill: 'forwards' });
		running.set(card, animation);
		try {
			await animation.finished;
		} catch {
			return false;
		}
		card.style.transform = to;
		animation.cancel();
		if (running.get(card) === animation) running.delete(card);
		return true;
	}
	async function promote(card: HTMLElement) {
		if (active === card) return;
		const token = ++revision;
		const previous = active;
		active = card;
		if (previous) {
			previous.removeAttribute('data-active');
			if (still()) {
				stop(previous);
				previous.style.transform = '';
			} else void move(previous, `translateY(0px) rotate(${previous.dataset.angle}deg)`, 440);
		}
		card.dataset.active = 'true';
		if (still()) {
			stop(card);
			card.style.transform = '';
			return;
		}
		// Change paint order only after the card has slid clear of its neighbours.
		if (!(await move(card, `translateY(${card.dataset.clear}px) rotate(0deg)`, 260)) || token !== revision) return;
		card.style.zIndex = String(++order);
		await move(card, 'translateY(-8px) rotate(0deg)', 420);
	}
	function release(force = false) {
		// Only bail if the *active* card contains focus, not any card in the stack.
		if (!force && active?.contains(document.activeElement)) return;
		++revision;
		if (!active) return;
		const card = active;
		active = null;
		card.removeAttribute('data-active');
		if (still()) {
			stop(card);
			card.style.transform = '';
		} else void move(card, `translateY(0px) rotate(${card.dataset.angle}deg)`, 480);
	}
	function reset() {
		++revision;
		active = null;
		for (const card of cards) {
			stop(card);
			card.style.transform = '';
			card.removeAttribute('data-active');
		}
	}

	const enter = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') void promote(event.currentTarget as HTMLElement);
	};
	const focus = (event: FocusEvent) => void promote(event.currentTarget as HTMLElement);
	const leave = () => release();
	const blur = (event: FocusEvent) => {
		if (!stage.contains(event.relatedTarget as Node)) release(true);
	};
	for (const card of cards) {
		card.addEventListener('pointerenter', enter);
		card.addEventListener('focus', focus);
	}
	stage.addEventListener('pointerleave', leave);
	stage.addEventListener('focusout', blur);
	reduced.addEventListener('change', reset);
	narrow.addEventListener('change', reset);

	return {
		destroy() {
			++revision;
			for (const animation of running.values()) animation.cancel();
			for (const card of cards) {
				card.removeEventListener('pointerenter', enter);
				card.removeEventListener('focus', focus);
			}
			stage.removeEventListener('pointerleave', leave);
			stage.removeEventListener('focusout', blur);
			reduced.removeEventListener('change', reset);
			narrow.removeEventListener('change', reset);
		}
	};
}
