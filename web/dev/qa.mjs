// Automated QA over the built site (needs `astro preview` on :4410).
// Usage: node dev/qa.mjs > ../tools/shots/qa.json
import puppeteer from 'puppeteer-core';
const PAGES = ['/', '/collections', '/collections/public', '/collections/vulcani-artificii', '/collections/profesionisti', '/collections/all',
  '/products/void-reaper', '/products/vulcani-fidji', '/products/baterie-gold-rain', '/search?q=vulcan', '/cart', '/checkout',
  '/pages/spectacole', '/pages/profesionisti', '/pages/contact', '/pages/faq', '/pages/ghid', '/pages/siguranta', '/pages/livrare-retur',
  '/pages/termeni', '/pages/confidentialitate', '/pages/cookies', '/pages/despre-noi', '/nu-exista'];
const WIDTHS = [360, 390, 768, 1024, 1440];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
for (const w of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: w < 768 ? 800 : 900, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); } catch {} });
  for (const p of PAGES) {
    const issues = [];
    const onConsole = (m) => { if (m.type() === 'error') issues.push(`console: ${m.text().slice(0, 160)}`); };
    const onErr = (e) => issues.push(`pageerror: ${String(e.message).slice(0, 160)}`);
    const onResp = (r) => { if (r.status() >= 400 && !r.url().includes('/nu-exista')) issues.push(`http ${r.status()}: ${r.url().replace('http://127.0.0.1:4410', '')}`); };
    page.on('console', onConsole); page.on('pageerror', onErr); page.on('response', onResp);
    try {
      await page.goto(`http://127.0.0.1:4410${p}`, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } scrollTo(0, 0); });
      await new Promise((r) => setTimeout(r, 400));
      const found = await page.evaluate((mobile) => {
        const out = [];
        const W = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > W + 1) {
          const wide = [...document.querySelectorAll('body *')].filter((el) => {
            const r = el.getBoundingClientRect(); if (!r.width || r.right <= W + 1) return false;
            for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') return false; }
            return true;
          }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
          out.push(`overflow-x: page ${document.documentElement.scrollWidth}px > ${W}px (${wide.join(', ')})`);
        }
        const h1 = document.querySelectorAll('main h1, body > h1').length;
        if (h1 !== 1) out.push(`h1 count ${h1}`);
        const noAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).length;
        if (noAlt) out.push(`img without alt: ${noAlt}`);
        const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
        const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
        if (dup.length) out.push(`duplicate ids: ${dup.slice(0, 6).join(', ')}`);
        const unnamed = [...document.querySelectorAll('a[href], button')].filter((el) => {
          const vis = el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; if (!vis) return false;
          const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim() || el.querySelector('img[alt]:not([alt=""])');
          return !name && !el.closest('[aria-hidden="true"]');
        }).slice(0, 4).map((el) => el.outerHTML.slice(0, 90));
        if (unnamed.length) out.push(`unnamed controls: ${unnamed.join(' | ')}`);
        if (mobile) {
          const small = [...document.querySelectorAll('main a[href], main button, header button, header a')].filter((el) => {
            const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 32 || r.width < 32) && getComputedStyle(el).display !== 'inline' && !el.closest('.prose, p, li, dd')
              && getComputedStyle(el, '::after').position !== 'absolute'; // a stretched link: the whole card is the target
          }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
          if (small.length) out.push(`small tap targets: ${small.join(', ')}`);
        }
        return out;
      }, w < 768);
      issues.push(...found);
    } catch (e) { issues.push(`load failed: ${e.message}`); }
    page.off('console', onConsole); page.off('pageerror', onErr); page.off('response', onResp);
    if (issues.length) report.push({ w, p, issues: [...new Set(issues)] });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
