import { esc, telHref, mailHref, mapsHref, fullAddress } from '../lib.mjs';
import { navItems, logo } from './header.mjs';
import { hoursTable } from './blocks.mjs';

export function footer(site) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand" href="/">${logo()}<span>${esc(site.name)}</span></a>
      <p class="muted">${esc(site.tagline)}</p>
    </div>
    <div>
      <h2 class="footer-heading">Get in touch</h2>
      <ul class="footer-list">
        <li><a href="${telHref(site)}">${esc(site.phone.display)}</a></li>
        <li><a href="${mailHref(site)}">${esc(site.email)}</a></li>
        <li><a href="${mapsHref(site)}" target="_blank" rel="noopener">${esc(fullAddress(site))}</a></li>
      </ul>
    </div>
    <div>
      <h2 class="footer-heading">Opening hours</h2>
      ${hoursTable(site, { compact: true })}
    </div>
    <div>
      <h2 class="footer-heading">Pages</h2>
      <ul class="footer-list">
        ${navItems.map((i) => `<li><a href="${i.href}">${esc(i.label)}</a></li>`).join('')}
        <li><a href="/privacy/">Privacy policy</a></li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; ${year} ${esc(site.name)}. All rights reserved.</p>
  </div>
</footer>`;
}
