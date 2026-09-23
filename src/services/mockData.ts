import type { AIProductAnalysis } from '../types/ai';

export const DEMO_ANALYSIS: AIProductAnalysis = {
  buyScore: 86,
  buyVerdict: 'buy_now',
  buyVerdictLabel: 'Great Buy — Priced Well Below Market',
  redFlags: [
    {
      severity: 'info',
      text: 'Only one photo provided — ask for a shot of the console powered on.',
    },
  ],
  questionsToAsk: [
    'Does the console include the original box and receipt for warranty proof?',
    'Any issues with disc drive reading or fan noise under load?',
    'Why are you selling it, and how long have you owned it?',
  ],
  identifiedProduct: {
    name: 'Sony PlayStation 5 Disc Edition (825GB) + DualSense Controller',
    brand: 'Sony',
    model: 'PlayStation 5 (CFI-1215A)',
    category: 'Gaming Consoles',
    conditionReport: 'Lightly used, authentic hardware with original accessories and cabling.',
  },
  pricing: {
    askingPrice: 320,
    currency: 'USD',
    estimatedNewPrice: 499,
    fairUsedMarketRange: {
      min: 380,
      max: 430,
      fairAverage: 405,
    },
    dealRating: 'great_deal',
    dealVerdictLabel: '🔥 Steal Deal — Underpriced by ~$85 (21% below market)',
    percentageVsMarket: -21,
  },
  flipPotential: {
    score: 8.8,
    recommendation: 'strong_buy_flip',
    estimatedResaleValue: 400,
    estimatedNetProfit: 75,
    resaleDifficulty: 'fast_flip',
    resaleTimeframe: '1-3 days',
    flipSummary: 'PS5 Disc editions sell rapidly on local marketplaces. Excellent margin for quick cash turnaround.',
  },
  visualAudit: {
    isAuthenticUserPhoto: true,
    isStockPhoto: false,
    detectedFlawsOrWear: [
      'Authentic living-room photo verified (not a stock picture)',
      'Minor hairline cosmetic scuff on white faceplate edge',
      'DualSense controller thumbsticks show zero rubber peeling',
    ],
    accessoriesVisible: [
      'Original DualSense Wireless Controller (White)',
      'HDMI 2.1 cable and AC power cord',
      'Vertical mounting stand',
    ],
    conditionScore: 'good',
  },
  negotiation: {
    recommendedOffer: 290,
    targetSavings: 30,
    counterOfferMessage:
      'Hi! I saw your PS5 listing and can pick it up today with cash in hand. Would you be willing to take $290 for a quick, hassle-free pickup? Let me know, thanks!',
  },
  aiSummary:
    'High-demand gaming console listed well below fair secondhand market value. Excellent personal buy or rapid $75 cash flip.',
  analyzedAt: Date.now(),
};
