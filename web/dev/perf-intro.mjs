import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 960, deviceScaleFactor: 1 });
const MODE = process.env.MODE || '';
await page.evaluateOnNewDocument((MODE) => {
  try { localStorage.setItem('bomba-mode-v1', 'public'); if (MODE === 'nointro') sessionStorage.setItem('bomba-intro-v1', '1'); } catch {}
  if (MODE === 'hide') document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'main, footer { visibility: hidden }'; document.head.append(s); });
  const t = []; let last = 0; window.__ft = t;
  const loop = (n) => { if (last) t.push([Math.round(n), Math.round(n - last)]); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) (window.__lt ??= []).push([e.entryType, Math.round(e.startTime), Math.round(e.duration), (e.scripts || []).map((s) => (s.sourceURL || '').split('/').pop() + ':' + s.invoker + ':' + Math.round(s.duration)).join(' | ')]); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
}, MODE);
await page.goto('http://127.0.0.1:4410/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));
const r = await page.evaluate(() => ({ slow: window.__ft.filter(([, d]) => d > 25), lt: window.__lt, intro: performance.getEntriesByType('resource').length }));
console.log(MODE || 'intro', 'slow frames', r.slow.length, 'sum', r.slow.reduce((a, b) => a + b[1], 0), JSON.stringify(r.slow.slice(0, 12)));
await browser.close();
