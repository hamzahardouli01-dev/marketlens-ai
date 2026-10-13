/**
 * Watchlist storage tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _store } from './setup';
import {
  attachAnalysis,
  clearWatchlist,
  getWatchItem,
  getWatchlist,
  priceChangeSinceSaved,
  recordObservedPrice,
  removeFromWatchlist,
  saveToWatchlist,
  updateWatchItem,
  watchlistToCsv,
} from '../src/storage/watchlist';
import { DEMO_ANALYSIS } from '../src/services/mockData';

const URL_A = 'https://www.facebook.com/marketplace/item/111/?ref=feed';
const ctx = (url = URL_A, priceRaw = '$320') => ({
  url,
  title: 'PS5 Disc Edition',
  priceRaw,
  currency: 'USD',
  imageUrl: 'https://scontent.fbcdn.net/img.jpg',
});

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
});

describe('Watchlist', () => {
  it('saves a listing with its analysis and finds it from another URL variant', async () => {
    const item = await saveToWatchlist(ctx(), DEMO_ANALYSIS);
    expect(item.id).toBe('facebook:111');
    expect(item.price).toBe(320);
    expect(item.status).toBe('watching');
    expect(item.title).toBe(DEMO_ANALYSIS.identifiedProduct.name);

    const found = await getWatchItem('https://www.facebook.com/marketplace/item/111');
    expect(found?.analysis?.buyScore).toBe(86);
  });

  it('does not store inline image data', async () => {
    const item = await saveToWatchlist({ ...ctx(), imageUrl: 'data:image/jpeg;base64,AAAA' });
    expect(item.imageUrl).toBeUndefined();
  });

  it('keeps status, notes and price history when saved again', async () => {
    await saveToWatchlist(ctx());
    await updateWatchItem('facebook:111', { status: 'contacted', notes: 'Pickup Saturday' });
    await recordObservedPrice(URL_A, '$300');
    const again = await saveToWatchlist(ctx(URL_A, '$300'), DEMO_ANALYSIS);
    expect(again.status).toBe('contacted');
    expect(again.notes).toBe('Pickup Saturday');
    expect(again.priceHistory.map((p) => p.price)).toEqual([320, 300]);
  });

  it('records price drops only when the price changes', async () => {
    await saveToWatchlist(ctx());
    const same = await recordObservedPrice(URL_A, '$320');
    expect(same?.change).toBeNull();
    expect(same?.item.priceHistory).toHaveLength(1);

    const dropped = await recordObservedPrice(URL_A, '$280');
    expect(dropped?.change).toEqual({ from: 320, to: 280, delta: -40 });

    const repeat = await recordObservedPrice(URL_A, '$280');
    expect(repeat?.item.priceHistory).toHaveLength(2);
    expect(repeat?.change?.delta).toBe(-40);
  });

  it('ignores price checks for listings that are not saved', async () => {
    expect(await recordObservedPrice(URL_A, '$100')).toBeNull();
  });

  it('attaches a fresh analysis only to saved listings', async () => {
    await attachAnalysis(URL_A, DEMO_ANALYSIS);
    expect(await getWatchlist()).toHaveLength(0);

    await saveToWatchlist(ctx());
    await attachAnalysis(URL_A, DEMO_ANALYSIS, 1234);
    const item = await getWatchItem(URL_A);
    expect(item?.analysis?.buyScore).toBe(86);
    expect(item?.analyzedAt).toBe(1234);
  });

  it('removes and clears listings', async () => {
    await saveToWatchlist(ctx());
    await saveToWatchlist(ctx('https://www.ebay.com/itm/9876543210', '$50'));
    expect(await getWatchlist()).toHaveLength(2);
    await removeFromWatchlist('facebook:111');
    expect(await getWatchlist()).toHaveLength(1);
    await clearWatchlist();
    expect(await getWatchlist()).toHaveLength(0);
  });

  it('reports no change with fewer than two known prices', () => {
    expect(priceChangeSinceSaved({ priceHistory: [{ price: 10, raw: '$10', at: 1 }] })).toBeNull();
    expect(priceChangeSinceSaved({ priceHistory: [{ price: null, raw: '', at: 1 }, { price: 5, raw: '$5', at: 2 }] })).toBeNull();
  });

  it('exports CSV with quoted fields', async () => {
    await saveToWatchlist(ctx(), DEMO_ANALYSIS);
    await updateWatchItem('facebook:111', { notes: 'Said "maybe", call back' });
    const csv = watchlistToCsv(await getWatchlist());
    const [header, row] = csv.split('\n');
    expect(header.startsWith('Title,Site,URL,Status')).toBe(true);
    expect(row).toContain('"Said ""maybe"", call back"');
    expect(row).toContain(',86,');
  });

  it('neutralises spreadsheet formulas in exported text', async () => {
    await saveToWatchlist({ ...ctx(), title: '=HYPERLINK("http://x")' });
    const row = watchlistToCsv(await getWatchlist()).split('\n')[1];
    expect(row.startsWith('"\'=HYPERLINK')).toBe(true);
  });
});
