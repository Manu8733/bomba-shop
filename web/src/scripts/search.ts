// Instant search overlay + the modal helpers the header drawer shares (Liquid: the search modal in
// sections/header.liquid, this file = assets/search.js). Results come from /catalog.json via loadCatalog();
// at the Shopify port, swap getIndex() for the Predictive Search API: /search/suggest.json?q=…&resources[type]=product.
import { loadCatalog, money, type CatalogItem } from './cart';

/** /catalog.json carries a few more fields than CatalogItem declares. */
type Item = CatalogItem & { vendor?: string | null; effect?: string | null };
type Entry = { item: Item; title: string; titleWords: string[]; meta: string; metaWords: string[] };

const MAX = 6;
const LOCK = 'header-lock';

/** Lowercase, no diacritics (ș→s, ț→t, ă/â→a, î→i, also the cedilla forms ş ţ), no punctuation. */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Romanian plural: 1 rezultat, 2–19 rezultate, 20+ „de rezultate”. */
const plural = (n: number, one: string, many: string) => {
  if (n === 1) return `1 ${one}`;
  const r = n % 100;
  return `${n} ${n === 0 || (r >= 1 && r <= 19) ? '' : 'de '}${many}`;
};

// ---------- Modal helpers (search overlay, mobile drawer) ----------
// Native <dialog>.showModal() gives the focus trap (rest of the page is inert) and Esc; we add the closing
// animation, the scroll lock and an explicit focus return. Dialogs that lock scroll carry [data-lock].
const openers = new WeakMap<HTMLDialogElement, HTMLElement | null>();
const wired = new WeakSet<HTMLDialogElement>();

function uiDuration(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--dur-ui').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : n * 1000;
}

export function openModal(d: HTMLDialogElement, opener?: HTMLElement | null) {
  if (!wired.has(d)) {
    wired.add(d);
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(d); });
    d.addEventListener('click', (e) => { if (e.target === d) closeModal(d); }); // click on ::backdrop
    d.addEventListener('close', () => {
      d.classList.remove('is-closing');
      if (!document.querySelector('dialog[data-lock][open]')) document.documentElement.classList.remove(LOCK);
      const back = openers.get(d);
      if (back && back.isConnected) back.focus();
    });
  }
  if (d.open) return;
  const active = document.activeElement;
  openers.set(d, opener ?? (active instanceof HTMLElement ? active : null));
  d.classList.remove('is-closing');
  d.showModal();
  document.documentElement.classList.add(LOCK);
}

export function closeModal(d: HTMLDialogElement, restoreFocus = true) {
  if (!d.open || d.classList.contains('is-closing')) return;
  if (!restoreFocus) openers.set(d, null);
  const ms = uiDuration();
  if (!ms) { d.close(); return; }
  d.classList.add('is-closing');
  window.setTimeout(() => d.close(), ms);
}

// ---------- Index and ranking ----------
let index: Entry[] | null = null;

async function getIndex(): Promise<Entry[]> {
  if (index) return index;
  const map = await loadCatalog();
  index = Array.from(map.values(), (raw) => {
    const item = raw as Item;
    const title = fold(item.title);
    const meta = fold([item.vendor, item.effect, item.category].filter(Boolean).join(' '));
    return { item, title, titleWords: title.split(' '), meta, metaWords: meta.split(' ') };
  });
  return index;
}

/** Every word of the query must match the title, vendor, effect or category; title matches weigh more. */
function score(e: Entry, tokens: string[], phrase: string): number {
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    for (const w of e.titleWords) {
      if (w === t) { s = 30; break; }
      if (w.startsWith(t)) s = 20;
    }
    if (!s && e.title.includes(t)) s = 10;
    if (!s && e.metaWords.some((w) => w.startsWith(t))) s = 6;
    if (!s && e.meta.includes(t)) s = 3;
    if (!s) return 0;
    total += s;
  }
  if (e.title.startsWith(phrase)) total += 25;
  else if (tokens.length > 1 && e.title.includes(phrase)) total += 10;
  if (e.item.available) total += 12;
  return total;
}

