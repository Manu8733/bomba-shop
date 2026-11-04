// A few quick viewport shots of one hero slide. Usage: node dev/burst.mjs <outDir> <width> <slide> <count> <gapMs>
import puppeteer from 'puppeteer-core';
const [out, width, slide, count, gap] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width, height: width < 768 ? 844 : 900, isMobile: width < 768, hasTouch: width < 768 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto('http://127.0.0.1:4410/', { waitUntil: 'load' });
await p.evaluate((k) => document.querySelectorAll('[data-go]')[k].click(), slide);
await new Promise((r) => setTimeout(r, 1800));
for (let i = 0; i < count; i++) { await p.screenshot({ path: `${out}/burst-${slide}-${width}-${i}.jpg`, type: 'jpeg', quality: 70 }); await new Promise((r) => setTimeout(r, gap)); }
await b.close();
