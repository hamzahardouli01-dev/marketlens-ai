/**
 * MarketLens AI — Analysis history (chrome.storage.local)
 *
 * Keeps recent appraisals per listing so reopening a listing is instant and
 * doesn't spend another free analysis. Images are stripped before storing.
 */

import type { AIProductAnalysis, BuyVerdict, UniversalListingContext } from '../types/ai';
import { listingKey } from '../utils/listing';

export const ANALYSIS_CACHE_KEY = 'marketlens_analysis_history';
export const MAX_CACHED_ANALYSES = 60;

export type StoredListingContext = Pick<UniversalListingContext, 'url' | 'title' | 'priceRaw' | 'currency' | 'imageUrl'>;

export interface CachedAnalysis {
  key: string;
  context: StoredListingContext;
  analysis: AIProductAnalysis;
  analyzedAt: number;
}

export interface AnalysisIndexEntry {
  score: number | null;
  verdict: BuyVerdict | null;
}

type CacheMap = Record<string, CachedAnalysis>;

async function readMap(): Promise<CacheMap> {
  try {
    const res = await chrome.storage.local.get(ANALYSIS_CACHE_KEY);
    const map = res?.[ANALYSIS_CACHE_KEY];
    return map && typeof map === 'object' ? (map as CacheMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: CacheMap): Promise<void> {
  await chrome.storage.local.set({ [ANALYSIS_CACHE_KEY]: map });
}

export function toStoredContext(context: UniversalListingContext): StoredListingContext {
  return {
    url: context.url,
    title: context.title,
    priceRaw: context.priceRaw,
    currency: context.currency,
    imageUrl: context.imageUrl && !context.imageUrl.startsWith('data:') ? context.imageUrl : undefined,
  };
}

export async function getCachedAnalysis(url: string): Promise<CachedAnalysis | null> {
  const key = listingKey(url);
  if (!key) return null;
  const map = await readMap();
  return map[key] ?? null;
}

export async function saveCachedAnalysis(
  context: UniversalListingContext,
  analysis: AIProductAnalysis,
  analyzedAt: number = Date.now()
): Promise<CachedAnalysis | null> {
  const key = listingKey(context.url);
  if (!key) return null;

  const map = await readMap();
  const entry: CachedAnalysis = { key, context: toStoredContext(context), analysis, analyzedAt };
  map[key] = entry;

  // Keep only the most recent analyses
  const keys = Object.keys(map);
  if (keys.length > MAX_CACHED_ANALYSES) {
    keys
      .sort((a, b) => map[b].analyzedAt - map[a].analyzedAt)
      .slice(MAX_CACHED_ANALYSES)
      .forEach((k) => delete map[k]);
  }

  await writeMap(map);
  return entry;
}

export async function countCachedAnalyses(): Promise<number> {
  return Object.keys(await readMap()).length;
}

export async function clearAnalysisHistory(): Promise<void> {
  await writeMap({});
}

/** Score/verdict per listing key, used for feed badges. */
export function buildAnalysisIndex(map: unknown): Record<string, AnalysisIndexEntry> {
  const index: Record<string, AnalysisIndexEntry> = {};
  if (!map || typeof map !== 'object') return index;
  for (const [key, entry] of Object.entries(map as CacheMap)) {
    const score = entry?.analysis?.buyScore;
    index[key] = {
      score: typeof score === 'number' && isFinite(score) ? Math.round(score) : null,
      verdict: entry?.analysis?.buyVerdict ?? null,
    };
  }
  return index;
}

export async function getAnalysisIndex(): Promise<Record<string, AnalysisIndexEntry>> {
  return buildAnalysisIndex(await readMap());
}
