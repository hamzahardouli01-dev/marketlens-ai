/**
 * CarListing Lens — DOM Extractor
 *
 * Layered extraction from Facebook Marketplace vehicle listings.
 * Strategy order:
 *   1. Structured data / ARIA labels
 *   2. data-* attributes
 *   3. Semantic proximity (heading → sibling text)
 *   4. Narrowly scoped text patterns
 *
 * Never invents data. Returns null / 'Not mentioned' for absent fields.
 */

import type {
  ListingData,
  PriceInfo,
  MileageInfo,
  Currency,
  PriceType,
  MileageUnit,
} from '../types/listing';
import { detectPhrases } from './highlighter';
import { generateQuestions } from '../utils/questions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getText(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function normUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove query params except those that are listing-identity relevant
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

/** Extract the Facebook Marketplace listing ID from the URL */
function extractListingId(url: string): string | null {
  const m = url.match(/\/marketplace\/item\/(\d+)/i);
  return m ? m[1] : null;
}

// ─── Price Parsing ────────────────────────────────────────────────────────────

const PAYMENT_AMBIGUITY_PATTERNS = [
  /down\s*pay/i,
  /monthly\s*pay/i,
  /per\s*month/i,
  /\/mo/i,
  /deposit/i,
  /financi/i,
  /acompte/i,           // French: down payment
  /versement\s*mensuel/i, // French: monthly payment
  /mise\s*de\s*fonds/i, // French: down payment
];

function detectPriceType(context: string): PriceType {
  for (const pat of PAYMENT_AMBIGUITY_PATTERNS) {
    if (pat.test(context)) {
      if (/deposit/i.test(context)) return 'deposit';
      if (/down\s*pay|acompte|mise\s*de\s*fonds/i.test(context)) return 'down_payment';
      if (/monthly|per\s*month|\/mo|mensuel/i.test(context)) return 'monthly';
      return 'unclear';
    }
  }
  return 'asking';
}

function detectCurrency(raw: string, context: string): Currency {
  if (/CAD|\bC\$|canadian/i.test(raw + ' ' + context)) return 'CAD';
  if (/USD|\bUS\$|american/i.test(raw + ' ' + context)) return 'USD';
  // Do NOT infer currency from a bare "$" sign
  return 'unknown';
}

function parseNumericPrice(text: string): number | null {
  const m = text.replace(/,/g, '').match(/[\d]+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isFinite(n) ? n : null;
}

function extractPrice(doc: Document): PriceInfo {
  // Strategy 1: aria-label on price element
  const priceSelectors = [
    '[data-testid="listing-price"]',
    '[aria-label*="price" i]',
    '[aria-label*="prix" i]',
  ];

  for (const sel of priceSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const raw = getText(el);
      if (raw) {
        const ctx = el.closest('[role="main"]')?.textContent ?? raw;
        const type = detectPriceType(ctx.slice(0, 300));
        return {
          raw,
          value: parseNumericPrice(raw),
          currency: detectCurrency(raw, ctx.slice(0, 300)),
          type,
          excerpt: raw,
        };
      }
    }
  }

  // Strategy 2: look for price-like text in the listing boundary
  const boundary = getListingBoundary(doc);
  if (boundary) {
    // Find spans/divs that contain a currency-amount pattern
    const walker = document.createTreeWalker(boundary, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const t = node.textContent?.trim() ?? '';
      if (/^\$[\d,]+(\.\d{2})?$/.test(t) || /[\d,]+\s*(CAD|USD|C\$|US\$)/i.test(t)) {
        const parentText = node.parentElement?.closest('div')?.textContent ?? t;
        const type = detectPriceType(parentText);
        if (type === 'unclear') {
          return {
            raw: t,
            value: parseNumericPrice(t),
            currency: detectCurrency(t, parentText),
            type: 'unclear',
            excerpt: parentText.slice(0, 200),
          };
        }
        return {
          raw: t,
          value: parseNumericPrice(t),
          currency: detectCurrency(t, parentText),
          type,
          excerpt: t,
        };
      }
    }
  }

  return {
    raw: '',
    value: null,
    currency: 'unknown',
    type: 'not_found',
    excerpt: '',
  };
}

// ─── Listing Boundary ─────────────────────────────────────────────────────────

