// Builds the static site into dist/. No dependencies: `node scripts/build.mjs`.
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../src/components/layout.mjs';
import * as home from '../src/pages/home.mjs';
import * as services from '../src/pages/services.mjs';
import * as contact from '../src/pages/contact.mjs';
import * as privacy from '../src/pages/privacy.mjs';
import * as notFound from '../src/pages/not-found.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// OUT_DIR and FORM_ENDPOINT overrides exist for the test suite.
const out = process.env.OUT_DIR ? join(root, process.env.OUT_DIR) : join(root, 'dist');
const site = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
if (process.env.FORM_ENDPOINT) site.form.endpoint = process.env.FORM_ENDPOINT;

validateConfig(site);

const pages = [home, services, contact, privacy, notFound];

await rm(out, { recursive: true, force: true });

for (const page of pages) {
  const meta = page.meta(site);
  const html = layout(site, meta, page.render(site));
  checkNoPlaceholders(html, meta.path);
  const file = meta.path.endsWith('.html') ? meta.path : join(meta.path, 'index.html');
  await write(file, html);
}

const css = await readFile(join(root, 'src/assets/styles.css'), 'utf8');
await write('styles.css', minifyCss(css));
await write('main.js', await readFile(join(root, 'src/assets/main.js'), 'utf8'));
await copyFile(join(root, 'src/assets/favicon.svg'), join(out, 'favicon.svg'));
await copyFile(join(root, 'src/assets/og-image.png'), join(out, 'og-image.png'));

const indexable = pages.map((p) => p.meta(site)).filter((m) => !m.noindex);
await write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((m) => `  <url><loc>${new URL(m.path, site.siteUrl).href}</loc></url>`).join('\n')}
</urlset>
`,
);
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site.siteUrl).href}\n`);

console.log(`Built ${pages.length} pages into ${out}`);
if (!site.form.endpoint) {
  console.log('Note: form.endpoint is empty, so the contact form will open the visitor\'s email app.');
}

async function write(rel, content) {
  const file = join(out, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

function minifyCss(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function validateConfig(s) {
  const required = ['name', 'businessType', 'siteUrl', 'email', 'phone.display', 'phone.e164', 'address.street', 'address.locality', 'mapsQuery'];
  const get = (path) => path.split('.').reduce((o, k) => o?.[k], s);
  const missing = required.filter((k) => !get(k));
  if (missing.length) fail(`site.config.json is missing: ${missing.join(', ')}`);
  if (!/^\+\d{7,15}$/.test(s.phone.e164)) fail('phone.e164 must look like +441234567890');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) fail('email is not a valid address');
  if (s.hours.length !== 7) fail('hours must list all 7 days');
  if (!s.services.length) fail('services must not be empty');
  if (s.form.endpoint && !/^https:\/\//.test(s.form.endpoint)) fail('form.endpoint must be an https:// URL');
}

// Stop the build if template text or dummy copy slipped into a page.
function checkNoPlaceholders(html, path) {
  const bad = html.match(/\[(BUSINESS|LOCATION|PHONE|EMAIL|SERVICES|HOURS)[^\]]*\]|lorem ipsum|coming soon|\bTODO\b|\bTBD\b|\{\{|undefined|NaN/i);
  if (bad) fail(`${path} contains "${bad[0]}"`);
}

function fail(msg) {
  console.error(`Build failed: ${msg}`);
  process.exit(1);
}
