// Screenshot one element of a page after it has been on screen a while. Usage: node dev/at.mjs <path> <selector> <out.jpg> [width] [waitMs]
import puppeteer from 'puppeteer-core';
const [path, sel, out, width = '1440', wait = '2500'] = process.argv.slice(2);
const w = Number(width);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.setViewport({ width: w, height: w < 768 ? 844 : 900, isMobile: w < 768, hasTouch: w < 768 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto((process.env.BASE || 'http://127.0.0.1:4410') + path, { waitUntil: 'load' });
await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
await new Promise((r) => setTimeout(r, Number(wait)));
const el = await p.$(sel); await el.screenshot({ path: out, type: 'jpeg', quality: 70 });
console.log(JSON.stringify({ path, sel, errors: errs }));
await b.close();