/**
 * Attempts to find the DOM subtree that contains the listing.
 * FB Marketplace uses a scrollable column for listing details.
 * We look for the element containing the listing title to bound extraction.
 */
function getListingBoundary(doc: Document): Element | null {
  // Try main content landmark
  const main = doc.querySelector('[role="main"]');
  if (main) return main;
  return doc.body;
}

// ─── Field Extractors ─────────────────────────────────────────────────────────

function extractTitle(doc: Document): string | null {
  // Facebook sets the page title to the listing title
  const h1 = doc.querySelector('h1');
  if (h1) {
    const t = getText(h1);
    if (t.length > 2) return t;
  }
  // Fallback: document title (strip site name)
  const title = document.title.replace(/\s*[\|·-]?\s*Facebook.*$/i, '').trim();
  return title.length > 2 ? title : null;
}

function extractLocation(doc: Document): string | null {
  // ARIA label strategies
  const locationSelectors = [
    '[aria-label*="location" i]',
    '[aria-label*="emplacement" i]',
    '[data-testid="listing-location"]',
  ];
  for (const sel of locationSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const t = getText(el);
      if (t) return t;
    }
  }

  // Pattern: "Location" or "Emplacement" label followed by text
  const boundary = getListingBoundary(doc);
  if (!boundary) return null;
  const spans = boundary.querySelectorAll('span, div');
  for (const span of spans) {
    const t = getText(span);
    if (/^location$/i.test(t) || /^emplacement$/i.test(t)) {
      const next = span.nextElementSibling;
      if (next) return getText(next);
    }
  }
  return null;
}

const KNOWN_MAKES = [
  'acura','audi','bmw','buick','cadillac','chevrolet','chevy','chrysler',
  'dodge','fiat','ford','gmc','honda','hyundai','infiniti','jeep','kia',
  'land rover','lexus','lincoln','mazda','mercedes','mini','mitsubishi',
  'nissan','pontiac','porsche','ram','saturn','subaru','tesla','toyota',
  'volkswagen','vw','volvo',
];

