/**
 * MarketLens AI — User-facing error details.
 *
 * Errors can carry technical text from the backend or third-party services.
 * Only messages the extension writes itself (prefixed with one of the codes
 * below) are shown to users; everything else stays hidden behind the
 * generic, translated error screen.
 */

const PUBLIC_ERROR_CODES = ['NOT_A_LISTING'];

/** A short, safe detail line for the error screen, or '' to show none. */
export function publicErrorDetail(message: unknown): string {
  const match = String(message ?? '').match(/^([A-Z_]+):\s*(.+)$/s);
  if (!match || !PUBLIC_ERROR_CODES.includes(match[1])) return '';
  const text = match[2].trim();
  return text.length > 200 ? `${text.slice(0, 197).trim()}…` : text;
}
