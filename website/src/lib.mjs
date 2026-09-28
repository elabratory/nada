// Shared helpers used by components and pages.

export const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const telHref = (site) => `tel:${site.phone.e164}`;
export const mailHref = (site, subject) =>
  `mailto:${site.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
export const mapsHref = (site) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.mapsQuery)}`;
export const mapsEmbedSrc = (site) =>
  `https://www.google.com/maps?q=${encodeURIComponent(site.mapsQuery)}&output=embed`;

export const fullAddress = (site) =>
  `${site.address.street}, ${site.address.locality} ${site.address.postalCode}`;

export const price = (site, amount) =>
  new Intl.NumberFormat(site.locale, {
    style: 'currency',
    currency: site.currency,
    minimumFractionDigits: 0,
  }).format(amount);

// "09:00" -> "9am", "19:30" -> "7:30pm"
export const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
};

export const hoursText = (entry) =>
  entry.closed ? 'Closed' : `${time12(entry.open)} – ${time12(entry.close)}`;
