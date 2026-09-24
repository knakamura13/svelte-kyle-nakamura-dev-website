<script lang="ts">
	import { stack } from '$lib/motion/stack';

	const zelle = { display: '(626) 388-5416', digits: '6263885416' };
	const idleCaption = 'Copies the number.';
	let zelleCaption = $state(idleCaption);
	let copyStatus = $state('');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyZelle() {
		try {
			await navigator.clipboard.writeText(zelle.digits);
			zelleCaption = 'Number copied.';
			copyStatus = 'Zelle number copied';
		} catch {
			zelleCaption = `Couldn’t copy. The number is ${zelle.display}.`;
			copyStatus = `Could not copy. The Zelle number is ${zelle.display}.`;
		}
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			zelleCaption = idleCaption;
			copyStatus = '';
		}, 4000);
	}
</script>

<svelte:head>
	<title>Send money — Kyle Nakamura</title>
	<meta name="description" content="Send Kyle money with Venmo, Cash App, PayPal, or Zelle." />
</svelte:head>

<div class="send-money">
	<header class="page-intro">
		<h1>Send money,<br /><span>however is easiest.</span></h1>
		<p class="page-lede">Pick whichever works best for you.</p>
	</header>

	<ul class="stack payment-stack" aria-label="Payment methods" use:stack>
		<li>
			<a class="stack-card pay-venmo" href="https://venmo.com/u/pileofkyle" target="_blank" rel="noopener noreferrer" data-angle="-3" data-clear="-80">
				<span class="stack-face">
					<span class="stack-title">Venmo <span aria-hidden="true">↗</span></span>
					<span class="pay-handle">@pileofkyle</span>
					<img src="/icons/logo-venmo-circle.png" alt="" width="256" height="256" />
				</span>
			</a>
		</li>
		<li>
			<a class="stack-card pay-cash" href="https://cash.app/$KyleKyle" target="_blank" rel="noopener noreferrer" data-angle="4" data-clear="-100">
				<span class="stack-face">
					<span class="stack-title">Cash App <span aria-hidden="true">↗</span></span>
					<span class="pay-handle">$KyleKyle</span>
					<img src="/icons/logo-cash-circle.png" alt="" width="256" height="256" />
				</span>
			</a>
		</li>
		<li>
			<a class="stack-card pay-paypal" href="https://paypal.me/kylenakamura12" target="_blank" rel="noopener noreferrer" data-angle="-5" data-clear="90">
				<span class="stack-face">
					<span class="stack-title">PayPal <span aria-hidden="true">↗</span></span>
					<span class="pay-handle">kylenakamura12</span>
					<img src="/icons/logo-paypal-circle.png" alt="" width="256" height="256" />
				</span>
			</a>
		</li>
		<li>
			<button class="stack-card pay-zelle" type="button" data-angle="5" data-clear="80" onclick={copyZelle}>
				<span class="stack-face">
					<span class="stack-title">Zelle <span aria-hidden="true">⧉</span></span>
					<span class="pay-handle">{zelle.display}</span>
					<img src="/icons/logo-zelle-circle.png" alt="" width="256" height="256" />
					<span class="stack-caption">{zelleCaption}</span>
				</span>
			</button>
		</li>
	</ul>
	<p class="sr-only" aria-live="polite">{copyStatus}</p>
</div>

<style>
	.send-money { display:grid; grid-template-columns:minmax(240px,.76fr) minmax(0,1.24fr); gap:10%; align-items:start; padding-bottom:85px; }
	.pay-handle { display:block; font-family:'Newsreader Variable',Georgia,serif; font-size:27px; line-height:1.15; letter-spacing:-.04em; margin-top:6px; }
	.stack-card img { width:56px; height:56px; margin-top:26px; }
	.pay-venmo { z-index:1; }
	.pay-cash { z-index:2; }
	.pay-paypal { z-index:3; }
	.pay-zelle { z-index:4; }
	/* Soft tints of each brand's hue, at the lightness of the home page's tints. */
	.pay-venmo .stack-face { background:#cbe6f6; }
	.pay-cash .stack-face { background:#c9e9d3; }
	.pay-paypal .stack-face { background:#b1c1e7; }
	.pay-zelle .stack-face { background:#e0d0f1; }
	@media(min-width:701px) {
		.payment-stack { height:520px; margin-top:40px; }
		.pay-venmo { left:0; top:0; width:56%; height:230px; transform:rotate(-3deg); }
		.pay-cash { right:0; top:92px; width:54%; height:230px; transform:rotate(4deg); }
		.pay-paypal { left:4%; top:262px; width:50%; height:220px; transform:rotate(-5deg); }
		.pay-zelle { right:3%; top:318px; width:48%; height:200px; transform:rotate(5deg); }
	}
	@media(max-width:1000px) and (min-width:701px) { .pay-handle { font-size:22px; } }
	@media(max-width:700px) {
		.send-money { display:block; }
		.payment-stack { margin-top:8px; }
		.pay-handle { grid-column:2; grid-row:2; font-size:22px; margin-top:2px; }
		.stack-face { grid-template-rows:auto auto auto; }
		.stack-card img { grid-row:1 / 4; width:56px; height:56px; margin:0; align-self:center; }
		.stack-caption { grid-row:3; }
	}
</style>
