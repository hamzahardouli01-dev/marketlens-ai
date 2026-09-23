/**
 * Extractor Unit Tests
 *
 * Tests extraction logic using synthetic fixtures.
 * These are NOT live Facebook listings — they are artificial test cases.
 */
import { describe, it, expect } from 'vitest';

// Import the pure functions we can test without a DOM
// (extractListing requires DOM, so we test subfunctions)

// Re-export internals for testing by extracting the regex/parse logic
// We test by calling detectPhrases and the price/mileage patterns.

import { detectPhrases } from '../src/content/highlighter';

// ── Price disambiguation fixtures (synthetic) ──────────────────────────────

const FIXTURE_FULL_PRICE = `
2018 Ford F-150 XLT
$28,500 CAD
Located in Calgary, AB. Clean title, one owner.
140,000 km. Automatic, V6 gasoline.
`;

const FIXTURE_DOWN_PAYMENT = `
2019 Kia Sorento
$1,500 down payment — $299/month
Financing available. Contact for details.
`;

const FIXTURE_PRICE_UNCLEAR = `
2015 Chevrolet Cruze
From $89/mo with approved credit.
Great condition, 95,000 km.
`;

const FIXTURE_SALVAGE = `
2016 Honda Civic — salvage title
Rebuilt after minor accident. Does not run currently.
75,000 km, manual transmission.
`;

const FIXTURE_FRENCH = `
2017 Mazda 3
65 000 km, transmission automatique, essence.
Vendu tel quel, acompte de 1000$ requis.
Ne démarre pas, moteur à vérifier.
`;

// ── Mileage patterns ──────────────────────────────────────────────────────

function parseMileage(text: string): { value: number | null; unit: string } {
  const patterns: Array<{ re: RegExp; unit: string }> = [
    // French-style space-separated thousands first (so "65 000 km" doesn't match "000 km")
    { re: /\b(\d{1,3}(?:\s\d{3})+)\s*km\b/i, unit: 'km' },
    { re: /\b(\d{1,3}(?:\s\d{3})+)\s*(?:miles?|mi)\b/i, unit: 'mi' },
    // Standard comma-formatted
    { re: /\b([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\s*k(?:m|ilom[eè]tres?)\b/i, unit: 'km' },
    { re: /\b([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:miles?|mi)\b/i, unit: 'mi' },
  ];
  for (const { re, unit } of patterns) {
    const m = text.match(re);
    if (m) {
      const numStr = m[1].replace(/[,\s]/g, '');
      return { value: parseFloat(numStr), unit };
    }
  }
  return { value: null, unit: 'unknown' };
}

describe('Mileage extraction (synthetic fixtures)', () => {
  it('parses comma-formatted km', () => {
    const r = parseMileage('140,000 km away from perfect condition');
    expect(r.value).toBe(140000);
    expect(r.unit).toBe('km');
  });

  it('parses miles', () => {
    const r = parseMileage('87,500 miles on the odometer');
    expect(r.value).toBe(87500);
    expect(r.unit).toBe('mi');
  });

  it('parses French-style spaced number km', () => {
    const r = parseMileage('65 000 km, transmission automatique');
    expect(r.value).toBe(65000);
    expect(r.unit).toBe('km');
  });

  it('returns null when no mileage present', () => {
    const r = parseMileage('Great car, contact seller for details.');
    expect(r.value).toBeNull();
  });
});

// ── Price type detection ──────────────────────────────────────────────────

const PAYMENT_PATTERNS = [
  { re: /down\s*pay/i, type: 'down_payment' },
  { re: /monthly\s*pay|per\s*month|\/mo/i, type: 'monthly' },
  { re: /deposit/i, type: 'deposit' },
];

function detectPriceType(context: string): string {
  for (const { re, type } of PAYMENT_PATTERNS) {
    if (re.test(context)) return type;
  }
  return 'asking';
}

describe('Price type disambiguation (synthetic fixtures)', () => {
  it('identifies asking price in F_FULL_PRICE', () => {
    expect(detectPriceType(FIXTURE_FULL_PRICE)).toBe('asking');
  });

  it('identifies down_payment in FIXTURE_DOWN_PAYMENT', () => {
    expect(detectPriceType(FIXTURE_DOWN_PAYMENT)).toBe('down_payment');
  });

  it('identifies monthly in FIXTURE_PRICE_UNCLEAR', () => {
    expect(detectPriceType(FIXTURE_PRICE_UNCLEAR)).toBe('monthly');
  });
});

// ── Fixture-based phrase detection ────────────────────────────────────────

describe('Full fixture — FIXTURE_SALVAGE', () => {
  it('detects salvage title', () => {
    const flags = detectPhrases(FIXTURE_SALVAGE);
    expect(flags.some((f) => f.category === 'title_disclosure')).toBe(true);
  });

  it('detects "does not run"', () => {
    const flags = detectPhrases(FIXTURE_SALVAGE);
    expect(flags.some((f) => f.label === 'Does not run')).toBe(true);
  });
});

describe('Full fixture — FIXTURE_FRENCH', () => {
  it('detects "vendu tel quel" (as-is)', () => {
    const flags = detectPhrases(FIXTURE_FRENCH);
    expect(flags.some((f) => f.label === 'Sold as-is')).toBe(true);
  });

  it('detects "acompte" (down payment)', () => {
    const flags = detectPhrases(FIXTURE_FRENCH);
    expect(flags.some((f) => f.label === 'Down payment mentioned')).toBe(true);
  });

  it('detects "ne démarre pas"', () => {
    const flags = detectPhrases(FIXTURE_FRENCH);
    expect(flags.some((f) => f.label === 'Does not run')).toBe(true);
  });
});

describe('Missing fields detection', () => {
  it('returns no mileage for fixture without mileage', () => {
    const r = parseMileage('2020 Honda Civic for sale. Great condition. Contact me.');
    expect(r.value).toBeNull();
  });
});
