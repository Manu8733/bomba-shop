// Look at a page on the dev server: viewport shots down the page + console errors + horizontal overflow.
// Usage: node dev/look.mjs <path> <outDir> [widths=1440,390] [maxShots=6]     (dev server: http://127.0.0.1:4321)
// Env: BASE to point at another server, MODE=pro to browse as an authorised buyer.
import puppeteer from 'puppeteer-core';
const [path = '/', out = '.', widths = '1440,390', max = '6'] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:4321';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
for (const w of widths.split(',').map(Number)) {
  const p = await b.newPage(), vh = w < 768 ? 844 : 900, errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.setViewport({ width: w, height: vh, isMobile: w < 768, hasTouch: w < 768 });
  await p.evaluateOnNewDocument((mode) => { try { localStorage.setItem('bomba-mode-v1', mode); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} }, process.env.MODE || 'public');
  await p.goto(base + path, { waitUntil: 'load', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 800));
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const name = path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
  let i = 0;
  for (let y = 0; y < H && i < Number(max); y += vh, i++) {
    await p.evaluate((y) => window.scrollTo(0, y), y); await new Promise((r) => setTimeout(r, 450));
    await p.screenshot({ path: `${out}/${name}-${w}-${i}.jpg`, type: 'jpeg', quality: 60 });
  }
  console.log(JSON.stringify({ path, w, height: H, shots: i, overflowX: over, errors: [...new Set(errs)].slice(0, 6) }));
  await p.close();
}
await b.close();
