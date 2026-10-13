/**
 * Drawer Display Helper Tests
 */
import { describe, it, expect } from 'vitest';
import { buildPriceScale, esc, money } from '../src/utils/format';

describe('esc', () => {
  it('escapes markup so listing text cannot inject HTML', () => {
    expect(esc('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(esc("Tom's & Jerry's")).toBe('Tom&#39;s &amp; Jerry&#39;s');
  });

  it('handles non-string and empty values', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('money', () => {
  it('formats whole dollars with separators', () => {
    expect(money(1499.6)).toBe('$1,500');
    expect(money(320)).toBe('$320');
    expect(money(0)).toBe('$0');
  });

  it('formats negatives with a minus sign', () => {
    expect(money(-75)).toBe('−$75');
  });

  it('returns a dash for missing values', () => {
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
    expect(money(NaN)).toBe('—');
  });
});

describe('buildPriceScale', () => {
  it('orders asking price, fair band and retail on one axis', () => {
    const s = buildPriceScale({ asking: 320, fairMin: 380, fairMax: 430, msrp: 499 });
    expect(s.asking).not.toBeNull();
    expect(s.asking!).toBeLessThan(s.bandStart!);
    expect(s.bandStart!).toBeLessThan(s.bandEnd!);
    expect(s.bandEnd!).toBeLessThan(s.msrp!);
  });

  it('places an overpriced asking price above the fair range', () => {
    const s = buildPriceScale({ asking: 900, fairMin: 380, fairMax: 430, msrp: 499 });
    expect(s.asking!).toBeGreaterThan(s.msrp!);
    expect(s.asking!).toBeLessThanOrEqual(97);
  });

  it('keeps every marker inside the track', () => {
    const s = buildPriceScale({ asking: 1, fairMin: 5000, fairMax: 6000, msrp: 9000 });
    for (const v of [s.asking, s.bandStart, s.bandEnd, s.msrp]) {
      expect(v!).toBeGreaterThanOrEqual(0);
      expect(v!).toBeLessThanOrEqual(100);
    }
  });

  it('tolerates a reversed fair range', () => {
    const s = buildPriceScale({ fairMin: 430, fairMax: 380 });
    expect(s.bandStart!).toBeLessThan(s.bandEnd!);
  });

  it('omits values that are missing or zero', () => {
    const s = buildPriceScale({ asking: 0, fairMin: 100, fairMax: 200, msrp: null });
    expect(s.asking).toBeNull();
    expect(s.msrp).toBeNull();
    expect(s.bandStart).not.toBeNull();
  });

  it('returns all nulls when nothing is known', () => {
    expect(buildPriceScale({})).toEqual({ asking: null, bandStart: null, bandEnd: null, msrp: null });
  });

  it('handles a single known value without dividing by zero', () => {
    const s = buildPriceScale({ asking: 250 });
    expect(Number.isFinite(s.asking!)).toBe(true);
  });
});
