/**
 * Server-Side Gemini Multimodal Vision Service
 *
 * Securely calls Google Gemini API without exposing credentials to client browsers.
 */

import 'dotenv/config';
import { harmonizeAnalysis } from './harmonizer.js';

export interface UniversalListingContext {
  url: string;
  title: string;
  priceRaw: string;
  currency: string;
  description: string;
  imageUrl?: string;
  imageBase64?: string;
  imageMimeType?: string;
  additionalImagesBase64?: Array<{ base64: string; mimeType?: string }>;
}

export function buildSystemPrompt(context: UniversalListingContext): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const currentYear = now.getFullYear();

  return `You are MarketLens AI, a trusted buyer's advocate who protects everyday shoppers on secondhand marketplaces with live, real-time web-grounded market intelligence.
Your task is to analyze this secondhand listing (including photo if provided), search Google for live market comps and retail release info, and return an exact JSON appraisal that answers: "Should I buy this?"

CURRENT TEMPORAL & REAL-TIME CONTEXT:
- Current Date: ${currentDate} (Year: ${currentYear})
- CRITICAL MARKET REALITY: Modern products released up through ${currentYear} (e.g., iPhone 16 series, iPhone 17 series released in 2025, iPhone 18 series in 2026, latest gaming consoles, modern graphics cards, 2025-2026 vehicle models) ARE ACTIVELY AVAILABLE on retail and secondhand marketplaces.
- ANTI-HALLUCINATION RULE: NEVER declare that a modern generation product "does not exist", "has not been released yet", or "is a scam because it is not out" based on an outdated knowledge cutoff! Always perform web searches to verify live real-time release status and market transaction data for ${currentYear}.

LISTING CONTEXT:
- Title: ${context.title || 'Untitled listing'}
- Asking Price: ${context.priceRaw || 'Not listed'}
- Currency Context: ${context.currency || 'USD'}
- Description: ${context.description || 'No description provided.'}
- Listing URL: ${context.url || ''}

REQUIREMENTS:
1. Real-Time Web Search & Grounding:
   - Search the web for current retail MSRP and active secondhand market comps for this exact item.
   - For recent electronics or gadgets, look up their actual launch MSRP and verified recent secondhand sale prices across platforms like Swappa, eBay, or Amazon Renewed.
2. Identify exact Brand, Model, Generation, and Category from the text, web comps, and photo.
3. Estimate the Brand New Retail Price (MSRP) when purchased new:
   - CRITICAL ERA-ACCURACY: If this item is older or has a model year (e.g., '2000 Honda Civic', '2006 Corolla', '2015 iPhone 6s'), estimatedNewPrice MUST be the HISTORIC original retail launch price from THAT specific year (e.g., in 2000, a new Honda Civic was ~$13,000–$16,000; in 2005 a Corolla was ~$14,500; an iPhone 6 was $649). NEVER substitute modern 2024-2026 prices, modern high-performance models (e.g. $55k Type-R), or unrelated luxury car prices for older budget items!
3. Determine the realistic Fair Used Secondhand Market Value range (min, max, and typical average):
   - Anchor strictly to what this specific item currently sells for used on marketplace platforms today.
4. Compute a Buy Score (0-100) — the headline "should I buy it?" answer. Weight it roughly:
   price fairness 40%, visible/reported condition 30%, listing trustworthiness 20%, value retention 10%.
   85-100 = exceptional buy, 70-84 = good buy, 50-69 = worth negotiating, 30-49 = risky, 0-29 = walk away.
5. Assign a Buy Verdict: 'buy_now' (rare, exceptional), 'good_buy', 'negotiate' (fair only after haggling),
   'caution' (real concerns), or 'walk_away'. Plus a short punchy human label.
6. Safety & Scam Check — list redFlags. Look for: stock/catalog photos, price suspiciously below market,
   vague or copy-pasted description, pressure wording ("first come", "no holds", "shipping only"),
   brand-new or high-fraud items (phones, consoles, gift cards), mismatched details, missing receipts.
   Severity: 'critical' (likely scam/defect), 'warning' (verify before paying), 'info' (worth knowing).
   Return an empty array if the listing looks clean.
7. Generate 3-5 smart 'questionsToAsk' the buyer should message the seller before paying — specific to
   THIS item's weak points (missing accessories, battery health, warranty, reason for selling, flaws).
8. Evaluate the Deal: Is it 'great_deal' (underpriced/steal), 'fair_deal' (market rate), 'overpriced',
   'extreme_ripoff', or 'suspiciously_cheap' (possible counterfeit/scam)?
   - STRICT LOGIC: If asking price > fairUsedMarketRange.max, it MUST be 'overpriced' or 'extreme_ripoff'.
9. Resale & Value Retention (secondary — most buyers keep the item):
   - STRICT LOGICAL HARMONY:
     * estimatedNetProfit MUST strictly equal (estimatedResaleValue - askingPrice).
     * If buyVerdict is 'walk_away' or 'caution' (or if deal is overpriced), the buyer CANNOT realistically flip it for a profit! estimatedResaleValue must be at or below fair market average, and estimatedNetProfit MUST be negative or zero (e.g. -$400 loss). NEVER promise positive flip profits on a walk-away / overpriced deal!
     * If estimatedNetProfit <= 0, recommendation must be 'avoid' or 'good_personal_buy' (NEVER 'strong_buy_flip').
   - Score 1 to 10 for resale demand.
   - Resale difficulty ('fast_flip' < 3 days, 'moderate' 1-2 weeks, 'slow' hard to sell).
10. Visual Inspection (if image provided):
   - Authenticity: Is it an authentic user-taken photo or a generic stock image?
   - Inspect visible condition: note visible scratches, dents, screen condition, cosmetic wear, or damage.
   - Note accessories visible in the photo.
   - Estimate condition: 'mint', 'good', 'fair', or 'poor'.
11. Negotiation Strategy:
   - Strategic target cash offer price.
   - Ready-to-paste polite counter-offer message for the seller.
12. A 2-sentence bottom-line verdict for the buyer, written for a normal shopper (not an investor).

CRITICAL: Return ONLY valid JSON matching this schema:
{
  "buyScore": 82,
  "buyVerdict": "buy_now | good_buy | negotiate | caution | walk_away",
  "buyVerdictLabel": "Short label e.g. Great Buy — Act Fast",
  "redFlags": [
    { "severity": "critical | warning | info", "text": "Short description of the concern" }
  ],
  "questionsToAsk": ["Question 1", "Question 2", "Question 3"],
  "identifiedProduct": {
    "name": "Full product name with specs",
    "brand": "Brand",
    "model": "Model",
    "category": "Category",
    "conditionReport": "Short summary of condition"
  },
  "pricing": {
    "askingPrice": 0,
    "currency": "USD",
    "estimatedNewPrice": 0,
    "fairUsedMarketRange": {
      "min": 0,
      "max": 0,
      "fairAverage": 0
    },
    "dealRating": "great_deal | fair_deal | overpriced | extreme_ripoff | suspiciously_cheap",
    "dealVerdictLabel": "Short punchy label e.g. 🔥 Steal Deal - Underpriced by $70",
    "percentageVsMarket": -18
  },
  "flipPotential": {
    "score": 8.5,
    "recommendation": "strong_buy_flip | good_personal_buy | fair_value | hard_to_resell | avoid",
    "estimatedResaleValue": 0,
    "estimatedNetProfit": 0,
    "resaleDifficulty": "fast_flip | moderate | slow",
    "resaleTimeframe": "1-3 days",
    "flipSummary": "How well the item holds value and how fast it would resell"
  },
  "visualAudit": {
    "isAuthenticUserPhoto": true,
    "isStockPhoto": false,
    "detectedFlawsOrWear": ["Flaw 1", "Flaw 2"],
    "accessoriesVisible": ["Item 1"],
    "conditionScore": "mint | good | fair | poor"
  },
  "negotiation": {
    "recommendedOffer": 0,
    "targetSavings": 0,
    "counterOfferMessage": "Polite ready-to-paste offer message"
  },
  "aiSummary": "Two sentence final verdict for an everyday buyer."
}`;
}

