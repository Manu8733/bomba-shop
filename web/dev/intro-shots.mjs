import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const out = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 768 });
  for (const ms of (process.env.TS || '400,760,1150,1900,2350,2950').split(',').map(Number)) {
    await p.evaluateOnNewDocument((t) => { localStorage.setItem('bomba-mode-v1', 'public'); window.__INTRO_T = t; }, ms);
    await p.goto((process.env.BASE || 'http://127.0.0.1:4410') + '/', { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 900));
    await p.screenshot({ path: `../tools/shots/intro-${w}-${ms}.png` });
  }
  await p.close();
}
await b.close();
