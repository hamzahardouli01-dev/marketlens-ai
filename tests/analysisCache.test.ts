/**
 * Analysis history tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _store } from './setup';
import {
  ANALYSIS_CACHE_KEY,
  MAX_CACHED_ANALYSES,
  buildAnalysisIndex,
  clearAnalysisHistory,
  countCachedAnalyses,
  getCachedAnalysis,
  saveCachedAnalysis,
} from '../src/storage/analysisCache';
import { DEMO_ANALYSIS } from '../src/services/mockData';

const ctx = (id: number) => ({
  url: `https://www.facebook.com/marketplace/item/${id}/`,
  title: `Item ${id}`,
  priceRaw: '$100',
  currency: 'USD',
  description: 'desc',
  imageUrl: 'https://scontent.fbcdn.net/a.jpg',
  imageBase64: 'BASE64DATA',
  additionalImagesBase64: [{ base64: 'MORE' }],
});

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
});

describe('Analysis history', () => {
  it('stores and retrieves an analysis by listing, across URL variants', async () => {
    await saveCachedAnalysis(ctx(5), DEMO_ANALYSIS, 1000);
    const hit = await getCachedAnalysis('https://www.facebook.com/marketplace/item/5?ref=x');
    expect(hit?.analysis.buyScore).toBe(86);
    expect(hit?.analyzedAt).toBe(1000);
  });

  it('never stores image data', async () => {
    await saveCachedAnalysis(ctx(5), DEMO_ANALYSIS);
    const raw = JSON.stringify(_store[ANALYSIS_CACHE_KEY]);
    expect(raw).not.toContain('BASE64DATA');
    expect(raw).not.toContain('MORE');
  });

  it('keeps only the most recent analyses', async () => {
    for (let i = 0; i < MAX_CACHED_ANALYSES + 5; i++) {
      await saveCachedAnalysis(ctx(i), DEMO_ANALYSIS, i);
    }
    expect(await countCachedAnalyses()).toBe(MAX_CACHED_ANALYSES);
    expect(await getCachedAnalysis(ctx(0).url)).toBeNull();
    expect(await getCachedAnalysis(ctx(MAX_CACHED_ANALYSES + 4).url)).not.toBeNull();
  });

  it('builds a score index for feed badges', async () => {
    await saveCachedAnalysis(ctx(7), DEMO_ANALYSIS);
    const index = buildAnalysisIndex(_store[ANALYSIS_CACHE_KEY]);
    expect(index['facebook:7']).toEqual({ score: 86, verdict: 'buy_now' });
    expect(buildAnalysisIndex(undefined)).toEqual({});
  });

  it('clears history', async () => {
    await saveCachedAnalysis(ctx(1), DEMO_ANALYSIS);
    await clearAnalysisHistory();
    expect(await countCachedAnalyses()).toBe(0);
  });
});
