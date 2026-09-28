import { esc, telHref } from '../lib.mjs';
import { icons } from './icons.mjs';

export const navItems = [
  { href: '/', label: 'Home' },
  { href: '/services/', label: 'Services & Prices' },
  { href: '/contact/', label: 'Contact & Visit' },
];

export function header(site, currentPath) {
  const links = navItems
    .map(
      (item) =>
        `<li><a href="${item.href}"${item.href === currentPath ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`,
    )
    .join('');

  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">${logo()}<span>${esc(site.name)}</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="nav-toggle-open">${icons.menu}</span><span class="nav-toggle-close">${icons.close}</span>
      <span class="visually-hidden">Menu</span>
    </button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <ul>${links}</ul>
      <a class="btn btn-primary btn-sm" href="${telHref(site)}">${icons.phone}<span>Call ${esc(site.phone.display)}</span></a>
    </nav>
  </div>
</header>`;
}

export const logo = () =>
  `<svg class="logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="7" fill="#c8a165"/><path d="M10 6v20M22 6v20M10 16h12" stroke="#16181c" stroke-width="3" stroke-linecap="round"/></svg>`;
