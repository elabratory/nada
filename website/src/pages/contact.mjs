import { esc, telHref, mailHref, mapsHref, mapsEmbedSrc } from '../lib.mjs';
import { icons } from '../components/icons.mjs';
import { hoursTable, openStatus, addressBlock } from '../components/blocks.mjs';

export const meta = (site) => ({
  path: '/contact/',
  title: 'Contact & Visit',
  description: `Contact ${site.name}: call ${site.phone.display}, email ${site.email} or visit us at ${site.address.street}, ${site.address.locality}. Opening hours and directions.`,
});

export function render(site) {
  const serviceOptions = site.services
    .map((s) => `<option>${esc(s.name)}</option>`)
    .join('');

  return `<section class="page-hero">
  <div class="container">
    <h1>Contact &amp; visit</h1>
    <p class="hero-lead">Call to book, send us a message, or drop in during opening hours.</p>
  </div>
</section>

<section class="section">
  <div class="container contact-grid">
    <div class="contact-info">
      <h2 class="subhead">${icons.pin}<span>Address</span></h2>
      ${addressBlock(site)}
      <a class="btn btn-outline btn-sm" href="${mapsHref(site)}" target="_blank" rel="noopener">${icons.pin}<span>Get directions</span></a>

      <h2 class="subhead">${icons.phone}<span>Phone &amp; email</span></h2>
      <ul class="contact-lines">
        <li><a href="${telHref(site)}">${icons.phone}<span>${esc(site.phone.display)}</span></a></li>
        <li><a href="${mailHref(site)}">${icons.mail}<span>${esc(site.email)}</span></a></li>
      </ul>

      <h2 class="subhead">${icons.clock}<span>Opening hours</span></h2>
      ${openStatus(site)}
      ${hoursTable(site)}
    </div>

    <div class="form-card">
      <h2>Send a message</h2>
      <p class="muted">For bookings the quickest way is to <a href="${telHref(site)}">call ${esc(site.phone.display)}</a>. For anything else, fill in the form and we will reply by email.</p>
      <form id="contact-form" class="contact-form" method="post" action="${esc(site.form.endpoint || mailHref(site, 'Website enquiry'))}" data-endpoint="${esc(site.form.endpoint)}" data-email="${esc(site.email)}"${site.form.endpoint ? '' : ' enctype="text/plain"'} novalidate>
        <div class="field">
          <label for="cf-name">Name <span aria-hidden="true">*</span></label>
          <input id="cf-name" name="name" type="text" autocomplete="name" required maxlength="100">
          <p class="field-error" id="cf-name-error" hidden></p>
        </div>
        <div class="field">
          <label for="cf-email">Email <span aria-hidden="true">*</span></label>
          <input id="cf-email" name="email" type="email" autocomplete="email" required maxlength="200">
          <p class="field-error" id="cf-email-error" hidden></p>
        </div>
        <div class="field">
          <label for="cf-phone">Phone <span class="optional">(optional)</span></label>
          <input id="cf-phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
        </div>
        <div class="field">
          <label for="cf-service">Service <span class="optional">(optional)</span></label>
          <select id="cf-service" name="service">
            <option value="">Not sure / general enquiry</option>
            ${serviceOptions}
          </select>
        </div>
        <div class="field">
          <label for="cf-message">Message <span aria-hidden="true">*</span></label>
          <textarea id="cf-message" name="message" rows="5" required maxlength="2000"></textarea>
          <p class="field-error" id="cf-message-error" hidden></p>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="cf-company">Leave this field empty</label>
          <input id="cf-company" name="_gotcha" type="text" tabindex="-1" autocomplete="off">
        </div>
        <p class="small muted">Fields marked * are required. We only use your details to reply to you. See our <a href="/privacy/">privacy policy</a>.</p>
        <button class="btn btn-primary" type="submit">${icons.mail}<span>Send message</span></button>
        <p class="form-status" role="status" aria-live="polite" tabindex="-1"></p>
      </form>
    </div>
  </div>
</section>

<section class="section section-alt" aria-labelledby="map-title">
  <div class="container">
    <h2 id="map-title" class="section-title">Find us</h2>
    <div class="map-frame">
      <iframe title="Map showing ${esc(site.name)}" src="${esc(mapsEmbedSrc(site))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
    <p><a class="text-link" href="${mapsHref(site)}" target="_blank" rel="noopener">Open in Google Maps ${icons.arrow}</a></p>
  </div>
</section>`;
}
