import { describe, it, expect } from 'vitest';
import {
  computeDealRisk,
  analyzeMileage,
  detectMissingDisclosures,
  generateSellerMessage,
} from '../src/utils/dealAnalyzer';
import type { ListingData } from '../src/types/listing';

function mockListing(overrides: Partial<ListingData> = {}): ListingData {
  return {
    listingId: '123456',
    url: 'https://www.facebook.com/marketplace/item/123456',
    title: '2018 Toyota Corolla LE',
    price: {
      raw: '$14,500',
      value: 14500,
      currency: 'USD',
      type: 'asking',
      excerpt: '$14,500 cash price',
    },
    year: 2018,
    make: 'Toyota',
    model: 'Corolla',
    mileage: {
      raw: '65,000 miles',
      value: 65000,
      unit: 'mi',
    },
    transmission: 'Automatic',
    fuelType: 'Gasoline',
    location: 'Seattle, WA',
    condition: 'Used - Good',
    description: 'Runs great, clean title in hand, no accidents. VIN: 2T1BURHE0JC123456.',
    extractedAt: Date.now(),
    isManual: false,
    flaggedPhrases: [],
    suggestedQuestions: [],
    ...overrides,
  };
}

describe('dealAnalyzer — Deal Risk Scoring', () => {
  it('identifies clean listings as low risk', () => {
    const listing = mockListing();
    const verdict = computeDealRisk(listing);
    expect(verdict.level).toBe('low');
    expect(verdict.scoreLabel).toContain('Low Risk');
  });

  it('flags mechanical concerns as high risk', () => {
    const listing = mockListing({
      flaggedPhrases: [
        {
          category: 'mechanical_concern',
          label: 'Transmission issue',
          keyword: 'needs transmission',
          excerpt: 'car runs but needs transmission repair',
        },
      ],
    });
    const verdict = computeDealRisk(listing);
    expect(verdict.level).toBe('high');
    expect(verdict.scoreLabel).toContain('High Risk');
    expect(verdict.reasons[0]).toContain('Transmission issue');
  });

  it('flags salvage or rebuilt title as high risk', () => {
    const listing = mockListing({
      flaggedPhrases: [
        {
          category: 'title_disclosure',
          label: 'Rebuilt title',
          keyword: 'rebuilt',
          excerpt: 'vehicle has rebuilt title from minor fender bender',
        },
      ],
    });
    const verdict = computeDealRisk(listing);
    expect(verdict.level).toBe('high');
    expect(verdict.reasons[0]).toContain('Rebuilt title');
  });

  it('flags down payment and financing traps as caution', () => {
    const listing = mockListing({
      price: {
        raw: '$1,000',
        value: 1000,
        currency: 'USD',
        type: 'down_payment',
        excerpt: '$1000 down payment required',
      },
    });
    const verdict = computeDealRisk(listing);
    expect(verdict.level).toBe('caution');
    expect(verdict.scoreLabel).toContain('Caution');
    expect(verdict.reasons[0]).toContain('Price trap');
  });
});

describe('dealAnalyzer — Mileage Reality Check', () => {
  it('detects low annual usage correctly', () => {
    const currentYear = new Date().getFullYear();
    const listing = mockListing({
      year: currentYear - 5,
      mileage: { raw: '20,000 miles', value: 20000, unit: 'mi' },
    });
    const analysis = analyzeMileage(listing);
    expect(analysis.assessment).toBe('low');
    expect(analysis.annualUsage).toBe(4000);
    expect(analysis.label).toContain('Low Usage');
  });

  it('detects high annual usage correctly', () => {
    const currentYear = new Date().getFullYear();
    const listing = mockListing({
      year: currentYear - 3,
      mileage: { raw: '75,000 miles', value: 75000, unit: 'mi' },
    });
    const analysis = analyzeMileage(listing);
    expect(analysis.assessment).toBe('high');
    expect(analysis.annualUsage).toBe(25000);
    expect(analysis.label).toContain('High Annual Usage');
  });

  it('handles missing mileage gracefully', () => {
    const listing = mockListing({
      mileage: { raw: '', value: null, unit: 'unknown' },
    });
    const analysis = analyzeMileage(listing);
    expect(analysis.assessment).toBe('unknown');
    expect(analysis.label).toContain('Not Disclosed');
  });
});

describe('dealAnalyzer — Missing Disclosures Radar', () => {
  it('flags missing VIN and unconfirmed title', () => {
    const listing = mockListing({
      description: 'Car runs great. Call for info.',
      condition: null,
    });
    const missing = detectMissingDisclosures(listing);
    const keys = missing.map((m) => m.key);
    expect(keys).toContain('vin');
    expect(keys).toContain('title');
  });

  it('does not flag VIN when 17-char VIN is present', () => {
    const listing = mockListing({
      description: 'Clean title. VIN: 1HGCR2F83HA123456. Runs perfect.',
    });
    const missing = detectMissingDisclosures(listing);
    const keys = missing.map((m) => m.key);
    expect(keys).not.toContain('vin');
    expect(keys).not.toContain('title');
  });
});

describe('dealAnalyzer — 1-Click Seller Message Generator', () => {
  it('generates polite message with vehicle name and relevant inquiry points', () => {
    const listing = mockListing({
      year: 2017,
      make: 'Honda',
      model: 'Civic',
      price: {
        raw: '$12,000',
        value: 12000,
        currency: 'USD',
        type: 'asking',
        excerpt: '$12,000',
      },
    });
    const risk = computeDealRisk(listing);
    const missing = detectMissingDisclosures(listing);
    const message = generateSellerMessage(listing, risk, missing);

    expect(message).toContain('2017 Honda Civic');
    expect(message).toContain('Is it still available?');
    expect(message).toContain('$12,000');
    expect(message).toContain('pre-purchase mechanic inspection');
  });

  it('asks about down payment when price type is down_payment', () => {
    const listing = mockListing({
      price: {
        raw: '$1,500',
        value: 1500,
        currency: 'USD',
        type: 'down_payment',
        excerpt: '$1,500 down payment',
      },
    });
    const risk = computeDealRisk(listing);
    const missing = detectMissingDisclosures(listing);
    const message = generateSellerMessage(listing, risk, missing);

    expect(message).toContain('full cash purchase price, or is it a down payment');
  });
});
