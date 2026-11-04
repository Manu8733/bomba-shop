// High-resolution crops of the hero product for each slide (DPR 2). Usage: node dev/zoom.mjs <outDir> [base]
import puppeteer from 'puppeteer-core';
const [out, base = 'http://127.0.0.1:4410'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 120000, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto(base + '/', { waitUntil: 'load', timeout: 90000 });
for (let k = 0; k < 5; k++) {
  await p.evaluate((k) => { document.querySelectorAll('[data-go]')[k].click(); document.querySelector('[data-pause]')?.click(); }, k);
  await new Promise((r) => setTimeout(r, 3200));
  const r = await p.evaluate(() => { const i = document.querySelector('.shot.on img').getBoundingClientRect(); return { x: i.left - 120, y: Math.max(0, i.top - 140), width: i.width + 240, height: i.height + 220 }; });
  await p.screenshot({ path: `${out}/z-${k}.jpg`, type: 'jpeg', quality: 80, clip: r });
}
await b.close();
console.log('ok');
