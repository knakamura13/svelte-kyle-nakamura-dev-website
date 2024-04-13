<script lang="ts">
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	const commonClasses = 'bg-gradient-to-br bg-clip-text text-transparent box-decoration-clone';
	const paymentMethods = [
		{
			name: 'Venmo',
			gradient: 'from-cyan-600 to-cyan-300',
			href: 'https://venmo.com/u/pileofkyle',
			label: 'Pay with Venmo',
			buttonText: 'Pay @pileofkyle',
			noUppercase: true
		},
		{
			name: 'Cash App',
			gradient: 'from-green-600 to-green-300',
			href: 'https://cash.app/$KyleKyle',
			label: 'Pay with Cash App',
			buttonText: 'Pay $KyleKyle',
			noUppercase: false
		},
		{
			name: 'PayPal',
			gradient: 'from-blue-600 to-blue-300',
			href: 'https://paypal.me/kylenakamura12',
			label: 'Pay with PayPal',
			buttonText: 'Pay kylenakamura12',
			noUppercase: true
		},
		{
			name: 'Zelle',
			gradient: 'from-red-600 to-red-300',
			clipboardText: '6263885416',
			label: 'Pay with Zelle',
			buttonText: 'Pay (626) 388-5416',
			noUppercase: true
		}
	];
</script>

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