function extractYearMakeModel(title: string | null, description: string | null): {
  year: number | null; make: string | null; model: string | null;
} {
  const text = [title ?? '', description?.slice(0, 300) ?? ''].join(' ');

  // Year: 4-digit number in 1900–2030 range
  const yearMatch = text.match(/\b(19[5-9]\d|20[0-2]\d|203[0])\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Make: known makes list
  let make: string | null = null;
  let makeIdx = -1;
  const textLower = text.toLowerCase();
  for (const m of KNOWN_MAKES) {
    const idx = textLower.indexOf(m);
    if (idx !== -1) {
      // Prefer makes closer to the year mention
      if (make === null || (year && Math.abs(idx - (yearMatch?.index ?? 0)) < Math.abs(makeIdx - (yearMatch?.index ?? 0)))) {
        make = m.charAt(0).toUpperCase() + m.slice(1);
        makeIdx = idx;
      }
    }
  }

  // Model: word(s) after the make
  let model: string | null = null;
  if (make && makeIdx !== -1) {
    const afterMake = text.slice(makeIdx + make.length).trim();
    const modelMatch = afterMake.match(/^[\s]*([A-Za-z0-9][\w\-]*)(?:\s+([A-Za-z0-9][\w\-]*))?/);
    if (modelMatch) {
      const candidate = [modelMatch[1], modelMatch[2]].filter(Boolean).join(' ');
      // Exclude common non-model words
      if (!/^(for|sale|with|and|the|un|une|à|de)$/i.test(candidate)) {
        model = candidate;
      }
    }
  }

  return { year, make, model };
}

function extractMileage(doc: Document, description: string | null): MileageInfo {
  const boundary = getListingBoundary(doc);
  const fullText = [
    getText(boundary ?? doc.body),
    description ?? '',
  ].join(' ');

  // Pattern: 123,456 km / 123456km / 123,456 miles / 123K km / French 65 000 km
  const patterns: Array<{ re: RegExp; unit: MileageUnit }> = [
    // French-style: "65 000 km" (space as thousands separator)
    { re: /\b(\d{1,3}(?:\s\d{3})+)\s*km\b/i, unit: 'km' },
    { re: /\b(\d{1,3}(?:\s\d{3})+)\s*(?:miles?|mi)\b/i, unit: 'mi' },
    // Standard comma-formatted
    { re: /\b([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\s*k(?:m|ilom[eè]tres?)\b/i, unit: 'km' },
    { re: /\b([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:miles?|mi)\b/i, unit: 'mi' },
    // K-shorthand
    { re: /\b([\d]+[kK])\s*km\b/, unit: 'km' },
    { re: /\b([\d]+[kK])\s*mi\b/, unit: 'mi' },
  ];

  for (const { re, unit } of patterns) {
    const m = fullText.match(re);
    if (m) {
      const raw = m[0].trim();
      const numStr = m[1].replace(/,/g, '').replace(/[kK]$/, '000');
      const value = parseFloat(numStr);
      return { raw, value: isFinite(value) ? value : null, unit };
    }
  }

  return { raw: '', value: null, unit: 'unknown' };
}

function extractTransmission(text: string): string | null {
  if (/\bautomatic\b|\bauto\b|\bat\b(?:\s|$)/i.test(text)) return 'Automatic';
  if (/\bmanual\b|\bstandard\b|\bmt\b(?:\s|$)|\b6-speed\b|\b5-speed\b/i.test(text)) return 'Manual';
  if (/\bcvt\b/i.test(text)) return 'CVT';
  // French
  if (/\bautomatique\b/i.test(text)) return 'Automatic';
  if (/\bmanuelle\b/i.test(text)) return 'Manual';
  return null;
}

function extractFuelType(text: string): string | null {
  if (/\bgasoline\b|\bgas\b|\bessence\b/i.test(text)) return 'Gasoline';
  if (/\bdiesel\b/i.test(text)) return 'Diesel';
  if (/\bhybrid\b|\bhybride\b/i.test(text)) return 'Hybrid';
  if (/\belectric\b|\belectrique\b|\bélectrique\b|\bev\b/i.test(text)) return 'Electric';
  if (/\bplug.in\b|\bphev\b/i.test(text)) return 'Plug-in Hybrid';
  return null;
}

function extractCondition(text: string): string | null {
  if (/\bsalvage\b|\bépave\b/i.test(text)) return 'Salvage title';
  if (/\brebuilt\b|\breconstruit/i.test(text)) return 'Rebuilt title';
  if (/\bfor\s*parts\b|\bpour\s*pièces\b/i.test(text)) return 'For parts';
  if (/\bclean\s*title\b|\btitre\s*propre\b/i.test(text)) return 'Clean title';
  return null;
}

function extractDescription(doc: Document): string | null {
  // Look for a seller-description section
  const descSelectors = [
    '[data-testid="listing-description"]',
    '[aria-label*="description" i]',
  ];
  for (const sel of descSelectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const t = getText(el);
      if (t.length > 10) return t;
    }
  }

  // Heuristic: find the longest text block inside listing boundary
  // that isn't the title (>100 chars)
  const boundary = getListingBoundary(doc);
  if (!boundary) return null;
  const candidates = boundary.querySelectorAll('span[dir="auto"], div[dir="auto"]');
  let longest = '';
  for (const el of candidates) {
    const t = getText(el);
    if (t.length > longest.length && t.length > 50) {
      longest = t;
    }
  }
  return longest.length > 50 ? longest : null;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────

export function extractListing(): ListingData {
  const url = normUrl(window.location.href);
  const listingId = extractListingId(url);
  const title = extractTitle(document);
  const description = extractDescription(document);

  const fullText = [title ?? '', description ?? ''].join(' ');
  const { year, make, model } = extractYearMakeModel(title, description);

  const price = extractPrice(document);
  const mileage = extractMileage(document, description);
  const transmission = extractTransmission(fullText);
  const fuelType = extractFuelType(fullText);
  const location = extractLocation(document);
  const condition = extractCondition(fullText);

  const flaggedPhrases = detectPhrases(fullText);
  const suggestedQuestions = generateQuestions({
    mileage,
    price,
    transmission,
    fuelType,
    description,
    condition,
    flaggedPhrases,
  });

  return {
    listingId,
    url,
    title,
    price,
    year,
    make,
    model,
    mileage,
    transmission,
    fuelType,
    location,
    condition,
    description,
    extractedAt: Date.now(),
    isManual: false,
    flaggedPhrases,
    suggestedQuestions,
  };
}
