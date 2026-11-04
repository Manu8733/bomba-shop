// Frozen intro frame at the landing, cropped around the header logo, to check the sparks sit exactly on the letters.
import puppeteer from 'puppeteer-core';
const [w, h, dpr, out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11'] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); window.__INTRO_T = 3200; });
await p.goto('http://127.0.0.1:4410/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1200));
const r = await p.evaluate(() => { const b = document.querySelector('.site-header .brand svg').getBoundingClientRect(); return { x: b.left - 20, y: b.top - 14, width: b.width + 40, height: b.height + 28 }; });
await p.screenshot({ path: `${out}/land-${w}.png`, clip: r });
await p.evaluate(() => { window.__INTRO_T = 3289; }); await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: `${out}/land-end-${w}.png`, clip: r });
await b.close();
