import puppeteer from 'puppeteer-core';
const [path, ...sel] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
await p.evaluateOnNewDocument(() => localStorage.setItem('bomba-mode-v1', 'public'));
p.on('pageerror', (e) => console.log('ERR', e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto('http://127.0.0.1:4410' + path, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 800));
const small = await p.evaluate(() => [...document.querySelectorAll('main a[href], main button, header button, header a')].filter((el) => {
  const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 32 || r.width < 32) && getComputedStyle(el).display !== 'inline' && !el.closest('.prose, p, li, dd');
}).map((el) => el.outerHTML.slice(0, 140)));
console.log(small.join('\n'));
await b.close();
