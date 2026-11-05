// End-to-end check of the account flow on the built site (needs `astro preview` on :4410): guard redirect, register,
// address book, demo checkout -> order page -> account, contact prefill, unsubscribe. Test values only.
// Usage: node dev/account.mjs <shotsDir>
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'shots-account'; mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4410';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); };
for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 768, hasTouch: w < 768 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bomba-mode-v1', 'public'); sessionStorage.setItem('bomba-intro-v1', '1'); } catch {} });
  page.on('console', (m) => { if (m.type() === 'error') fails.push(`${tag} console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => fails.push(`${tag} pageerror: ${String(e.message).slice(0, 160)}`));
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }); };
  const shot = (n) => page.screenshot({ path: `${OUT}/${tag}-${n}.png`, fullPage: true });
  const type = async (sel, v) => { await page.$eval(sel, (el) => { el.value = ''; }); await page.type(sel, v); };
  const errs = () => page.$$eval('.err:not([hidden])', (els) => els.filter((e) => e.textContent.trim()).length);
  const pw = `t${Math.random().toString(36).slice(2, 10)}7`;

  await go('/account');
  check(page.url().includes('/account/login?next='), `${tag}: signed-out /account did not go to login (${page.url()})`);
  await go('/account/register'); await shot('register');
  await page.click('[data-register] button[type=submit]');
  check(await errs() >= 4, `${tag}: empty register shows ${await errs()} errors`);
  await shot('register-errors');
  await type('#rg-fn', 'Ana'); await type('#rg-ln', 'Test'); await type('#rg-email', 'ana.test@example.com'); await type('#rg-pw', pw);
  await page.click('#rg-age'); await page.click('#rg-news');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-register] button[type=submit]')]);
  check(new URL(page.url()).pathname === '/account', `${tag}: register landed on ${page.url()}`);
  check((await page.$eval('[data-acct-title]', (e) => e.textContent)) === 'Salut, Ana', `${tag}: greeting missing`);
  await shot('account-empty');

  await go('/account/addresses');
  await page.click('[data-new]'); await page.click('[data-addr-form] button[type=submit]');
  check(await errs() >= 6, `${tag}: empty address shows ${await errs()} errors`);
  await type('#ad-fn', 'Ana'); await type('#ad-ln', 'Test'); await type('#ad-a1', 'Strada Exemplu 1'); await type('#ad-city', 'Cluj-Napoca');
  await page.select('#ad-county', 'Cluj'); await type('#ad-zip', '400001'); await type('#ad-ph', '0700000000');
  await page.click('[data-addr-form] button[type=submit]');
  check((await page.$$('[data-list] li')).length === 1, `${tag}: address not listed`);
  check(await page.evaluate(() => document.activeElement?.matches('[data-new]')), `${tag}: focus after save is ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`);
  await shot('addresses');

  await page.evaluate(() => localStorage.setItem('bomba-cart-v1', JSON.stringify([{ handle: 'vulcan-etna', quantity: 2 }, { handle: 'candele-romane-30-foc', quantity: 1 }])));
  await go('/checkout');
  check((await page.$eval('#c-email', (e) => e.value)) === 'ana.test@example.com', `${tag}: checkout email not prefilled`);
  check((await page.$eval('#c-city', (e) => e.value)) === 'Cluj-Napoca', `${tag}: checkout address not prefilled`);
  await page.click('#c-age'); await page.click('#c-terms');
  await page.click('[data-checkout] button[type=submit]');
  await page.waitForSelector('[data-placed]:not([hidden])', { timeout: 5000 }).catch(() => fails.push(`${tag}: order not placed`));
  const link = await page.$eval('[data-placed-link]', (a) => a.getAttribute('href'));
  check(/\/account\/order\?n=\d+/.test(link), `${tag}: order link ${link}`);
  check((await page.evaluate(() => localStorage.getItem('bomba-cart-v1'))) === '[]', `${tag}: cart not cleared`);
  await shot('placed');

  await go(link);
  await page.waitForSelector('[data-lines] li', { timeout: 5000 }).catch(() => {});
  check((await page.$$('[data-lines] li')).length === 2, `${tag}: order page lines`);
  await shot('order');
  await go('/account');
  check((await page.$$('[data-orders] tbody tr')).length === 1, `${tag}: account orders table`);
  await shot('account');

  await go(`/pages/contact?comanda=${link.split('n=')[1]}`);
  check((await page.$eval('#ct-order', (e) => e.value)) === link.split('n=')[1] && (await page.$eval('#ct-name', (e) => e.value)) === 'Ana Test', `${tag}: contact prefill`);
  await page.click('[data-contact] button[type=submit]');
  check(await errs() >= 2, `${tag}: contact without message/consent shows ${await errs()} errors`);
  await type('#ct-msg', 'Test: vreau să schimb adresa.'); await page.click('#ct-consent');
  await page.click('[data-contact] button[type=submit]');
  check(!(await page.$eval('[data-done]', (e) => e.hidden)), `${tag}: contact not sent`);
  await shot('contact');

  await go('/pages/dezabonare?email=ana.test%40example.com');
  await page.click('[data-unsub] button[type=submit]');
  check(!(await page.$eval('[data-done]', (e) => e.hidden)), `${tag}: unsubscribe not done`);
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('bomba-account-v1')).newsletter)) === false, `${tag}: account still subscribed`);
  await shot('unsub');

  // signing out and back in keeps the profile; another customer on the same browser sees none of Ana's addresses
  await go('/account'); await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('[data-signout]')]);
  await go('/account/login'); await type('#li-email', 'ana.test@example.com'); await type('#li-pw', pw);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-login] button[type=submit]')]);
  check((await page.$eval('[data-acct-title]', (e) => e.textContent)) === 'Salut, Ana', `${tag}: profile lost after signing back in`);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('[data-signout]')]);
  await go('/account/login?next=%2F%5Cexample.org'); await type('#li-email', 'bob.test@example.com'); await type('#li-pw', pw);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-login] button[type=submit]')]);
  check(new URL(page.url()).origin === BASE && new URL(page.url()).pathname === '/account', `${tag}: ?next= escaped the site (${page.url()})`);
  check((await page.$eval('[data-addr]', (e) => e.textContent)).includes('Nu ai salvat'), `${tag}: Bob sees Ana's address`);
  // spaces alone do not pass a required field
  await go('/account/addresses'); await page.click('[data-new]'); await type('#ad-a1', '   ');
  await page.click('[data-addr-form] button[type=submit]');
  check(await page.$eval('#ad-a1', (e) => e.getAttribute('aria-invalid')) === 'true', `${tag}: blank street accepted`);

  await go('/account/login'); await shot('login');
  await ctx.close();
}
await browser.close();
console.log(fails.length ? fails.join('\n') : 'account flow: all checks passed');
