<script lang="ts">
	import { onMount } from 'svelte';
	import { evaluateAttempt, scenarios, type Scenario } from './scheduler';

	const MAX_SECONDS = 20;
	const SCALE_DAYS = 35;
	const sourceUrl = 'https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/app/src/lib/domain/srs.ts#L372-L465';

	// Two fixed comparisons, rendered on the server so the idea reads without JavaScript.
	const staticExamples = [2, 10].map((seconds) => ({ seconds, ...evaluateAttempt({ correct: true, ms: seconds * 1000, scenario: 'established' }) }));

	const defaults = { scenario: 'established' as Scenario, correct: true, seconds: 2 };
	let scenario = $state<Scenario>(defaults.scenario);
	let correct = $state(defaults.correct);
	let seconds = $state(defaults.seconds);
	// Controls exist only once the page is interactive, so no-JS readers never see inert controls.
	let interactive = $state(false);
	onMount(() => (interactive = true));

	let outcome = $derived(evaluateAttempt({ correct, ms: Math.round(seconds * 1000), scenario }));
	let summary = $derived(`${outcome.grade}. Next review in ${outcome.delay}.`);
	let barDays = $derived(Math.min(SCALE_DAYS, outcome.delayMs / 86_400_000));
	// Announced only when a change is committed (release, selection, Reset), never per slider pixel.
	let announcement = $state('');
	const commit = () => (announcement = summary);

	function setSeconds(value: number) {
		if (Number.isFinite(value)) seconds = Math.min(MAX_SECONDS, Math.max(0, Math.round(value * 10) / 10));
	}
	function reset() {
		scenario = defaults.scenario;
		correct = defaults.correct;
		seconds = defaults.seconds;
		announcement = '';
		queueMicrotask(commit);
	}
</script>

<svelte:head>
	<noscript><style>.explorer { display:none !important; }</style></noscript>
</svelte:head>

