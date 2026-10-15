<script lang="ts">
	import Segmented from '$lib/experiments/ui/Segmented.svelte';
	import { useAirflow } from '../experience.svelte';

	const experience = useAirflow();
	const active = $derived(experience.scenarios.find((scenario) => scenario.id === experience.scenario) ?? null);
</script>

<Segmented
	legend="Home"
	name="airflow-home"
	value={experience.setup.plan}
	options={experience.plans.map((plan) => ({ value: plan.id, label: plan.name }))}
	onchange={(id) => experience.selectPlan(id)}
/>

<div class="dock-field">
	<p class="dock-label" id="airflow-scenario-label">Scenario</p>
	<div class="chips" role="group" aria-labelledby="airflow-scenario-label">
		{#each experience.scenarios as scenario (scenario.id)}
			<button
				type="button"
				class="chip"
				aria-pressed={experience.scenario === scenario.id}
				aria-describedby="airflow-scenario-{scenario.id}"
				title={scenario.blurb}
				onclick={() => experience.applyScenario(scenario.id)}>{scenario.name}</button
			>
			<!-- Read with the button, from `aria-describedby`; hidden so a screen reader does not also read it where it stands. -->
			<span hidden id="airflow-scenario-{scenario.id}">{scenario.blurb}</span>
		{/each}
	</div>
	<p class="dock-notice" data-scenario={active?.id ?? ''}>
		{#if active}<strong>{active.name}.</strong> {active.notice}{:else}Your own setup. Pick a scenario to start from one of the prepared ones.{/if}
	</p>
</div>

<div class="dock-field">
	<div class="dock-actions" role="group" aria-label="Whole setup">
		<button type="button" class="pill" onclick={() => experience.restart()}>
			<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10a5.5 5.5 0 1 0 1.9-4.2M4.5 3.5v3.3h3.3" /></svg>
			{experience.acknowledged === 'restart' ? 'Restarted' : 'Restart'}
		</button>
		<button type="button" class="pill" onclick={() => experience.reset()}>
			<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7.5 5.5 4 9l3.5 3.5M4 9h7.2a4 4 0 0 1 0 8H8" /></svg>
			{experience.acknowledged === 'reset' ? 'Reset done' : 'Reset'}
		</button>
		<button type="button" class="pill primary" onclick={() => experience.copyLink()}>
			<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2l-.8.8M11.4 8.6a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l.8-.8" /></svg>
			{experience.copied ? 'Link copied' : 'Copy link'}
		</button>
	</div>
	<p class="dock-notice">Restart clears the air and keeps the setup. Reset puts this home or scenario back the way it began. The link carries the setup, not the air.</p>
	{#if experience.linkShown}
		<label class="dock-link">
			<span class="dock-label">The browser would not copy it. Copy the link by hand:</span>
			<input type="text" readonly value={experience.shareUrl()} onfocus={(event) => event.currentTarget.select()} />
		</label>
	{/if}
</div>
