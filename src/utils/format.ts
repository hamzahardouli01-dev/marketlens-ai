/**
 * MarketLens AI — Display helpers for the in-page drawer.
 */

import { getDir, intlLocale, t } from '../i18n';

/** Escape text for safe interpolation into innerHTML (text or attribute context). */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Whole-dollar amount with thousands separators, e.g. 1499.6 → "$1,500". */
export function money(value: number | null | undefined): string {
  if (typeof value !== 'number' || !isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const text = `${sign}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
  // In right-to-left text (Arabic) "$320" would otherwise render as "320$"; isolate it as left-to-right
  return getDir() === 'rtl' ? `\u2066${text}\u2069` : text;
}

export interface PriceScaleInput {
  asking?: number | null;
  fairMin?: number | null;
  fairMax?: number | null;
  msrp?: number | null;
}

/** Positions on a 0–100 track; null when the value isn't available. */
export interface PriceScale {
  asking: number | null;
  bandStart: number | null;
  bandEnd: number | null;
  msrp: number | null;
}

const usable = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v) && v > 0;

/**
 * Lay asking price, fair used range and retail price out on one shared linear
 * axis, so the chart shows where the asking price sits relative to real values.
 */
export function buildPriceScale(input: PriceScaleInput): PriceScale {
  let fairMin = usable(input.fairMin) ? input.fairMin : null;
  let fairMax = usable(input.fairMax) ? input.fairMax : null;
  if (fairMin !== null && fairMax !== null && fairMin > fairMax) {
    [fairMin, fairMax] = [fairMax, fairMin];
  }
  const asking = usable(input.asking) ? input.asking : null;
  const msrp = usable(input.msrp) ? input.msrp : null;

  const values = [asking, fairMin, fairMax, msrp].filter((v): v is number => v !== null);
  if (values.length === 0) {
    return { asking: null, bandStart: null, bandEnd: null, msrp: null };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max || 1;
  const lo = Math.max(0, min - span * 0.15);
  const hi = max + span * 0.1;

  const pos = (v: number | null, clamp = true): number | null => {
    if (v === null) return null;
    const p = ((v - lo) / (hi - lo)) * 100;
    return clamp ? Math.min(97, Math.max(3, p)) : Math.min(100, Math.max(0, p));
  };

  return {
    asking: pos(asking),
    bandStart: pos(fairMin ?? fairMax, false),
    bandEnd: pos(fairMax ?? fairMin, false),
    msrp: pos(msrp),
  };
}

/** Short relative time in the active language, e.g. "5 min ago", "yesterday", "il y a 3 jours". */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return t('time.justNow');

  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto', style: 'long' });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.round(months / 12), 'year');
}
