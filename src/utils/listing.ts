/**
 * MarketLens AI — Listing identity & price helpers shared by the drawer,
 * analysis history and watchlist.
 */

export type ListingSite = 'facebook' | 'ebay' | 'craigslist' | 'offerup' | 'mercari' | 'poshmark' | 'other';

export function detectSite(url: string): ListingSite {
  const u = url.toLowerCase();
  if (u.includes('facebook.com')) return 'facebook';
  if (/ebay\.[a-z.]+/.test(u)) return 'ebay';
  if (u.includes('craigslist.org')) return 'craigslist';
  if (u.includes('offerup.com')) return 'offerup';
  if (u.includes('mercari.com')) return 'mercari';
  if (u.includes('poshmark.com')) return 'poshmark';
  return 'other';
}

export const SITE_LABELS: Record<ListingSite, string> = {
  facebook: 'Facebook Marketplace',
  ebay: 'eBay',
  craigslist: 'Craigslist',
  offerup: 'OfferUp',
  mercari: 'Mercari',
  poshmark: 'Poshmark',
  other: 'Web',
};

/**
 * Stable key for a listing, so the same item matches across URL variations
 * (tracking params, feed vs. direct links, trailing slashes).
 */
export function listingKey(url: string): string {
  if (!url) return '';

  const fb = url.match(/facebook\.com\/marketplace\/item\/(\d+)/i);
  if (fb) return `facebook:${fb[1]}`;

  const ebay = url.match(/ebay\.[a-z.]+\/itm\/(?:[^/?#]+\/)?(\d{6,})/i);
  if (ebay) return `ebay:${ebay[1]}`;

  const cl = url.match(/craigslist\.org\/.*?(\d{8,})\.html/i);
  if (cl) return `craigslist:${cl[1]}`;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.hostname.replace(/^www\./, '').toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/** Numeric value from a raw price string like "CA$1,250", "$680 · Negotiable" or "Free". */
export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).replace(/[   ]/g, ' ').trim();
  if (/^\s*(free|gratuit)\b/i.test(text)) return 0;

  const match = text.match(/\d[\d,. ]*/);
  if (!match) return null;

  let num = match[0].trim().replace(/ /g, '');
  // "1.234,56" (European) → "1234.56"; "1,234.56" → "1234.56"; "1,234" → "1234"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(num)) {
    num = num.replace(/\./g, '').replace(',', '.');
  } else {
    num = num.replace(/,/g, '');
  }

  const value = parseFloat(num);
  return isFinite(value) ? value : null;
}
