/**
 * Counter-offer templates & summary tests
 */
import { describe, it, expect } from 'vitest';
import { buildDealSummary, buildOfferMessage, offerStep, shortItemName } from '../src/utils/dealText';
import { timeAgo } from '../src/utils/format';
import { DEMO_ANALYSIS } from '../src/services/mockData';

describe('offer messages', () => {
  it('includes the amount in every tone', () => {
    for (const tone of ['friendly', 'direct', 'cash'] as const) {
      expect(buildOfferMessage(tone, { item: 'PS5', amount: 1290 })).toContain('$1,290');
    }
  });

  it('cites market value in the direct tone when known', () => {
    expect(buildOfferMessage('direct', { item: 'PS5', amount: 290, fairAverage: 405 })).toContain('$405');
    expect(buildOfferMessage('direct', { item: 'PS5', amount: 290 })).not.toContain('selling for');
  });

  it('uses a short item name without spec parentheses', () => {
    expect(shortItemName(DEMO_ANALYSIS)).toBe('PlayStation 5');
    expect(shortItemName({ identifiedProduct: { name: '', brand: '', model: '', category: '', conditionReport: '' } })).toBe('item');
  });

  it('scales the stepper to the price', () => {
    expect(offerStep(30)).toBe(1);
    expect(offerStep(150)).toBe(5);
    expect(offerStep(290)).toBe(10);
    expect(offerStep(2500)).toBe(50);
    expect(offerStep(14500)).toBe(100);
  });
});

describe('buildDealSummary', () => {
  it('produces a readable plain-text report', () => {
    const text = buildDealSummary(DEMO_ANALYSIS, { url: 'https://example.com/item', priceRaw: '$320' });
    expect(text).toContain('MarketLens AI — Sony PlayStation 5');
    expect(text).toContain('Buy now, score 86/100');
    expect(text).toContain('Asking $320');
    expect(text).toContain('fair used $380–$430 (avg $405)');
    expect(text).toContain('Suggested offer: $290');
    expect(text).toContain('Condition: Good');
    expect(text).toContain('  • Only one photo provided');
    expect(text.trim().endsWith('https://example.com/item')).toBe(true);
  });
});

describe('timeAgo', () => {
  const now = 1_000_000_000_000;
  it('formats relative times', () => {
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(timeAgo(now - 86_400_000, now)).toBe('1 day ago');
    expect(timeAgo(now - 400 * 86_400_000, now)).toBe('1 year ago');
  });
});
