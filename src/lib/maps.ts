/**
 * Links that open an address in the device's own maps app: Apple Maps on iPhone,
 * iPad and Mac, the default maps app on Android (a geo: link, which offers a choice
 * when several are installed), and Google Maps in the browser everywhere else.
 */
type MapsKind = 'ios' | 'mac' | 'android' | 'web';

function mapsKind(): MapsKind {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  // iPads ask for the desktop site, so they look like a Mac with a touch screen.
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? 'ios' : 'mac';
  return 'web';
}

export function mapsUrl(address: string, kind: MapsKind = mapsKind()) {
  const q = encodeURIComponent(address.replace(/\s+/g, ' ').trim());
  switch (kind) {
    // Apple's map links open the Maps app on iPhone and iPad.
    case 'ios': return `https://maps.apple.com/?q=${q}`;
    // On a Mac, maps: opens the Maps app from any browser (the browser asks first).
    case 'mac': return `maps://?q=${q}`;
    case 'android': return `geo:0,0?q=${q}`;
    default: return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
}

/** Props for an <a> that opens the address in maps: app links stay in the page, web links get a new tab. */
export function mapsLinkProps(address: string) {
  const href = mapsUrl(address);
  return href.startsWith('http') ? { href, target: '_blank', rel: 'noreferrer' } : { href };
}

/** Opens the address in maps, e.g. from a grid cell. */
export function openMaps(address: string) {
  const href = mapsUrl(address);
  if (href.startsWith('http')) window.open(href, '_blank', 'noopener');
  else window.location.href = href;
}
