// Client-side collection filters over the rendered cards' data-* attributes (see snippets/ProductCard.astro).
// Shopify port: the groups become storefront filters rendered from `collection.filters` in
// sections/main-collection-product-grid.liquid (filter.v.availability, filter.p.m.pyro.category, filter.v.price.gte/lte…),
// sort maps to ?sort_by=price-ascending | price-descending | title-ascending, and "load more" to {% paginate %}.
// This module has no top-level side effects, so pages can import `plural` / `norm` at build time too.

/** Lowercase, without diacritics: "Jerbă / vulcan" -> "jerba / vulcan". */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** URL-safe key: "Jerbă / vulcan" -> "jerba-vulcan". */
export const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Romanian count phrase: 1 produs · 2–19 produse · 20 de produse · 101 produse · 120 de produse. */
export function plural(n: number, one: string, many: string) {
  if (n === 1) return `1 ${one}`;
  const r = n % 100;
  return n === 0 || (r >= 1 && r <= 19) ? `${n} ${many}` : `${n} de ${many}`;
}
export const productsPhrase = (n: number) => plural(n, 'produs', 'produse');

const lei = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
export const leiInt = (v: number) => `${lei.format(v)} lei`;

/** Price slider scale: positions 0..1000, logarithmic when prices span more than 10×. Shared with Filters.astro. */
export function priceScale(lo: number, hi: number) {
  const log = lo > 0 && hi / lo >= 10;
  const toPrice = (t: number) => {
    const f = Math.max(0, Math.min(1000, t)) / 1000;
    return Math.round(log ? lo * Math.pow(hi / lo, f) : lo + (hi - lo) * f);
  };
  const toT = (v: number) => {
    if (hi <= lo) return 0;
    const f = log ? Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
    return Math.round(Math.max(0, Math.min(1, f)) * 1000);
  };
  return { log, toPrice, toT };
}

type Group = 'pro' | 'stock' | 'cat' | 'effect' | 'color' | 'price' | 'sale';
const GROUPS: Group[] = ['pro', 'stock', 'cat', 'effect', 'color', 'price', 'sale'];
const BIT = Object.fromEntries(GROUPS.map((g, i) => [g, 1 << i])) as Record<Group, number>;
type Sort = 'recomandat' | 'pret-asc' | 'pret-desc' | 'nume';
const SORTS: Sort[] = ['recomandat', 'pret-asc', 'pret-desc', 'nume'];
const URL_KEYS = ['stock', 'cat', 'effect', 'color', 'min', 'max', 'sale', 'pro', 'sort'];

type Card = {
  li: HTMLElement; i: number; available: boolean; cat: string; pro: boolean;
  effect: string; color: string; price: number | null; sale: boolean; title: string;
};
type State = {
  stock: boolean; sale: boolean; cat: Set<string>; effect: Set<string>; color: Set<string>;
  min: number; max: number; sort: Sort; showPro: boolean | null;
};

