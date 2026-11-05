// The home page's first screen on real phone sizes, with the GPU, after the first effect has burnt a while; reports
// horizontal overflow and where the hero's parts sit. Usage: node dev/phone.mjs <outDir> [WxH,WxH…] [path]
import puppeteer from 'puppeteer-core';
const [out, sizes = '320x568,360x640,375x667,390x844,412x915,430x932', path = '/'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 120000,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
for (const s of sizes.split(',')) {
  const [w, h] = s.split('x').map(Number);
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`http://127.0.0.1:4410${path}`, { waitUntil: 'load', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2600));
  const info = await page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, count: r('.hero .count'), stage: r('.hero .stage'),
      shot: r('.hero .shot.on'), kind: r('.hero .slide.on .kind'), name: r('.hero .slide.on .name'), btn: r('.hero .slide.on .acts .btn'), picker: r('.hero .picker'), h1: r('#hero-h') };
  });
  await page.screenshot({ path: `${out}/${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${w}x${h}.jpg`, type: 'jpeg', quality: 72 });
  console.log(`${w}x${h}`, JSON.stringify(info), errs.length ? `errors: ${errs.join(' | ').slice(0, 200)}` : '');
  await page.close();
}
await browser.close();
