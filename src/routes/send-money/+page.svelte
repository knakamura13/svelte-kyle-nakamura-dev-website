<script lang="ts">
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	interface PaymentMethod {
		name: string;
		href?: string;
		clipboardText?: string;
		label: string;
		buttonText: string;
		noUppercase: boolean;
		icon: string;
	}

	const paymentMethods: PaymentMethod[] = [
		{
			name: 'Venmo',
			href: 'https://venmo.com/u/pileofkyle',
			label: 'Pay with Venmo',
			buttonText: 'Pay @pileofkyle',
			noUppercase: true,
			icon: '/icons/logo-venmo-circle.png'
		},
		{
			name: 'Cash App',
			href: 'https://cash.app/$KyleKyle',
			label: 'Pay with Cash App',
			buttonText: 'Pay $KyleKyle',
			noUppercase: false,
			icon: '/icons/logo-cash-circle.png'
		},
		{
			name: 'PayPal',
			href: 'https://paypal.me/kylenakamura12',
			label: 'Pay with PayPal',
			buttonText: 'Pay kylenakamura12',
			noUppercase: true,
			icon: '/icons/logo-paypal-circle.png'
		},
		{
			name: 'Zelle',
			clipboardText: '6263885416',
			label: 'Pay with Zelle',
			buttonText: 'Pay (626) 388-5416',
			noUppercase: true,
			icon: '/icons/logo-zelle-circle.png'
		}
	];
</script>

<svelte:head>
	<title>Send money to Kyle</title>
</svelte:head>

<div class="page fade-rise" id="send-money">
	<div class="section-kicker">
		<span class="cat-no">Ledger</span>
		<h1>Send Money</h1>
	</div>
	<p class="sub">Pick whichever works best for you.</p>

	<div class="methods">
		{#each paymentMethods as method (method.name)}
			<div class="method-card">
				<div class="method-info">
					<img class="brand" src={method.icon} alt="{method.name} logo" />
					<h2>{method.name}</h2>
				</div>

				<AnimatedButton
					href={method.href}
					size="big"
					ariaLabel={method.label}
					noUppercase={method.noUppercase || undefined}
					clipboardText={method.clipboardText}
					icon={method.icon}
					iconSize="med"
				>
					{method.buttonText}
				</AnimatedButton>
			</div>
		{/each}
	</div>
</div>

<style>
	h1 {
		font-size: clamp(2.4rem, 7vw, 4.2rem);
		margin: 0;
		font-variation-settings: 'SOFT' 45, 'WONK' 1, 'opsz' 96;
	}

	.sub {
		color: var(--color-ink-muted);
		margin: 0.75rem 0 2.25rem;
		max-width: 28rem;
	}

	.methods {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--color-ink);
	}

	.method-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1.35rem 0.15rem 1.35rem 0;
		border-bottom: 1px solid var(--color-ink);
		background: transparent;
		transition: background-color 0.2s ease;
	}

	.method-card:hover {
		background: rgb(251 246 234 / 0.55);
	}

	.method-info {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.brand {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		border: 1px solid var(--color-ink);
	}

	h2 {
		font-size: 1.45rem;
		font-weight: 500;
	}
</style>
