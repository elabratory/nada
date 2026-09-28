import { mapsHref } from '../lib.mjs';

// schema.org LocalBusiness data so search engines can show hours, phone and address.
export function localBusinessSchema(site) {
  return {
    '@context': 'https://schema.org',
    '@type': site.schemaType,
    name: site.name,
    description: site.description,
    url: site.siteUrl,
    telephone: site.phone.e164,
    email: site.email,
    image: new URL('/og-image.png', site.siteUrl).href,
    hasMap: mapsHref(site),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    openingHoursSpecification: site.hours
      .filter((h) => !h.closed)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${h.day}`,
        opens: h.open,
        closes: h.close,
      })),
    makesOffer: site.services.map((s) => ({
      '@type': 'Offer',
      price: s.price.toFixed(2),
      priceCurrency: site.currency,
      itemOffered: { '@type': 'Service', name: s.name, description: s.description },
    })),
  };
}
