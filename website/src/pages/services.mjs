import { esc, price } from '../lib.mjs';
import { serviceList, visitCta } from '../components/blocks.mjs';

export const meta = (site) => {
  const from = Math.min(...site.services.map((s) => s.price));
  return {
    path: '/services/',
    title: 'Services & Prices',
    description: `Full price list for ${site.name} in ${site.address.locality}: ${site.services
      .map((s) => s.name)
      .join(', ')}. Prices from ${price(site, from)}.`,
  };
};

export function render(site) {
  return `<section class="page-hero">
  <div class="container">
    <h1>Services &amp; prices</h1>
    <p class="hero-lead">Every service at ${esc(site.name)}, with prices and how long it takes.</p>
  </div>
</section>

<section class="section" aria-label="Price list">
  <div class="container narrow">
    ${serviceList(site)}
    <p class="muted small">Prices in ${esc(site.currency)}. Times are approximate.</p>
  </div>
</section>

${visitCta(site)}`;
}
