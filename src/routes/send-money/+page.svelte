<script lang="ts">
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	const commonClasses = 'bg-gradient-to-br bg-clip-text text-transparent box-decoration-clone';
	const paymentMethods = [
		{
			name: 'Venmo',
			gradient: 'from-[#00BAFF] to-cyan-200',
			href: 'https://venmo.com/u/pileofkyle',
			label: 'Pay with Venmo',
			buttonText: 'Pay @pileofkyle',
			noUppercase: true,
			icon: '/icons/logo-venmo-circle.png'
		},
		{
			name: 'Cash App',
			gradient: 'from-[#3BFF4C] to-lime-200',
			href: 'https://cash.app/$KyleKyle',
			label: 'Pay with Cash App',
			buttonText: 'Pay $KyleKyle',
			noUppercase: false,
			icon: '/icons/logo-cash-circle.png'
		},
		{
			name: 'PayPal',
			gradient: 'from-[#34BEFF] to-blue-200',
			href: 'https://paypal.me/kylenakamura12',
			label: 'Pay with PayPal',
			buttonText: 'Pay kylenakamura12',
			noUppercase: true,
			icon: '/icons/logo-paypal-circle.png'
		},
		{
			name: 'Zelle',
			gradient: 'from-[#8F27FF] to-purple-200',
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

<section class="page" id="send-money">
	<section class="payment-methods">
		{#each paymentMethods as method}
			<h1 class="h1">
				<span class="{commonClasses} {method.gradient}">
					{method.name}
				</span>
			</h1>
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
		{/each}
	</section>
</section>

<style lang="scss">
	.page#send-money {
		padding: 1rem 1.5rem;
	}

	.payment-methods {
		padding-bottom: 4rem;
	}
</style>
