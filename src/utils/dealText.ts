/**
 * MarketLens AI — Counter-offer templates and shareable summary text.
 */

import type { AIProductAnalysis } from '../types/ai';
import { money } from './format';
import { t } from '../i18n';

export type OfferTone = 'ai' | 'friendly' | 'direct' | 'cash';

export const OFFER_TONES: OfferTone[] = ['ai', 'friendly', 'direct', 'cash'];

export function offerToneLabel(tone: OfferTone): string {
  return t(`offer.tone.${tone}` as const);
}

/** Short, natural item name for messages ("PlayStation 5" rather than the full spec line). */
export function shortItemName(analysis: Pick<AIProductAnalysis, 'identifiedProduct'>, fallback = 'item'): string {
  const p = analysis.identifiedProduct;
  const candidate = (p?.model && p.model.length <= 40 ? p.model : p?.name) || fallback;
  const trimmed = candidate.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45).trim()}…` : trimmed || fallback;
}

export interface OfferInput {
  item: string;
  amount: number;
  fairAverage?: number | null;
}

export function buildOfferMessage(tone: Exclude<OfferTone, 'ai'>, { item, amount, fairAverage }: OfferInput): string {
  const params = { item, amount: money(amount) };
  switch (tone) {
    case 'friendly':
      return t('offer.msg.friendly', params);
    case 'direct':
      return fairAverage && fairAverage > 0
        ? t('offer.msg.directMarket', { ...params, market: money(fairAverage) })
        : t('offer.msg.direct', params);
    case 'cash':
      return t('offer.msg.cash', params);
  }
}

/** Step size for the offer stepper, scaled to the price. */
export function offerStep(amount: number): number {
  if (amount < 50) return 1;
  if (amount < 200) return 5;
  if (amount < 1000) return 10;
  if (amount < 5000) return 50;
  return 100;
}

/** Plain-text report suitable for pasting into a message or note. */
export function buildDealSummary(
  analysis: AIProductAnalysis,
  context: { url: string; title?: string; priceRaw?: string }
): string {
  const p = analysis.pricing;
  const fair = p?.fairUsedMarketRange;
  const lines: string[] = [];

  lines.push(`MarketLens AI — ${analysis.identifiedProduct?.name || context.title || t('results.marketItem')}`);

  const verdict = analysis.buyVerdict ? t(`verdict.${analysis.buyVerdict}` as const) : null;
  const score =
    typeof analysis.buyScore === 'number' ? t('summary.score', { score: Math.round(analysis.buyScore) }) : null;
  const headline = [verdict, score].filter(Boolean).join(', ');
  if (headline || analysis.buyVerdictLabel) {
    lines.push(t('summary.verdict', { text: [headline, analysis.buyVerdictLabel].filter(Boolean).join(' — ') }));
  }

  const priceParts = [t('summary.asking', { amount: context.priceRaw || money(p?.askingPrice) })];
  if (fair) {
    priceParts.push(t('summary.fair', { min: money(fair.min), max: money(fair.max), avg: money(fair.fairAverage) }));
  }
  if (p?.estimatedNewPrice) priceParts.push(t('summary.retail', { amount: money(p.estimatedNewPrice) }));
  lines.push(t('summary.price', { text: priceParts.join(' · ') }));

  if (analysis.negotiation?.recommendedOffer) {
    lines.push(t('summary.offer', { amount: money(analysis.negotiation.recommendedOffer) }));
  }

  const grade = analysis.visualAudit?.conditionScore;
  if (grade) lines.push(t('summary.condition', { grade: t(`condition.${grade}` as const) }));

  const flags = analysis.redFlags ?? [];
  if (flags.length > 0) {
    lines.push(t('summary.watchOut'));
    flags.forEach((f) => lines.push(`  • ${f.text}`));
  }

  if (analysis.aiSummary) lines.push('', analysis.aiSummary);
  if (context.url) lines.push('', context.url);

  return lines.join('\n');
}
