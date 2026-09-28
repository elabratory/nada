import { esc, telHref, mapsHref, mailHref } from '../lib.mjs';
import { icons } from '../components/icons.mjs';
import { hoursTable, openStatus, serviceList, visitCta, addressBlock } from '../components/blocks.mjs';

export const meta = (site) => ({
  path: '/',
  title: 'Home',
  description: site.description,
});

export function render(site) {
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="container hero-inner">
    <p class="eyebrow">${esc(site.businessType)} &middot; ${esc(site.address.locality)}</p>
    <h1 id="hero-title">${esc(site.name)}</h1>
    <p class="hero-lead">${esc(site.tagline)}</p>
    ${openStatus(site)}
    <div class="btn-row">
      <a class="btn btn-primary" href="${telHref(site)}">${icons.phone}<span>Call to book</span></a>
      <a class="btn btn-outline" href="/services/">${icons.scissors}<span>See services &amp; prices</span></a>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="offer-title">
  <div class="container">
    <h2 id="offer-title" class="section-title">What we do</h2>
    <ul class="feature-grid">
      <li class="feature">${icons.scissors}<h3>Haircuts &amp; fades</h3><p>Classic scissor cuts, skin fades and buzz cuts, finished with a neck shave and styling.</p></li>
      <li class="feature">${icons.razor}<h3>Beards &amp; shaves</h3><p>Beard trims, shape-ups and traditional hot towel shaves with a straight razor.</p></li>
      <li class="feature">${icons.user}<h3>Kids' cuts</h3><p>Haircuts for children under 12, any style.</p></li>
    </ul>
  </div>
</section>

<section class="section section-alt" aria-labelledby="prices-title">
  <div class="container">
    <div class="section-head">
      <h2 id="prices-title" class="section-title">Popular services</h2>
      <a class="text-link" href="/services/">Full price list ${icons.arrow}</a>
    </div>
    ${serviceList(site, { limit: 4 })}
  </div>
</section>

<section class="section" aria-labelledby="visit-title">
  <div class="container visit-grid">
    <div>
      <h2 id="visit-title" class="section-title">Visit the shop</h2>
      ${addressBlock(site)}
      <ul class="contact-lines">
        <li><a href="${telHref(site)}">${icons.phone}<span>${esc(site.phone.display)}</span></a></li>
        <li><a href="${mailHref(site)}">${icons.mail}<span>${esc(site.email)}</span></a></li>
        <li><a href="${mapsHref(site)}" target="_blank" rel="noopener">${icons.pin}<span>Open in Google Maps</span></a></li>
      </ul>
    </div>
    <div>
      <h3 class="subhead">${icons.clock}<span>Opening hours</span></h3>
      ${hoursTable(site)}
    </div>
  </div>
</section>

${visitCta(site)}`;
}
