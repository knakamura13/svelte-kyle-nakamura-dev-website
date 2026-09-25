<script lang="ts">
	import Arrow from './Arrow.svelte';
	import { projects } from '$lib/content/portfolio';
	import { stack } from '$lib/motion/stack';
</script>

<nav class="stack project-stack" aria-label="Explore my projects" use:stack>
	<a class="stack-card stack-korean" href="#korean" data-angle="-3" data-clear="-115">
		<div class="stack-face">
			<span class="stack-title">Learning Korean <span aria-hidden="true"><Arrow direction="down-right" /></span></span>
			<span class="hangul" lang="ko">한<span>글</span></span>
			<img src={projects[0].image} alt="Interactive Hangul learning lab" width="1280" height="720" fetchpriority="high" />
			<span class="stack-caption">Learning by trying.</span>
		</div>
	</a>
	<a class="stack-card stack-mlrose" href="#mlrose" data-angle="-5" data-clear="110">
		<div class="stack-face">
			<span class="stack-title">mlrose-ky <span aria-hidden="true"><Arrow direction="down-right" /></span></span>
			<img src={projects[1].image} alt="Optimization graph" width="751" height="727" />
			<span class="stack-caption">Exploring optimization.</span>
		</div>
	</a>
	<a class="stack-card stack-foods" href="#oc-foods" data-angle="5" data-clear="95">
		<div class="stack-face">
			<span class="stack-title">OC Foods <span aria-hidden="true"><Arrow direction="down-right" /></span></span>
			<img src="/images/concepts/oc-foods.png" alt="Orange with a green leaf" width="180" height="180" />
			<span class="stack-caption">Finding a good local meal.</span>
		</div>
	</a>
</nav>

<style>
	.stack-korean { z-index:1; }
	.stack-mlrose { z-index:2; }
	.stack-foods { z-index:3; }
	.stack-korean .stack-face { background:var(--sage-card); }
	.stack-mlrose .stack-face { background:var(--butter); }
	.stack-foods .stack-face { background:var(--peach); }
	.stack-foods img { mix-blend-mode:multiply; }
	.hangul { display:block; font-size:62px; line-height:1.25; color:#31533b; letter-spacing:-.07em; margin:5px 0 9px; }
	.hangul>span { color:#89a879; }
	@media(min-width:701px) {
		.project-stack { height:500px; margin-top:12px; }
		.stack-korean { left:5%; top:15px; width:82%; height:315px; transform:rotate(-3deg); }
		.stack-korean img { width:100%; height:145px; object-fit:cover; object-position:top; border-radius:8px; }
		.stack-mlrose { left:2%; top:282px; width:47%; height:207px; transform:rotate(-5deg); }
		.stack-mlrose img { height:113px; width:100%; object-fit:contain; margin-top:10px; border-radius:5px; }
		.stack-foods { right:0; top:295px; width:45%; height:196px; transform:rotate(5deg); }
		.stack-foods img { width:96px; height:96px; object-fit:contain; margin:10px auto 0; border-radius:14px; }
	}
	@media(max-width:700px) {
		.stack-korean img { object-position:left; }
		.hangul { display:none; }
	}
</style>