/** Public mode (or no mode yet): public products first, then products reserved for authorised buyers. */
export async function searchCatalog(query: string, publicMode: boolean): Promise<Item[]> {
  const phrase = fold(query);
  if (!phrase) return [];
  const tokens = phrase.split(' ');
  const hits: { item: Item; s: number }[] = [];
  for (const e of await getIndex()) {
    const s = score(e, tokens, phrase);
    if (s) hits.push({ item: e.item, s });
  }
  hits.sort((a, b) =>
    (publicMode ? Number(a.item.pro) - Number(b.item.pro) : 0) || b.s - a.s || a.item.title.length - b.item.title.length);
  return hits.map((h) => h.item);
}

// ---------- Overlay UI ----------
type UI = {
  dialog: HTMLDialogElement; form: HTMLFormElement; input: HTMLInputElement; listbox: HTMLElement; status: HTMLElement;
  live: HTMLElement; clear: HTMLButtonElement; all: HTMLAnchorElement; allCount: HTMLElement; popular: HTMLElement;
};
let ui: UI | null = null;
let active = -1;
let seq = 0;
let inputTimer = 0;
let liveTimer = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Clone the server-rendered CatBadge (snippets/CatBadge) so results show the same diamond as the cards. */
function catBadge(dialog: HTMLElement, cat: string | null): HTMLElement | null {
  if (!cat) return null;
  const exact = dialog.querySelector<HTMLTemplateElement>(`template[data-cat-tpl="${cat}"]`);
  const tpl = exact ?? (cat === 'F1' ? null : dialog.querySelector<HTMLTemplateElement>('template[data-cat-tpl="P1"]'));
  const node = tpl?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  if (!node) return null;
  if (!exact) { const txt = node.querySelector('.txt'); if (txt?.firstChild) txt.firstChild.textContent = cat; }
  node.removeAttribute('role');
  node.removeAttribute('aria-label');
  node.setAttribute('aria-hidden', 'true'); // the text tag next to the title carries the category
  return node;
}

function option(dialog: HTMLElement, it: Item, i: number, publicMode: boolean): HTMLAnchorElement {
  const a = el('a', 'sr-item');
  a.href = it.url;
  a.id = `sr-opt-${i}`;
  a.tabIndex = -1;
  a.setAttribute('role', 'option');
  a.setAttribute('aria-selected', 'false');

  const thumb = el('span', 'sr-thumb');
  if (it.image) {
    const img = el('img', '');
    img.src = it.image; img.alt = ''; img.width = 64; img.height = 64; img.loading = 'lazy'; img.decoding = 'async';
    thumb.append(img);
  } else {
    thumb.append(el('span', 'sr-noimg', 'Fără foto'));
  }
  const badge = catBadge(dialog, it.category);
  if (badge) thumb.append(badge);

  const body = el('span', 'sr-body');
  body.append(el('span', 'sr-title', it.title));
  const meta = el('span', 'sr-meta');
  if (it.category) {
    const label = it.pro ? `${it.category} · ${publicMode ? 'Doar autorizați' : 'Pro'}` : `${it.category} · 16+`;
    meta.append(el('span', it.pro ? 'sr-cat pro' : 'sr-cat', label));
  }
  if (it.vendor) meta.append(el('span', '', it.vendor));
  if (it.effect) meta.append(el('span', '', it.effect));
  body.append(meta);

  const price = el('span', 'sr-price');
  price.append(el('span', 'sr-now', it.price == null ? 'Preț la cerere' : money(it.price)));
  if (!it.available) price.append(el('span', 'sr-out', 'Epuizat'));

  a.append(thumb, body, price);
  return a;
}

function options(): HTMLAnchorElement[] {
  return ui ? Array.from(ui.listbox.querySelectorAll<HTMLAnchorElement>('[role="option"]')) : [];
}

function setActive(i: number) {
  if (!ui) return;
  const opts = options();
  active = i < 0 || !opts.length ? -1 : Math.min(i, opts.length - 1);
  opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === active)));
  if (active >= 0) {
    ui.input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  } else {
    ui.input.removeAttribute('aria-activedescendant');
  }
}

/** Visible status updates at once; the screen-reader announcement waits until typing pauses. */
function say(text: string) {
  if (!ui) return;
  const { status, live } = ui;
  status.textContent = text;
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(() => { live.textContent = text; }, 600);
}

