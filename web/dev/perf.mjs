// Frame-time check on the real GPU: the entry intro (first 3.5 s) and the hero stage per slide. Usage: node dev/perf.mjs [width]
import puppeteer from 'puppeteer-core';
const w = Number(process.argv[2] || 1920);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: Math.round(w * .5), deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem('bomba-mode-v1', 'public'); } catch {}
  const t = []; let last = 0; window.__ft = t;
  const loop = (n) => { if (last) t.push(n - last); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
});
const stat = (a) => { const s = [...a].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]?.toFixed(1);
  return `frames ${s.length} median ${q(.5)}ms p95 ${q(.95)}ms max ${q(1)}ms >25ms: ${s.filter((x) => x > 25).length}`; };
await page.goto('http://127.0.0.1:4410/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 3600));
console.log('gpu', await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g?.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
console.log('intro ', stat(await page.evaluate(() => window.__ft.splice(0))));
await new Promise((r) => setTimeout(r, 1500));
const n = await page.$$eval('[data-go]', (b) => b.length);
for (let k = 0; k < n; k++) {
  await page.evaluate((k) => document.querySelectorAll('[data-go]')[k].click(), k);
  await new Promise((r) => setTimeout(r, 1200)); await page.evaluate(() => window.__ft.splice(0));
  await new Promise((r) => setTimeout(r, 2500));
  console.log('slide', k, stat(await page.evaluate(() => window.__ft.splice(0))));
}
await browser.close();
