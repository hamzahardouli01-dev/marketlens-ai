/**
 * Analysis Logic & Math Harmonizer Tests
 */
import { describe, it, expect } from 'vitest';
import { harmonizeAnalysis, extractModelYear } from '../src/utils/analysisHarmonizer';
import type { AIProductAnalysis } from '../src/types/ai';

function makeRawAnalysis(overrides: Partial<AIProductAnalysis> = {}): AIProductAnalysis {
  return {
    buyScore: 75,
    buyVerdict: 'good_buy',
    buyVerdictLabel: 'Good Buy',
    analyzedAt: Date.now(),
    identifiedProduct: {
      name: '2000 Honda Civic EX',
      brand: 'Honda',
      model: 'Civic',
      category: 'Vehicles',
      conditionReport: 'Fair condition',
    },
    pricing: {
      askingPrice: 3500,
      currency: 'USD',
      estimatedNewPrice: 55000, // Unrealistic hallucinated MSRP for a 2000 Civic!
      fairUsedMarketRange: {
        min: 2500,
        max: 4000,
        fairAverage: 3200,
      },
      dealRating: 'fair_deal',
      dealVerdictLabel: 'Fair Market Price',
      percentageVsMarket: 9,
    },
    flipPotential: {
      score: 7,
      recommendation: 'strong_buy_flip',
      estimatedResaleValue: 5000,
      estimatedNetProfit: 1500,
      resaleDifficulty: 'moderate',
      resaleTimeframe: '1-2 weeks',
      flipSummary: 'Good resale potential',
    },
    visualAudit: {
      isAuthenticUserPhoto: true,
      isStockPhoto: false,
      detectedFlawsOrWear: [],
      accessoriesVisible: [],
      conditionScore: 'fair',
    },
    negotiation: {
      recommendedOffer: 3000,
      targetSavings: 500,
      counterOfferMessage: 'Hello, would you take $3,000?',
    },
    aiSummary: 'Reliable commuter car at fair market rate.',
    ...overrides,
  };
}

describe('extractModelYear', () => {
  it('extracts valid model years from text', () => {
    expect(extractModelYear('2000 Honda Civic')).toBe(2000);
    expect(extractModelYear('Clean 1998 Toyota 4Runner 4x4')).toBe(1998);
    expect(extractModelYear('Apple iPhone 15 Pro Max 2023')).toBe(2023);
    expect(extractModelYear('Random generic title without year')).toBe(null);
  });
});

describe('harmonizeAnalysis', () => {
  it('clamps unrealistic MSRP for older economy cars (e.g. 2000 Civic with $55k MSRP)', () => {
    const raw = makeRawAnalysis({
      pricing: {
        askingPrice: 3500,
        currency: 'USD',
        estimatedNewPrice: 55000, // Should be clamped!
        fairUsedMarketRange: { min: 2500, max: 4000, fairAverage: 3200 },
        dealRating: 'fair_deal',
        dealVerdictLabel: 'Fair Market Price',
        percentageVsMarket: 9,
      },
    });

    const result = harmonizeAnalysis(raw, { title: '2000 Honda Civic EX' });

    expect(result.identifiedProduct.modelYear).toBe(2000);
    // Historical 2000 Civic MSRP should be around ~$17,500, definitely not $55,000
    expect(result.pricing.estimatedNewPrice).toBeLessThan(22000);
    expect(result.pricing.estimatedNewPrice).toBeGreaterThan(12000);
  });

  it('resolves walk_away contradiction: cannot promise positive flip profit on a walk_away deal', () => {
    const raw = makeRawAnalysis({
      buyVerdict: 'walk_away',
      buyVerdictLabel: 'High Risk · Do Not Buy',
      pricing: {
        askingPrice: 5000,
        currency: 'USD',
        estimatedNewPrice: 15000,
        fairUsedMarketRange: { min: 2000, max: 3500, fairAverage: 2800 },
        dealRating: 'overpriced',
        dealVerdictLabel: 'Overpriced',
        percentageVsMarket: 78,
      },
      flipPotential: {
        score: 8.5,
        recommendation: 'strong_buy_flip',
        estimatedResaleValue: 7000, // Contradiction: Reselling for $7,000 when market average is $2,800!
        estimatedNetProfit: 2000,
        resaleDifficulty: 'fast_flip',
        resaleTimeframe: '1-3 days',
        flipSummary: 'Huge flip profit!',
      },
    });

    const result = harmonizeAnalysis(raw, { title: '2000 Honda Civic' });

    // Contradiction must be resolved:
    // Resale value must be clamped to fair market rate ($2800)
    expect(result.flipPotential.estimatedResaleValue).toBeLessThanOrEqual(3500);
    // Net profit must be negative: 2800 - 5000 = -2200
    expect(result.flipPotential.estimatedNetProfit).toBeLessThanOrEqual(0);
    expect(result.flipPotential.estimatedNetProfit).toBe(
      result.flipPotential.estimatedResaleValue - (result.pricing.askingPrice || 0)
    );
    // Recommendation must not be strong_buy_flip
    expect(result.flipPotential.recommendation).toBe('avoid');
    expect(result.flipPotential.score).toBeLessThanOrEqual(3.5);
  });

  it('enforces exact mathematical consistency: net profit = resale - asking', () => {
    const raw = makeRawAnalysis({
      pricing: {
        askingPrice: 4000,
        currency: 'USD',
        estimatedNewPrice: 16000,
        fairUsedMarketRange: { min: 3000, max: 4500, fairAverage: 3800 },
        dealRating: 'fair_deal',
        dealVerdictLabel: 'Fair',
        percentageVsMarket: 5,
      },
      flipPotential: {
        score: 6,
        recommendation: 'fair_value',
        estimatedResaleValue: 4200,
        estimatedNetProfit: 99999, // Intentional mismatch
        resaleDifficulty: 'moderate',
        resaleTimeframe: '1 week',
        flipSummary: 'Fair value',
      },
    });

    const result = harmonizeAnalysis(raw);
    expect(result.flipPotential.estimatedNetProfit).toBe(4200 - 4000);
    expect(result.flipPotential.estimatedNetProfit).toBe(200);
  });

  it('adjusts buy verdict and rating if item is heavily overpriced', () => {
    const raw = makeRawAnalysis({
      buyVerdict: 'buy_now', // Contradiction with 60% above market!
      pricing: {
        askingPrice: 8000,
        currency: 'USD',
        estimatedNewPrice: 16000,
        fairUsedMarketRange: { min: 4000, max: 5500, fairAverage: 5000 },
        dealRating: 'overpriced',
        dealVerdictLabel: 'Overpriced',
        percentageVsMarket: 60,
      },
    });

    const result = harmonizeAnalysis(raw);
    expect(result.buyVerdict).not.toBe('buy_now');
    expect(['negotiate', 'caution', 'walk_away']).toContain(result.buyVerdict);
    expect(result.pricing.dealRating).toBe('extreme_ripoff');
  });
});
