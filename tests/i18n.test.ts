/// <reference types="node" />
/**
 * Internationalisation tests — catalogue integrity, plurals and language detection
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  LOCALES,
  detectLocale,
  getCatalog,
  getDir,
  matchLocale,
  setLocale,
  t,
  tn,
  type Locale,
  type PluralKey,
} from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { money, timeAgo } from '../src/utils/format';
import { buildOfferMessage } from '../src/utils/dealText';

const placeholders = (s: string) => new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]));
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const pluralBases = new Set(
  Object.keys(en)
    .filter((k) => k.endsWith('_other'))
    .map((k) => k.replace(/_other$/, ''))
);

afterEach(() => setLocale('en'));

describe('message catalogues', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const catalog = getCatalog(locale);

      it('has a non-empty translation for every English key', () => {
        for (const key of Object.keys(en)) {
          expect(catalog[key], `${locale}: ${key}`).toBeTruthy();
          expect(catalog[key].trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
        }
      });

      it('only adds extra keys for plural forms', () => {
        for (const key of Object.keys(catalog)) {
          if (key in en) continue;
          const base = key.replace(PLURAL_SUFFIX, '');
          expect(pluralBases.has(base) && PLURAL_SUFFIX.test(key), `${locale}: unexpected key ${key}`).toBe(true);
        }
      });

      it('uses the same {placeholders} as English', () => {
        for (const [key, value] of Object.entries(catalog)) {
          const base = key.replace(PLURAL_SUFFIX, '');
          const isPlural = pluralBases.has(base) && PLURAL_SUFFIX.test(key);
          const english = isPlural ? (en as Record<string, string>)[`${base}_other`] : (en as Record<string, string>)[key];
          const expected = placeholders(english);
          const actual = placeholders(value);
          // A plural form may spell the number out ("one", "two") instead of using {count}
          if (isPlural) {
            expected.delete('count');
            actual.delete('count');
          }
          expect([...actual].sort(), `${locale}: ${key}`).toEqual([...expected].sort());
        }
      });

      it('resolves every plural form it needs', () => {
        setLocale(locale);
        for (const base of pluralBases) {
          for (const n of [0, 1, 2, 3, 5, 11, 21, 22, 100, 101]) {
            const text = tn(base as PluralKey, n);
            expect(text, `${locale}: ${base}(${n})`).not.toContain(base);
            expect(text, `${locale}: ${base}(${n})`).not.toMatch(/\{\w+\}/);
          }
        }
      });
    });
  }
});

describe('language detection', () => {
  it('maps browser and page tags to supported languages', () => {
    expect(matchLocale('pt-BR')).toBe('pt');
    expect(matchLocale('zh-TW')).toBe('zh');
    expect(matchLocale('AR')).toBe('ar');
    expect(matchLocale('es_419')).toBe('es');
    expect(matchLocale('ur-PK')).toBeNull();
    expect(matchLocale('')).toBeNull();
  });

  it('prefers the Settings choice, then the page, then the browser', () => {
    expect(detectLocale({ preference: 'de', pageLang: 'ar', browserLangs: ['fr'] })).toBe('de');
    expect(detectLocale({ preference: 'auto', pageLang: 'ar', browserLangs: ['fr'] })).toBe('ar');
    expect(detectLocale({ preference: 'auto', pageLang: '', browserLangs: ['ja-JP', 'fr-CA'] })).toBe('fr');
  });

  it('falls back to English for unsupported languages', () => {
    expect(detectLocale({ pageLang: 'ja', browserLangs: ['ko-KR', 'tr'] })).toBe('en');
    expect(detectLocale({})).toBe('en');
  });

  it('uses right-to-left layout only for Arabic', () => {
    for (const locale of LOCALES) {
      expect(getDir(locale)).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    }
  });
});

describe('translation helpers', () => {
  it('interpolates parameters and leaves unknown placeholders in place', () => {
    expect(t('price.belowMarket', { pct: 21 })).toBe('21% below market');
    expect(t('guide.tip')).toContain('{keys}');
  });

  it('switches every helper to the active language', () => {
    setLocale('fr');
    expect(t('verdict.buy_now')).toBe('Achetez vite');
    expect(tn('risk.warnings', 2)).toBe('2 alertes');
    expect(buildOfferMessage('cash', { item: 'PS5', amount: 290 })).toContain('$290');
    expect(timeAgo(Date.now() - 3 * 86_400_000)).toMatch(/il y a 3 jours/);

    setLocale('ru');
    expect(tn('risk.warnings', 1)).toBe('1 предупреждение');
    expect(tn('risk.warnings', 3)).toBe('3 предупреждения');
    expect(tn('risk.warnings', 5)).toBe('5 предупреждений');

    setLocale('ar');
    expect(tn('options.listingsCount', 2)).toBe('إعلانان');
    // Prices are isolated as left-to-right so "$320" never renders as "320$"
    expect(money(320)).toBe('\u2066$320\u2069');
    // Latin digits keep relative times consistent with prices
    expect(timeAgo(Date.now() - 5 * 60_000)).toMatch(/5/);
  });
});

describe('Chrome store translations (_locales)', () => {
  const dir = path.resolve(process.cwd(), 'public/_locales');
  const folders = fs.readdirSync(dir);
  const english = JSON.parse(fs.readFileSync(path.join(dir, 'en', 'messages.json'), 'utf8'));

  it('covers every supported language', () => {
    const covered = new Set(folders.map((f: string) => matchLocale(f)));
    for (const locale of LOCALES) expect(covered.has(locale as Locale), locale).toBe(true);
  });

  for (const folder of folders) {
    it(`${folder} has every message within Chrome Web Store limits`, () => {
      const messages = JSON.parse(fs.readFileSync(path.join(dir, folder, 'messages.json'), 'utf8'));
      expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
      expect(messages.extName.message.length).toBeLessThanOrEqual(75);
      expect(messages.extDescription.message.length).toBeLessThanOrEqual(132);
    });
  }
});
