// Phone tour: every page and every panel (menu, search, cart, filters, profile gate) as a real phone shows it, portrait and
// landscape, screen by screen down the page (viewport shots, so the sticky header sits where a person sees it).
// Usage: node dev/phone-tour.mjs <outDir> [portrait|landscape|both] [maxScreens=6]
// Writes <outDir>/<orient>/<NN>-<name>-<k>.jpg and <outDir>/index.json (name, url, files, overflow, console errors).
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const [out = 'phone-tour', which = 'both', maxArg = '6'] = process.argv.slice(2);
const MAX = Number(maxArg), BASE = process.env.BASE || 'http://127.0.0.1:4410';
const ORIENTS = { portrait: [390, 844], landscape: [844, 390] };
const cart = JSON.stringify([{ handle: 'vulcan-etna', quantity: 2 }, { handle: 'candele-romane-30-foc', quantity: 1 }]);
const account = JSON.stringify({ firstName: 'Ana', lastName: 'Test', email: 'ana.test@example.com', newsletter: true, since: '2026-11-01T10:00:00.000Z' });
const addresses = JSON.stringify({ 'ana.test@example.com': [{ id: 'a1', firstName: 'Ana', lastName: 'Test', company: '', address1: 'Strada Exemplu 1', address2: 'Bl. A2, ap. 14',
  city: 'Cluj-Napoca', county: 'Cluj', zip: '400001', phone: '0700000000', isDefault: true }] });
const orders = JSON.stringify([{ number: 1001, date: '2026-11-02T10:00:00.000Z', email: 'ana.test@example.com', total: 70, payment: 'Card online',
  lines: [{ handle: 'vulcan-etna', title: 'Vulcan Etna', quantity: 2, price: 5 }, { handle: 'candele-romane-30-foc', title: 'Candele Romane 30 foc', quantity: 1, price: 60 }],
  address: { firstName: 'Ana', lastName: 'Test', company: '', address1: 'Strada Exemplu 1', address2: 'Bl. A2, ap. 14', city: 'Cluj-Napoca', county: 'Cluj', zip: '400001', phone: '0700000000' } }]);

// name, path, state: 'gate' = first visit (no profile chosen), 'user' = signed in with an order, plus an optional action
const STOPS = [
  ['gate', '/', { gate: true, screens: 1 }],
  ['home', '/', {}],
  ['menu', '/', { screens: 1, act: (p) => p.click('[data-menu-open]') }],
  ['search', '/', { screens: 1, act: async (p) => { await p.click('[data-search-open]'); await p.type('[data-search-input]', 'vulcan'); } }],
  ['cart-drawer', '/collections/public', { cart: true, screens: 1, act: (p) => p.click('[data-cart-toggle]') }],
  ['collection', '/collections/public', {}],
  ['filters', '/collections/public', { screens: 1, act: (p) => p.click('[data-sheet-open]') }],
  ['collections', '/collections', {}],
  ['product', '/products/vulcan-etna', {}],
  ['product-pro', '/products/baterie-artificii-de-zi', { screens: 3 }],
  ['cart', '/cart', { cart: true }],
  ['checkout', '/checkout', { cart: true }],
  ['search-page', '/search?q=vulcan', { screens: 3 }],
  ['login', '/account/login', { screens: 2 }],
  ['register', '/account/register', { screens: 2 }],
  ['account', '/account', { user: true, screens: 3 }],
  ['addresses', '/account/addresses', { user: true, screens: 2 }],
  ['order', '/account/order?n=1001', { user: true, screens: 3 }],
  ['contact', '/pages/contact', { screens: 3 }],
  ['unsubscribe', '/pages/dezabonare', { screens: 2 }],
  ['faq', '/pages/faq', { screens: 3 }],
  ['guide', '/pages/ghid', { screens: 3 }],
  ['safety', '/pages/siguranta', { screens: 3 }],
  ['delivery', '/pages/livrare-retur', { screens: 2 }],
  ['about', '/pages/despre-noi', { screens: 3 }],
  ['pro', '/pages/profesionisti', { screens: 4 }],
  ['terms', '/pages/termeni', { screens: 2 }],
  ['404', '/nu-exista', { screens: 1 }],
];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 180000,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const index = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const orient of which === 'both' ? ['portrait', 'landscape'] : [which]) {
  const [w, h] = ORIENTS[orient];
  mkdirSync(`${out}/${orient}`, { recursive: true });
  for (const [n, [name, path, o]] of STOPS.entries()) {
    const ctx = await browser.createBrowserContext(); // a fresh browser profile per stop: no storage carried over
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((s) => {
      try {
        sessionStorage.setItem('bomba-intro-v1', '1');
        if (!s.gate) localStorage.setItem('bomba-mode-v1', 'public');
        if (s.cart) localStorage.setItem('bomba-cart-v1', s.cartJson);
        if (s.user) { localStorage.setItem('bomba-account-v1', s.account); localStorage.setItem('bomba-addresses-v2', s.addresses); localStorage.setItem('bomba-orders-v1', s.orders); }
      } catch {}
    }, { gate: !!o.gate, cart: !!o.cart, user: !!o.user, cartJson: cart, account, addresses, orders });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
    const files = [];
    try {
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 });
      await wait(path === '/' ? 2400 : 900);
      if (o.act) { await o.act(page); await wait(900); }
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const screens = Math.min(o.screens ?? MAX, MAX, Math.ceil(total / (h * .85)));
      for (let k = 0; k < screens; k++) {
        if (!o.act) { await page.evaluate((y) => scrollTo(0, y), Math.round(k * h * .85)); await wait(k ? 500 : 100); }
        const f = `${orient}/${String(n).padStart(2, '0')}-${name}-${k}.jpg`;
        await page.screenshot({ path: `${out}/${f}`, type: 'jpeg', quality: 70 });
        files.push(f);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      index.push({ orient, name, url: path, viewport: `${w}x${h}`, files, pageHeight: total, screensShown: files.length, overflow, errors: errs });
    } catch (e) { index.push({ orient, name, url: path, viewport: `${w}x${h}`, files, error: e.message.slice(0, 160), errors: errs }); }
    console.log(orient, name, files.length, errs.length ? `errors ${errs.length}` : '');
    await ctx.close();
  }
}
writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
await browser.close();
