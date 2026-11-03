/**
 * Server-Side Gemini Multimodal Vision Service
 *
 * Securely calls Google Gemini API without exposing credentials to client browsers.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
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


// ─── Gemini Configuration ─────────────────────────────────────────────────────
//
// Everything is read from environment variables at call time, so changing
// GEMINI_API_KEY or GEMINI_MODEL in the Render dashboard takes effect on the
// automatic restart, with no code change and no extension update.
//
// - GEMINI_API_KEY: required.
// - GEMINI_MODEL:   optional, comma-separated (e.g. "gemini-2.5-flash,gemini-flash-latest").
//                   When unset, the newest stable Flash model available to the key is
//                   discovered automatically from Google's model list.
// - GEMINI_THINKING: optional, "low" (default, fastest), "medium", "high", or "off" to let
//                   the model decide. Less thinking is the biggest speed win for appraisals.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STATUS_CACHE_TTL_MS = 60 * 1000;
const LIST_TIMEOUT_MS = 15 * 1000;
// Photo appraisals with Google Search grounding regularly take 45-90s.
const GENERATE_TIMEOUT_MS = 150 * 1000;

export type GeminiErrorCode = 'NOT_CONFIGURED' | 'INVALID_KEY' | 'RATE_LIMITED' | 'UNAVAILABLE';

export class GeminiServiceError extends Error {
  constructor(public code: GeminiErrorCode, message: string) {
    super(message);
    this.name = 'GeminiServiceError';
  }
}

type ModelSource = 'env' | 'auto' | 'fallback';

interface ResolvedModels {
  models: string[];
  source: ModelSource;
}

let modelCache: (ResolvedModels & { apiKey: string; fetchedAt: number }) | null = null;

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiServiceError('NOT_CONFIGURED', 'GEMINI_API_KEY is not set in the server environment.');
  }
  return apiKey;
}

/**
 * Reads a failed Gemini response. Returns a fatal error when retrying other
 * models is pointless (bad key, quota), or null when the next model may work.
 */
async function classifyGeminiError(res: Response): Promise<{ fatal: GeminiServiceError | null; message: string }> {
  const body = await res.text();
  let message = body;
  let details = '';
  try {
    const json = JSON.parse(body);
    message = json.error?.message || body;
    details = JSON.stringify(json.error?.details || '');
  } catch {
    // non-JSON body
  }

  if (res.status === 401 || res.status === 403 || details.includes('API_KEY_INVALID')) {
    return {
      fatal: new GeminiServiceError('INVALID_KEY', `Gemini rejected GEMINI_API_KEY (${res.status}): ${message}`),
      message,
    };
  }
  if (res.status === 429) {
    return {
      fatal: new GeminiServiceError('RATE_LIMITED', `Gemini rate limit or quota reached: ${message}`),
      message,
    };
  }
  return { fatal: null, message };
}

