import { esc, telHref, mapsHref, fullAddress, hoursText, price } from '../lib.mjs';
import { icons } from './icons.mjs';

// Weekly opening hours. The row for today is highlighted by main.js.
export function hoursTable(site, { compact = false } = {}) {
  const rows = site.hours
    .map(
      (h) =>
        `<tr data-day="${esc(h.day)}"><th scope="row">${esc(compact ? h.day.slice(0, 3) : h.day)}</th><td>${esc(hoursText(h))}</td></tr>`,
    )
    .join('');
  return `<table class="hours${compact ? ' hours-compact' : ''}"><caption class="visually-hidden">Opening hours</caption><tbody>${rows}</tbody></table>`;
}

// Live "open now / closed" badge, filled in by main.js using the shop's time zone.
export function openStatus(site) {
  const data = esc(JSON.stringify(site.hours));
  return `<p class="open-status" data-hours="${data}" data-tz="${esc(site.timeZone)}" aria-live="polite"></p>`;
}

export function serviceList(site, { limit } = {}) {
  const items = (limit ? site.services.slice(0, limit) : site.services)
    .map(
      (s) => `<li class="service">
  <div class="service-head">
    <h3>${esc(s.name)}</h3>
    <span class="service-dots" aria-hidden="true"></span>
    <p class="service-price">${esc(price(site, s.price))}</p>
  </div>
  <p class="service-meta">${esc(s.duration)} minutes</p>
  <p class="service-desc">${esc(s.description)}</p>
</li>`,
    )
    .join('');
  return `<ul class="service-list">${items}</ul>`;
}

export function visitCta(site) {
  return `<section class="section cta-band" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <div>
      <h2 id="cta-title">Ready for a fresh cut?</h2>
      <p>Call to book a time, or walk in during opening hours.</p>
    </div>
    <div class="btn-row">
      <a class="btn btn-primary" href="${telHref(site)}">${icons.phone}<span>Call ${esc(site.phone.display)}</span></a>
      <a class="btn btn-outline" href="${mapsHref(site)}" target="_blank" rel="noopener">${icons.pin}<span>Get directions</span></a>
    </div>
  </div>
</section>`;
}

export const addressBlock = (site) =>
  `<address>${esc(site.address.street)}<br>${esc(site.address.locality)} ${esc(site.address.postalCode)}<br>${esc(site.address.countryName)}</address>`;

export { fullAddress };
