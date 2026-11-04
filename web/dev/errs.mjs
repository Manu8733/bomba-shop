// Console errors and a short frame-time sample of a page. Usage: node dev/errs.mjs <path> [width]
import puppeteer from 'puppeteer-core';
const [path = '/', width = '1440'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 60000, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); const out = [];
p.on('pageerror', (e) => out.push('pageerror ' + e.message)); p.on('console', (m) => out.push(m.type() + ' ' + m.text().slice(0, 300)));
await p.setViewport({ width: Number(width), height: 900 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto('http://127.0.0.1:4410' + path, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4000));
const fps = await Promise.race([p.evaluate(() => new Promise((res) => { let f = 0; const t0 = performance.now(); const l = () => { f++; performance.now() - t0 < 1000 ? requestAnimationFrame(l) : res(f); }; requestAnimationFrame(l); })), new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
console.log('fps', fps); console.log(out.slice(0, 20).join('\n'));
await b.close();
