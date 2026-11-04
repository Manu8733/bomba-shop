// The candle pack turned round with the "Vezi spatele" button. Usage: node dev/turn.mjs <out.jpg>
import puppeteer from 'puppeteer-core';
const [out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 120000, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto('http://127.0.0.1:4410/', { waitUntil: 'load' });
await p.evaluate(() => document.querySelectorAll('[data-go]')[1].click());
await new Promise((r) => setTimeout(r, 2500));
const btn = await p.evaluate(() => { const b = document.querySelector('.slide.on [data-turn]'); if (!b) return 'none'; b.click(); return b.hidden ? 'hidden' : 'ok'; });
await new Promise((r) => setTimeout(r, 1800));
const r = await p.evaluate(() => { const i = document.querySelector('.shot.on img').getBoundingClientRect(); return { x: i.left - 120, y: Math.max(0, i.top - 60), width: i.width + 240, height: i.height + 120 }; });
await p.screenshot({ path: out, type: 'jpeg', quality: 80, clip: r });
console.log('button', btn, 'label', await p.evaluate(() => document.querySelector('.slide.on [data-turn]')?.textContent), 'errors', JSON.stringify(errs));
await b.close();
