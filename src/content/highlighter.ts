/**
 * CarListing Lens — Phrase Highlighter
 *
 * Detects and categorizes notable phrases in listing text.
 * Handles negation and context to avoid false positives.
 * Supports English and French.
 */

import type { FlaggedPhrase, FlagCategory } from '../types/listing';

interface PatternRule {
  category: FlagCategory;
  label: string;
  /** Main keyword or phrase pattern (case-insensitive) */
  pattern: RegExp;
  /** If this pattern appears within 3 words before the main pattern, skip the match */
  negationWords?: string[];
}

const RULES: PatternRule[] = [
  // ── Mechanical Concerns ──
  {
    category: 'mechanical_concern',
    label: 'Transmission issue',
    pattern: /\b(needs?\s*transmission|transmission\s*(problem|issue|fail|gone|shot|clunk|slip)|bo[iî]te\s*de\s*vitesse\s*(?:\w+\s*){0,4}(probl[eè]me|d[eé]faut|hs|bris[ée]?|claqu|slip)|probl[eè]me\s*(?:de\s*|avec\s*(?:la\s*)?)bo[iî]te\s*de\s*vitesse)\b/i,
    negationWords: ['no', 'not', 'never', 'without', 'sans', 'aucun'],
  },
  {
    category: 'mechanical_concern',
    label: 'Engine concern',
    pattern: /\b(engine\s*knock|knocking|motor\s*knock|moteur\s*(frappe|claque)|claquement\s*moteur)\b/i,
    negationWords: ['no', 'not', 'never', 'fixed', 'resolved', 'réparé'],
  },
  {
    category: 'mechanical_concern',
    label: 'Overheating',
    pattern: /\b(overheat(?:ing|ed|s)?|surchauffe|runs?\s*hot|température\s*élevée)\b/i,
    negationWords: ['no', 'not', 'never', 'fixed', 'réparé'],
  },
  {
    category: 'mechanical_concern',
    label: 'Does not run',
    pattern: /\b(does\s*not\s*run|doesn'?t\s*run|won'?t\s*start|ne\s*démarre\s*pas|ne\s*roule\s*pas|does\s*not\s*drive|doesn'?t\s*drive)\b/i,
    negationWords: [],
  },
  {
    category: 'mechanical_concern',
    label: 'Needs repairs',
    pattern: /\b(needs?\s*(work|repair|fix|attention|service)|nécessite\s*(réparation|travaux|attention))\b/i,
    negationWords: ['no', 'not'],
  },
  {
    category: 'mechanical_concern',
    label: 'Oil leak',
    pattern: /\b(oil\s*leak|fuite\s*d'huile|leaking\s*oil)\b/i,
    negationWords: ['no', 'not', 'sans', 'fixed', 'réparé'],
  },
  {
    category: 'mechanical_concern',
    label: 'Check engine light',
    pattern: /\b(check\s*engine|cel\b|témoin\s*moteur|voyant\s*moteur)\b/i,
    negationWords: ['no', 'not', 'off', 'éteint', 'cleared'],
  },
  {
    category: 'mechanical_concern',
    label: 'Rust / Frame damage',
    pattern: /\b(frame\s*damage|rust\s*through|rusted\s*(frame|floor|subframe)|rouille\s*(structure|plancher|châssis))\b/i,
    negationWords: ['no', 'not', 'minor', 'surface'],
  },

  // ── Title / Condition Disclosures ──
  {
    category: 'title_disclosure',
    label: 'Rebuilt title',
    pattern: /\b(rebuilt\s*title|rebuilt|reconstruit|titre\s*reconstruit)\b/i,
    negationWords: [],
  },
  {
    category: 'title_disclosure',
    label: 'Salvage title',
    pattern: /\b(salvage|épave|titre\s*épave|salvage\s*title)\b/i,
    negationWords: [],
  },
  {
    category: 'title_disclosure',
    label: 'For parts only',
    pattern: /\b(for\s*parts|parts\s*only|pour\s*pièces|pour\s*démontage)\b/i,
    negationWords: [],
  },

  // ── Payment Ambiguity ──
  {
    category: 'payment_ambiguity',
    label: 'Monthly payment mentioned',
    pattern: /\b(monthly\s*payment|per\s*month|\/mo\b|versement\s*mensuel|par\s*mois)\b/i,
    negationWords: [],
  },
  {
    category: 'payment_ambiguity',
    label: 'Down payment mentioned',
    pattern: /\b(down\s*payment|acompte|mise\s*de\s*fonds)\b/i,
    negationWords: [],
  },
  {
    category: 'payment_ambiguity',
    label: 'Financing mentioned',
    pattern: /\b(financing|finance\s*available|financement\s*disponible|financement\s*offert)\b/i,
    negationWords: [],
  },

  // ── Inspection / Sale Conditions ──
  {
    category: 'inspection_condition',
    label: 'Needs inspection',
    pattern: /\b(needs?\s*inspection|safety\s*needed|requires?\s*safety|inspection\s*required|inspection\s*nécessaire)\b/i,
    negationWords: ['no', 'not'],
  },
  {
    category: 'inspection_condition',
    label: 'Out of province',
    pattern: /\b(out\s*of\s*province|hors\s*province|out-of-province\s*inspection)\b/i,
    negationWords: [],
  },
  {
    category: 'inspection_condition',
    label: 'Sold as-is',
    pattern: /\b(as\s*[–-]?\s*is|tel\s*quel|vendu\s*tel\s*quel|no\s*warranty|sans\s*garantie)\b/i,
    negationWords: [],
  },
  {
    category: 'inspection_condition',
    label: 'Out of province',
    pattern: /\b(out\s*of\s*province|hors\s*province)\b/i,
    negationWords: [],
  },
];

/** Split text into sentences for context extraction */
function toSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

/** Check if a negation word appears within the 4 tokens before the match start in the sentence */
function isNegated(sentence: string, matchIndex: number, negationWords: string[]): boolean {
  if (negationWords.length === 0) return false;
  // Get the 40 characters before the match
  const before = sentence.slice(Math.max(0, matchIndex - 40), matchIndex);
  const tokens = before.toLowerCase().split(/\s+/);
  const windowTokens = tokens.slice(-4);
  return windowTokens.some((t) => negationWords.some((n) => t === n || t.startsWith(n)));
}

export function detectPhrases(text: string): FlaggedPhrase[] {
  const results: FlaggedPhrase[] = [];
  const seen = new Set<string>();
  const sentences = toSentences(text);

  for (const rule of RULES) {
    for (const sentence of sentences) {
      const match = rule.pattern.exec(sentence);
      if (!match) continue;

      const key = `${rule.category}:${rule.label}`;
      if (seen.has(key)) continue;

      if (isNegated(sentence, match.index, rule.negationWords ?? [])) continue;

      seen.add(key);
      results.push({
        category: rule.category,
        label: rule.label,
        keyword: match[0],
        excerpt: sentence.trim().slice(0, 300),
      });
    }
  }

  return results;
}
