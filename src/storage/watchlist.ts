/**
 * MarketLens AI — Watchlist (saved listings) in chrome.storage.local
 *
 * Items are keyed by listingKey() so the same listing is recognised from the
 * feed, the item page and the Saved page. Each revisit records the price, so
 * drops since saving can be surfaced.
 */

import type { AIProductAnalysis, UniversalListingContext } from '../types/ai';
import { detectSite, listingKey, parsePrice, type ListingSite } from '../utils/listing';

export const WATCHLIST_KEY = 'marketlens_watchlist';

export type WatchStatus = 'watching' | 'contacted' | 'negotiating' | 'bought' | 'passed';

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  watching: 'Watching',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  bought: 'Bought',
  passed: 'Passed',
};

export interface PricePoint {
  price: number | null;
  raw: string;
  at: number;
}

export interface WatchlistItem {
  id: string;
  url: string;
  site: ListingSite;
  title: string;
  imageUrl?: string;
  currency: string;
  priceRaw: string;
  price: number | null;
  priceHistory: PricePoint[];
  analysis?: AIProductAnalysis;
  analyzedAt?: number;
  status: WatchStatus;
  notes: string;
  savedAt: number;
  updatedAt: number;
}

export interface PriceChange {
  from: number;
  to: number;
  /** Negative when the price dropped */
  delta: number;
}

type WatchMap = Record<string, WatchlistItem>;

async function readMap(): Promise<WatchMap> {
  try {
    const res = await chrome.storage.local.get(WATCHLIST_KEY);
    const map = res?.[WATCHLIST_KEY];
    return map && typeof map === 'object' ? (map as WatchMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: WatchMap): Promise<void> {
  await chrome.storage.local.set({ [WATCHLIST_KEY]: map });
}

/** Change between the price when saved and the latest observed price. */
export function priceChangeSinceSaved(item: Pick<WatchlistItem, 'priceHistory'>): PriceChange | null {
  const known = (item.priceHistory ?? []).filter((p): p is PricePoint & { price: number } => typeof p.price === 'number');
  if (known.length < 2) return null;
  const from = known[0].price;
  const to = known[known.length - 1].price;
  if (from === to) return null;
  return { from, to, delta: to - from };
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => b.savedAt - a.savedAt);
}

export async function getWatchItem(url: string): Promise<WatchlistItem | null> {
  const key = listingKey(url);
  if (!key) return null;
  return (await readMap())[key] ?? null;
}

export async function saveToWatchlist(
  context: Pick<UniversalListingContext, 'url' | 'title' | 'priceRaw' | 'currency' | 'imageUrl'>,
  analysis?: AIProductAnalysis,
  analyzedAt?: number
): Promise<WatchlistItem> {
  const id = listingKey(context.url);
  const map = await readMap();
  const now = Date.now();
  const existing = map[id];

  const price = parsePrice(context.priceRaw) ?? analysis?.pricing?.askingPrice ?? null;
  const imageUrl = context.imageUrl && !context.imageUrl.startsWith('data:') ? context.imageUrl : existing?.imageUrl;

  const item: WatchlistItem = {
    id,
    url: context.url,
    site: detectSite(context.url),
    title: analysis?.identifiedProduct?.name || context.title || existing?.title || 'Saved listing',
    imageUrl,
    currency: context.currency || existing?.currency || 'USD',
    priceRaw: context.priceRaw || existing?.priceRaw || '',
    price,
    priceHistory: existing?.priceHistory?.length
      ? existing.priceHistory
      : [{ price, raw: context.priceRaw || '', at: now }],
    analysis: analysis ?? existing?.analysis,
    analyzedAt: analysis ? analyzedAt ?? now : existing?.analyzedAt,
    status: existing?.status ?? 'watching',
    notes: existing?.notes ?? '',
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
  };

  map[id] = item;
  await writeMap(map);
  return item;
}

export async function removeFromWatchlist(id: string): Promise<void> {
  const map = await readMap();
  delete map[id];
  await writeMap(map);
}

export async function updateWatchItem(
  id: string,
  patch: Partial<Pick<WatchlistItem, 'status' | 'notes'>>
): Promise<WatchlistItem | null> {
  const map = await readMap();
  const item = map[id];
  if (!item) return null;
  map[id] = { ...item, ...patch, updatedAt: Date.now() };
  await writeMap(map);
  return map[id];
}

/** Attach a fresh analysis to a saved item (no-op if the listing isn't saved). */
export async function attachAnalysis(url: string, analysis: AIProductAnalysis, analyzedAt: number = Date.now()): Promise<void> {
  const id = listingKey(url);
  const map = await readMap();
  if (!map[id]) return;
  map[id] = { ...map[id], analysis, analyzedAt, updatedAt: Date.now() };
  await writeMap(map);
}

/**
 * Record the price seen on a revisit. Only appends when it differs from the
 * last observation. Returns the updated item and the change since saving.
 */
export async function recordObservedPrice(
  url: string,
  priceRaw: string
): Promise<{ item: WatchlistItem; change: PriceChange | null } | null> {
  const id = listingKey(url);
  const map = await readMap();
  const item = map[id];
  if (!item) return null;

  const price = parsePrice(priceRaw);
  const last = item.priceHistory[item.priceHistory.length - 1];
  if (price !== null && (!last || last.price !== price)) {
    item.priceHistory = [...item.priceHistory, { price, raw: priceRaw, at: Date.now() }].slice(-20);
    item.price = price;
    item.priceRaw = priceRaw;
    item.updatedAt = Date.now();
    map[id] = item;
    await writeMap(map);
  }

  return { item, change: priceChangeSinceSaved(item) };
}

export async function clearWatchlist(): Promise<void> {
  await writeMap({});
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Listing text could start with a spreadsheet formula character; neutralise it
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function watchlistToCsv(items: WatchlistItem[]): string {
  const header = [
    'Title', 'Site', 'URL', 'Status', 'Asking price', 'Price when saved', 'Buy score', 'Verdict',
    'Fair value (avg)', 'Fair range min', 'Fair range max', 'Suggested offer', 'Condition', 'Notes', 'Saved on',
  ];
  const rows = items.map((it) => {
    const a = it.analysis;
    const first = it.priceHistory[0]?.price ?? '';
    return [
      it.title, it.site, it.url, WATCH_STATUS_LABELS[it.status], it.price ?? '', first,
      a?.buyScore ?? '', a?.buyVerdictLabel ?? '', a?.pricing?.fairUsedMarketRange?.fairAverage ?? '',
      a?.pricing?.fairUsedMarketRange?.min ?? '', a?.pricing?.fairUsedMarketRange?.max ?? '',
      a?.negotiation?.recommendedOffer ?? '', a?.visualAudit?.conditionScore ?? '', it.notes,
      new Date(it.savedAt).toISOString().slice(0, 10),
    ].map(csvCell).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
