<script lang="ts">
 import { onMount } from 'svelte';
 import type { Snippet } from 'svelte';
 import { email } from './content';
 import './concept.css';
 import './portfolio.css';
 let { children, home = false }: { children: Snippet; home?: boolean } = $props();
 const galleryPath = '/prototype/gallery';
 let hidden = $state(false);
 let contactOpen = $state(false);
 let menuOpen = $state(false);
 let copyStatus = $state('');
 let nav: HTMLElement;
 let contactTrigger: HTMLButtonElement;
 let menuTrigger: HTMLButtonElement;
 let opener: HTMLElement | null = null;
 let copyTimer: ReturnType<typeof setTimeout> | undefined;
 function openContact(event: MouseEvent) {
  opener = event.currentTarget as HTMLElement;
  contactOpen = !contactOpen;
  menuOpen = false;
  hidden = false;
  copyStatus = '';
 }
 function closePanels() { contactOpen = false; menuOpen = false; }
 function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && (contactOpen || menuOpen)) {
   const target = contactOpen ? (opener ?? contactTrigger) : menuTrigger;
   closePanels(); target?.focus();
  }
  if (event.key === 'Tab') hidden = false;
 }
 async function copyEmail() {
  try { await navigator.clipboard.writeText(email); copyStatus = 'Email copied'; }
  catch { copyStatus = 'Could not copy. Select the email address above.'; }
  clearTimeout(copyTimer); copyTimer = setTimeout(() => copyStatus = '', 4000);
 }
 onMount(() => {
  let last = window.scrollY;
  let travel = 0;
  let direction = 0;
  const onScroll = () => {
   const current = Math.max(0, window.scrollY);
   const delta = current - last;
   last = current;
   if (current < 80 || contactOpen || menuOpen || nav?.matches(':hover, :focus-within')) { hidden = false; travel = 0; return; }
   if (Math.sign(delta) !== direction) { travel = 0; direction = Math.sign(delta); }
   travel += delta;
   if (Math.abs(travel) >= 12) { hidden = travel > 0; travel = 0; }
  };
  const outside = (event: PointerEvent) => {
   if (!nav?.contains(event.target as Node) && !opener?.contains(event.target as Node)) closePanels();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('pointerdown', outside);
  return () => { window.removeEventListener('scroll', onScroll); document.removeEventListener('pointerdown', outside); clearTimeout(copyTimer); };
 });
</script>
<svelte:window onkeydown={keydown} />
<div class="concept gallery personal">
 <a href="#main" class="concept-skip">Skip to content</a>
 <header class="concept-header">
  <a href={galleryPath} class="identity" aria-label="Kyle Nakamura, homepage"><span class="monogram" aria-hidden="true">kn<span>↗</span></span><span>Kyle Nakamura</span></a>
  <nav bind:this={nav} aria-label="Main navigation" class:nav-hidden={hidden} class="floating-nav" onfocusin={() => hidden = false}>
   <div class="capsule">
    <a class="desktop-nav" href={`${galleryPath}#work`} onclick={closePanels}>Work</a>
    <a class="desktop-nav" href={`${galleryPath}#about`} onclick={closePanels}>About</a>
    <a class="desktop-nav" href="/resume">Résumé <span aria-hidden="true">↗</span></a>
    <button class="mobile-menu" bind:this={menuTrigger} aria-expanded={menuOpen} aria-controls="mobile-links" onclick={() => { menuOpen = !menuOpen; contactOpen = false; }}>Menu <span aria-hidden="true">{menuOpen ? '−' : '+'}</span></button>
    <button class="contact-trigger" bind:this={contactTrigger} aria-expanded={contactOpen} aria-controls="contact-panel" onclick={openContact}>Contact <span class:turned={contactOpen} aria-hidden="true">↗</span></button>
   </div>
   {#if menuOpen}
    <div class="nav-panel mobile-links" id="mobile-links">
     <a href={`${galleryPath}#work`} onclick={closePanels}>Selected work <span>↗</span></a>
     <a href={`${galleryPath}#about`} onclick={closePanels}>About Kyle <span>↗</span></a>
     <a href="/resume">Résumé <span>↗</span></a>
    </div>
   {/if}
   {#if contactOpen}
    <div class="nav-panel contact-panel" id="contact-panel">
     <div class="panel-heading"><p>Start a conversation.</p><button class="close-contact" aria-label="Close contact panel" onclick={() => { closePanels(); (opener ?? contactTrigger)?.focus(); }}>×</button></div>
     <a class="email-link" href="mailto:{email}">{email} <span aria-hidden="true">↗</span></a>
     <div class="contact-options"><button onclick={copyEmail}>Copy email <span aria-hidden="true">⧉</span></button><a href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div>
     <p class="copy-status" aria-live="polite">{copyStatus}</p>
    </div>
   {/if}
  </nav>
 </header>

 <main id="main">{@render children()}</main>
 <footer class="concept-footer portfolio-footer">
  <a href={galleryPath}>Kyle Nakamura <span aria-hidden="true">↗</span></a>
  <div><a href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a><span>© {new Date().getFullYear()}</span></div>
 </footer>
 <aside class="concept-switcher" aria-label="Compare portfolio versions"><a href={galleryPath} aria-current={home ? 'page' : undefined}>Gallery</a><a href="/prototype/gallery-original">Original Gallery</a><a href="/prototype/workbench">Workbench</a></aside>
</div>
