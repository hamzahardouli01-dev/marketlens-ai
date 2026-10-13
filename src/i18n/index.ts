/**
 * MarketLens AI — Internationalisation
 *
 * Supports the ten most widely spoken languages (with German in place of
 * Urdu) and falls back to English for anything else. The active language is
 * chosen in this order: the user's choice in Settings, the language of the
 * page being viewed (e.g. Facebook set to Arabic), the browser's languages,
 * then English.
 */

import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';
import { de } from './messages/de';
import { ar } from './messages/ar';
import { pt } from './messages/pt';
import { zh } from './messages/zh';
import { hi } from './messages/hi';
import { bn } from './messages/bn';
import { ru } from './messages/ru';

export type MessageKey = keyof typeof en;

/** Every language must define every key; extra plural forms (_few, _many…) are allowed. */
export type Messages = Record<MessageKey, string> & Record<string, string>;

type PluralBase<K> = K extends `${infer B}_other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;

export const LOCALES = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export type LanguagePreference = 'auto' | Locale;

export const DEFAULT_LOCALE: Locale = 'en';

/** chrome.storage.local key: language of the last marketplace page viewed (used by the Saved page). */
export const PAGE_LOCALE_KEY = 'marketlens_page_locale';

export const LOCALE_INFO: Record<Locale, { nativeName: string; englishName: string; dir: 'ltr' | 'rtl'; intl: string }> = {
  en: { nativeName: 'English', englishName: 'English', dir: 'ltr', intl: 'en-US' },
  zh: { nativeName: '中文（简体）', englishName: 'Chinese (Simplified)', dir: 'ltr', intl: 'zh-CN' },
  hi: { nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', intl: 'hi-IN' },
  es: { nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', intl: 'es' },
  fr: { nativeName: 'Français', englishName: 'French', dir: 'ltr', intl: 'fr' },
  ar: { nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', intl: 'ar' },
  bn: { nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr', intl: 'bn' },
  pt: { nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', intl: 'pt-BR' },
  ru: { nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', intl: 'ru' },
  de: { nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', intl: 'de' },
};

const CATALOG: Record<Locale, Messages> = { en, es, fr, de, ar, pt, zh, hi, bn, ru };

let current: Locale = DEFAULT_LOCALE;

/** Map a BCP-47 / Chrome locale tag ("pt-BR", "zh_Hant", "AR") to a supported locale, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = String(tag).trim().toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}

export function detectLocale(opts: {
  preference?: LanguagePreference | string | null;
  pageLang?: string | null;
  browserLangs?: readonly string[] | null;
}): Locale {
  if (opts.preference && opts.preference !== 'auto') {
    const chosen = matchLocale(opts.preference);
    if (chosen) return chosen;
  }
  const fromPage = matchLocale(opts.pageLang);
  if (fromPage) return fromPage;
  for (const lang of opts.browserLangs ?? []) {
    const match = matchLocale(lang);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Locale from the page and browser only (what "Automatic" resolves to). */
export function detectAutoLocale(): Locale {
  return detectLocale({
    pageLang: typeof document !== 'undefined' ? document.documentElement?.lang : null,
    browserLangs: typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : null,
  });
}

export function setLocale(locale: Locale): boolean {
  const changed = locale !== current;
  current = locale;
  return changed;
}

export function getLocale(): Locale {
  return current;
}

export function getDir(locale: Locale = current): 'ltr' | 'rtl' {
  return LOCALE_INFO[locale].dir;
}

/** Intl locale for dates and plurals. Latin digits keep numbers consistent with prices. */
export function intlLocale(locale: Locale = current): string {
  return `${LOCALE_INFO[locale].intl}-u-nu-latn`;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = CATALOG[current][key] ?? en[key] ?? key;
  return interpolate(template, params);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** Plural-aware lookup: picks key_one / key_few / key_other… for `count`. */
export function tn(key: PluralKey, count: number, params?: Record<string, string | number>): string {
  let rules = pluralRules.get(current);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_INFO[current].intl);
    pluralRules.set(current, rules);
  }
  const category = rules.select(count);
  const messages = CATALOG[current];
  const template =
    messages[`${key}_${category}`] ?? messages[`${key}_other`] ?? (en as Record<string, string>)[`${key}_other`] ?? key;
  return interpolate(template, { count, ...params });
}

/** Exposed for tests. */
export function getCatalog(locale: Locale): Messages {
  return CATALOG[locale];
}
