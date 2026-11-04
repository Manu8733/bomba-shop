// Where the header logo is when the intro measures it vs. once the page has settled. Usage: node dev/logo-pos.mjs <w> <h> <dpr>
import puppeteer from 'puppeteer-core';
const [w, h, dpr] = process.argv.slice(2).map(Number);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11'] });
const p = await b.newPage();
await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: false });
await p.evaluateOnNewDocument(() => {
  localStorage.setItem('bomba-mode-v1', 'public');
  const rec = (tag) => { const el = document.querySelector('.site-header .brand svg'); if (!el) return; const r = el.getBoundingClientRect();
    (window.__pos ??= []).push([tag, Math.round(performance.now()), +r.left.toFixed(1), +r.top.toFixed(1), +r.width.toFixed(1), document.documentElement.clientWidth, innerWidth]); };
  new MutationObserver((m, o) => { if (document.querySelector('.intro-canvas')) { rec('canvas'); o.disconnect(); } }).observe(document, { childList: true, subtree: true });
  addEventListener('load', () => rec('load')); document.fonts?.ready.then(() => rec('fonts'));
  addEventListener('intro:done', () => rec('done'));
});
await p.goto('http://127.0.0.1:4410/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4500));
console.log(JSON.stringify(await p.evaluate(() => window.__pos)));
await b.close();
