<script lang="ts">
	import Arrow from './Arrow.svelte';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { destinationFor, type Destination } from '$lib/nav/destination';
	import { panel } from '$lib/motion/panel';
	import type { Snippet } from 'svelte';
	import { email } from '$lib/content/portfolio';
	import '$lib/styles/site.css';
	import '$lib/styles/portfolio.css';

	let { children }: { children: Snippet } = $props();

	let hidden = $state(false);
	let contactOpen = $state(false);
	let menuOpen = $state(false);
	let copyState = $state<'idle' | 'success' | 'failure'>('idle');
	let copyFailure = $state('');
	let emailAddress: HTMLElement | undefined = $state();
	let copyButton: HTMLButtonElement | undefined = $state();
	let attempt = 0;
	let nav: HTMLElement;
	let capsule: HTMLElement | undefined = $state();

	// Capsule highlight: keyboard focus beats hover, which beats the route/hash the page rests on.
	const destinations: Destination[] = ['work', 'about', 'resume'];
	let linkEls: Partial<Record<Destination, HTMLAnchorElement>> = $state({});
	let resting = $derived(destinationFor(page.url));
	let hovered = $state<Destination | null>(null);
	let focused = $state<Destination | null>(null);
	let target = $derived(focused ?? hovered ?? resting);
	// Measured link bounds relative to the capsule. Empty until the first valid measurement, which
	// keeps the static per-link background in charge during SSR and hydration.
	let bounds = $state<Partial<Record<Destination, { x: number; y: number; w: number; h: number }>>>({});
	let pillReady = $derived(!!target && !!bounds[target]);
	let pillMoves = $state(false);
	// While fading out with no target, the pill stays where it last was instead of jumping home.
	let lastTarget = $state<Destination | null>(null);
	$effect(() => {
		if (target) lastTarget = target;
	});
	let pillStyle = $derived.by(() => {
		const shown = target ?? lastTarget;
		const box = shown ? bounds[shown] : undefined;
		return box ? `transform:translate(${box.x}px,${box.y}px);width:${box.w}px;height:${box.h}px` : '';
	});

	function measure() {
		if (!capsule) return;
		const origin = capsule.getBoundingClientRect();
		const next: typeof bounds = {};
		for (const name of destinations) {
			const box = linkEls[name]?.getBoundingClientRect();
			if (box && box.width > 0 && box.height > 0) next[name] = { x: box.left - origin.left - capsule.clientLeft, y: box.top - origin.top - capsule.clientTop, w: box.width, h: box.height };
		}
		bounds = next;
	}

	const pointerOn = (name: Destination) => (event: PointerEvent) => {
		if (event.pointerType !== 'touch') hovered = name;
	};
	const focusOn = (name: Destination) => (event: FocusEvent) => {
		if ((event.currentTarget as HTMLElement).matches(':focus-visible')) focused = name;
	};
	let contactTrigger: HTMLButtonElement;
	let menuTrigger: HTMLButtonElement;
	let opener: HTMLElement | null = null;
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	function openContact(event: MouseEvent) {
		opener = event.currentTarget as HTMLElement;
		contactOpen = !contactOpen;
		menuOpen = false;
		hidden = false;
		resetCopy();
	}

	function closePanels() {
		contactOpen = false;
		menuOpen = false;
		resetCopy();
	}

	// Closing or reopening invalidates any write still in flight and any pending reset.
	function resetCopy() {
		attempt++;
		clearTimeout(copyTimer);
		copyState = 'idle';
	}

	// An outgoing panel stays in the DOM for its exit, but must not take focus or clicks meanwhile.
	function retire(event: Event) {
		(event.currentTarget as HTMLElement).inert = true;
	}

	afterNavigate(closePanels);

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && (contactOpen || menuOpen)) {
			const target = contactOpen ? (opener ?? contactTrigger) : menuTrigger;
			closePanels();
			target?.focus();
		}
		if (event.key === 'Tab') hidden = false;
	}

	async function copyEmail() {
		const current = ++attempt;
		clearTimeout(copyTimer);
		let result: 'success' | 'failure' = 'success';
		try {
			await navigator.clipboard.writeText(email);
		} catch {
			result = 'failure';
		}
		if (current !== attempt) return;
		copyState = result;
		if (result === 'failure') {
			const touch = matchMedia('(pointer: coarse)').matches;
			copyFailure = touch ? 'Could not copy. Touch and hold the address to copy it.' : 'Could not copy. Select the email address above.';
			// Select the address-only element; some engines blur the active control when the selection moves, so put focus back.
			if (emailAddress) getSelection()?.selectAllChildren(emailAddress);
			copyButton?.focus({ preventScroll: true });
		} else {
			copyTimer = setTimeout(() => (copyState = 'idle'), 4000);
		}
	}

	let copyStatus = $derived(copyState === 'success' ? 'Email copied' : copyState === 'failure' ? copyFailure : '');

	onMount(() => {
		// Measure after fonts load and whenever the capsule changes size (zoom, breakpoint, font swap).
		// The first placement is instant; travel is enabled only once a position exists.
		const observer = new ResizeObserver(measure);
		if (capsule) observer.observe(capsule);
		void document.fonts.ready.then(measure);
		measure();
		const enableTravel = requestAnimationFrame(() => requestAnimationFrame(() => (pillMoves = true)));
		let last = window.scrollY;
		let travel = 0;
		let direction = 0;
		const onScroll = () => {
			const current = Math.max(0, window.scrollY);
			const delta = current - last;
			last = current;
			if (current < 80 || contactOpen || menuOpen || nav?.matches(':hover, :focus-within')) {
				hidden = false;
				travel = 0;
				return;
			}
			if (Math.sign(delta) !== direction) {
				travel = 0;
				direction = Math.sign(delta);
			}
			travel += delta;
			if (Math.abs(travel) >= 12) {
				hidden = travel > 0;
				travel = 0;
			}
		};
		const outside = (event: PointerEvent) => {
			if (!nav?.contains(event.target as Node) && !opener?.contains(event.target as Node)) {
				closePanels();
			}
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		document.addEventListener('pointerdown', outside);
		return () => {
			window.removeEventListener('scroll', onScroll);
			document.removeEventListener('pointerdown', outside);
			attempt++;
			clearTimeout(copyTimer);
			cancelAnimationFrame(enableTravel);
			observer.disconnect();
		};
	});
</script>

<svelte:window onkeydown={keydown} />

<div class="concept personal">
	<a href="#main" class="concept-skip">Skip to content</a>
	<header class="concept-header">
		<a href="/" class="identity" aria-label="Kyle Nakamura, homepage">
			<span class="monogram" aria-hidden="true">kn<span><Arrow /></span></span>
			<span>Kyle Nakamura</span>
		</a>
		<nav
			bind:this={nav}
			aria-label="Main navigation"
			class:nav-hidden={hidden}
			class="floating-nav"
			onfocusin={() => (hidden = false)}
		>
			<div class="capsule" class:pill-ready={pillReady} bind:this={capsule} onpointerleave={() => (hovered = null)}>
				<span class="nav-pill" class:moves={pillMoves} class:shown={pillReady} style={pillStyle} aria-hidden="true"></span>
				<a class="desktop-nav" href="/#work" bind:this={linkEls.work} data-resting={resting === 'work' ? '' : undefined} onclick={closePanels} onpointerenter={pointerOn('work')} onfocus={focusOn('work')} onblur={() => (focused = null)}>Work</a>
				<a class="desktop-nav" href="/#about" bind:this={linkEls.about} data-resting={resting === 'about' ? '' : undefined} onclick={closePanels} onpointerenter={pointerOn('about')} onfocus={focusOn('about')} onblur={() => (focused = null)}>About</a>
				<a class="desktop-nav" href="/resume" bind:this={linkEls.resume} aria-current={page.url.pathname === '/resume' ? 'page' : undefined} data-resting={resting === 'resume' ? '' : undefined} onpointerenter={pointerOn('resume')} onfocus={focusOn('resume')} onblur={() => (focused = null)}>Résumé <span aria-hidden="true"><Arrow /></span></a>
				<button
					class="mobile-menu"
					bind:this={menuTrigger}
					aria-expanded={menuOpen}
					aria-controls="mobile-links"
					onclick={() => {
						menuOpen = !menuOpen;
						contactOpen = false;
					}}
				>
					Menu <span aria-hidden="true">{menuOpen ? '−' : '+'}</span>
				</button>
				<button
					class="contact-trigger"
					bind:this={contactTrigger}
					aria-expanded={contactOpen}
					aria-controls="contact-panel"
					onclick={openContact}
				>
					Contact <span class:turned={contactOpen} aria-hidden="true"><Arrow /></span>
				</button>
			</div>
			{#if menuOpen}
				<div class="nav-panel mobile-links" id="mobile-links" transition:panel onoutrostart={retire}>
					<a href="/#work" data-resting={resting === 'work' ? '' : undefined} onclick={closePanels}>Selected work <span><Arrow /></span></a>
					<a href="/#about" data-resting={resting === 'about' ? '' : undefined} onclick={closePanels}>About Kyle <span><Arrow /></span></a>
					<a href="/resume" aria-current={page.url.pathname === '/resume' ? 'page' : undefined} data-resting={resting === 'resume' ? '' : undefined}>Résumé <span><Arrow /></span></a>
				</div>
			{/if}
			{#if contactOpen}
				<div class="nav-panel contact-panel" id="contact-panel" transition:panel onoutrostart={retire}>
					<div class="panel-heading">
						<p>Start a conversation.</p>
						<button
							class="close-contact"
							aria-label="Close contact panel"
							onclick={() => {
								closePanels();
								(opener ?? contactTrigger)?.focus();
							}}
						>
							×
						</button>
					</div>
					<a class="email-link" href="mailto:{email}"><span bind:this={emailAddress}>{email}</span> <span aria-hidden="true"><Arrow /></span></a>
					<div class="contact-options">
						<button bind:this={copyButton} onclick={copyEmail}>
							Copy email
							<span class="copy-glyph" aria-hidden="true" data-state={copyState}>
								<span class="glyph-copy">⧉</span>
								<span class="glyph-check">✓</span>
							</span>
						</button>
						<a href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer"
							>LinkedIn <Arrow /></a
						>
					</div>
					<p class="copy-status" aria-live="polite">{copyStatus}</p>
				</div>
			{/if}
		</nav>
	</header>

	<main id="main">{@render children()}</main>

	<footer class="concept-footer portfolio-footer">
		<a href="/">Kyle Nakamura <span aria-hidden="true"><Arrow /></span></a>
		<div>
			<a href="/experiments">Experiments <span aria-hidden="true"><Arrow /></span></a>
			<a href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">GitHub <Arrow /></a>
			<a href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer"
				>LinkedIn <Arrow /></a
			>
			<span>© {new Date().getFullYear()}</span>
		</div>
	</footer>
</div>
