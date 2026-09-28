// End-to-end checks for the built site. Run with `npm test` (builds first).
// Covers: every page, every internal link, phone/email/maps links, desktop and
// mobile navigation, responsive layout at 3 widths, and both contact form modes.
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const site = JSON.parse(await readFile(new URL('site.config.json', root), 'utf8'));
const shots = process.env.SCREENSHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });

const PAGES = ['/', '/services/', '/contact/', '/privacy/'];
const VIEWPORTS = { mobile: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 900 } };
const TEST_ENDPOINT = 'https://forms.test.invalid/submit';

let failures = 0;
let passes = 0;
const check = (ok, label) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
};

// Two builds: the real one (email-app fallback) and one with a form endpoint.
execFileSync('node', ['scripts/build.mjs'], { cwd: root, env: { ...process.env, OUT_DIR: '.test-dist/endpoint', FORM_ENDPOINT: TEST_ENDPOINT }, stdio: 'ignore' });
const servers = [
  serve('dist', 4311),
  serve('.test-dist/endpoint', 4312),
];
await new Promise((r) => setTimeout(r, 500));
const BASE = 'http://localhost:4311';
const BASE_EP = 'http://localhost:4312';

const browser = await chromium.launch();
try {
  await testPages();
  await testLinks();
  await testDesktopNav();
  await testMobileNav();
  await testResponsive();
  await testFormValidation();
  await testFormMailto();
  await testFormEndpoint();
  await test404();
} finally {
  await browser.close();
  servers.forEach((s) => s.kill());
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// ---------------------------------------------------------------------------

function serve(dir, port) {
  return spawn('node', ['scripts/serve.mjs', String(port)], { cwd: root, env: { ...process.env, DIST: dir }, stdio: 'ignore' });
}

async function newPage(viewport = VIEWPORTS.desktop) {
  const context = await browser.newContext({ viewport });
  // Keep tests offline and deterministic: block the Google Maps iframe.
  await context.route(/google\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  return page;
}

async function testPages() {
  console.log('\nPages load with SEO metadata and no errors');
  const page = await newPage();
  const titles = new Set();
  for (const path of PAGES) {
    const res = await page.goto(BASE + path);
    check(res.status() === 200, `${path} returns 200`);
    const title = await page.title();
    titles.add(title);
    check(title.includes(site.name), `${path} title "${title}"`);
    const desc = await page.getAttribute('meta[name="description"]', 'content');
    check(desc && desc.length > 50 && desc.length <= 300, `${path} has meta description (${desc?.length} chars)`);
    check((await page.getAttribute('link[rel="canonical"]', 'href')) === new URL(path, site.siteUrl).href, `${path} canonical URL`);
    check((await page.locator('h1').count()) === 1, `${path} has exactly one h1`);
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    check(ld.telephone === site.phone.e164 && ld.address.streetAddress === site.address.street, `${path} structured data matches config`);
    const text = await page.locator('body').innerText();
    check(!/lorem|ipsum|coming soon|placeholder|\[[A-Z ]+\]|undefined|NaN/i.test(text), `${path} has no placeholder text`);
    check(page.errors.length === 0, `${path} has no console errors ${page.errors.join('; ')}`);
  }
  check(titles.size === PAGES.length, 'every page has a unique title');
  for (const asset of ['/styles.css', '/main.js', '/favicon.svg', '/og-image.png', '/sitemap.xml', '/robots.txt']) {
    const res = await page.request.get(BASE + asset);
    check(res.status() === 200, `${asset} is served`);
  }
  const sitemap = await (await page.request.get(BASE + '/sitemap.xml')).text();
  check(PAGES.every((p) => sitemap.includes(new URL(p, site.siteUrl).href)), 'sitemap lists every page');
  await page.context().close();
}

async function testLinks() {
  console.log('\nEvery link and button points somewhere real');
  const page = await newPage();
  const internal = new Set();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapsQuery)}`;
  for (const path of PAGES.concat('/404.html')) {
    await page.goto(BASE + path);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim(), target: a.target, rel: a.rel })));
    check(hrefs.every((a) => a.href && a.href !== '#' && !a.href.startsWith('javascript:')), `${path}: no empty or dead (#) links`);
    for (const a of hrefs) {
      if (a.href.startsWith('#')) check((await page.locator(a.href).count()) === 1, `${path}: in-page link ${a.href} has a target`);
      else if (a.href.startsWith('/')) internal.add(a.href.split('#')[0]);
      else if (a.href.startsWith('tel:')) check(a.href === `tel:${site.phone.e164}`, `${path}: phone link "${a.text}" -> ${a.href}`);
      else if (a.href.startsWith('mailto:')) check(a.href.split('?')[0] === `mailto:${site.email}`, `${path}: email link "${a.text}" -> ${a.href.split('?')[0]}`);
      else if (a.href.includes('google.com/maps')) check(a.href === mapsUrl && a.target === '_blank' && a.rel.includes('noopener'), `${path}: maps link "${a.text}" points to the business`);
      else if (a.href.startsWith('https://')) check(a.target === '_blank' && a.rel.includes('noopener'), `${path}: external link ${a.href} opens safely in new tab`);
      else check(false, `${path}: unexpected link ${a.href}`);
    }
    const buttons = await page.$$eval('button', (bs) => bs.map((b) => ({ type: b.type, name: (b.textContent + (b.getAttribute('aria-label') || '')).trim() })));
    check(buttons.every((b) => b.name.length > 0), `${path}: every <button> has an accessible name`);
  }
  for (const href of internal) {
    const res = await page.request.get(BASE + href);
    check(res.status() === 200, `internal link ${href} resolves (200)`);
  }
  await page.context().close();
}

