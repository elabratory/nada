# Barber shop website

A static, dependency-free website for a local barber shop: Home, Services & Prices, Contact & Visit, Privacy Policy and a 404 page.

> **The business details in `site.config.json` are TEST DATA** ("Harbour & Hale Barbers"). The phone number is from Ofcom's reserved drama range and the email and domain use the reserved `.example` TLD. Replace everything in that file with the client's real details before launch (see the checklist below).

## How it works

- `site.config.json` is the single source of truth for the name, phone, email, address, hours, services and form endpoint. Every page, link, the structured data for search engines, the sitemap and the footer are generated from it.
- `src/components/` holds the shared parts (layout with SEO tags, header, footer, hours table, service list and so on). `src/pages/` has one module per page.
- `scripts/build.mjs` renders plain HTML into `dist/`. It needs Node 18+ and **no npm packages**. The build fails if the config is invalid or if placeholder text (lorem ipsum, "coming soon", `[PHONE]`, etc.) ends up on a page.
- `src/assets/main.js` (about 7 KB, no framework) handles the mobile menu, the "Open now / Closed" badge (worked out in the shop's time zone), the highlighted row for today in the hours table, and the contact form.

## Commands

```bash
npm run build     # build into dist/
npm run preview   # serve dist/ at http://localhost:4173
npm install && npm test   # build, then run the 171 end-to-end browser checks (Playwright)
```

Playwright is a dev dependency used only for tests and for `scripts/make-og-image.mjs`. The deployed site has no dependencies.

## Contact form

The form has two modes, set by `form.endpoint` in `site.config.json`:

1. **Endpoint set (recommended):** create a free form at [Formspree](https://formspree.io), set its notification email to the client's inbox, and paste the form URL (`https://formspree.io/f/xxxxxxx`) into `form.endpoint`. Messages are then sent in the background, and the visitor sees a confirmation or an error message. Without JavaScript the form posts directly to Formspree. It includes a `_gotcha` honeypot field, which Formspree uses to block spam.
2. **Endpoint empty (current setting):** submitting opens the visitor's own email app with the message filled in and addressed to the shop. This works with no account, but only once the visitor presses send in their email app.

After changing the endpoint, rebuild. The privacy policy updates automatically to name the form provider.

## Deploying

This is a plain static site. Build command: `npm run build`. Output directory: `dist`.

- **Netlify / Vercel / Cloudflare Pages:** connect the repo, set the base directory to `website`, then use the build command and output directory above. All three serve `404.html` for unknown URLs.
- **Any other web host:** run `npm run build` and upload the contents of `dist/`.

Set `siteUrl` to the real domain before building. It is used for canonical URLs, the sitemap and social sharing previews.

## Pre-launch checklist

- [ ] Replace every value in `site.config.json` with the client's real details: name, business type, tagline, description, `siteUrl`, phone (display and `+44…` format), email, address, `mapsQuery`, hours, services and prices.
- [ ] Set `mapsQuery` to the business name and address exactly as it appears on its Google Business Profile, so "Get directions" opens the right listing.
- [ ] Rewrite the "What we do" cards in `src/pages/home.mjs` if the client's services differ.
- [ ] Update the monogram in `src/components/header.mjs` and `src/assets/favicon.svg` (currently an "H"), or swap in the client's logo.
- [ ] Run `node scripts/make-og-image.mjs` to regenerate the social sharing image with the real name.
- [ ] Set up the form endpoint (see above) and send a test message to confirm the client receives it.
- [ ] Have the client confirm the privacy policy wording, especially the 12-month retention period in `src/pages/privacy.mjs`.
- [ ] Run `npm test`.

## Photos

There are no stock photos, because none could be licensed and downloaded in this build environment, and the design is complete without them. If the client provides their own photos (the shop, the team, finished cuts), put optimised WebP/JPEG files (under 200 KB, with `width`/`height` attributes and descriptive `alt` text) in `src/assets/`, copy them in `scripts/build.mjs` next to `favicon.svg`, and add them to the hero or a gallery section. Only use photos the client owns or has a licence for.
