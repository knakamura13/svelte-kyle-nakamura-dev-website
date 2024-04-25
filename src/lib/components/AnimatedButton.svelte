<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { clipboard } from '@skeletonlabs/skeleton';

	type BUTTON_SIZE = 'big' | 'small';
	type BUTTON_ICON_SIZE = 'big' | 'med' | 'small';

	export let href: string | undefined;
	export let size: BUTTON_SIZE = 'small';
	export let ariaLabel: string = '';
	export let disabled: boolean = false;
	export let icon: string = '/icons/icon-arrow-light.svg';
	export let iconSize: BUTTON_ICON_SIZE = 'med';
	export let noUppercase: boolean | undefined = false;
	export let clipboardText: string = '';

	const dispatch = createEventDispatcher();

	// Determine if the link is external
	$: isExternalLink = typeof href === 'string' && href.length && !href.startsWith('/');

	// Determine if the link is a PDF
	$: isPDFLink = typeof href === 'string' && href.length && href.endsWith('.pdf');

	// Determine if the link is copyable text
	$: isClipboardLink = typeof href === 'undefined' && !!clipboardText;

	let copied = false;

	function handleClick(event: MouseEvent): void {
		if (href !== undefined && isPDFLink) {
			event.preventDefault();
			event.stopPropagation();
			window.open(href, '_blank');
		} else {
			dispatch('clickEvent', event);
		}
	}

	function handleClipboardClick(): void {
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 1000);
	}

	function determineClasses(): string {
		const buttonClasses = [
			'button',
			'btn',
			'btn-sm',
			'variant-ghost-surface',
			size,
			`icon--${iconSize}`,
			disabled ? 'disabled-link' : '',
			noUppercase ? 'no-uppercase' : ''
		];
		return buttonClasses.join(' ');
	}

	function determineHref(): string {
		if (!href) return '';
		return isPDFLink ? 'javascript:void(0)' : href;
	}
</script>

{#if isExternalLink}
	<a
		on:click={handleClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		{href}
		class={determineClasses()}
		rel="noopener noreferrer"
		target="_blank"
		type="button"
	>
		<div class="btn-text">
			<slot />
		</div>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</a>
{:else if isClipboardLink}
	<button
		use:clipboard={clipboardText}
		on:click={handleClipboardClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		class={determineClasses()}
		disabled={copied}
	>
		<span class="btn-text">
			{#if copied}
				Copied phone number 👍
			{:else}
				<slot />
			{/if}
		</span>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</button>
{:else}
	<a
		on:click={handleClick}
		aria-label={ariaLabel}
		title={ariaLabel}
		href={determineHref()}
		class={determineClasses()}
		type="button"
	>
		<div class="btn-text">
			<slot />
		</div>

		<img src={icon} alt="" aria-hidden="true" class="btn-icon" />
	</a>
{/if}

<style lang="scss">
	.disabled-link {
		pointer-events: none;
		opacity: 0.6;
		cursor: not-allowed;
	}

	.button {
		position: relative;
		display: inline-block;
		overflow: hidden;
		line-height: 100%;
		cursor: pointer;
		text-transform: capitalize;
		white-space: nowrap;

		img.btn-icon {
			position: absolute;
			top: 0;
			right: -4rem;
			bottom: 0;
			height: 55%;
			width: auto;
			margin: auto;
			transition: all 0.3s;
			aspect-ratio: 1 / 1 !important;
			border-radius: unset;
		}

		.btn-text {
			display: inline-block;
			transition: all 0.3s;
		}

		&.no-uppercase {
			text-transform: initial !important;
		}

		// Animations
		&:hover,
		&:focus {
			img.btn-icon {
				right: calc(1rem + 1px);
			}

			.btn-text {
				transform: translateX(-0.9rem);
			}
		}

		// Button Size
		&.big {
			padding: 0.75rem 2rem;
			font-size: 1rem;
		}

		&.small {
			padding: 0.66rem 1rem;
			font-size: 0.9rem;
		}

		// Icon size
		&.icon--big {
			img.btn-icon {
				height: 75%;
			}

			&:hover,
			&:focus {
				img.btn-icon {
					right: calc(0.6rem - 1px);
				}

				.btn-text {
					transform: translateX(-0.9rem);
				}
			}
		}
		&.icon--small {
			img.btn-icon {
				height: 40%;
			}

			&:hover,
			&:focus {
				img.btn-icon {
					right: 0.45rem;
				}

				.btn-text {
					transform: translateX(-0.6rem);
				}
			}
		}
	}
</style>
