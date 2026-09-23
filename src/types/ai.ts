/**
 * MarketLens AI — Types for Gemini Vision Multimodal Valuation & Flip Analysis
 */

export type DealRating =
  | 'great_deal'
  | 'fair_deal'
  | 'overpriced'
  | 'extreme_ripoff'
  | 'suspiciously_cheap';

export type FlipRecommendation =
  | 'strong_buy_flip'
  | 'good_personal_buy'
  | 'fair_value'
  | 'hard_to_resell'
  | 'avoid';

export type BuyVerdict =
  | 'buy_now'
  | 'good_buy'
  | 'negotiate'
  | 'caution'
  | 'walk_away';

export interface RedFlag {
  severity: 'critical' | 'warning' | 'info';
  text: string;
}

export interface AIProductAnalysis {
  /** Headline 0-100 "should I buy it?" score (new analyses; may be absent on cached ones) */
  buyScore?: number;
  buyVerdict?: BuyVerdict;
  buyVerdictLabel?: string;
  /** Scam/safety signals — empty array means the listing looks clean */
  redFlags?: RedFlag[];
  /** Smart questions the buyer should ask the seller before paying */
  questionsToAsk?: string[];
  identifiedProduct: {
    name: string;
    brand: string;
    model: string;
    category: string;
    conditionReport: string;
    modelYear?: number;
  };
  pricing: {
    askingPrice: number | null;
    currency: string;
    estimatedNewPrice: number | null;
    fairUsedMarketRange: {
      min: number;
      max: number;
      fairAverage: number;
    };
    dealRating: DealRating;
    dealVerdictLabel: string;
    percentageVsMarket: number; // e.g. -25 for 25% under market
  };
  flipPotential: {
    score: number; // 1 to 10
    recommendation: FlipRecommendation;
    estimatedResaleValue: number;
    estimatedNetProfit: number;
    resaleDifficulty: 'fast_flip' | 'moderate' | 'slow';
    resaleTimeframe: string;
    flipSummary: string;
  };
  visualAudit: {
    isAuthenticUserPhoto: boolean;
    isStockPhoto: boolean;
    detectedFlawsOrWear: string[];
    accessoriesVisible: string[];
    conditionScore: 'mint' | 'good' | 'fair' | 'poor';
  };
  negotiation: {
    recommendedOffer: number;
    targetSavings: number;
    counterOfferMessage: string;
  };
  aiSummary: string;
  analyzedAt: number;
  imageUrl?: string;
}

export interface UniversalListingContext {
  url: string;
  title: string;
  priceRaw: string;
  currency: string;
  description: string;
  imageUrl?: string;
  imageBase64?: string;
  imageMimeType?: string;
  galleryImages?: string[];
  additionalImagesBase64?: Array<{ base64: string; mimeType?: string }>;
}
