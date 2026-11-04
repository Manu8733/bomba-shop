// Viewport shots of each hero slide after its effect has been burning a while. Usage: node dev/hero.mjs <outDir> <width> [ms]
import puppeteer from 'puppeteer-core';
const [out, width, ms = '2600'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
const w = Number(width);
await page.setViewport({ width: w, height: w < 768 ? 844 : 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto('http://127.0.0.1:4410/', { waitUntil: 'load', timeout: 90000 });
const n = await page.$$eval('[data-go]', (b) => b.length);
for (let k = 0; k < n; k++) {
  await page.evaluate((k) => document.querySelectorAll('[data-go]')[k].click(), k);
  await new Promise((r) => setTimeout(r, Number(ms)));
  await page.screenshot({ path: `${out}/hero-${k}-${w}.jpg`, type: 'jpeg', quality: 70 });
}
// frame time while the fountain burns
await page.evaluate(() => document.querySelectorAll('[data-go]')[0].click());
await new Promise((r) => setTimeout(r, 1500));
const fps = await page.evaluate(() => new Promise((res) => { let f = 0; const t0 = performance.now(); const loop = () => { f++; performance.now() - t0 < 2000 ? requestAnimationFrame(loop) : res(f / 2); }; requestAnimationFrame(loop); }));
console.log('slides', n, 'fps', fps, 'errors', JSON.stringify(errs));
await browser.close();