export function extractJsonFromResponse(raw: string): any {
  let text = raw.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  } else {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
  }
  return JSON.parse(text);
}

export async function analyzeListingOnServer(context: UniversalListingContext): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('SERVER_CONFIG_ERROR: Backend GEMINI_API_KEY is not configured in server environment.');
  }

  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
  ];
  const promptText = buildSystemPrompt(context);

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: promptText },
  ];

  if (context.imageBase64) {
    const cleanBase64 = context.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
    parts.push({
      inlineData: {
        mimeType: context.imageMimeType || 'image/jpeg',
        data: cleanBase64,
      },
    });
  }

  if (context.additionalImagesBase64 && Array.isArray(context.additionalImagesBase64)) {
    for (const addImg of context.additionalImagesBase64.slice(0, 2)) {
      if (addImg.base64) {
        const cleanAdd = addImg.base64.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        parts.push({
          inlineData: {
            mimeType: addImg.mimeType || 'image/jpeg',
            data: cleanAdd,
          },
        });
      }
    }
  }

  let lastError = '';
  let parsedJson: any = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // ── Attempt 1: Real-Time Web Search Grounding (Live Market Data) ──
    try {
      const searchPayload = {
        contents: [{ parts }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.2,
        },
      };

      const searchRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const candidate = searchData.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text;
        if (rawText) {
          parsedJson = extractJsonFromResponse(rawText);
          console.log(`[Gemini Grounding] Successfully analyzed listing with Google Search tools via ${model}`);
          if (candidate.groundingMetadata?.webSearchQueries) {
            console.log('[Gemini Grounding] Live web queries executed:', candidate.groundingMetadata.webSearchQueries);
          }
          break;
        }
      }
    } catch (searchErr: any) {
      console.warn(`[Gemini Grounding] Search tool attempt failed on ${model}:`, searchErr.message);
    }

    // ── Attempt 2: Structured JSON Mode (Direct Fallback) ──
    try {
      const fallbackPayload = {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json',
        },
      };

      const fallbackRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fallbackPayload),
      });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const rawText = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          parsedJson = extractJsonFromResponse(rawText);
          console.log(`[Gemini Direct] Successfully analyzed listing via direct JSON fallback on ${model}`);
          break;
        }
      } else {
        const errText = await fallbackRes.text();
        lastError = errText;
      }
    } catch (fallbackErr: any) {
      lastError = fallbackErr.message || String(fallbackErr);
    }
  }

  if (!parsedJson) {
    throw new Error(`Gemini AI service unavailable: ${lastError || 'All models failed'}`);
  }

  parsedJson.analyzedAt = Date.now();
  parsedJson.imageUrl = context.imageUrl;
  return harmonizeAnalysis(parsedJson, context);
}
