<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible = false;
  export let radius = 80;

  const dispatch = createEventDispatcher();
  let knobAngle = 0;

  function handlePointerMove(e: PointerEvent) {
    const rect = e.currentTarget!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const angle = Math.atan2(dy, dx);

    if (angle >= -Math.PI && angle <= 0) {
      knobAngle = angle;
      dispatch('spinselect', { spin: dx < 0 ? -1 : 1 });
    }
  }
</script>

{#if visible}
<svg
  width={radius * 2}
  height={radius}
  on:pointerdown|preventDefault={handlePointerMove}
  on:pointermove|preventDefault={handlePointerMove}
  style="touch-action: none; display: block; margin: 1rem auto;"
>
  <path
    d="M 0 {radius} A {radius} {radius} 0 0 1 {radius * 2} {radius}"
    fill="none"
    stroke="#ccc"
    stroke-width="4"
  />

  {#if knobAngle}
    <circle
      cx={radius + Math.cos(knobAngle) * radius}
      cy={radius + Math.sin(knobAngle) * radius}
      r="8"
      fill="black"
    />
  {/if}
</svg>
{/if}