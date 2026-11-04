// Full-page screenshots of the built site for design review.
// Usage: node tools/shoot.mjs <outDir> <width> <path> [path...]   (needs `npm --prefix web run preview` on :4410)
import puppeteer from 'puppeteer-core';
const [out, width, ...paths] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
const w = Number(width);
await page.setViewport({ width: w, height: w < 768 ? 844 : 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} });
for (const p of paths) {
  await page.goto(`http://127.0.0.1:4410${p}`, { waitUntil: 'load', timeout: 90000 });
  // scroll through once so lazy images and scroll-driven sections render, then return to top
  if (process.env.FULL !== '0') await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, Number(process.env.WAIT || 600)));
  const name = (p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')) + `-${w}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: process.env.FULL !== '0' });
  console.log(name);
}
await browser.close();
