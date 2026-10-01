<script lang="ts">
	import { onMount } from 'svelte';

	// The two assembly targets of the first lab, from learning-korean at commit e993c60
	// (app/src/lib/content/lab01.ts, "assemble" steps): a tall vowel takes the consonant beside it,
	// a wide vowel takes it above.
	const examples = [
		{ id: 'ba', consonant: 'ㅂ', vowel: 'ㅏ', syllable: '바', reading: 'ba', shape: 'tall', layout: 'beside' },
		{ id: 'so', consonant: 'ㅅ', vowel: 'ㅗ', syllable: '소', reading: 'so', shape: 'wide', layout: 'above' }
	] as const;
	type Example = (typeof examples)[number];

	let selected = $state<(typeof examples)[number]['id']>('ba');
	let assembled = $state(false);
	// Controls exist only once the page is interactive, so no-JS readers never see inert buttons.
	let interactive = $state(false);
	onMount(() => (interactive = true));

	let example = $derived(examples.find((item) => item.id === selected) ?? examples[0]);
	function choose(id: (typeof examples)[number]['id']) {
		selected = id;
		assembled = false;
	}
</script>

<svelte:head>
	<noscript><style>.builder { min-height:0 !important; padding:0 !important; background:none !important; }</style></noscript>
</svelte:head>

<!-- Only the Hangul is marked lang="ko"; the English and the romanization stay in the page language,
     so screen readers do not switch to a Korean voice for the explanation. -->
{#snippet why(item: Example)}<span lang="ko">{item.vowel}</span> is a {item.shape} vowel, so the consonant sits {item.layout} it.{/snippet}

<ul class="equations">
	{#each examples as item (item.id)}
		<li>
			<span lang="ko">{item.consonant} + {item.vowel} → {item.syllable}</span> ({item.reading}). {@render why(item)}
		</li>
	{/each}
</ul>

<!-- The frame is always rendered so hydration does not push the practice section down after an anchor lands. -->
<div class="builder" class:ready={interactive} aria-hidden={interactive ? undefined : 'true'}>
	{#if interactive}
		<fieldset>
			<legend>Example</legend>
			{#each examples as item (item.id)}
				<label>
					<input type="radio" name="syllable-example" value={item.id} checked={selected === item.id} onchange={() => choose(item.id)} />
					<span><span lang="ko">{item.consonant} + {item.vowel}</span> ({item.reading})</span>
				</label>
			{/each}
		</fieldset>

		<div class="stage" data-example={example.id} data-state={assembled ? 'assembled' : 'separated'} aria-hidden="true">
			<span class="piece consonant" lang="ko">{example.consonant}</span>
			<span class="piece vowel" lang="ko">{example.vowel}</span>
			<span class="glyph" lang="ko">{example.syllable}</span>
		</div>

		<button type="button" class="toggle" onclick={() => (assembled = !assembled)}>{assembled ? 'Separate pieces' : 'Build syllable'}</button>
		<p class="result" aria-live="polite">
			{#if assembled}
				<span lang="ko">{example.consonant}</span> + <span lang="ko">{example.vowel}</span> = <span lang="ko">{example.syllable}</span> ({example.reading}). {@render why(example)}
			{:else}
				<span lang="ko">{example.consonant}</span> and <span lang="ko">{example.vowel}</span> are apart.
			{/if}
		</p>
	{/if}
</div>

<style>
	.equations { list-style:none; padding:0; margin:18px 0 0; display:grid; gap:6px; }
	.equations li { font-size:13px; line-height:1.8; color:var(--muted); }
	.equations [lang='ko'] { font-size:18px; color:var(--ink); }
	.builder { margin-top:20px; padding:18px; border-radius:12px; display:grid; gap:14px; justify-items:start; min-height:398px; background:var(--sage); }
	fieldset { border:0; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:4px 18px; }
	legend { font-size:11px; color:var(--muted); padding:0 0 4px; }
	label { display:inline-flex; align-items:center; gap:8px; min-height:44px; font-size:13px; cursor:pointer; }
	input[type='radio'] { width:20px; height:20px; accent-color:var(--accent); }
	.stage { position:relative; width:100%; max-width:240px; height:150px; background:var(--surface); border-radius:10px; overflow:hidden; --cx:0px; --cy:0px; --vx:0px; --vy:0px; }
	.stage[data-example='ba'][data-state='separated'] { --cx:-62px; --vx:62px; }
	.stage[data-example='ba'][data-state='assembled'] { --cx:-22px; --vx:22px; }
	.stage[data-example='so'][data-state='separated'] { --cy:-44px; --vy:44px; }
	.stage[data-example='so'][data-state='assembled'] { --cy:-24px; --vy:24px; }
	.piece, .glyph { position:absolute; left:50%; top:50%; line-height:1; color:var(--ink); }
	.piece { font-size:54px; translate:calc(-50% + var(--cx)) calc(-50% + var(--cy)); transition:translate 300ms var(--ease), scale 300ms var(--ease), opacity 120ms ease; }
	.vowel { translate:calc(-50% + var(--vx)) calc(-50% + var(--vy)); }
	.glyph { font-size:84px; translate:-50% -50%; opacity:0; transition:opacity 120ms ease; }
	/* The pieces slide together, then hand over to the real glyph so the final shape is the font's own. */
	/* Scaling to the glyph's size (84px / 54px) keeps the handover from popping. */
	.stage[data-state='assembled'] .piece { scale:1.55; opacity:0; transition-delay:0ms, 0ms, 240ms; }
	.stage[data-state='assembled'] .glyph { opacity:1; transition-delay:240ms; }
	.toggle { min-height:44px; padding:0 20px; border-radius:100px; background:var(--ink); color:var(--surface); font-size:13px; font-weight:600; }
	.toggle:hover { background:var(--accent); }
	.result { font-size:13px; line-height:1.7; min-height:60px; margin:0; }
	.result [lang='ko'] { font-size:15px; }
	@media(prefers-reduced-motion:reduce) {
		.piece, .glyph { transition:none; transition-delay:0ms; }
		.stage[data-state='assembled'] .piece, .stage[data-state='assembled'] .glyph { transition-delay:0ms; }
	}
</style>
