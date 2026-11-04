// Product page behaviour (Liquid: assets/product.js). Gallery + zoom, quantity stepper, sticky buy bar, notify form.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initGallery(root: HTMLElement | null | undefined) {
  if (!root) return; // products whose only photos were excluded render no gallery
  const track = root.querySelector<HTMLElement>('[data-track]');
  const slides = [...root.querySelectorAll<HTMLElement>('[data-slide]')];
  if (!track || !slides.length) return;
  const thumbs = [...root.querySelectorAll<HTMLButtonElement>('[data-thumb]')];
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]'), next = root.querySelector<HTMLButtonElement>('[data-next]');
  const count = root.querySelector<HTMLElement>('[data-count]'), live = root.querySelector<HTMLElement>('[data-live]');
  let index = 0;

  const paint = (i: number, announce = false) => {
    index = i;
    thumbs.forEach((t, k) => t.setAttribute('aria-current', String(k === i)));
    prev?.setAttribute('aria-disabled', String(i === 0));
    next?.setAttribute('aria-disabled', String(i === slides.length - 1));
    if (count) count.textContent = `${i + 1} / ${slides.length}`;
    if (announce && live) live.textContent = `Imaginea ${i + 1} din ${slides.length}`;
  };
  const go = (i: number) => {
    const k = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[k].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    paint(k, true);
  };
  // keep state in sync with swipes
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && e.intersectionRatio > .6) paint(slides.indexOf(e.target as HTMLElement));
  }), { root: track, threshold: [.6] });
  slides.forEach((s) => io.observe(s));
  prev?.addEventListener('click', () => go(index - 1));
  next?.addEventListener('click', () => go(index + 1));
  thumbs.forEach((t, k) => t.addEventListener('click', () => go(k)));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
  });

  // zoom dialog
  const zoom = root.querySelector<HTMLDialogElement>('[data-zoom]');
  if (!zoom) return;
  const zimg = zoom.querySelector<HTMLImageElement>('[data-zoom-img]')!, view = zoom.querySelector<HTMLElement>('[data-zoom-view]')!;
  const zin = zoom.querySelector<HTMLButtonElement>('[data-zoom-in]'), zout = zoom.querySelector<HTMLButtonElement>('[data-zoom-out]');
  const zcount = zoom.querySelector<HTMLElement>('[data-zoom-count]'), zlive = zoom.querySelector<HTMLElement>('[data-zoom-live]');
  let scale = 1, opener: HTMLElement | null = null;
  const setScale = (s: number) => {
    scale = Math.max(1, Math.min(3, s));
    zimg.style.transform = `scale(${scale})`;
    zout?.setAttribute('aria-disabled', String(scale <= 1));
    zin?.setAttribute('aria-disabled', String(scale >= 3));
  };
  const show = (i: number) => {
    const s = slides[(i + slides.length) % slides.length];
    index = slides.indexOf(s);
    zimg.src = s.dataset.full!; zimg.width = +s.dataset.w!; zimg.height = +s.dataset.h!;
    setScale(1);
    if (zcount) zcount.textContent = `${index + 1} / ${slides.length}`;
    if (zlive) zlive.textContent = `Imaginea ${index + 1} din ${slides.length}`;
  };
  slides.forEach((s, k) => {
    const trigger = s.querySelector<HTMLElement>('button, [data-open-zoom]') ?? s;
    trigger.addEventListener('click', () => { opener = trigger; show(k); zoom.showModal(); });
  });
  zin?.addEventListener('click', () => setScale(scale + .5));
  zout?.addEventListener('click', () => setScale(scale - .5));
  zoom.querySelector('[data-zoom-prev]')?.addEventListener('click', () => show(index - 1));
  zoom.querySelector('[data-zoom-next]')?.addEventListener('click', () => show(index + 1));
  zoom.querySelector('[data-zoom-close]')?.addEventListener('click', () => zoom.close());
  zoom.addEventListener('close', () => { go(index); opener?.focus(); });
  zoom.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === '+' || e.key === '=') setScale(scale + .5);
    if (e.key === '-') setScale(scale - .5);
  });
  view.addEventListener('wheel', (e) => { e.preventDefault(); setScale(scale - Math.sign(e.deltaY) * .25); }, { passive: false });
  view.addEventListener('pointermove', (e) => {
    if (scale <= 1) return;
    const r = view.getBoundingClientRect();
    zimg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  view.addEventListener('dblclick', () => setScale(scale > 1 ? 1 : 2));
}

export function initStepper(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-stepper]').forEach((st) => {
    const input = st.querySelector<HTMLInputElement>('input')!;
    const max = Number(input.max) || 99;
    const set = (v: number) => { input.value = String(Math.max(1, Math.min(max, v || 1))); };
    st.querySelector('[data-dec]')?.addEventListener('click', () => set(+input.value - 1));
    st.querySelector('[data-inc]')?.addEventListener('click', () => set(+input.value + 1));
    input.addEventListener('change', () => set(+input.value));
  });
}

/** Shows the compact bar whenever the main buy button is off screen (mobile only via CSS): on a phone the price and the
 *  button are on the first screen from the start, and the bar steps aside while the real button is visible. */
export function initStickyBar(main: HTMLElement | null, bar: HTMLElement | null) {
  if (!main || !bar) return;
  new IntersectionObserver(([e]) => { bar.dataset.show = String(!e.isIntersecting); }).observe(main);
}

export function initNotify(form: HTMLFormElement | null) {
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector<HTMLInputElement>('input[type="email"]')!;
    const err = form.querySelector<HTMLElement>('[data-error]')!;
    if (!email.checkValidity()) { err.hidden = false; email.setAttribute('aria-invalid', 'true'); email.focus(); return; }
    // Shopify: replace with the back-in-stock app's endpoint.
    form.querySelector<HTMLElement>('[data-fields]')!.hidden = true;
    form.querySelector<HTMLElement>('[data-done]')!.hidden = false;
  });
}

/** Mode-aware purchase: P1/T1 can only be bought in pro mode. */
export function initModeGate(root: HTMLElement) {
  const paint = () => { root.dataset.modeNow = document.documentElement.dataset.mode ?? 'unset'; };
  paint();
  window.addEventListener('mode:change', paint);
}
