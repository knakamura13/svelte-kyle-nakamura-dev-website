<script lang="ts">
 import { onMount } from 'svelte';
 import { projects } from '$lib/content/portfolio';
 let stage: HTMLElement;
 let active: HTMLAnchorElement | null = null;
 let order = 3;
 let revision = 0;
 const running = new Map<HTMLElement, Animation>();
 const ease = 'cubic-bezier(.22,.75,.25,1)';
 const resting = (card: HTMLElement) => `translateY(0px) rotate(${card.dataset.angle}deg)`;
 const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 700px)').matches;

 function stop(card: HTMLElement) {
  const current = getComputedStyle(card).transform;
  running.get(card)?.cancel();
  running.delete(card);
  card.style.transform = current;
  return current;
 }
 async function move(card: HTMLElement, to: string, duration: number) {
  const from = stop(card);
  const animation = card.animate([{ transform: from }, { transform: to }], { duration, easing: ease, fill: 'forwards' });
  running.set(card, animation);
  try { await animation.finished; } catch { return false; }
  card.style.transform = to;
  animation.cancel();
  if (running.get(card) === animation) running.delete(card);
  return true;
 }
 async function promote(card: HTMLAnchorElement) {
  if (active === card) return;
  const token = ++revision;
  const previous = active;
  active = card;
  if (previous) {
   previous.removeAttribute('data-active');
   if (still()) { stop(previous); previous.style.transform = ''; }
   else void move(previous, resting(previous), 440);
  }
  card.dataset.active = 'true';
  if (still()) { stop(card); card.style.transform = ''; return; }
  // Change paint order only after the card has slid clear of its neighbours.
  if (!await move(card, `translateY(${card.dataset.clear}px) rotate(0deg)`, 260) || token !== revision) return;
  card.style.zIndex = String(++order);
  await move(card, 'translateY(-8px) rotate(0deg)', 420);
 }
 function release(force = false) {
  // Only bail if the *active* card contains focus, not any card in the stack.
  if (!force && active?.contains(document.activeElement)) return;
  ++revision;
  if (!active) return;
  const card = active;
  active = null;
  card.removeAttribute('data-active');
  if (still()) { stop(card); card.style.transform = ''; }
  else void move(card, resting(card), 480);
 }
 onMount(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const reset = () => {
   ++revision;
   active = null;
   for (const card of stage.querySelectorAll<HTMLElement>('.stack-card')) {
    stop(card); card.style.transform = ''; card.removeAttribute('data-active');
   }
  };
  reduced.addEventListener('change', reset);
  mobile.addEventListener('change', reset);
  return () => { ++revision; for (const animation of running.values()) animation.cancel(); reduced.removeEventListener('change', reset); mobile.removeEventListener('change', reset); };
 });
</script>

<nav class="project-stack" aria-label="Explore my projects" bind:this={stage} onpointerleave={() => release()} onfocusout={(event) => { if (!stage.contains(event.relatedTarget as Node)) release(true); }}>
 <a class="stack-card stack-korean" href="#korean" data-angle="-3" data-clear="-115" onpointerenter={(event) => { if (event.pointerType === 'mouse') void promote(event.currentTarget); }} onfocus={(event) => void promote(event.currentTarget)}>
  <div class="card-face">
   <span class="card-title">Learning Korean <span aria-hidden="true">↘</span></span>
   <span class="hangul" lang="ko">한<span>글</span></span>
   <img src={projects[0].image} alt="Interactive Hangul learning lab" width="1280" height="720" fetchpriority="high" />
   <span class="card-caption">Learning by trying.</span>
  </div>
 </a>
 <a class="stack-card stack-mlrose" href="#mlrose" data-angle="-5" data-clear="110" onpointerenter={(event) => { if (event.pointerType === 'mouse') void promote(event.currentTarget); }} onfocus={(event) => void promote(event.currentTarget)}>
  <div class="card-face">
   <span class="card-title">mlrose-ky <span aria-hidden="true">↘</span></span>
   <img src={projects[1].image} alt="Optimization graph" width="751" height="727" />
   <span class="card-caption">Exploring optimization.</span>
  </div>
 </a>
 <a class="stack-card stack-foods" href="#oc-foods" data-angle="5" data-clear="95" onpointerenter={(event) => { if (event.pointerType === 'mouse') void promote(event.currentTarget); }} onfocus={(event) => void promote(event.currentTarget)}>
  <div class="card-face">
   <span class="card-title">OC Foods <span aria-hidden="true">↘</span></span>
   <img src="/images/concepts/oc-foods.png" alt="Orange with a green leaf" width="180" height="180" />
   <span class="card-caption">Finding a good local meal.</span>
  </div>
 </a>
</nav>

<style>
 .project-stack { position:relative; height:500px; margin-top:12px; isolation:isolate; }
 .stack-card { position:absolute; display:block; color:inherit; text-decoration:none; outline-offset:7px; will-change:transform; border-radius:20px; }
 .card-face { height:100%; padding:20px; border-radius:20px; overflow:hidden; box-shadow:0 12px 30px #2032260c; transition:box-shadow 500ms cubic-bezier(.22,.75,.25,1),scale 220ms ease; }
 .stack-card:global([data-active]) .card-face { box-shadow:0 24px 45px #20322620; }
 .stack-card:active .card-face { scale:.98; }
 .card-title { display:flex; justify-content:space-between; gap:10px; font-size:14px; font-weight:650; }
 .card-title>span { font-weight:400; }
 .card-caption { display:block; font-size:11px; margin-top:12px; }
 .stack-korean { left:5%; top:15px; width:82%; height:315px; transform:rotate(-3deg); z-index:1; }
 .stack-korean .card-face { background:#dfe9d3; }
 .hangul { display:block; font-size:62px; line-height:1.25; color:#31533b; letter-spacing:-.07em; margin:5px 0 9px; }
 .hangul>span { color:#89a879; }
 .stack-korean img { width:100%; height:145px; object-fit:cover; object-position:top; border-radius:8px; }
 .stack-mlrose { left:2%; top:282px; width:47%; height:207px; transform:rotate(-5deg); z-index:2; }
 .stack-mlrose .card-face { background:#f5e1bb; }
 .stack-mlrose img { height:113px; width:100%; object-fit:contain; margin-top:10px; border-radius:5px; }
 .stack-foods { right:0; top:295px; width:45%; height:196px; transform:rotate(5deg); z-index:3; }
 .stack-foods .card-face { background:#f1dfcd; }
 .stack-foods img { width:96px; height:96px; object-fit:contain; margin:10px auto 0; border-radius:14px; mix-blend-mode:multiply; }
 @media(max-width:1000px) and (min-width:701px) { .card-face { padding:15px; } .card-title { font-size:12px; } .card-caption { font-size:10px; } }
 @media(max-width:700px) {
  .project-stack { display:grid; gap:14px; height:auto; margin:0; }
  .stack-card { position:relative; inset:auto; width:auto; height:auto; transform:none; will-change:auto; }
  .card-face { display:grid; grid-template-columns:72px 1fr; column-gap:18px; padding:18px; border-radius:15px; }
  .card-title { grid-column:2; grid-row:1; align-self:end; }
  .card-caption { grid-column:2; grid-row:2; margin-top:5px; }
  .stack-card img { grid-column:1; grid-row:1 / 3; width:72px; height:72px; object-fit:cover; margin:0; border-radius:8px; }
  .stack-korean img { object-position:left; }
  .hangul { display:none; }
 }
 @media(prefers-reduced-motion:reduce) { .card-face { transition:none; } .stack-card:active .card-face { scale:1; } }
</style>