async function testDesktopNav() {
  console.log('\nDesktop navigation');
  const page = await newPage(VIEWPORTS.desktop);
  await page.goto(BASE + '/');
  check(!(await page.locator('.nav-toggle').isVisible()), 'menu button hidden on desktop');
  for (const [label, path] of [['Services & Prices', '/services/'], ['Contact & Visit', '/contact/'], ['Home', '/']]) {
    await page.locator('#site-nav').getByRole('link', { name: label }).click();
    await page.waitForURL(BASE + path);
    check(new URL(page.url()).pathname === path, `click "${label}" -> ${path}`);
    check((await page.locator('#site-nav a[aria-current="page"]').textContent()) === label, `"${label}" marked as current page`);
  }
  await page.locator('.site-footer').getByRole('link', { name: 'Privacy policy' }).click();
  await page.waitForURL(BASE + '/privacy/');
  check(true, 'footer "Privacy policy" link navigates');
  await page.locator('.site-header .brand').click();
  await page.waitForURL(BASE + '/');
  check(true, 'logo links home');
  await page.goto(BASE + '/');
  await page.getByRole('link', { name: 'See services & prices' }).click();
  await page.waitForURL(BASE + '/services/');
  check(true, 'hero "See services & prices" button navigates');
  await page.goto(BASE + '/');
  await page.getByRole('link', { name: /Full price list/ }).click();
  await page.waitForURL(BASE + '/services/');
  check(true, '"Full price list" link navigates');
  await page.goto(BASE + '/');
  await page.keyboard.press('Tab');
  check((await page.evaluate(() => document.activeElement.textContent)) === 'Skip to content', 'skip link is first tab stop');
  await page.context().close();
}