function modelVersion(name: string): number {
  const match = name.match(/^gemini-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/** Picks general-purpose Flash models from Google's model list, newest stable first. */
export function pickFlashModels(
  models: Array<{ name?: string; supportedGenerationMethods?: string[] }>
): string[] {
  return models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name || '').replace(/^models\//, ''))
    .filter((name) => /^gemini-\d+(\.\d+)?-flash/.test(name))
    .filter((name) => !/(lite|image|tts|audio|live|thinking|exp|computer)/.test(name))
    .sort((a, b) => {
      const previewDiff = Number(a.includes('preview')) - Number(b.includes('preview'));
      if (previewDiff !== 0) return previewDiff;
      const versionDiff = modelVersion(b) - modelVersion(a);
      if (versionDiff !== 0) return versionDiff;
      return a.length - b.length;
    })
    .slice(0, 3);
}

async function listModels(apiKey: string, pageSize: number): Promise<Response> {
  return fetch(`${GEMINI_API_BASE}/models?pageSize=${pageSize}`, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
}

export async function resolveModels(apiKey: string): Promise<ResolvedModels> {
  const fromEnv = process.env.GEMINI_MODEL?.split(',').map((m) => m.trim()).filter(Boolean);
  if (fromEnv?.length) {
    return { models: fromEnv, source: 'env' };
  }

  if (modelCache && modelCache.apiKey === apiKey && Date.now() - modelCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return { models: modelCache.models, source: modelCache.source };
  }

  try {
    const res = await listModels(apiKey, 1000);
    if (!res.ok) {
      const { fatal, message } = await classifyGeminiError(res);
      if (fatal) throw fatal;
      console.warn('[Gemini Models] Model discovery failed:', message);
    } else {
      const data = await res.json();
      const picked = pickFlashModels(data.models || []);
      if (picked.length) {
        const models = [...new Set([...picked, ...FALLBACK_MODELS])];
        modelCache = { apiKey, models, source: 'auto', fetchedAt: Date.now() };
        return { models, source: 'auto' };
      }
    }
  } catch (err) {
    if (err instanceof GeminiServiceError) throw err;
    console.warn('[Gemini Models] Model discovery failed:', err instanceof Error ? err.message : String(err));
  }

  return { models: FALLBACK_MODELS, source: 'fallback' };
}

// ─── Status (for /health/ai and startup logs) ─────────────────────────────────

export interface GeminiStatus {
  configured: boolean;
  keyValid: boolean;
  models: string[];
  modelSource: ModelSource | null;
  error?: string;
  checkedAt: number;
}

let statusCache: GeminiStatus | null = null;

/** Verifies the key with a cheap model-list call. Never includes the key itself. */
export async function getGeminiStatus(): Promise<GeminiStatus> {
  if (statusCache && Date.now() - statusCache.checkedAt < STATUS_CACHE_TTL_MS) {
    return statusCache;
  }

  const status: GeminiStatus = {
    configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    keyValid: false,
    models: [],
    modelSource: null,
    checkedAt: Date.now(),
  };

  try {
    const apiKey = getApiKey();
    const res = await listModels(apiKey, 1);
    if (!res.ok) {
      const { fatal, message } = await classifyGeminiError(res);
      status.error = fatal?.message || `Gemini model list failed (${res.status}): ${message}`;
    } else {
      status.keyValid = true;
      const resolved = await resolveModels(apiKey);
      status.models = resolved.models;
      status.modelSource = resolved.source;
    }
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }

  statusCache = status;
  return status;
}

// ─── Appraisal ────────────────────────────────────────────────────────────────

// Models that rejected thinkingConfig; they are called without it from then on.
const modelsWithoutThinking = new Set<string>();

/** Gemini 3+ takes a thinking level, 2.5 a token budget; other models get nothing. */
function thinkingConfigFor(model: string): Record<string, unknown> | null {
  const level = (process.env.GEMINI_THINKING || 'low').trim().toLowerCase();
  if (level === 'off' || modelsWithoutThinking.has(model)) return null;
  const version = modelVersion(model);
  if (version >= 3) return { thinkingLevel: level };
  if (version >= 2.5) return { thinkingBudget: level === 'low' ? 1024 : level === 'medium' ? 4096 : -1 };
  return null;
}

async function generateContent(
  model: string,
  apiKey: string,
  payload: { contents: unknown; tools?: unknown; generationConfig: Record<string, unknown> }
): Promise<{ text?: string; candidate?: any; error?: string }> {
  const thinkingConfig = thinkingConfigFor(model);
  const body = thinkingConfig
    ? { ...payload, generationConfig: { ...payload.generationConfig, thinkingConfig } }
    : payload;

  const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const { fatal, message } = await classifyGeminiError(res);
    if (fatal) throw fatal;
    if (thinkingConfig && res.status === 400 && /thinking/i.test(message)) {
      console.warn(`[Gemini] ${model} does not accept thinkingConfig; retrying without it.`);
      modelsWithoutThinking.add(model);
      return generateContent(model, apiKey, payload);
    }
    return { error: `${model} (${res.status}): ${message}` };
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
  return text ? { text, candidate } : { error: `${model}: empty response` };
}

// ─── Result Cache ─────────────────────────────────────────────────────────────
// The same listing is often opened again (or by several buyers). Serving it from
// memory makes repeat appraisals instant and saves Gemini quota.

const RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESULT_CACHE_MAX = 300;
const resultCache = new Map<string, { analysis: any; storedAt: number }>();

function cacheKeyFor(context: UniversalListingContext): string {
  const hash = createHash('sha256');
  for (const part of [context.url, context.title, context.priceRaw, context.currency, context.description]) {
    hash.update(`${part || ''}\u0000`);
  }
  hash.update(context.imageBase64 || '');
  for (const img of context.additionalImagesBase64 || []) hash.update(img.base64 || '');
  return hash.digest('hex');
}

export async function analyzeListingOnServer(context: UniversalListingContext): Promise<any> {
  const key = cacheKeyFor(context);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.storedAt < RESULT_CACHE_TTL_MS) {
    console.log('[Gemini Cache] Served repeat appraisal from cache');
    return { ...cached.analysis, imageUrl: context.imageUrl };
  }

  const analysis = await runGeminiAppraisal(context);

  resultCache.delete(key);
  resultCache.set(key, { analysis, storedAt: Date.now() });
  if (resultCache.size > RESULT_CACHE_MAX) {
    resultCache.delete(resultCache.keys().next().value as string);
  }
  return analysis;
}

async function runGeminiAppraisal(context: UniversalListingContext): Promise<any> {
  const apiKey = getApiKey();
  const { models: modelsToTry, source } = await resolveModels(apiKey);
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

  // Google Search grounding cannot be combined with JSON mode, so each model gets
  // a grounded attempt first and a plain JSON-mode attempt second.
  const attempts = [
    {
      label: 'Gemini Grounding',
      payload: { contents: [{ parts }], tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2 } },
    },
    {
      label: 'Gemini Direct',
      payload: { contents: [{ parts }], generationConfig: { temperature: 0.2, response_mime_type: 'application/json' } },
    },
  ];

  let lastError = '';
  let parsedJson: any = null;

  for (const model of modelsToTry) {
    for (const attempt of attempts) {
      try {
        const result = await generateContent(model, apiKey, attempt.payload);
        if (!result.text) {
          lastError = result.error || lastError;
          continue;
        }
        parsedJson = extractJsonFromResponse(result.text);
        console.log(`[${attempt.label}] Analyzed listing via ${model} (models from ${source})`);
        if (result.candidate?.groundingMetadata?.webSearchQueries) {
          console.log('[Gemini Grounding] Live web queries executed:', result.candidate.groundingMetadata.webSearchQueries);
        }
        break;
      } catch (err) {
        // Bad key or quota: every other model would fail the same way.
        if (err instanceof GeminiServiceError) throw err;
        lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[${attempt.label}] Attempt failed on ${model}:`, lastError);
      }
    }
    if (parsedJson) break;
  }

  if (!parsedJson) {
    modelCache = null; // rediscover models on the next request
    throw new GeminiServiceError('UNAVAILABLE', `All Gemini models failed. Last error: ${lastError || 'unknown'}`);
  }

  parsedJson.analyzedAt = Date.now();
  parsedJson.imageUrl = context.imageUrl;
  return harmonizeAnalysis(parsedJson, context);
}
