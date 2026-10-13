/**
 * Listing identity & price parsing tests
 */
import { describe, it, expect } from 'vitest';
import { detectSite, listingKey, parsePrice } from '../src/utils/listing';

describe('listingKey', () => {
  it('normalizes Facebook item URLs regardless of query strings', () => {
    expect(listingKey('https://www.facebook.com/marketplace/item/123456789/?ref=search&referral_code=x')).toBe('facebook:123456789');
    expect(listingKey('https://web.facebook.com/marketplace/item/123456789')).toBe('facebook:123456789');
  });

  it('normalizes eBay item URLs with or without a slug', () => {
    expect(listingKey('https://www.ebay.com/itm/1234567890?hash=abc')).toBe('ebay:1234567890');
    expect(listingKey('https://www.ebay.ca/itm/sony-ps5-console/1234567890')).toBe('ebay:1234567890');
  });

  it('normalizes Craigslist posting URLs', () => {
    expect(listingKey('https://toronto.craigslist.org/tor/ele/d/toronto-ps5/7712345678.html')).toBe('craigslist:7712345678');
  });

  it('falls back to host + path for other sites', () => {
    expect(listingKey('https://www.example.com/items/42/?utm=1#top')).toBe('example.com/items/42');
  });

  it('returns an empty key for an empty URL', () => {
    expect(listingKey('')).toBe('');
  });
});

describe('parsePrice', () => {
  it('parses common marketplace formats', () => {
    expect(parsePrice('$680')).toBe(680);
    expect(parsePrice('CA$1,250')).toBe(1250);
    expect(parsePrice('$1,299.99')).toBe(1299.99);
    expect(parsePrice('US $45.00 · Negotiable')).toBe(45);
    expect(parsePrice('1.250,50 €')).toBe(1250.5);
  });

  it('treats free listings as zero', () => {
    expect(parsePrice('Free')).toBe(0);
    expect(parsePrice('gratuit')).toBe(0);
  });

  it('returns null when there is no number', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('Contact seller')).toBeNull();
  });
});

describe('detectSite', () => {
  it('identifies supported marketplaces', () => {
    expect(detectSite('https://www.facebook.com/marketplace/item/1')).toBe('facebook');
    expect(detectSite('https://www.ebay.ca/itm/1')).toBe('ebay');
    expect(detectSite('https://sfbay.craigslist.org/x/1.html')).toBe('craigslist');
    expect(detectSite('https://example.com')).toBe('other');
  });
});
