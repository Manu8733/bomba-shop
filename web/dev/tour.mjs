import puppeteer from 'puppeteer-core';
const [w] = process.argv.slice(2).map(Number);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: w, height: w < 768 ? 844 : 900, isMobile: w < 768, hasTouch: w < 768 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); });
await p.goto('http://127.0.0.1:4410/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
const stops = await p.evaluate(() => {
  const top = (s, f = 0) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top + scrollY + f : null; };
  const fx = document.querySelector('[data-fxs]');
  return [0, top('[data-launch]', innerHeight * 1.5), top('#occ-h', -120), top('#stock-h', -100), fx ? top('[data-fxs]', (fx.offsetHeight - innerHeight) * .5) : null, top('.shows'), top('.promise'), document.body.scrollHeight - innerHeight].filter((v) => v !== null);
});
let i = 0;
for (const y of stops) {
  await p.evaluate((y) => scrollTo(0, y), y);
  await new Promise((r) => setTimeout(r, 1400));
  await p.screenshot({ path: `../tools/shots/tour-${w}-${i++}.png` });
}
await b.close();
console.log(i);
