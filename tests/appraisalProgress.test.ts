import { describe, it, expect } from 'vitest';
import {
  buildStages,
  expectedDurationMs,
  progressSnapshot,
} from '../src/utils/appraisalProgress';

describe('appraisalProgress', () => {
  it('names the photo count in the inspection step', () => {
    expect(buildStages(3)[1].label).toContain('3 photos');
    expect(buildStages(1)[1].label).toContain('1 photo ');
    expect(buildStages(0)[1].label).toContain('No photos');
  });

  it('expects photo appraisals to take longer, with a cap', () => {
    expect(expectedDurationMs(3)).toBeGreaterThan(expectedDurationMs(0));
    expect(expectedDurationMs(20)).toBe(50_000);
  });

  it('stays on the first step while the listing is read', () => {
    const snap = progressSnapshot(null, 30_000, 1_000);
    expect(snap.activeIndex).toBe(0);
    expect(snap.percent).toBeLessThan(10);
  });

  it('walks through the AI steps and holds on the last one', () => {
    const expected = 30_000;
    const steps = [0, 0.3, 0.7, 0.9, 3].map((r) => progressSnapshot(r * expected, expected, r * expected).activeIndex);
    expect(steps).toEqual([1, 2, 3, 4, 4]);
  });

  it('never reports 100% before the result arrives', () => {
    const expected = 30_000;
    let previous = 0;
    for (const ratio of [0, 0.5, 1, 1.5, 3, 10]) {
      const { percent } = progressSnapshot(ratio * expected, expected, ratio * expected);
      expect(percent).toBeGreaterThanOrEqual(previous);
      expect(percent).toBeLessThan(100);
      previous = percent;
    }
  });

  it('changes the reassurance hint as time passes', () => {
    const hints = [5_000, 20_000, 45_000, 90_000].map((t) => progressSnapshot(t, 30_000, t).hint);
    expect(new Set(hints).size).toBe(4);
  });
});