export function initFilters(root: HTMLElement) {
  if (root.dataset.ready) return;
  root.dataset.ready = 'true';
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));

  const grid = $('[data-grid]');
  const form = $<HTMLFormElement>('[data-filter-form]');
  if (!grid || !form) return;

  const cards: Card[] = Array.from(grid.children as HTMLCollectionOf<HTMLElement>).flatMap((li, i) => {
    const d = li.querySelector<HTMLElement>('[data-product-card]')?.dataset;
    if (!d) return [];
    return [{
      li, i,
      available: d.available === 'true',
      cat: d.category || 'nespecificat',
      pro: d.audience === 'pro',
      effect: d.effect ? slug(d.effect) : '',
      color: d.color ?? '',
      price: d.price ? Number(d.price) : null,
      sale: d.discount === 'true',
      title: d.title ?? '',
    }];
  });

  const pageSize = Number(root.dataset.pageSize) || 24;
  const proDefaultShow = root.dataset.proDefault === 'show';
  const isProMode = () => document.documentElement.dataset.mode === 'pro';

  // ---- price ----
  const priceBox = $('[data-price]');
  const lo = Number(priceBox?.dataset.lo ?? 0);
  const hi = Number(priceBox?.dataset.hi ?? 0);
  const scale = priceScale(lo, hi);
  const minIn = $<HTMLInputElement>('[data-price-min]');
  const maxIn = $<HTMLInputElement>('[data-price-max]');
  const priceOut = $('[data-price-out]');
  const bars = $$('[data-bar]');

  const state: State = {
    stock: false, sale: false, cat: new Set(), effect: new Set(), color: new Set(),
    min: lo, max: hi, sort: 'recomandat', showPro: null,
  };
  const priceOn = () => !!priceBox && (state.min > lo || state.max < hi);
  const hidePro = () => !isProMode() && !(state.showPro ?? proDefaultShow);

  // ---- form <-> state ----
  const inputs = (name: string) => $$<HTMLInputElement>(`input[name="${name}"]`);
  const values = (name: string) => new Set(inputs(name).map((i) => i.value));

  function readForm() {
    const on = (name: string) => new Set(inputs(name).filter((i) => i.checked).map((i) => i.value));
    state.stock = inputs('stock').some((i) => i.checked);
    state.sale = inputs('sale').some((i) => i.checked);
    const before = state.cat;
    state.cat = on('cat');
    state.effect = on('effect');
    state.color = on('color');
    // choosing P1/T1 explicitly means "show me those", even in public mode
    const addedPro = [...state.cat].some((c) => !before.has(c) && c !== 'F1' && c !== 'nespecificat');
    if (addedPro && hidePro()) state.showPro = true;
  }

  function writeForm() {
    const set = (name: string, on: (v: string) => boolean) => inputs(name).forEach((i) => (i.checked = on(i.value)));
    set('stock', () => state.stock);
    set('sale', () => state.sale);
    set('cat', (v) => state.cat.has(v));
    set('effect', (v) => state.effect.has(v));
    set('color', (v) => state.color.has(v));
    if (minIn && maxIn) { minIn.value = String(scale.toT(state.min)); maxIn.value = String(scale.toT(state.max)); }
    if (sortSel) sortSel.value = state.sort;
  }

  function readUrl() {
    const q = new URLSearchParams(location.search);
    const list = (k: string) => (q.get(k) ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const pick = (name: string, raw: string[], map: (v: string) => string) => {
      const ok = values(name);
      return new Set(raw.map(map).filter((v) => ok.has(v)));
    };
    state.cat = pick('cat', list('cat'), (v) => (/^[a-z]\d$/i.test(v) ? v.toUpperCase() : slug(v)));
    state.effect = pick('effect', list('effect'), slug); // the homepage effects lab links with ?effect=<label>
    state.color = pick('color', list('color'), slug);
    state.stock = q.get('stock') === '1' && inputs('stock').length > 0;
    state.sale = q.get('sale') === '1' && inputs('sale').length > 0;
    const num = (k: string, d: number) => { const n = parseInt(q.get(k) ?? '', 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    if (priceBox) { state.min = num('min', lo); state.max = num('max', hi); if (state.min > state.max) [state.min, state.max] = [state.max, state.min]; }
    const s = q.get('sort') as Sort | null;
    state.sort = s && SORTS.includes(s) ? s : 'recomandat';
    const p = q.get('pro');
    state.showPro = p === '1' ? true : p === '0' ? false : null;
  }

  function writeUrl() {
    const keep = Array.from(new URLSearchParams(location.search)).filter(([k]) => !URL_KEYS.includes(k));
    const out: [string, string][] = [];
    if (state.stock) out.push(['stock', '1']);
    if (state.cat.size) out.push(['cat', [...state.cat].join(',')]);
    if (state.effect.size) out.push(['effect', [...state.effect].join(',')]);
    if (state.color.size) out.push(['color', [...state.color].join(',')]);
    if (priceOn()) { if (state.min > lo) out.push(['min', String(state.min)]); if (state.max < hi) out.push(['max', String(state.max)]); }
    if (state.sale) out.push(['sale', '1']);
    if (state.showPro !== null && !isProMode() && cards.some((c) => c.pro)) out.push(['pro', state.showPro ? '1' : '0']);
    if (state.sort !== 'recomandat') out.push(['sort', state.sort]);
    const qs = [...keep, ...out].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/gi, ',')}`).join('&');
    history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }

  // ---- sorting ----
  const collator = new Intl.Collator('ro', { sensitivity: 'base', numeric: true });
  const compare: Record<Sort, (a: Card, b: Card) => number> = {
    recomandat: (a, b) => a.i - b.i,
    'pret-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.i - b.i,
    'pret-desc': (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity) || a.i - b.i,
    nume: (a, b) => collator.compare(a.title, b.title) || a.i - b.i,
  };
  let ordered = cards.slice();
  let appliedSort: Sort = 'recomandat';

  // ---- UI hooks ----
  const sortSel = $<HTMLSelectElement>('[data-sort]');
  const countEl = $('[data-count]');
  const liveEl = $('[data-live]');
  const applyCount = $('[data-apply-count]');
  const empty = $('[data-empty]');
  const emptyPro = $<HTMLButtonElement>('[data-empty-pro]');
  const moreWrap = $('[data-more-wrap]');
  const moreBtn = $<HTMLButtonElement>('[data-more]');
  const moreStatus = $('[data-more-status]');
  const fuse = moreWrap?.querySelector<HTMLElement>('.fuse') ?? null;
  const proWrap = $('[data-pro-wrap]');
  const proToggle = $<HTMLInputElement>('[data-pro-toggle]');
  const activeBox = $('[data-active]');
  const chipTpl = $<HTMLTemplateElement>('[data-chip-tpl]');
  const badge = $('[data-filter-badge]');
  let limit = pageSize;
  let liveTimer = 0;

  const labelOf = (input: HTMLInputElement) =>
    input.closest('label')?.querySelector('[data-label]')?.textContent?.trim() ?? input.value;

  function activeChips(): { key: string; label: string }[] {
    const chips: { key: string; label: string }[] = [];
    for (const name of ['stock', 'cat', 'effect', 'color', 'sale']) {
      inputs(name).filter((i) => i.checked).forEach((i) => chips.push({ key: `${name}:${i.value}`, label: labelOf(i) }));
    }
    if (priceOn()) chips.push({ key: 'price:', label: `${leiInt(state.min)} – ${leiInt(state.max)}` });
    return chips;
  }

  function renderChips(chips: { key: string; label: string }[]) {
    if (!activeBox || !chipTpl) return;
    activeBox.replaceChildren();
    activeBox.hidden = chips.length === 0;
    for (const c of chips) {
      const btn = chipTpl.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
      btn.dataset.remove = c.key;
      btn.setAttribute('aria-label', `Elimină filtrul ${c.label}`);
      btn.querySelector('[data-t]')!.textContent = c.label;
      activeBox.append(btn);
    }
    if (chips.length > 1) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'achip-clear';
      all.dataset.reset = '';
      all.textContent = 'Șterge tot';
      activeBox.append(all);
    }
  }

  function apply({ announce = true } = {}) {
    const gatePro = hidePro();
    const on = priceOn();
    const fails = (c: Card) =>
      (gatePro && c.pro ? BIT.pro : 0) |
      (state.stock && !c.available ? BIT.stock : 0) |
      (state.cat.size && !state.cat.has(c.cat) ? BIT.cat : 0) |
      (state.effect.size && !state.effect.has(c.effect) ? BIT.effect : 0) |
      (state.color.size && !state.color.has(c.color) ? BIT.color : 0) |
      (on && (c.price == null || c.price < state.min || c.price > state.max) ? BIT.price : 0) |
      (state.sale && !c.sale ? BIT.sale : 0);

    if (state.sort !== appliedSort) {
      ordered = cards.slice().sort(compare[state.sort]);
      grid!.append(...ordered.map((c) => c.li));
      appliedSort = state.sort;
    }

    // faceted counts: an option counts the cards that pass every *other* group
    const counts = new Map<string, number>();
    const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
    const results: Card[] = [];
    for (const c of ordered) {
      const f = fails(c);
      if (!f) results.push(c);
      const only = (g: Group) => (f & ~BIT[g]) === 0;
      if (only('stock') && c.available) bump('stock:1');
      if (only('sale') && c.sale) bump('sale:1');
      if ((f & ~(BIT.cat | BIT.pro)) === 0) bump(`cat:${c.cat}`); // P1/T1 chips show their real size even while hidden
      if (only('effect') && c.effect) bump(`effect:${c.effect}`);
      if (only('color') && c.color) bump(`color:${c.color}`);
      if (only('pro') && c.pro) bump('pro:1');
    }

    const visible = new Set(results.slice(0, limit));
    for (const c of cards) c.li.hidden = !visible.has(c);
    root.dataset.pro = gatePro ? 'hide' : 'show';

    for (const input of $$<HTMLInputElement>('[data-filter-form] input[type="checkbox"]')) {
      const n = counts.get(`${input.name}:${input.value}`) ?? 0;
      const label = input.closest('label');
      const out = label?.querySelector('[data-opt-count]');
      if (out) out.textContent = String(n);
      label?.classList.toggle('zero', n === 0 && !input.checked);
    }

    const n = results.length;
    const proMatching = counts.get('pro:1') ?? 0; // P1/T1 cards that match the other filters
    if (countEl) countEl.textContent = productsPhrase(n);
    if (applyCount) applyCount.textContent = n === 0 ? 'Niciun produs găsit' : `Arată ${productsPhrase(n)}`;
    if (empty) empty.hidden = n > 0;
    if (emptyPro) {
      emptyPro.hidden = !(gatePro && proMatching > 0);
      const s = emptyPro.querySelector('[data-n]');
      if (s) s.textContent = String(proMatching);
    }
    if (proWrap) proWrap.hidden = isProMode();
    if (proToggle) {
      proToggle.checked = !gatePro;
      const s = proWrap?.querySelector('[data-pro-count]');
      if (s) s.textContent = String(proMatching);
    }
    if (moreWrap) {
      const shown = Math.min(limit, n);
      moreWrap.hidden = n <= limit;
      if (moreStatus) moreStatus.textContent = `Ai văzut ${shown} din ${productsPhrase(n)}`;
      if (moreBtn) moreBtn.textContent = `Arată încă ${Math.min(pageSize, n - shown)}`;
      if (fuse) {
        const p = n ? shown / n : 0;
        fuse.style.setProperty('--p', String(p));
        fuse.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      }
    }

    // price slider visuals
    if (minIn && maxIn) {
      const a = scale.toT(state.min), b = scale.toT(state.max);
      priceBox!.style.setProperty('--a', `${a / 10}%`);
      priceBox!.style.setProperty('--b', `${b / 10}%`);
      minIn.setAttribute('aria-valuetext', leiInt(state.min));
      maxIn.setAttribute('aria-valuetext', leiInt(state.max));
      minIn.style.zIndex = a > 500 ? '3' : '';
      if (priceOut) priceOut.textContent = `${leiInt(state.min)} – ${leiInt(state.max)}`;
      bars.forEach((bar) => bar.classList.toggle('on', Number(bar.dataset.to) > a && Number(bar.dataset.from) < b));
    }

    const chips = activeChips();
    renderChips(chips);
    if (badge) {
      badge.hidden = chips.length === 0;
      const s = badge.querySelector('[data-n]');
      if (s) s.textContent = String(chips.length);
    }
    $$<HTMLButtonElement>('[data-reset-soft]').forEach((b) => (b.disabled = chips.length === 0));
    $$('[data-reset-head]').forEach((b) => (b.hidden = chips.length === 0));

    if (announce && liveEl) {
      clearTimeout(liveTimer);
      liveTimer = window.setTimeout(() => {
        liveEl.textContent = `${productsPhrase(n)} ${n === 1 ? 'găsit' : 'găsite'}`;
      }, 450);
    }
  }

  function update({ resetLimit = true } = {}) {
    if (resetLimit) limit = pageSize;
    apply();
    writeUrl();
  }

  function reset() {
    state.stock = state.sale = false;
    state.cat = new Set(); state.effect = new Set(); state.color = new Set();
    state.min = lo; state.max = hi;
    writeForm();
    update();
  }

  // keep the toolbar in view on desktop when the result list shrinks under the reader
  const toolbar = $('[data-toolbar]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function keepInView() {
    if (sheetOpen || !toolbar) return;
    if (toolbar.getBoundingClientRect().top < 0) toolbar.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  // ---- events ----
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t === minIn || t === maxIn) {
      let a = Number(minIn!.value), b = Number(maxIn!.value);
      if (a > b) { if (t === minIn) a = b; else b = a; minIn!.value = String(a); maxIn!.value = String(b); }
      state.min = scale.toPrice(a);
      state.max = scale.toPrice(b);
    } else readForm();
    writeForm();
    update();
  });
  form.addEventListener('change', keepInView);

  sortSel?.addEventListener('change', () => {
    state.sort = SORTS.includes(sortSel.value as Sort) ? (sortSel.value as Sort) : 'recomandat';
    update();
    keepInView();
  });

  proToggle?.addEventListener('change', () => { state.showPro = proToggle.checked; update(); });
  emptyPro?.addEventListener('click', () => { state.showPro = true; update(); proToggle?.focus(); });

  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-reset], [data-reset-soft], [data-reset-head], [data-reset-empty]')) {
      reset();
      // the pressed button may now be hidden or disabled; keep focus inside the sheet while it is modal
      (sheetOpen ? sheet?.querySelector<HTMLElement>('[data-sheet-close]') : countEl)?.focus();
      return;
    }
    const rm = el.closest<HTMLElement>('[data-remove]');
    if (rm) {
      const [name, value] = rm.dataset.remove!.split(':');
      const siblings = Array.from(activeBox?.querySelectorAll<HTMLElement>('[data-remove]') ?? []);
      const idx = siblings.indexOf(rm);
      if (name === 'price') { state.min = lo; state.max = hi; }
      else if (name === 'stock') state.stock = false;
      else if (name === 'sale') state.sale = false;
      else (state[name as 'cat' | 'effect' | 'color'] as Set<string>).delete(value);
      writeForm();
      update();
      const next = activeBox?.querySelectorAll<HTMLElement>('[data-remove]');
      (next?.[Math.min(idx, next.length - 1)] ?? countEl)?.focus();
    }
  });

  moreBtn?.addEventListener('click', () => {
    const first = limit;
    limit += pageSize;
    apply({ announce: false });
    const results = ordered.filter((c) => !c.li.hidden);
    results[first]?.li.querySelector<HTMLElement>('h2 a, h3 a')?.focus();
    if (liveEl) liveEl.textContent = `Încă ${results.length - first} afișate`;
  });

  window.addEventListener('mode:change', () => apply());

  // ---- mobile bottom sheet ----
  const sheet = $('[data-sheet]');
  const backdrop = $('[data-sheet-backdrop]');
  const openBtn = $<HTMLButtonElement>('[data-sheet-open]');
  const desktop = matchMedia('(min-width: 1024px)');
  let sheetOpen = false;
  let lastFocus: HTMLElement | null = null;
  const focusables = () =>
    Array.from(sheet!.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, a[href], [tabindex="0"]'))
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

  function openSheet() {
    if (!sheet || desktop.matches) return;
    lastFocus = document.activeElement as HTMLElement;
    sheetOpen = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.classList.add('is-open');
    if (backdrop) backdrop.hidden = false;
    openBtn?.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => sheet.querySelector<HTMLElement>('[data-sheet-close]')?.focus());
  }
  function closeSheet({ restore = true } = {}) {
    if (!sheet || !sheetOpen) return;
    sheetOpen = false;
    sheet.classList.remove('is-open');
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
    if (backdrop) backdrop.hidden = true;
    openBtn?.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    if (restore) (lastFocus ?? openBtn)?.focus();
  }
  openBtn?.addEventListener('click', openSheet);
  backdrop?.addEventListener('click', () => closeSheet());
  $$('[data-sheet-close], [data-sheet-apply]').forEach((b) => b.addEventListener('click', () => closeSheet()));
  sheet?.addEventListener('keydown', (e) => {
    if (!sheetOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  desktop.addEventListener('change', () => { if (desktop.matches) closeSheet({ restore: false }); });

  // ---- boot ----
  readUrl();
  writeForm();
  apply({ announce: false });
  writeUrl();
  root.removeAttribute('data-pending');
}
