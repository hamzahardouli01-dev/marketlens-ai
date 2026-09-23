/**
 * Storage Tests
 *
 * Tests chrome.storage.local wrapper with the mock from setup.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _store } from './setup';
import type { ListingData } from '../src/types/listing';

// Reset store before each test
beforeEach(() => {
  // Clear the mock store
  Object.keys(_store).forEach((k) => delete _store[k]);
});

// Re-import after clearing (dynamic import for fresh module state)
// Since vitest doesn't reinitialize modules, we test the public API

import {
  saveListing,
  getAllSaved,
  deleteListing,
  updateUserFields,
  updateListingData,
  clearAllListings,
  getByListingData,
} from '../src/storage/store';

function makeListingData(overrides: Partial<ListingData> = {}): ListingData {
  return {
    listingId: '1234567890',
    url: 'https://www.facebook.com/marketplace/item/1234567890',
    title: '2019 Honda Civic LX',
    price: {
      raw: '$14,500',
      value: 14500,
      currency: 'CAD',
      type: 'asking',
      excerpt: '$14,500 CAD',
    },
    year: 2019,
    make: 'Honda',
    model: 'Civic LX',
    mileage: { raw: '85,000 km', value: 85000, unit: 'km' },
    transmission: 'Automatic',
    fuelType: 'Gasoline',
    location: 'Toronto, ON',
    condition: 'Clean title',
    description: 'One owner, no accidents, full service records.',
    extractedAt: Date.now(),
    isManual: false,
    flaggedPhrases: [],
    suggestedQuestions: [],
    ...overrides,
  };
}

describe('saveListing', () => {
  it('saves a listing and returns it', async () => {
    const data = makeListingData();
    const saved = await saveListing(data);
    expect(saved.id).toBe('1234567890');
    expect(saved.data.title).toBe('2019 Honda Civic LX');
    expect(saved.status).toBe('interested');
    expect(saved.priceHistory).toHaveLength(1);
  });

  it('throws on duplicate save', async () => {
    const data = makeListingData();
    await saveListing(data);
    await expect(saveListing(data)).rejects.toThrow('already saved');
  });

  it('deduplicates by listingId', async () => {
    const data = makeListingData({ listingId: 'abc123' });
    await saveListing(data);
    const all = await getAllSaved();
    expect(all).toHaveLength(1);
  });
});

describe('getAllSaved', () => {
  it('returns empty array when nothing saved', async () => {
    const all = await getAllSaved();
    expect(all).toHaveLength(0);
  });

  it('returns all saved listings', async () => {
    await saveListing(makeListingData({ listingId: 'a1' }));
    await saveListing(makeListingData({ listingId: 'a2', url: 'https://www.facebook.com/marketplace/item/a2' }));
    const all = await getAllSaved();
    expect(all).toHaveLength(2);
  });
});

describe('updateListingData', () => {
  it('updates listing and preserves price history on price change', async () => {
    const data = makeListingData();
    const saved = await saveListing(data);

    const newData = makeListingData({
      price: { raw: '$13,500', value: 13500, currency: 'CAD', type: 'asking', excerpt: '$13,500' },
      extractedAt: Date.now() + 1000,
    });
    const updated = await updateListingData(saved.id, newData);

    expect(updated.priceHistory).toHaveLength(2);
    expect(updated.priceHistory[0].raw).toBe('$14,500');
    expect(updated.priceHistory[1].raw).toBe('$13,500');
  });

  it('does not duplicate price history if price unchanged', async () => {
    const data = makeListingData();
    const saved = await saveListing(data);
    const updated = await updateListingData(saved.id, data);
    expect(updated.priceHistory).toHaveLength(1);
  });
});

describe('updateUserFields', () => {
  it('updates notes and status', async () => {
    const data = makeListingData();
    const saved = await saveListing(data);
    const updated = await updateUserFields(saved.id, { notes: 'Nice car!', status: 'contacted' });
    expect(updated.notes).toBe('Nice car!');
    expect(updated.status).toBe('contacted');
    expect(updated.hasUserEdits).toBe(true);
  });
});

describe('deleteListing', () => {
  it('removes a listing', async () => {
    const data = makeListingData();
    const saved = await saveListing(data);
    await deleteListing(saved.id);
    const all = await getAllSaved();
    expect(all).toHaveLength(0);
  });
});

describe('clearAllListings', () => {
  it('removes all listings', async () => {
    await saveListing(makeListingData({ listingId: 'x1' }));
    await saveListing(makeListingData({ listingId: 'x2', url: 'https://www.facebook.com/marketplace/item/x2' }));
    await clearAllListings();
    const all = await getAllSaved();
    expect(all).toHaveLength(0);
  });
});

describe('URL-based deduplication', () => {
  it('uses URL hash for listings without listingId', async () => {
    const data = makeListingData({
      listingId: null,
      url: 'https://www.facebook.com/marketplace/item/99999',
    });
    const saved = await saveListing(data);
    expect(saved.id).toMatch(/^url_/);
  });
});

describe('XSS safety', () => {
  it('stores untrusted text as-is without rendering (storage layer is safe)', async () => {
    const xssText = '<script>alert("xss")</script>';
    const data = makeListingData({ description: xssText, title: xssText });
    const saved = await saveListing(data);
    // Storage layer just stores it — rendering safety is React's responsibility
    expect(saved.data.description).toBe(xssText);
    expect(saved.data.title).toBe(xssText);
    // Confirm the raw string is not executed (just stored)
    const all = await getAllSaved();
    expect(all[0].data.description).toBe(xssText);
  });
});
