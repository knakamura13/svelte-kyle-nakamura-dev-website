export function reveal(node: HTMLElement) {
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 if (reduced.matches || !('IntersectionObserver' in window) || node.getBoundingClientRect().top < window.innerHeight) return {};
 const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
   node.classList.remove('reveal-pending');
   observer.disconnect();
  }
 }, { threshold: 0.08 });
 observer.observe(node);
 node.classList.add('reveal-pending');
 const show = () => { if (reduced.matches) { node.classList.remove('reveal-pending'); observer.disconnect(); } };
 reduced.addEventListener('change', show);
 return { destroy() { observer.disconnect(); reduced.removeEventListener('change', show); } };
}
