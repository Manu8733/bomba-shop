// Responsive matrix: every page × viewport × engine (Chromium, Firefox, WebKit = Safari's engine).
// Checks what must be on the first screen without scrolling, horizontal overflow, text that is too small, console errors.
// Usage: node dev/matrix.mjs [outDir] [engines=chromium,firefox,webkit] [pages=all]
// Env: BASE (default http://127.0.0.1:4321, the dev server), SHOTS=fail|all|none (default fail), ONLY=390x844,1920x1080
import { chromium, firefox, webkit } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const [out = 'matrix-out', engines = 'chromium,firefox,webkit', pagesArg = 'all'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const SHOTS = process.env.SHOTS || 'fail';
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  // phones (portrait, then landscape)
  [320, 568, 'phone'], [360, 640, 'phone'], [375, 667, 'phone'], [390, 844, 'phone'], [412, 915, 'phone'], [430, 932, 'phone'],
  [667, 375, 'phone-land'], [844, 390, 'phone-land'],
  // tablets
  [768, 1024, 'tablet'], [820, 1180, 'tablet'], [1024, 768, 'tablet-land'], [1180, 820, 'tablet-land'],
  // laptops and desktops (heights are the page area left by the browser's own bars)
  [1280, 650, 'laptop'], [1366, 657, 'laptop'], [1440, 789, 'laptop'], [1536, 730, 'laptop'],
  [1920, 969, 'desktop'], [2560, 1329, 'desktop'], [3440, 1329, 'ultrawide'],
].filter(([w, h]) => !process.env.ONLY || process.env.ONLY.split(',').includes(`${w}x${h}`));

// selectors that must be completely inside the first screen; "any" = at least one of the list
const PAGES = {
  '/': { fold: ['.site-header .brand', '.hero .slide.on .name', '.hero .slide.on .price', '.hero .slide.on .acts .btn', '.hero .arrows'],
    after: async (p) => p.evaluate(() => { const s = document.querySelector('.fxs .stage'); if (!s) return null; s.scrollIntoView(); const r = s.getBoundingClientRect(), panel = s.querySelector('.panel')?.getBoundingClientRect();
      return { fxsFits: r.height <= innerHeight + 1, fxsPanelInside: panel ? panel.top >= -1 && panel.bottom <= r.bottom + 1 : true }; }) },
  // on phones the sticky bar (name, price, button) is up from the first screen, so it counts for the name
  '/products/vulcan-etna': { fold: ['main h1, [data-sticky][data-show="true"] .st-title', '[data-gallery] .slide img', '[data-add-to-cart]'] },
  '/collections/public': { fold: ['main h1'], startsInFold: ['[data-product-card]'] },
  '/account/login': { fold: ['main h1', '#li-email', '#li-pw'] },
  '/pages/contact': { fold: ['main h1'] },
};
const pageList = pagesArg === 'all' ? Object.keys(PAGES) : pagesArg.split(',');

const launchers = { chromium: () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }), firefox: () => firefox.launch(), webkit: () => webkit.launch() };
const report = [];
for (const name of engines.split(',')) {
  const browser = await launchers[name]();
  for (const [w, h, kind] of VIEWPORTS) {
    const mobile = w < 768 || kind.startsWith('phone');
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile, ...(name !== 'firefox' ? { isMobile: mobile && name === 'chromium' } : {}) });
    await ctx.addInitScript(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} });
    for (const path of pageList) {
      const spec = PAGES[path]; const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404 \(Not Found\)/.test(m.text())) errors.push(m.text().slice(0, 140)); });
      const issues = [];
      try {
        await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(700);
        const r = await page.evaluate(({ fold, anyOf = [], startsInFold = [] }) => {
          const vw = document.documentElement.clientWidth, vh = innerHeight, out = [];
          const box = (sel) => [...document.querySelectorAll(sel)].map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden');
          fold.forEach((sel, i) => {
            const all = box(sel);
            const inside = all.filter(({ r }) => r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1);
            if (!all.length) out.push(`missing: ${sel}`);
            else if (!inside.length && !(anyOf.includes(i) && all.some(({ r }) => r.top < vh))) out.push(`below fold or cut: ${sel} (top ${Math.round(all[0].r.top)}, bottom ${Math.round(all[0].r.bottom)}, vh ${vh})`);
          });
          startsInFold.forEach((sel) => { const b = box(sel)[0]; if (!b) out.push(`missing: ${sel}`); else if (b.r.top > vh * .92) out.push(`starts below fold: ${sel} (top ${Math.round(b.r.top)}, vh ${vh})`); });
          const overflow = document.documentElement.scrollWidth - vw;
          if (overflow > 1) out.push(`horizontal overflow ${overflow}px`);
          // smallest visible text in the first screen
          let min = 99, minText = '';
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walk.nextNode()) {
            const t = walk.currentNode; if (!t.textContent.trim()) continue;
            const el = t.parentElement; if (!el || el.closest('[aria-hidden="true"], [role="img"], .visually-hidden, script, style')) continue;
            const rr = el.getBoundingClientRect(); if (!rr.width || rr.bottom < 0 || rr.top > vh) continue;
            const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
            const fs = parseFloat(cs.fontSize); if (fs < min) { min = fs; minText = t.textContent.trim().slice(0, 30); }
          }
          if (min < 12) out.push(`text ${min}px: "${minText}"`);
          const hero = document.querySelector('.hero .slide.on .name');
          return { issues: out, minFont: min, heroName: hero ? Math.round(parseFloat(getComputedStyle(hero).fontSize)) : null };
        }, { fold: spec.fold, anyOf: spec.anyOf, startsInFold: spec.startsInFold });
        issues.push(...r.issues);
        if (spec.after) { const a = await spec.after(page); if (a && !a.fxsFits) issues.push('effects section taller than the screen'); if (a && !a.fxsPanelInside) issues.push('effects panel cut'); }
        if (errors.length) issues.push(...[...new Set(errors)].map((e) => `console: ${e}`));
        const shot = SHOTS === 'all' || (SHOTS === 'fail' && issues.length);
        if (shot) { await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${name}-${w}x${h}-${path.replace(/[^a-z0-9]+/gi, '_') || 'home'}.jpg`, type: 'jpeg', quality: 55 }); }
        report.push({ engine: name, vp: `${w}x${h}`, kind, path, issues, minFont: r.minFont, heroName: r.heroName });
        process.stderr.write(`${name} ${w}x${h} ${path} ${issues.length ? 'ISSUES' : 'ok'}\n`); // progress
      } catch (e) { report.push({ engine: name, vp: `${w}x${h}`, kind, path, issues: [`load failed: ${e.message.slice(0, 120)}`] }); }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.issues.length);
console.log(`checked ${report.length} page views, ${bad.length} with issues`);
for (const r of bad) console.log(`${r.engine} ${r.vp} ${r.path}: ${r.issues.join(' | ')}`);