<div class="static-compare">
	<p>
		Take a card you have reviewed three times without a lapse. Answer it correctly and it comes back at an interval that depends on how quickly you answered:
	</p>
	<ul>
		{#each staticExamples as item (item.seconds)}
			<li>Correct in <strong>{item.seconds} seconds</strong>: graded <strong>{item.grade}</strong>, due again in <strong>{item.delay}</strong>.</li>
		{/each}
	</ul>
</div>

<!-- The controls are server-rendered but inert (unfocusable, unclickable, hidden from assistive tech) until
     hydration, so the layout is identical before and after and nothing unusable is presented as usable. -->
<div class="explorer" class:pending={!interactive} inert={!interactive} aria-hidden={interactive ? undefined : 'true'}>
	<p class="label">Try it: an illustration of the scheduling rules this project uses</p>
	<div class="row">
		<fieldset>
			<legend>Card history</legend>
			{#each Object.entries(scenarios) as [id, item] (id)}
				<label><input type="radio" name="explorer-scenario" value={id} checked={scenario === id} onchange={() => { scenario = id as Scenario; commit(); }} /> {item.label}</label>
			{/each}
		</fieldset>
		<fieldset>
			<legend>Answer</legend>
			<label><input type="radio" name="explorer-correct" checked={correct} onchange={() => { correct = true; commit(); }} /> Correct</label>
			<label><input type="radio" name="explorer-correct" checked={!correct} onchange={() => { correct = false; commit(); }} /> Incorrect</label>
		</fieldset>
	</div>
	<!-- Both explanations share one grid cell, so switching history never changes the frame height. -->
	<p class="history">
		{#each Object.entries(scenarios) as [id, item] (id)}
			<span class:shown={scenario === id} aria-hidden={scenario === id ? undefined : 'true'}>{item.explanation}</span>
		{/each}
	</p>

	<div class="time">
		<label for="explorer-seconds">Response time</label>
		<input id="explorer-seconds" type="range" min="0" max={MAX_SECONDS} step="0.1" value={seconds} oninput={(event) => setSeconds(event.currentTarget.valueAsNumber)} onchange={commit} />
		<span class="number">
			<input type="number" aria-label="Response time in seconds" min="0" max={MAX_SECONDS} step="0.1" value={seconds} oninput={(event) => setSeconds(event.currentTarget.valueAsNumber)} onchange={(event) => { event.currentTarget.value = String(seconds); commit(); }} />
			<span aria-hidden="true">seconds</span>
		</span>
	</div>

	<div class="result">
		<p class="summary"><strong>{outcome.grade}</strong>. Next review in <strong>{outcome.delay}</strong>.</p>
		<div class="track" aria-hidden="true"><div class="fill" class:empty={barDays < 0.05} style:width="{(barDays / SCALE_DAYS) * 100}%"></div></div>
		<div class="scale" aria-hidden="true">
			{#each [0, 1, 2, 3, 4, 5] as step (step)}
				<span style:left="{step * 20}%">{step === 0 ? '0' : `${(SCALE_DAYS / 5) * step} days`}</span>
			{/each}
		</div>
	</div>

	<button type="button" class="reset" onclick={reset}>Reset</button>
	<p class="sr-only" aria-live="polite">{announcement}</p>
	<p class="note">
		This is an illustration of the project's published scheduling rules at a pinned revision, not a live learner's schedule or a promise about retention.
		<a class="text-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>
	</p>
</div>

<style>
	.static-compare p, .static-compare li { font-size:13px; line-height:1.8; color:var(--muted); }
	.static-compare ul { margin:8px 0 0; padding-left:1.1em; display:grid; gap:2px; }
	.static-compare li { text-wrap:pretty; }
	.static-compare strong { color:var(--ink); font-weight:650; }
	.explorer { margin-top:20px; padding:18px; border-radius:12px; background:var(--sage); display:grid; gap:14px; justify-items:start; }
	.explorer { transition:opacity 200ms var(--ease); }
	.explorer.pending { opacity:.55; }
	.label { font-size:11px; color:var(--muted); margin:0; }
	.row { display:flex; flex-wrap:wrap; gap:4px 28px; }
	fieldset { border:0; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:0 16px; }
	legend { font-size:11px; color:var(--muted); padding:0 0 2px; }
	label { display:inline-flex; align-items:center; gap:8px; min-height:44px; font-size:13px; cursor:pointer; }
	input[type='radio'] { width:20px; height:20px; accent-color:var(--accent); }
	.history { font-size:12px; line-height:1.7; color:var(--muted); margin:0; display:grid; }
	.history>span { grid-area:1 / 1; visibility:hidden; }
	.history>span.shown { visibility:visible; }
	.time { display:flex; flex-wrap:wrap; align-items:center; gap:2px 14px; width:100%; }
	.time input[type='range'] { flex:1 1 180px; min-width:0; min-height:44px; accent-color:var(--accent); }
	.number { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); }
	.number input { width:5.5em; min-height:44px; padding:0 10px; border:1px solid #c9d2c2; border-radius:8px; background:var(--surface); font:inherit; font-size:14px; color:var(--ink); }
	.result { width:100%; }
	.summary { font-size:16px; margin:0 0 10px; min-height:1.7em; }
	.track { height:12px; border-radius:6px; background:var(--surface); overflow:hidden; }
	.fill { height:100%; background:var(--accent); border-radius:6px; transition:width 300ms var(--ease), opacity 120ms ease; }
	.fill.empty { opacity:0; }
	/* Each label is centred on its tick; the ends align to the bar's edges. */
	.scale { position:relative; height:16px; font-size:10px; color:var(--muted); margin-top:5px; }
	.scale>span { position:absolute; top:0; translate:-50% 0; white-space:nowrap; }
	.scale>span:first-child { translate:0 0; }
	.scale>span:last-child { left:auto !important; right:0; translate:0 0; }
	.reset { min-height:44px; padding:0 20px; border-radius:100px; background:transparent; border:1px solid var(--ink); font-size:13px; font-weight:600; }
	.reset:hover { background:var(--ink); color:var(--surface); }
	.note { font-size:11px; line-height:1.7; color:var(--muted); margin:0; }
	/* An inline link inside the sentence (exempt from target-size rules), so it does not stretch the line. */
	.note .text-link { display:inline; min-height:0; font-size:inherit; }
	.note .text-link::after { bottom:-1px; }
	/* On narrow screens the result can wrap and the label sits above its slider; reserve both so nothing jumps. */
	@media(max-width:480px) {
		.summary { min-height:calc(2 * 1.7em); }
		.time>label { min-height:auto; flex-basis:100%; }
	}
	@media(prefers-reduced-motion:reduce) { .fill, .explorer { transition:none; } }
</style>
