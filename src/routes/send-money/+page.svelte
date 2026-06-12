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
	<h1>Send Money</h1>
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
		font-size: clamp(2rem, 5vw, 2.75rem);
		margin-bottom: 0.5rem;
	}

	.sub {
		color: var(--color-ink-muted);
		margin-bottom: 2.5rem;
	}

	.methods {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.method-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-radius: 12px;
		background: var(--color-raised);
		border: 1px solid var(--color-edge);
		transition: border-color 0.25s ease;
	}

	.method-card:hover {
		border-color: var(--color-edge-strong);
	}

	.method-info {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.brand {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
	}

	h2 {
		font-size: 1.15rem;
	}
</style>
