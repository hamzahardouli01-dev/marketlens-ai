/**
 * MarketLens AI — Appraisal Progress Plan
 *
 * The backend answers in one response, so the loading screen paces its steps
 * against an expected duration. Reading the listing is a real milestone; the
 * AI steps advance on time and the last one holds until the result arrives.
 */

export interface ProgressStage {
  icon: string;
  label: string;
}

export interface ProgressSnapshot {
  /** Index of the step currently running; steps before it are done. */
  activeIndex: number;
  /** 0-100. Approaches but never reaches 100 until the result arrives. */
  percent: number;
  hint: string;
}

// Share of the expected AI time at which each AI step starts.
const AI_STEP_STARTS = [0, 0.2, 0.65, 0.85];

export function buildStages(photoCount: number): ProgressStage[] {
  return [
    { icon: '📄', label: 'Reading the listing' },
    photoCount > 0
      ? { icon: '👁️', label: `Inspecting ${photoCount} photo${photoCount === 1 ? '' : 's'} for wear & damage` }
      : { icon: '👁️', label: 'No photos found, checking the description' },
    { icon: '🔎', label: 'Searching live market prices' },
    { icon: '🛡️', label: 'Checking for scam & red flags' },
    { icon: '✍️', label: 'Writing your deal score & offer' },
  ];
}

/** Rough AI time: web search plus a few seconds per photo. */
export function expectedDurationMs(photoCount: number): number {
  return Math.min(50_000, 20_000 + photoCount * 7_000);
}

export function hintFor(elapsedMs: number, expectedMs: number): string {
  const seconds = elapsedMs / 1000;
  if (seconds < 12) return `Usually takes about ${Math.round(expectedMs / 1000)} seconds.`;
  if (seconds < 30) return 'Comparing real sold prices on eBay, Swappa and other marketplaces…';
  if (seconds < 60) return 'Still working. Photo checks take a little longer. You can close this panel, the result will be here when you reopen it.';
  return 'Almost there. Busy times can take up to 2 minutes.';
}

/**
 * @param aiElapsedMs time since the listing was read and sent to the AI, or null
 *                    while the listing is still being read.
 */
export function progressSnapshot(aiElapsedMs: number | null, expectedMs: number, totalElapsedMs: number): ProgressSnapshot {
  if (aiElapsedMs === null) {
    return { activeIndex: 0, percent: Math.min(8, totalElapsedMs / 250), hint: hintFor(totalElapsedMs, expectedMs) };
  }

  const ratio = aiElapsedMs / expectedMs;
  let step = 0;
  AI_STEP_STARTS.forEach((start, i) => {
    if (ratio >= start) step = i;
  });

  // Linear to 90% at the expected time, then creep toward 99%.
  const percent = ratio <= 1 ? 10 + 80 * ratio : 99 - 9 * Math.exp(-(ratio - 1) * 1.5);

  return { activeIndex: 1 + step, percent, hint: hintFor(totalElapsedMs, expectedMs) };
}
