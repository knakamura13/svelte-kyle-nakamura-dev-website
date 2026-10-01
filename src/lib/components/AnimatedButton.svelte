<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';

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

	const COPY_FEEDBACK_MS = 4000;

	let copyStatus = $state<'idle' | 'success' | 'failure'>('idle');
	let copyButton: HTMLButtonElement | undefined = $state();
	let attempt = 0;
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

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

	function pressAndReturn(): void {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		copyButton?.animate(
			[{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
			{ duration: 160, easing: 'ease-out' }
		);
	}

	async function handleClipboardClick(): Promise<void> {
		const current = ++attempt;
		clearTimeout(resetTimer);
		let result: 'success' | 'failure' = 'success';
		try {
			await navigator.clipboard.writeText(clipboardText);
		} catch {
			result = 'failure';
		}
		if (current !== attempt) return;
		copyStatus = result;
		if (result === 'success') pressAndReturn();
		resetTimer = setTimeout(() => {
			copyStatus = 'idle';
		}, COPY_FEEDBACK_MS);
	}

	onDestroy(() => {
		attempt++;
		clearTimeout(resetTimer);
	});
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
		bind:this={copyButton}
		onclick={handleClipboardClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		class={[classes, copyStatus === 'success' && 'copied']}
	>
		<span class="btn-text">
			{#if copyStatus === 'success'}
				Copied phone number
			{:else if copyStatus === 'failure'}
				Copy failed: {clipboardText}
			{:else}
				{@render children()}
			{/if}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
		<svg class="btn-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		</svg>
	</button>
	<span class="copy-status" role="status">
		{#if copyStatus === 'success'}
			Copied phone number to clipboard
		{:else if copyStatus === 'failure'}
			Could not copy automatically. Select the number {clipboardText} to copy it manually.
		{/if}
	</span>
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
			color 0.2s ease,
			transform 0.08s ease;
	}

	.animated-btn:active:not(.disabled-link) {
		transform: translateY(1px);
	}

	@media (max-width: 40rem) {
		.animated-btn {
			white-space: normal;
			overflow-wrap: anywhere;
		}
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

	.animated-btn.primary:hover {
		background: var(--color-lacquer-hot);
		border-color: var(--color-lacquer-hot);
	}

	.animated-btn.primary:focus-visible {
		background: var(--color-lacquer-hot);
		border-color: var(--color-lacquer-hot);
		outline: 2px solid var(--color-cream);
		outline-offset: 3px;
		box-shadow: 0 0 0 5px var(--color-ink);
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

	.copy-status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.btn-check {
		position: absolute;
		top: 0;
		right: 1rem;
		bottom: 0;
		height: 55%;
		margin: auto;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.16s ease;
	}

	.animated-btn.icon--big .btn-check {
		height: 70%;
		right: 0.85rem;
	}

	.animated-btn.icon--small .btn-check {
		height: 40%;
		right: 0.75rem;
	}

	/* Crossfade the copy glyph to a checkmark and keep the text shifted to make room. */
	.animated-btn.copied img.btn-icon,
	.animated-btn.copied:hover img.btn-icon,
	.animated-btn.copied:focus-visible img.btn-icon {
		opacity: 0;
	}

	.animated-btn.copied .btn-check {
		opacity: 1;
	}

	.animated-btn.copied .btn-text {
		transform: translateX(-0.75rem);
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-check,
		img.btn-icon,
		.btn-text {
			transition: none;
		}
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
