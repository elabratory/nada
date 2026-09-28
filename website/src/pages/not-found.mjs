import { esc, telHref } from '../lib.mjs';
import { icons } from '../components/icons.mjs';

export const meta = () => ({
  path: '/404.html',
  title: 'Page not found',
  description: 'The page you were looking for could not be found.',
  noindex: true,
});

export function render(site) {
  return `<section class="page-hero page-hero-tall">
  <div class="container">
    <h1>Page not found</h1>
    <p class="hero-lead">That page doesn't exist or has moved.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="/">${icons.arrow}<span>Go to the home page</span></a>
      <a class="btn btn-outline" href="${telHref(site)}">${icons.phone}<span>Call ${esc(site.phone.display)}</span></a>
    </div>
  </div>
</section>`;
}
