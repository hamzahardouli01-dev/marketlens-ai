/**
 * MarketLens AI — Counter-offer templates and shareable summary text.
 */

import type { AIProductAnalysis } from '../types/ai';
import { money } from './format';

export type OfferTone = 'ai' | 'friendly' | 'direct' | 'cash';

export const OFFER_TONES: Array<{ id: OfferTone; label: string }> = [
  { id: 'ai', label: 'AI draft' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'direct', label: 'Direct' },
  { id: 'cash', label: 'Cash pickup' },
];

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
  const offer = money(amount);
  switch (tone) {
    case 'friendly':
      return `Hi! I'm interested in your ${item}. Would you consider ${offer}? I'm flexible on pickup time. Thanks!`;
    case 'direct':
      return fairAverage && fairAverage > 0
        ? `Hi, I'd like to buy your ${item}. Similar ones are selling for around ${money(fairAverage)}, so I can offer ${offer}. Let me know if that works.`
        : `Hi, I'd like to buy your ${item}. I can offer ${offer}. Let me know if that works.`;
    case 'cash':
      return `Hi! Is your ${item} still available? I can pick it up today and pay ${offer} cash.`;
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

const VERDICT_TEXT: Record<string, string> = {
  buy_now: 'Buy now',
  good_buy: 'Good buy',
  negotiate: 'Negotiate first',
  caution: 'Caution',
  walk_away: 'Walk away',
};

/** Plain-text report suitable for pasting into a message or note. */
export function buildDealSummary(
  analysis: AIProductAnalysis,
  context: { url: string; title?: string; priceRaw?: string }
): string {
  const p = analysis.pricing;
  const fair = p?.fairUsedMarketRange;
  const lines: string[] = [];

  lines.push(`MarketLens AI — ${analysis.identifiedProduct?.name || context.title || 'Listing'}`);

  const verdict = analysis.buyVerdict ? VERDICT_TEXT[analysis.buyVerdict] : null;
  const score = typeof analysis.buyScore === 'number' ? `${Math.round(analysis.buyScore)}/100` : null;
  const headline = [verdict, score && `score ${score}`].filter(Boolean).join(', ');
  if (headline || analysis.buyVerdictLabel) {
    lines.push(`Verdict: ${[headline, analysis.buyVerdictLabel].filter(Boolean).join(' — ')}`);
  }

  const asking = context.priceRaw || money(p?.askingPrice);
  const priceParts = [`Asking ${asking}`];
  if (fair) priceParts.push(`fair used ${money(fair.min)}–${money(fair.max)} (avg ${money(fair.fairAverage)})`);
  if (p?.estimatedNewPrice) priceParts.push(`retail ${money(p.estimatedNewPrice)}`);
  lines.push(`Price: ${priceParts.join(' · ')}`);

  if (analysis.negotiation?.recommendedOffer) {
    lines.push(`Suggested offer: ${money(analysis.negotiation.recommendedOffer)}`);
  }

  if (analysis.visualAudit?.conditionScore) {
    const grade = analysis.visualAudit.conditionScore;
    lines.push(`Condition: ${grade.charAt(0).toUpperCase()}${grade.slice(1)}`);
  }

  const flags = analysis.redFlags ?? [];
  if (flags.length > 0) {
    lines.push('Watch out for:');
    flags.forEach((f) => lines.push(`  • ${f.text}`));
  }

  if (analysis.aiSummary) lines.push('', analysis.aiSummary);
  if (context.url) lines.push('', context.url);

  return lines.join('\n');
}
