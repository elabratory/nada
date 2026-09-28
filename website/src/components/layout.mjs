import { esc } from '../lib.mjs';
import { header } from './header.mjs';
import { footer } from './footer.mjs';
import { localBusinessSchema } from './schema.mjs';

// Wraps page content in the full HTML document with SEO metadata.
export function layout(site, page, content) {
  const url = new URL(page.path, site.siteUrl).href;
  const title = page.path === '/' ? `${site.name} | ${site.businessType} in ${site.address.locality}` : `${page.title} | ${site.name}`;
  const robots = page.noindex ? '<meta name="robots" content="noindex">' : '';

  return `<!doctype html>
<html lang="${esc(site.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
${robots}
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#16181c">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(new URL('/og-image.png', site.siteUrl).href)}">
<meta property="og:locale" content="${esc(site.locale.replace('-', '_'))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify(localBusinessSchema(site)).replace(/</g, '\\u003c')}</script>
<script src="/main.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${header(site, page.path)}
<main id="main">
${content}
</main>
${footer(site)}
</body>
</html>
`;
}
