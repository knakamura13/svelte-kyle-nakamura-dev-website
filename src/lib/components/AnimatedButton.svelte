<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	type BUTTON_SIZE = 'big' | 'small';
	type BUTTON_TYPE = 'fill' | 'outline';
	type ICON_SIZE = 'big' | 'med' | 'small';

	export let href: string | undefined;
	export let size: BUTTON_SIZE = 'small';
	export let type: BUTTON_TYPE = 'fill';
	export let ariaLabel: string = '';
	export let disabled: boolean = false;
	export let icon: string = '/src/assets/icons/icon-arrow-light.svg';
	export let iconSize: ICON_SIZE = 'med';

	const dispatch = createEventDispatcher();

	// Computed property to determine if the link is external
	$: isExternalLink = typeof href === 'string' && href.length > 0 && !href.startsWith('/');

	function handleClick(event: MouseEvent): void {
		if (href !== undefined && href.endsWith('.pdf')) {
			event.preventDefault();
			event.stopPropagation();
			window.open(href, '_blank');
		} else {
			dispatch('clickEvent', event);
		}
	}

	function determineClasses(): string {
		return `button btn btn-sm variant-ghost-surface ${size} ${type} icon-${iconSize} ${
			disabled ? 'disabled-link' : ''
		}`;
	}

	function determineHref(): string {
		if (!href) return '';
		return href?.endsWith('.pdf') ? 'javascript:void(0)' : href;
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
	$color-tangerine: 'orange';
	$color-flour: 'white';
	$color-cool-slate: 'grey';

	.button {
		--_button-height: 40px;
	}

	.disabled-link {
		pointer-events: none;
		opacity: 0.6;
		cursor: not-allowed;
	}

	.button {
		position: relative;
		display: inline-block;
		overflow: hidden;
		line-height: 1.5625rem;
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

		// size
		&.big {
			padding: 0.25rem 1rem;
			//font-size: 1rem;
		}

		&.small {
			padding: 0.2rem 1rem;
			//font-size: 0.8125rem;
		}

		// type
		&.fill {
			background-color: $color-tangerine !important;
		}

		&.outline {
			background-color: transparent;
		}

		// mode
		&.dark {
			color: $color-flour;
		}

		&.light {
			color: $color-cool-slate;
		}

		&.neutral {
			color: $color-cool-slate;
		}

		// Animations
		&:hover,
		&:focus {
			img.btn-icon {
				right: 0.1rem;
			}

			.btn-text {
				transform: translateX(-0.55rem);
			}
		}

		// icon size
		&.icon-small {
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
