<script lang="ts">
	import { onMount } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import type { DeviceModel } from '../../devices/types';
	import { MAX_DEVICES } from '../../state';
	import { formatFlow } from '../../units';
	import { isClick } from './carry';
	import { CATALOG_TABS, cardLines, inTab, type CatalogTab } from './catalog';
	import Icon from './Icon.svelte';
	import { DEVICE_KINDS, ratedFlow } from './menus';
	import { useHudUi } from './ui.svelte';
	import { overWorld } from './world';

	/**
	 * The Build catalog, beside the rail while the Build tool is chosen: Fans and Purifiers, a card each with its picture, what it is, its
	 * maker and its rated flow. Drag a card into a room and let go to put it there; or click a card, and it follows the pointer until a
	 * click in a room puts it down. From the keyboard, Enter puts one at the best free spot.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const units = $derived(experience.view.units);
	let tab: CatalogTab = $state('fans');
	const shown = $derived(experience.models.filter((model) => inTab(model, tab)));
	const placed = $derived(experience.setup.devices.length);
	const full = $derived(placed >= MAX_DEVICES);

	let pictures: Map<string, string> = $state(new Map());
	onMount(() => {
		let cancelled = false;
		const draw = async () => {
			const { renderThumbnails } = await import('./thumbnails');
			if (!cancelled) pictures = renderThumbnails(experience.models);
		};
		const idle = 'requestIdleCallback' in window ? requestIdleCallback(() => void draw(), { timeout: 600 }) : setTimeout(() => void draw(), 60);
		return () => {
			cancelled = true;
			if ('cancelIdleCallback' in window) cancelIdleCallback(idle as number);
			else clearTimeout(idle as ReturnType<typeof setTimeout>);
		};
	});

	const rated = (model: DeviceModel) => `${model.kind === 'air-purifier' ? 'Cleans ' : ''}${formatFlow(ratedFlow(model), units).text}`;

	// ---- a card dragged straight into the world ----
	let press: { pointer: number; x: number; y: number; moved: boolean; model: string } | null = null;

	function follow(x: number, y: number) {
		const at = overWorld(x, y) ? experience.bridge.pick?.(x, y) : null;
		if (at) experience.carryTo(at.x, at.z);
		else experience.carryAway();
	}

	function down(event: PointerEvent, model: DeviceModel) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		press = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, model: model.id };
	}

	function move(event: PointerEvent) {
		if (!press || press.pointer !== event.pointerId) return;
		if (!press.moved && !isClick(press, { x: event.clientX, y: event.clientY })) {
			press.moved = true;
			experience.startCarry(press.model);
			ui.held = true;
		}
		if (press.moved) follow(event.clientX, event.clientY);
	}

	function up(event: PointerEvent) {
		if (!press || press.pointer !== event.pointerId) return;
		const done = press;
		press = null;
		ui.held = false;
		// A click picks it up: it follows the pointer until a click in a room puts it down.
		if (!done.moved) {
			if (experience.carry?.model === done.model && !experience.carry.moving) experience.cancelCarry();
			else experience.startCarry(done.model);
			return;
		}
		if (!overWorld(event.clientX, event.clientY)) {
			experience.cancelCarry();
			return;
		}
		follow(event.clientX, event.clientY);
		// Where it cannot go it stays carried, and the chip by the pointer says why.
		experience.placeCarry();
	}

	function cancel(event: PointerEvent) {
		if (!press || press.pointer !== event.pointerId) return;
		press = null;
		ui.held = false;
		experience.cancelCarry();
	}

	/** Enter or Space on a card: the keyboard has no pointer to carry it with, so it goes to the best free spot. */
	function key(event: MouseEvent, model: DeviceModel) {
		if (event.detail !== 0) return;
		experience.addDevice(model.id);
	}

	function tabKey(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		const at = CATALOG_TABS.findIndex((t) => t.id === tab);
		tab = CATALOG_TABS[(at + (event.key === 'ArrowRight' ? 1 : -1) + CATALOG_TABS.length) % CATALOG_TABS.length].id;
		(event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
		event.preventDefault();
	}

	const count = (id: CatalogTab) => experience.models.filter((model) => inTab(model, id)).length;
</script>

<section class="drawer glass" aria-labelledby="hud-catalog-title">
	<header class="head">
		<div>
			<h2 id="hud-catalog-title" class="title">Build</h2>
			<p class="sub" data-full={full ? '' : undefined}>{placed} of {MAX_DEVICES} placed</p>
		</div>
		<button type="button" class="ibtn" aria-label="Close the catalog" onclick={() => experience.setTool('select')}><Icon name="close" size={18} /></button>
	</header>

	<div class="tabs seg" role="tablist" aria-label="Catalog">
		{#each CATALOG_TABS as t (t.id)}
			<button type="button" role="tab" data-tab={t.id} aria-selected={tab === t.id} aria-controls="hud-catalog-panel" tabindex={tab === t.id ? 0 : -1} onclick={() => (tab = t.id)} onkeydown={tabKey}>
				<Icon name={t.id === 'fans' ? 'fan' : 'purifier'} size={17} />
				{t.label}<span class="tab-count">{count(t.id)}</span>
			</button>
		{/each}
	</div>

	<div class="grid scroll" id="hud-catalog-panel" role="tabpanel" aria-label={tab === 'fans' ? 'Fans' : 'Purifiers'}>
		{#each shown as model (model.id)}
			{@const lines = cardLines(model)}
			{@const picture = pictures.get(model.id)}
			<button
				type="button"
				class="card"
				class:carried={experience.carry?.model === model.id && !experience.carry.moving}
				data-model={model.id}
				aria-label="{model.name}, {DEVICE_KINDS[model.kind].toLowerCase()}, {rated(model)} on High. Drag it into a room, or press Enter to add it."
				onpointerdown={(event) => down(event, model)}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={cancel}
				onclick={(event) => key(event, model)}
			>
				<span class="picture" aria-hidden="true">
					{#if picture}
						<img src={picture} alt="" draggable="false" />
					{:else}
						<span class="placeholder"><Icon name={model.kind === 'air-purifier' ? 'purifier' : 'fan'} size={34} /></span>
					{/if}
					<span class="kind">{DEVICE_KINDS[model.kind]}</span>
				</span>
				<span class="card-title" aria-hidden="true">{lines.title}</span>
				<span class="card-maker" aria-hidden="true">{lines.maker}</span>
				<span class="card-flow" aria-hidden="true"><Icon name={model.kind === 'air-purifier' ? 'air' : 'wind'} size={14} />{rated(model)}</span>
			</button>
		{/each}
	</div>

	<p class="foot">
		{#if full}
			A home holds {MAX_DEVICES}. Remove one to bring in another.
		{:else}
			Drag a card into a room, or click it, then click a spot. <span class="key">R</span> turns it, <span class="key">Esc</span> puts it back.
		{/if}
	</p>
</section>

<style>
	.drawer {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		gap: 12px;
		width: 318px;
		max-height: 100%;
		padding: 14px 14px 12px;
		border-radius: 22px;
		animation: hud-slide 260ms var(--hud-ease);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.title {
		margin: 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.sub {
		margin: 2px 0 0;
		color: var(--hud-muted);
		font-size: 12px;
	}
	.sub[data-full] {
		color: #f7c97e;
	}
	.head .ibtn {
		margin: -6px -6px 0 0;
		color: var(--hud-muted);
	}
	.tabs {
		display: flex;
	}
	.tabs > button {
		flex: 1;
	}
	.tabs > button[aria-selected='true'] {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
	}
	.tab-count {
		margin-left: 2px;
		padding: 0 6px;
		border-radius: 8px;
		background: rgb(255 255 255 / 0.1);
		font-size: 11px;
	}
	.tabs > button[aria-selected='true'] .tab-count {
		background: rgb(5 38 26 / 0.18);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-content: start;
		gap: 10px;
		margin: 0 -4px;
		padding: 2px 4px 4px;
	}
	.card {
		display: grid;
		gap: 2px;
		padding: 6px 6px 10px;
		border: 0;
		border-radius: 16px;
		background: var(--hud-well);
		text-align: left;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		cursor: grab;
		touch-action: none;
		user-select: none;
		transition:
			background 180ms var(--hud-ease),
			box-shadow 180ms var(--hud-ease),
			transform 180ms var(--hud-ease);
	}
	.card:hover {
		background: var(--hud-hover);
		transform: translateY(-2px);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.18),
			0 10px 22px rgb(0 0 0 / 0.22);
	}
	.card:active {
		cursor: grabbing;
	}
	.card.carried {
		box-shadow: inset 0 0 0 2px var(--hud-accent);
	}
	.picture {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 1.12;
		margin-bottom: 6px;
		border-radius: 11px;
		background:
			radial-gradient(90% 70% at 50% 82%, rgb(20 30 25 / 0.2), transparent 70%),
			linear-gradient(170deg, #f1f5f1, #d3ddd7);
		overflow: hidden;
	}
	.picture img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 6px 6px rgb(20 30 25 / 0.25));
		transition: transform 220ms var(--hud-ease);
	}
	.card:hover .picture img {
		transform: scale(1.05);
	}
	.placeholder {
		color: #7d8c84;
	}
	.kind {
		position: absolute;
		left: 6px;
		top: 6px;
		padding: 2px 7px;
		border-radius: 7px;
		background: rgb(13 19 16 / 0.72);
		color: #e9f0eb;
		font-size: 10px;
		font-weight: 750;
	}
	.card-title {
		padding: 0 4px;
		font-size: 13px;
		font-weight: 750;
		line-height: 1.25;
	}
	.card-maker {
		padding: 0 4px;
		color: var(--hud-muted);
		font-size: 11px;
	}
	.card-flow {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
		padding: 0 4px;
		color: var(--hud-accent);
		font-size: 11.5px;
		font-weight: 750;
	}
	.foot {
		margin: 0;
		color: var(--hud-muted);
		font-size: 11.5px;
		line-height: 1.6;
	}

	:global(.hud.phone) .drawer {
		width: auto;
		max-height: 46vh;
		animation-name: hud-rise;
	}
	:global(.hud.phone) .grid {
		grid-template-columns: none;
		grid-auto-flow: column;
		grid-auto-columns: 128px;
		overflow-x: auto;
		overflow-y: hidden;
	}
	:global(.hud.phone) .foot {
		display: none;
	}
</style>
