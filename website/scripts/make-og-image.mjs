// Renders src/assets/og-image.png (1200x630 social sharing image) from site.config.json.
// Run after changing the business name: `node scripts/make-og-image.mjs` (needs the playwright devDependency).
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const site = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<body style="margin:0;width:1200px;height:630px;background:#16181c;color:#fff;font-family:Georgia,serif;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;background-image:repeating-linear-gradient(-45deg,rgba(200,161,101,.08) 0 18px,transparent 18px 36px)">
<p style="font:600 26px system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#c8a165;margin:0 0 20px">${esc(site.businessType)} · ${esc(site.address.locality)}</p>
<h1 style="font-size:86px;line-height:1.05;margin:0 0 28px">${esc(site.name)}</h1>
<p style="font:32px system-ui,sans-serif;color:#d9d4ca;margin:0">${esc(site.phone.display)} · ${esc(site.address.street)}</p></body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: new URL('../src/assets/og-image.png', import.meta.url).pathname });
await browser.close();
console.log('Wrote src/assets/og-image.png');
