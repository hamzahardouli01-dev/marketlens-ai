/**
 * MarketLens AI — Response languages
 *
 * The extension sends the user's interface language with each appraisal so
 * Gemini writes its text in that language. Only these codes are accepted;
 * anything else falls back to English.
 */

export const RESPONSE_LANGUAGES = {
  en: 'English',
  zh: 'Simplified Chinese',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  ar: 'Arabic',
  bn: 'Bengali',
  pt: 'Portuguese',
  ru: 'Russian',
  de: 'German',
} as const;

export type ResponseLanguage = keyof typeof RESPONSE_LANGUAGES;

export function resolveResponseLanguage(code: unknown): ResponseLanguage {
  const base = typeof code === 'string' ? code.trim().toLowerCase().split(/[-_]/)[0] : '';
  return base in RESPONSE_LANGUAGES ? (base as ResponseLanguage) : 'en';
}

/** Text the harmonizer writes itself when it corrects the model's output. */
const HARMONIZER_TEXT: Record<ResponseLanguage, { overpricedLabel: string; resaleLoss: (amount: string) => string }> = {
  en: {
    overpricedLabel: 'Overpriced · Negotiate Offer',
    resaleLoss: (a) => `Priced at or above open market rate. Reselling would result in a net loss of approx. ${a}. Best for personal use only.`,
  },
  zh: {
    overpricedLabel: '价格偏高 · 建议还价',
    resaleLoss: (a) => `售价等于或高于市场价。转卖预计亏损约 ${a}，仅适合自用。`,
  },
  hi: {
    overpricedLabel: 'कीमत ज़्यादा · मोलभाव करें',
    resaleLoss: (a) => `कीमत बाज़ार दर के बराबर या उससे ज़्यादा है। दोबारा बेचने पर लगभग ${a} का नुकसान होगा। केवल निजी इस्तेमाल के लिए ठीक है।`,
  },
  es: {
    overpricedLabel: 'Precio alto · Negocia una oferta',
    resaleLoss: (a) => `El precio está en o por encima del valor de mercado. Revenderlo supondría una pérdida aproximada de ${a}. Mejor solo para uso personal.`,
  },
  fr: {
    overpricedLabel: 'Trop cher · Négociez une offre',
    resaleLoss: (a) => `Prix égal ou supérieur au prix du marché. La revente entraînerait une perte d’environ ${a}. À réserver à un usage personnel.`,
  },
  ar: {
    overpricedLabel: 'سعر مرتفع · فاوض على عرض',
    resaleLoss: (a) => `السعر مساوٍ لسعر السوق أو أعلى منه. إعادة البيع ستؤدي إلى خسارة تقارب ${a}. مناسب للاستخدام الشخصي فقط.`,
  },
  bn: {
    overpricedLabel: 'দাম বেশি · দর কষাকষি করুন',
    resaleLoss: (a) => `দাম বাজারদরের সমান বা বেশি। আবার বিক্রি করলে প্রায় ${a} লোকসান হবে। শুধু নিজের ব্যবহারের জন্য ভালো।`,
  },
  pt: {
    overpricedLabel: 'Preço alto · Negocie uma oferta',
    resaleLoss: (a) => `O preço está igual ou acima do valor de mercado. Revender daria um prejuízo de cerca de ${a}. Melhor apenas para uso pessoal.`,
  },
  ru: {
    overpricedLabel: 'Завышенная цена · Торгуйтесь',
    resaleLoss: (a) => `Цена на уровне рынка или выше. При перепродаже убыток составит около ${a}. Подходит только для личного использования.`,
  },
  de: {
    overpricedLabel: 'Zu teuer · Angebot verhandeln',
    resaleLoss: (a) => `Der Preis liegt auf oder über dem Marktwert. Ein Weiterverkauf brächte etwa ${a} Verlust. Nur für den Eigengebrauch sinnvoll.`,
  },
};

export function harmonizerText(language: ResponseLanguage) {
  return HARMONIZER_TEXT[language] ?? HARMONIZER_TEXT.en;
}