async function testMobileNav() {
  console.log('\nMobile navigation');
  const page = await newPage(VIEWPORTS.mobile);
  await page.goto(BASE + '/');
  const toggle = page.locator('.nav-toggle');
  check(await toggle.isVisible(), 'menu button visible on mobile');
  check(!(await page.locator('#site-nav').isVisible()), 'menu closed initially');
  await toggle.click();
  check((await toggle.getAttribute('aria-expanded')) === 'true', 'menu button sets aria-expanded=true');
  check(await page.locator('#site-nav').isVisible(), 'menu opens');
  await page.keyboard.press('Escape');
  check(!(await page.locator('#site-nav').isVisible()), 'Escape closes menu');
  check(await page.evaluate(() => document.activeElement.classList.contains('nav-toggle')), 'focus returns to menu button');
  for (const [label, path] of [['Services & Prices', '/services/'], ['Contact & Visit', '/contact/'], ['Home', '/']]) {
    await toggle.click();
    await page.locator('#site-nav').getByRole('link', { name: label }).click();
    await page.waitForURL(BASE + path);
    check(!(await page.locator('#site-nav').isVisible()), `mobile "${label}" -> ${path}, menu closed on new page`);
  }
  await toggle.click();
  const callBtn = page.locator('#site-nav a[href^="tel:"]');
  check(await callBtn.isVisible(), 'call button visible in mobile menu');
  await page.mouse.click(180, 700);
  check(!(await page.locator('#site-nav').isVisible()), 'tapping outside closes menu');
  await page.context().close();
}

async function testResponsive() {
  console.log('\nResponsive layout (no horizontal scrolling, tap targets)');
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    const page = await newPage(viewport);
    for (const path of PAGES.concat('/404.html')) {
      await page.goto(BASE + path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `${name} ${viewport.width}px ${path}: no horizontal overflow`);
      if (name === 'mobile') {
        const small = await page.$$eval('main .btn, main button, .site-header button', (els) =>
          els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()));
        check(small.length === 0, `${name} ${path}: buttons at least 44px tall ${small.join(', ')}`);
      }
      if (shots) await page.screenshot({ path: `${shots}/${name}${path.replace(/\//g, '_') || '_'}.png`, fullPage: true });
    }
    await page.context().close();
  }
}

async function testFormValidation() {
  console.log('\nContact form validation');
  const page = await newPage();
  await page.goto(BASE + '/contact/');
  await page.getByRole('button', { name: 'Send message' }).click();
  check((await page.locator('#cf-name').getAttribute('aria-invalid')) === 'true', 'empty name flagged');
  check((await page.locator('#cf-email').getAttribute('aria-invalid')) === 'true', 'empty email flagged');
  check((await page.locator('#cf-message').getAttribute('aria-invalid')) === 'true', 'empty message flagged');
  check(await page.evaluate(() => document.activeElement.id === 'cf-name'), 'focus moves to first invalid field');
  check((await page.locator('#cf-name').getAttribute('aria-describedby')) === 'cf-name-error', 'error linked via aria-describedby');
  await page.fill('#cf-name', 'Sam Taylor');
  await page.fill('#cf-email', 'not-an-email');
  await page.fill('#cf-message', 'Hello');
  await page.getByRole('button', { name: 'Send message' }).click();
  check((await page.locator('#cf-name').getAttribute('aria-invalid')) === null, 'error clears once name is filled');
  check((await page.locator('#cf-email-error').textContent()).includes('valid email'), 'invalid email rejected with message');
  for (const id of ['cf-name', 'cf-email', 'cf-phone', 'cf-service', 'cf-message']) {
    check((await page.locator(`label[for="${id}"]`).count()) === 1, `#${id} has a label`);
  }
  await page.context().close();
}

async function testFormMailto() {
  console.log('\nContact form: email-app mode (no endpoint configured)');
  const page = await newPage();
  await page.goto(BASE + '/contact/');
  const target = page.waitForEvent('request', (r) => r.url().startsWith('mailto:'), { timeout: 3000 }).catch(() => null);
  const navFailed = page.waitForEvent('framenavigated', { timeout: 3000 }).catch(() => null);
  await page.fill('#cf-name', 'Sam Taylor');
  await page.fill('#cf-email', 'sam@example.com');
  await page.fill('#cf-phone', '07700 900123');
  await page.selectOption('#cf-service', site.services[1].name);
  await page.fill('#cf-message', 'Do you have space on Saturday morning?');
  await page.getByRole('button', { name: 'Send message' }).click();
  const req = await target;
  await navFailed;
  const url = req ? req.url() : null;
  check(url && url.startsWith(`mailto:${site.email}?`), `opens mail app addressed to ${site.email}`);
  if (url) {
    const body = decodeURIComponent(url.split('&body=')[1] || '');
    check(body.includes('Sam Taylor') && body.includes('sam@example.com') && body.includes('07700 900123') && body.includes(site.services[1].name) && body.includes('Saturday morning'), 'email body contains every field');
  }
  const status = await page.locator('.form-status').textContent();
  check(status.includes('email app'), 'visitor is told to press send in their email app');
  await page.context().close();
}

