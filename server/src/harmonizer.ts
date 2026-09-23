/**
 * MarketLens AI — Server Analysis Logic & Mathematics Harmonizer
 *
 * Ensures 100% logical and mathematical consistency across:
 * 1. Era-appropriate MSRP for older/vintage cars & electronics (e.g. year 2000 Civic is ~$13k, not $55k).
 * 2. Mathematical alignment: Net Profit strictly equals (Resale Value - Asking Price).
 * 3. Contradiction resolution: A "Walk Away / High Risk" verdict cannot promise positive flip profit.
 * 4. Deal rating alignment: Overpriced items cannot be rated "Buy Now" or "Strong Buy Flip".
 */

// Common historical economy car MSRP references (when new)
const HISTORICAL_ECONOMY_MAKES = [
  'civic', 'corolla', 'camry', 'accord', 'sentra', 'altima', 'focus', 'fiesta',
  'cruze', 'elantra', 'sonata', 'forte', 'optima', 'mazda 3', 'mazda 6', 'golf',
  'jetta', 'cavalier', 'neon', 'escort', 'prius', 'yaris', 'fit', 'versa', 'rio'
];

export function extractModelYear(text: string): number | null {
  if (!text) return null;
  // Match 4-digit years between 1970 and 2028
  const match = text.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
  if (match) {
    const yr = parseInt(match[1], 10);
    if (yr >= 1970 && yr <= 2028) return yr;
  }
  return null;
}

export function harmonizeAnalysis(analysis: any, context?: any): any {
  if (!analysis || !analysis.pricing || !analysis.flipPotential) {
    return analysis;
  }

  const combinedText = `${context?.title || ''} ${analysis.identifiedProduct?.name || ''} ${context?.description || ''}`.toLowerCase();
  const year = extractModelYear(combinedText);

  if (year && analysis.identifiedProduct) {
    analysis.identifiedProduct.modelYear = year;
  }

  // ─── 1. Era-Appropriate MSRP Sanity Clamping ──────────────────────────────────
  let msrp = analysis.pricing.estimatedNewPrice;
  if (msrp && msrp > 0 && year) {
    const isEconomyCar = HISTORICAL_ECONOMY_MAKES.some((m) => combinedText.includes(m));
    const isVehicle = combinedText.includes('car') || combinedText.includes('sedan') || combinedText.includes('coupe') || combinedText.includes('truck') || isEconomyCar;

    if (isEconomyCar) {
      if (year <= 2000 && msrp > 22000) {
        // e.g. 2000 Honda Civic was ~$12,500 - $16,000
        msrp = Math.round(13500 + ((year - 1990) * 400));
      } else if (year <= 2006 && msrp > 26000) {
        msrp = Math.round(15000 + ((year - 2000) * 600));
      } else if (year <= 2012 && msrp > 32000) {
        msrp = Math.round(17500 + ((year - 2006) * 750));
      } else if (year <= 2018 && msrp > 38000) {
        msrp = Math.round(20000 + ((year - 2012) * 900));
      }
    } else if (isVehicle && year <= 2005 && msrp > 45000) {
      // Non-luxury standard older cars shouldn't hallucinate $55k+ MSRP
      const isLuxury = combinedText.includes('porsche') || combinedText.includes('ferrari') || combinedText.includes('corvette') || combinedText.includes('amg') || combinedText.includes('m3') || combinedText.includes('s-class');
      if (!isLuxury) {
        msrp = Math.round(24000 + ((year - 1990) * 800));
      }
    } else if (combinedText.includes('iphone') || combinedText.includes('galaxy')) {
      // Historical phone MSRPs
      if (year <= 2016 && msrp > 850) {
        msrp = 699;
      }
    }

    analysis.pricing.estimatedNewPrice = msrp;
  }

  // ─── 2. Fair Used Market Range Sanity ─────────────────────────────────────────
  const range = analysis.pricing.fairUsedMarketRange;
  if (range) {
    if (range.min > range.max) {
      const temp = range.min;
      range.min = range.max;
      range.max = temp;
    }
    if (!range.fairAverage || range.fairAverage < range.min || range.fairAverage > range.max) {
      range.fairAverage = Math.round((range.min + range.max) / 2);
    }
  }

  const asking = analysis.pricing.askingPrice || 0;
  const fairAvg = range?.fairAverage || asking;
  const fairMax = range?.max || fairAvg;

  // Recompute percentage vs market
  if (asking > 0 && fairAvg > 0) {
    analysis.pricing.percentageVsMarket = Math.round(((asking - fairAvg) / fairAvg) * 100);
  }

  // ─── 3. Resale & Net Gain/Loss Mathematical Enforcement ───────────────────────
  let resale = analysis.flipPotential.estimatedResaleValue || fairAvg;

  // If asking price is higher than fair market max (overpriced), realistic resale cannot be above market
  if (asking > fairMax) {
    resale = Math.min(resale, fairAvg);
  }

  // ─── 4. Contradiction Resolution: Walk-Away / Caution vs Resale ───────────────
  const verdict = analysis.buyVerdict;

  if (verdict === 'walk_away' || verdict === 'caution') {
    // If it's walk-away or high risk, you CANNOT make a positive flip profit on an overpriced/risky listing!
    if (resale >= asking && asking > 0) {
      // Clamp resale to fair market rate or below asking
      resale = Math.min(asking, fairAvg);
    }
    analysis.flipPotential.recommendation = 'avoid';
    analysis.flipPotential.score = Math.min(analysis.flipPotential.score || 3, 3.5);
  }

  // Strictly enforce Net Profit = Resale - Asking
  analysis.flipPotential.estimatedResaleValue = Math.round(resale);
  const exactNetProfit = Math.round(resale - asking);
  analysis.flipPotential.estimatedNetProfit = exactNetProfit;

  // ─── 5. Contradiction Resolution: Negative Net Profit vs Flip Tag ─────────────
  if (exactNetProfit <= 0) {
    if (analysis.flipPotential.recommendation === 'strong_buy_flip') {
      analysis.flipPotential.recommendation =
        verdict === 'good_buy' || verdict === 'buy_now' ? 'good_personal_buy' : 'avoid';
    }
    analysis.flipPotential.score = Math.min(analysis.flipPotential.score || 4, 4.8);

    if (exactNetProfit < 0 && (!analysis.flipPotential.flipSummary || analysis.flipPotential.flipSummary.toLowerCase().includes('profit'))) {
      analysis.flipPotential.flipSummary = `Priced at or above open market rate. Reselling would result in a net loss of approx. $${Math.abs(exactNetProfit)}. Best for personal use only.`;
    }
  }

  // ─── 6. Deal Rating vs Verdict Alignment ─────────────────────────────────────
  if (analysis.pricing.percentageVsMarket > 15 || analysis.pricing.dealRating === 'overpriced' || analysis.pricing.dealRating === 'extreme_ripoff') {
    analysis.pricing.dealRating = analysis.pricing.percentageVsMarket > 30 ? 'extreme_ripoff' : 'overpriced';
    if (analysis.buyVerdict === 'buy_now' || analysis.buyVerdict === 'good_buy') {
      analysis.buyVerdict = 'negotiate';
      analysis.buyVerdictLabel = 'Overpriced · Negotiate Offer';
      if (analysis.buyScore && analysis.buyScore > 55) {
        analysis.buyScore = 48;
      }
    }
  }

  return analysis;
}
