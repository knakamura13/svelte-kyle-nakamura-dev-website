<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonSize = 'big' | 'small';
	type ButtonIconSize = 'big' | 'med' | 'small';

	interface Props {
		href?: string;
		size?: ButtonSize;
		ariaLabel?: string;
		disabled?: boolean;
		icon?: string;
		iconSize?: ButtonIconSize;
		noUppercase?: boolean;
		clipboardText?: string;
		variant?: 'primary' | 'ghost';
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	let {
		href = undefined,
		size = 'small',
		ariaLabel = '',
		disabled = false,
		icon = '/icons/icon-arrow-light.svg',
		iconSize = 'med',
		noUppercase = false,
		clipboardText = '',
		variant = 'ghost',
		onclick,
		children
	}: Props = $props();

	let copied = $state(false);

	let isExternalLink = $derived(typeof href === 'string' && !!href.length && !href.startsWith('/'));
	let isPDFLink = $derived(typeof href === 'string' && !!href.length && href.endsWith('.pdf'));
	let isClipboardLink = $derived(typeof href === 'undefined' && !!clipboardText);
	let invertIcon = $derived(variant === 'ghost' && /(white|light)/i.test(icon));

	let classes = $derived(
		[
			'animated-btn',
			variant,
			size,
			`icon--${iconSize}`,
			disabled ? 'disabled-link' : '',
			noUppercase ? 'no-uppercase' : '',
			invertIcon ? 'invert-icon' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	function handlePDFClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		if (href) window.open(href, '_blank');
	}

	async function handleClipboardClick(): Promise<void> {
		try {
			await navigator.clipboard.writeText(clipboardText);
		} catch {
			// Clipboard API unavailable; nothing else to do
		}
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 1000);
	}
</script>

{#if isExternalLink}
	<a
		onclick={onclick}
		aria-label={ariaLabel}
		title={ariaLabel}
		{href}
		class={classes}
		rel="noopener noreferrer"
		target="_blank"
	>
		<span class="btn-text">
			{@render children()}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</a>
{:else if isClipboardLink}
	<button
		onclick={handleClipboardClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		class={classes}
		disabled={copied}
	>
		<span class="btn-text">
			{#if copied}
				Copied phone number 👍
			{:else}
				{@render children()}
			{/if}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</button>
{:else if isPDFLink}
	<a
		onclick={handlePDFClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		href={href}
		class={classes}
		target="_blank"
		rel="noopener noreferrer"
	>
		<span class="btn-text">
			{@render children()}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</a>
{:else}
	<a
		onclick={onclick}
		aria-label={ariaLabel}
		title={ariaLabel}
		{href}
		class={classes}
	>
		<span class="btn-text">
			{@render children()}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</a>
{/if}

<style>
	.disabled-link {
		pointer-events: none;
		opacity: 0.6;
		cursor: not-allowed;
	}

	.animated-btn {
		position: relative;
		display: inline-block;
		overflow: hidden;
		line-height: 100%;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		text-decoration: none;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 0.78rem;
		color: var(--color-ink);
		border-radius: 2px;
		transition:
			border-color 0.2s ease,
			background-color 0.2s ease,
			color 0.2s ease;
	}

	.animated-btn.ghost {
		background: transparent;
		border: 1px solid var(--color-ink);
	}

	.animated-btn.ghost:hover,
	.animated-btn.ghost:focus-visible {
		background: var(--color-ink);
		color: var(--color-cream);
	}

	.animated-btn.primary {
		background: var(--color-lacquer);
		border: 1px solid var(--color-lacquer);
		color: var(--color-cream);
	}

	.animated-btn.primary:hover,
	.animated-btn.primary:focus-visible {
		background: var(--color-lacquer-hot);
		border-color: var(--color-lacquer-hot);
	}

	img.btn-icon {
		position: absolute;
		top: 0;
		right: 1rem;
		bottom: 0;
		height: 55%;
		width: auto;
		margin: auto;
		opacity: 0;
		transform: translateX(calc(100% + 0.75rem));
		transition:
			transform 0.3s ease,
			opacity 0.3s ease,
			filter 0.2s ease;
		aspect-ratio: 1 / 1 !important;
		border-radius: unset;
		pointer-events: none;
	}

	.animated-btn.invert-icon img.btn-icon {
		filter: invert(1);
	}

	.animated-btn.ghost:hover.invert-icon img.btn-icon,
	.animated-btn.ghost:focus-visible.invert-icon img.btn-icon {
		filter: invert(0);
	}

	.btn-text {
		display: inline-block;
		transition: transform 0.3s ease;
	}

	.animated-btn.no-uppercase {
		text-transform: initial !important;
		letter-spacing: 0.02em;
	}

	.animated-btn:hover img.btn-icon,
	.animated-btn:focus-visible img.btn-icon {
		opacity: 1;
		transform: translateX(0);
	}

	.animated-btn:hover .btn-text,
	.animated-btn:focus-visible .btn-text {
		transform: translateX(-0.75rem);
	}

	.animated-btn.big {
		padding: 0.95rem 1.85rem;
		font-size: 0.8rem;
	}

	.animated-btn.small {
		padding: 0.72rem 1.25rem;
		font-size: 0.75rem;
	}

	.animated-btn.icon--big img.btn-icon {
		height: 70%;
		right: 0.85rem;
	}

	.animated-btn.icon--big:hover .btn-text,
	.animated-btn.icon--big:focus-visible .btn-text {
		transform: translateX(-0.9rem);
	}

	.animated-btn.icon--small img.btn-icon {
		height: 40%;
		right: 0.75rem;
	}

	.animated-btn.icon--small:hover .btn-text,
	.animated-btn.icon--small:focus-visible .btn-text {
		transform: translateX(-0.5rem);
	}
</style>
