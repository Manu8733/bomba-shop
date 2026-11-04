// Viewport shots down the home page (below the hero), for design review. Usage: node dev/sections.mjs <outDir> <width>
import puppeteer from 'puppeteer-core';
const [out, width] = process.argv.slice(2);
const w = Number(width);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: w, height: w < 768 ? 844 : 900, isMobile: w < 768, hasTouch: w < 768 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto(`http://127.0.0.1:4410${process.env.PAGE || '/'}`, { waitUntil: 'load' });
const H = await p.evaluate(() => document.body.scrollHeight), vh = w < 768 ? 844 : 900;
let i = 0;
for (let y = Number(process.env.FROM || vh); y < H - 200; y += vh) {
  await p.evaluate((y) => window.scrollTo(0, y), y); await new Promise((r) => setTimeout(r, 700));
  await p.screenshot({ path: `${out}/sec-${w}-${String(i++).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 60 });
}
console.log('shots', i, 'height', H);
await b.close();