async function update() {
  if (!ui) return;
  const { dialog, input, listbox, all, allCount, popular } = ui;
  const q = input.value.trim();
  const my = ++seq;
  setActive(-1);

  const idle = () => {
    listbox.replaceChildren();
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    all.hidden = true;
    popular.hidden = false;
  };
  if (fold(q).length < 2) { idle(); say(q ? 'Scrie cel puțin 2 litere.' : ''); return; }

  let hits: Item[];
  const publicMode = document.documentElement.dataset.mode !== 'pro';
  if (!index) say('Caut…');
  try {
    hits = await searchCatalog(q, publicMode);
  } catch {
    if (my !== seq) return;
    idle();
    say('Căutarea instant nu răspunde acum. Apasă Enter ca să vezi toate rezultatele.');
    return;
  }
  if (my !== seq) return;

  const total = hits.length;
  const items = hits.slice(0, MAX);
  listbox.replaceChildren(...items.map((it, i) => option(dialog, it, i, publicMode)));
  listbox.hidden = !items.length;
  input.setAttribute('aria-expanded', String(items.length > 0));
  all.hidden = !total;
  all.href = `/search?q=${encodeURIComponent(q)}`;
  allCount.textContent = String(total);
  popular.hidden = total > 0;
  say(!total
    ? `Niciun produs pentru „${q}”. Încearcă o colecție de mai jos.`
    : total > MAX ? `Primele ${MAX} din ${plural(total, 'rezultat', 'rezultate')}` : plural(total, 'rezultat', 'rezultate'));
}

export function openSearch(query = '', opener?: HTMLElement | null) {
  if (!ui) return;
  const { dialog, input, clear } = ui;
  openModal(dialog, opener);
  if (query) input.value = query;
  clear.hidden = !input.value;
  input.focus();
  input.select();
  void update();
}

export function initSearch() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]');
  if (!dialog || ui) return;
  const q = <T extends Element>(sel: string) => dialog.querySelector<T>(sel)!;
  ui = {
    dialog,
    form: q<HTMLFormElement>('[data-search-form]'),
    input: q<HTMLInputElement>('[data-search-input]'),
    listbox: q<HTMLElement>('[data-search-listbox]'),
    status: q<HTMLElement>('[data-search-status]'),
    live: q<HTMLElement>('[data-search-live]'),
    clear: q<HTMLButtonElement>('[data-search-clear]'),
    all: q<HTMLAnchorElement>('[data-search-all]'),
    allCount: q<HTMLElement>('[data-search-all-count]'),
    popular: q<HTMLElement>('[data-search-popular]'),
  };
  const { form, input, clear } = ui;

  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(update, 90);
  });

  // Combobox keys: ↑/↓ move through results, Enter opens the highlighted product or the full results page.
  input.addEventListener('keydown', (e) => {
    const count = options().length;
    if (e.key === 'ArrowDown' && count) {
      e.preventDefault();
      setActive(active + 1 >= count ? 0 : active + 1);
    } else if (e.key === 'ArrowUp' && count) {
      e.preventDefault();
      setActive(active === -1 ? count - 1 : active - 1);
    } else if (e.key === 'Enter') {
      const opt = active >= 0 ? options()[active] : null;
      if (opt) { e.preventDefault(); window.location.href = opt.href; }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(dialog);
    }
  });

  form.addEventListener('submit', (e) => { if (!fold(input.value)) e.preventDefault(); });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    void update();
    input.focus();
  });
  q<HTMLButtonElement>('[data-search-close]').addEventListener('click', () => closeModal(dialog));

  // Openers anywhere on the page; other sections can also dispatch window 'search:open' with detail {q}.
  document.querySelectorAll<HTMLElement>('[data-search-open]').forEach((b) => {
    b.addEventListener('click', (e) => { e.preventDefault(); openSearch('', b); });
    const warm = () => { void getIndex().catch(() => undefined); };
    b.addEventListener('pointerenter', warm, { once: true });
    b.addEventListener('focus', warm, { once: true });
  });
  window.addEventListener('search:open', (e) => {
    const detail = (e as CustomEvent<{ q?: string } | undefined>).detail;
    openSearch(detail?.q ?? '');
  });
  window.addEventListener('mode:change', () => { if (dialog.open) void update(); });

  // Ctrl+K / ⌘K. A modifier is required: single-key shortcuts fail WCAG 2.1.4.
  const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
  if (apple) document.querySelectorAll<HTMLElement>('[data-search-kbd]').forEach((k) => { k.textContent = '⌘ K'; });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'k' || !(apple ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    openSearch();
  });
}
