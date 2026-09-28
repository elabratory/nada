import { esc, mailHref, telHref, fullAddress } from '../lib.mjs';

export const meta = (site) => ({
  path: '/privacy/',
  title: 'Privacy Policy',
  description: `How ${site.name} handles the personal information you give us through this website.`,
});

export function render(site) {
  const formProcessor = site.form.endpoint
    ? `<p>Messages sent through the form are delivered to us by our form-handling provider (${esc(new URL(site.form.endpoint).hostname)}), which stores them on our behalf so they can be forwarded to our inbox.</p>`
    : `<p>The contact form does not store anything on this website. It opens your own email app with your message filled in, and nothing is sent until you press send in that app.</p>`;

  return `<section class="page-hero">
  <div class="container">
    <h1>Privacy policy</h1>
  </div>
</section>

<section class="section">
  <div class="container narrow prose">
    <h2>Who we are</h2>
    <p>${esc(site.name)}, ${esc(fullAddress(site))}. You can contact us about this policy at <a href="${mailHref(site, 'Privacy question')}">${esc(site.email)}</a> or on <a href="${telHref(site)}">${esc(site.phone.display)}</a>.</p>

    <h2>What we collect</h2>
    <p>If you use the contact form we receive your name, email address, and anything else you choose to include (phone number, service, message). We use this only to reply to your enquiry and to manage any booking you make.</p>
    ${formProcessor}

    <h2>How long we keep it</h2>
    <p>We keep enquiries for as long as needed to deal with them, and delete them within 12 months unless you are an ongoing customer.</p>

    <h2>Cookies and third parties</h2>
    <p>This website does not set cookies and does not use analytics or advertising trackers. The map on our contact page is provided by Google Maps. When that map loads, Google may set its own cookies and receive your IP address under <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google's privacy policy</a>.</p>

    <h2>Your rights</h2>
    <p>You can ask us for a copy of the information we hold about you, or ask us to correct or delete it, by emailing <a href="${mailHref(site, 'Data request')}">${esc(site.email)}</a>. If you are unhappy with how we handle your data you can complain to the Information Commissioner's Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk</a>.</p>
  </div>
</section>`;
}
