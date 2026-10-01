<script lang="ts">
	import Arrow from './Arrow.svelte';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
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
			<div class="capsule">
				<a class="desktop-nav" href="/#work" onclick={closePanels}>Work</a>
				<a class="desktop-nav" href="/#about" onclick={closePanels}>About</a>
				<a class="desktop-nav" href="/resume">Résumé <span aria-hidden="true"><Arrow /></span></a>
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
					<a href="/#work" onclick={closePanels}>Selected work <span><Arrow /></span></a>
					<a href="/#about" onclick={closePanels}>About Kyle <span><Arrow /></span></a>
					<a href="/resume">Résumé <span><Arrow /></span></a>
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
