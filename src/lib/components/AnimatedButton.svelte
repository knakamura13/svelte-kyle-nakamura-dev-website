<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type BUTTON_SIZE = 'big' | 'small';
	type BUTTON_ICON_SIZE = 'big' | 'med' | 'small';

	export let href: string | undefined;
	export let size: BUTTON_SIZE = 'small';
	export let ariaLabel: string = '';
	export let disabled: boolean = false;
	export let icon: string = '/icons/icon-arrow-light.svg';
	export let iconSize: BUTTON_ICON_SIZE = 'med';

	const dispatch = createEventDispatcher();

	// Determine if the link is external
	$: isExternalLink = typeof href === 'string' && href.length && !href.startsWith('/');

	// Determine if the link is a PDF
	$: isPDFLink = typeof href === 'string' && href.length && href.endsWith('.pdf');

	function handleClick(event: MouseEvent): void {
		if (href !== undefined && isPDFLink) {
			event.preventDefault();
			event.stopPropagation();
			window.open(href, '_blank');
		} else {
			dispatch('clickEvent', event);
		}
	}

	function determineClasses(): string {
		return `button btn btn-sm variant-ghost-surface ${size} icon--${iconSize} ${
			disabled ? 'disabled-link' : ''
		}`;
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
			height: 75%;
			width: auto;
			margin-bottom: auto;
			margin-top: auto;
			overflow: visible;
			transition: all 0.3s;
			aspect-ratio: 1 / 1 !important;
		}

		.btn-text {
			transition: all 0.3s;
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

		// Animations
		&:hover,
		&:focus {
			img.btn-icon {
				right: calc(0.6rem - 1px);
			}

			.btn-text {
				transform: translateX(-0.9rem);
			}
		}

		// Icon size
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
