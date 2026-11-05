// Client cart. Shape follows Shopify's /cart.js (items with handle, quantity, price in RON) so the port can swap
// this module for real fetch('/cart/add.js') calls without touching the UI. Persists in localStorage.
// Events: 'cart:change' on window with detail = Cart; 'cart:open' to ask the drawer to open.

export type CatalogItem = { handle: string; title: string; price: number | null; compare: number | null; available: boolean;
  category: string | null; pro: boolean; url: string; image: string | null; stock: number | null };
export type Line = { handle: string; quantity: number };
export type Cart = { items: (Line & { product: CatalogItem; line_price: number })[]; item_count: number; total_price: number };

const KEY = 'bomba-cart-v1';
let catalog: Map<string, CatalogItem> | null = null;
let loading: Promise<Map<string, CatalogItem>> | null = null;
let memoryLines: Line[] | null = null;

export function loadCatalog(): Promise<Map<string, CatalogItem>> {
  if (catalog) return Promise.resolve(catalog);
  loading ??= fetch('/catalog.json').then((r) => r.json()).then((list: CatalogItem[]) => (catalog = new Map(list.map((p) => [p.handle, p]))));
  return loading;
}

function readLines(): Line[] {
  if (memoryLines !== null) return memoryLines;
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeLines(lines: Line[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
    memoryLines = null;
  } catch {
    const wasPersistent = memoryLines === null;
    memoryLines = lines;
    if (wasPersistent) window.dispatchEvent(new CustomEvent('toast', {
      detail: { message: 'Coșul rămâne disponibil doar pe această pagină.', tone: 'warn' },
    }));
  }
}

export async function getCart(): Promise<Cart> {
  if (readLines().length === 0) return { items: [], item_count: 0, total_price: 0 };
  const cat = await loadCatalog();
  const items = readLines().filter((l) => cat.has(l.handle)).map((l) => {
    const product = cat.get(l.handle)!;
    return { ...l, product, line_price: (product.price ?? 0) * l.quantity };
  });
  return { items, item_count: items.reduce((s, i) => s + i.quantity, 0), total_price: items.reduce((s, i) => s + i.line_price, 0) };
}

async function emit() {
  const cart = await getCart();
  window.dispatchEvent(new CustomEvent('cart:change', { detail: cart }));
  return cart;
}

export async function addToCart(handle: string, quantity = 1) {
  const cat = await loadCatalog();
  const p = cat.get(handle);
  if (!p || !p.available || p.price == null) throw new Error('Produsul nu poate fi adăugat în coș.');
  if (p.pro && document.documentElement.dataset.mode !== 'pro') throw new Error('Produs doar pentru persoane autorizate.');
  const lines = readLines();
  const line = lines.find((l) => l.handle === handle);
  const max = p.stock ?? 99;
  if (line) line.quantity = Math.min(max, line.quantity + quantity); else lines.push({ handle, quantity: Math.min(max, quantity) });
  writeLines(lines);
  return emit();
}

export async function setQuantity(handle: string, quantity: number) {
  let lines = readLines();
  if (quantity <= 0) lines = lines.filter((l) => l.handle !== handle);
  else { const l = lines.find((x) => x.handle === handle); if (l) l.quantity = quantity; }
  writeLines(lines);
  return emit();
}

export const removeLine = (handle: string) => setQuantity(handle, 0);
export function clearCart() {
  writeLines([]);
  return emit();
}
export const openCart = () => window.dispatchEvent(new CustomEvent('cart:open'));
export const refreshCart = emit;

const lei = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: number | null | undefined) => (v == null ? '—' : `${lei.format(v)} lei`);

/** A spark with a short tail flies in an arc from the button to the header cart icon; resolves when it lands. */
function flyToCart(from: HTMLElement): Promise<void> {
  const target = document.querySelector<HTMLElement>('[data-cart-toggle]');
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
  const lift = Math.min(220, Math.abs(x1 - x0) * .35 + 80);
  const path = (k: number) => {
    const q = 1 - k, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - lift;
    return [q * q * x0 + 2 * q * k * mx + k * k * x1, q * q * y0 + 2 * q * k * my + k * k * y1];
  };
  const frames = Array.from({ length: 13 }, (_, i) => {
    const [x, y] = path(i / 12);
    return { transform: `translate(${x}px, ${y}px) scale(${1 - i / 30})`, offset: i / 12 };
  });
  const dur = 640;
  const dots = [0, 1, 2, 3, 4].map((i) => {
    const d = document.createElement('span');
    d.setAttribute('aria-hidden', 'true');
    const size = 12 - i * 2;
    d.style.cssText = `position:fixed;left:0;top:0;z-index:120;pointer-events:none;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;`
      + `background:${i ? '#ffb648' : '#fff3c4'};box-shadow:0 0 ${14 - i * 2}px ${4 - i * .6}px rgba(255,182,72,${.8 - i * .14});opacity:${1 - i * .16}`;
    document.body.appendChild(d);
    return d.animate(frames, { duration: dur, delay: i * 34, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
  });
  return dots[0].finished.then(() => {
    dots.forEach((an) => an.finished.then(() => (an.effect as KeyframeEffect).target?.remove()));
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }).catch(() => undefined);
}

// One delegated handler for every [data-add-to-cart] button on any page.
export function initCartButtons() {
  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-add-to-cart]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    const qtyInput = btn.dataset.qtyInput ? document.querySelector<HTMLInputElement>(btn.dataset.qtyInput) : null;
    const qty = Math.max(1, parseInt(qtyInput?.value || '1', 10) || 1);
    btn.setAttribute('aria-busy', 'true');
    try {
      await addToCart(btn.dataset.handle!, qty);
      btn.classList.add('added');
      await flyToCart(btn);
      window.dispatchEvent(new CustomEvent('cart:added', { detail: { handle: btn.dataset.handle, button: btn } }));
      openCart();
      setTimeout(() => btn.classList.remove('added'), 1200);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: (err as Error).message, tone: 'warn' } }));
    } finally {
      btn.removeAttribute('aria-busy');
    }
  });
}
