<script lang="ts">
 import { onMount } from 'svelte';
 import { projects, email } from './content';
 import { reveal } from './reveal';
 import './concept.css';
 let { variant }: { variant: 'gallery' | 'workbench' } = $props();
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

<svelte:head>
 <title>{variant === 'gallery' ? 'Gallery' : 'Workbench'} — Kyle Nakamura concept</title>
 <meta name="robots" content="noindex, nofollow" />
 <meta name="theme-color" content="#f7f8f5" />
</svelte:head>
<svelte:window onkeydown={keydown} />

<div class="concept {variant}">
 <a href="#main" class="concept-skip">Skip to content</a>
 <header class="concept-header">
  <a href="#main" class="identity" aria-label="Kyle Nakamura, back to top"><span class="monogram" aria-hidden="true">kn<span>↗</span></span><span>Kyle Nakamura</span></a>
  <nav bind:this={nav} aria-label="Main navigation" class:nav-hidden={hidden} class="floating-nav" onfocusin={() => hidden = false}>
   <div class="capsule">
    <a class="desktop-nav" href="#work" onclick={closePanels}>Work</a>
    <a class="desktop-nav" href="#about" onclick={closePanels}>About</a>
    <a class="desktop-nav" href="/resume">Résumé <span aria-hidden="true">↗</span></a>
    <button class="mobile-menu" bind:this={menuTrigger} aria-expanded={menuOpen} aria-controls="mobile-links" onclick={() => { menuOpen = !menuOpen; contactOpen = false; }}>Menu <span aria-hidden="true">{menuOpen ? '−' : '+'}</span></button>
    <button class="contact-trigger" bind:this={contactTrigger} aria-expanded={contactOpen} aria-controls="contact-panel" onclick={openContact}>Let's talk <span class:turned={contactOpen} aria-hidden="true">↗</span></button>
   </div>
   {#if menuOpen}
    <div class="nav-panel mobile-links" id="mobile-links">
     <a href="#work" onclick={closePanels}>Selected work <span>↗</span></a>
     <a href="#about" onclick={closePanels}>About Kyle <span>↗</span></a>
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

 <main id="main">
  <section class="concept-hero" aria-labelledby="intro-title">
   <div class="hero-copy">
    <p class="eyeline">Senior full-stack engineer / ML</p>
    <h1 id="intro-title">Thoughtful software.<br /><span>A curious mind.</span></h1>
    <p class="intro">I'm Kyle. I build full-stack web applications and bring machine learning research into real products.</p>
    <div class="hero-actions"><button class="solid-button" onclick={openContact}>Let's talk <span aria-hidden="true">↗</span></button><a class="text-link" href="/resume">View my r&eacute;sum&eacute; <span aria-hidden="true">↗</span></a></div>
   </div>
   <div class="hero-art" aria-label="A glimpse of selected work">
    <a href="#korean" class="hero-project korean-preview">
     <div class="preview-top"><span>Learning Korean</span><span aria-hidden="true">↗</span></div>
     <div class="korean-letter" aria-hidden="true">한<span>글</span></div>
     <p class="preview-note">A writing system.<br />A world to discover.</p>
     <img src={projects[0].image} alt={projects[0].alt} width="1280" height="720" fetchpriority="high" />
     <div class="preview-foot"><span>Interactive learning</span><span>Explore the project &rarr;</span></div>
    </a>
    <a href="#mlrose" class="hero-project ml-preview">
     <div class="preview-top"><span>mlrose-ky</span><span aria-hidden="true">↗</span></div>
     <img src={projects[1].image} alt={projects[1].alt} width="751" height="727" />
     <div class="preview-foot"><span>Optimization, explored.</span></div>
    </a>
    <p class="art-caption">A few things I've been building <span aria-hidden="true">↗</span></p>
   </div>
   <a class="scroll-cue" href="#work">Take a look around <span aria-hidden="true">↓</span></a>
  </section>

  <section id="work" class="selected-work" aria-labelledby="work-heading">
   <div class="section-heading" use:reveal><p class="eyeline">Selected work</p><h2 id="work-heading">From an idea<br />to something useful.</h2><p>Learning tools, open-source experiments,<br class="wide-break" /> and the engineering that connects them.</p></div>
   <div class="project-list">
    {#each projects as project, index}
     <article id={project.id} class="project-story {project.id}" use:reveal>
      <a href={project.href} class="project-visual" target="_blank" rel="noopener noreferrer" aria-label={project.action}>
       <div class="visual-label"><span>{project.name}</span><span class="round-arrow" aria-hidden="true">↗</span></div>
       {#if project.id === 'korean'}<span class="visual-title" aria-hidden="true">Make sense of<br /><em>한글.</em></span>{:else}<span class="visual-title" aria-hidden="true">Explore.<br /><em>Optimize.</em></span>{/if}
       <img src={project.image} alt={project.alt} width={index === 0 ? 1280 : 751} height={index === 0 ? 720 : 727} loading="lazy" />
      </a>
      <div class="project-copy"><p class="eyeline">{project.category}</p><h3>{project.title}</h3><p>{project.description}</p><p class="project-tech">{project.detail}</p><div class="project-actions"><a href={project.href} class="text-link" target="_blank" rel="noopener noreferrer">{project.action} <span aria-hidden="true">↗</span></a><a class="source-link" href={project.source} target="_blank" rel="noopener noreferrer">Source ↗</a></div></div>
     </article>
    {/each}
   </div>
   <a class="all-work text-link" href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">More on GitHub <span aria-hidden="true">↗</span></a>
  </section>

  <section id="about" class="about-section" use:reveal aria-labelledby="about-heading">
   <p class="eyeline">A little about me</p><h2 id="about-heading">Interested in how things work.<br /><span>And how they could work better.</span></h2>
   <div class="about-bottom"><p>My work connects full-stack engineering with machine learning. I completed my master's in Computer Science at Georgia Tech, specializing in ML, and contribute to open-source tools like mlrose-ky.</p><a class="text-link" href="/resume">The longer version <span aria-hidden="true">↗</span></a></div>
  </section>
  <section class="closing" use:reveal aria-labelledby="contact-heading"><p class="eyeline">Have something in mind?</p><h2 id="contact-heading">Let's build<br /><span>something good.</span></h2><a class="solid-button" href="mailto:{email}">Get in touch <span aria-hidden="true">↗</span></a></section>
 </main>
 <footer class="concept-footer"><a href="#main">Kyle Nakamura <span aria-hidden="true">↑</span></a><div><a href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a><span>© {new Date().getFullYear()}</span></div></footer>
 <aside class="concept-switcher" aria-label="Compare design concepts"><a href="/prototype/gallery">Revised Gallery</a><a href="/prototype/gallery-original" aria-current={variant === 'gallery' ? 'page' : undefined}>Original Gallery</a><a href="/prototype/workbench" aria-current={variant === 'workbench' ? 'page' : undefined}>Workbench</a></aside>
</div>
