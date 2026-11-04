// Scroll-linked motion for decorative layers (Liquid: assets/parallax.js).
//   [data-parallax="0.2"]   moves vertically at 20% of the scroll distance relative to the viewport centre
//   [data-scrub]            receives --t (0..1): how far its parent section has travelled through the viewport
// One passive scroll listener, one rAF per frame, only for elements on screen. Off for reduced motion.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initParallax(root: ParentNode = document) {
  if (reduce) return;
  const layers = [...root.querySelectorAll<HTMLElement>('[data-parallax]')];
  const scrubs = [...root.querySelectorAll<HTMLElement>('[data-scrub]')];
  const visible = new Set<HTMLElement>();
  const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? visible.add(e.target as HTMLElement) : visible.delete(e.target as HTMLElement))),
    { rootMargin: '20% 0px' });
  [...layers, ...scrubs].forEach((el) => io.observe(el.parentElement ?? el));
  let queued = false;
  const frame = () => {
    queued = false;
    const vh = innerHeight;
    for (const el of layers) {
      const host = el.parentElement ?? el;
      if (!visible.has(host)) continue;
      const r = host.getBoundingClientRect();
      const d = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.parallax);
      el.style.transform = `translate3d(0, ${d.toFixed(1)}px, 0)`;
    }
    for (const el of scrubs) {
      const host = el.parentElement ?? el;
      if (!visible.has(host)) continue;
      const r = host.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      el.style.setProperty('--t', t.toFixed(4));
    }
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  frame();
}
