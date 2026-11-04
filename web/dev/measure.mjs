// Print the box of a few elements at one viewport. Usage: node dev/measure.mjs <path> <w>x<h> <selector> [selector...]
import { chromium } from 'playwright';
const [path, vp, ...sels] = process.argv.slice(2); const [w, h] = vp.split('x').map(Number);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await b.newContext({ viewport: { width: w, height: h } });
await ctx.addInitScript(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
const p = await ctx.newPage(); await p.goto((process.env.BASE || 'http://127.0.0.1:4410') + path, { waitUntil: 'load' }); await p.waitForTimeout(500);
for (const s of sels) console.log(s, JSON.stringify(await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop, pb: cs.paddingBottom }; }, s)));
await b.close();