async function testFormEndpoint() {
  console.log('\nContact form: endpoint mode (Formspree-compatible)');
  const page = await newPage();
  let received = null;
  let respond = 200;
  await page.route(TEST_ENDPOINT, async (route) => {
    received = { method: route.request().method(), headers: route.request().headers(), body: JSON.parse(route.request().postData()) };
    await new Promise((r) => setTimeout(r, 200));
    await route.fulfill({ status: respond, contentType: 'application/json', body: respond === 200 ? '{"ok":true}' : '{"error":"x"}' });
  });
  await page.goto(BASE_EP + '/contact/');
  check((await page.getAttribute('#contact-form', 'action')) === TEST_ENDPOINT, 'no-JS fallback posts straight to endpoint');
  await page.fill('#cf-name', 'Sam Taylor');
  await page.fill('#cf-email', 'sam@example.com');
  await page.fill('#cf-message', 'Do you do beard trims on Sundays?');
  await page.getByRole('button', { name: 'Send message' }).click();
  check(await page.getByRole('button', { name: 'Sending…' }).isDisabled(), 'button disabled while sending');
  await page.locator('.form-status.is-success').waitFor();
  check(received?.method === 'POST' && received.headers['content-type'] === 'application/json', 'POSTs JSON to the endpoint');
  check(received?.body.name === 'Sam Taylor' && received.body.email === 'sam@example.com' && received.body.message.includes('beard trims'), 'submitted data is correct');
  check((await page.locator('.form-status').textContent()).includes('has been sent'), 'success message shown');
  check((await page.inputValue('#cf-name')) === '', 'form cleared after success');
  check(await page.getByRole('button', { name: 'Send message' }).isEnabled(), 'button re-enabled');

  respond = 500;
  await page.fill('#cf-name', 'Sam Taylor');
  await page.fill('#cf-email', 'sam@example.com');
  await page.fill('#cf-message', 'Second message');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.locator('.form-status.is-error').waitFor();
  check((await page.locator('.form-status').textContent()).includes(site.email), 'server error shows message with email fallback');
  check((await page.inputValue('#cf-message')) === 'Second message', 'message kept after failed send');

  received = null;
  respond = 200;
  await page.reload();
  await page.fill('#cf-name', 'Bot');
  await page.fill('#cf-email', 'bot@example.com');
  await page.fill('#cf-message', 'spam');
  await page.evaluate(() => (document.getElementById('cf-company').value = 'spam co'));
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.waitForTimeout(400);
  check(received === null, 'spam honeypot blocks submission');
  await page.context().close();
}

async function test404() {
  console.log('\n404 page');
  const page = await newPage();
  const res = await page.goto(BASE + '/no-such-page');
  check(res.status() === 404, 'unknown URL returns 404 status');
  check((await page.locator('h1').textContent()) === 'Page not found', '404 page rendered');
  check((await page.getAttribute('meta[name="robots"]', 'content')) === 'noindex', '404 page is noindex');
  await page.getByRole('link', { name: 'Go to the home page' }).click();
  await page.waitForURL(BASE + '/');
  check(true, '404 "Go to the home page" works');
  const redirect = await page.request.get(BASE + '/services', { maxRedirects: 0 });
  check(redirect.status() === 301 && redirect.headers().location === '/services/', '/services redirects to /services/');
  await page.context().close();
}
