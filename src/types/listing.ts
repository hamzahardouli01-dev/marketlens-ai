/**
 * CarListing Lens — Shared TypeScript Types
 */

export type Currency = 'CAD' | 'USD' | 'unknown';
export type PriceType = 'asking' | 'deposit' | 'down_payment' | 'monthly' | 'unclear' | 'not_found';
export type MileageUnit = 'km' | 'mi' | 'unknown';
export type ListingStatus = 'interested' | 'contacted' | 'viewing_scheduled' | 'archived';
export type FlagCategory =
  | 'mechanical_concern'
  | 'title_disclosure'
  | 'payment_ambiguity'
  | 'inspection_condition';

export interface PriceInfo {
  /** Raw price string from the listing */
  raw: string;
  /** Numeric value if parseable */
  value: number | null;
  currency: Currency;
  type: PriceType;
  /** Sentence/excerpt that supports this value */
  excerpt: string;
}

export interface MileageInfo {
  raw: string;
  value: number | null;
  unit: MileageUnit;
}

export interface FlaggedPhrase {
  category: FlagCategory;
  /** Human-readable category label */
  label: string;
  /** The exact matched keyword or pattern */
  keyword: string;
  /** The surrounding sentence or excerpt */
  excerpt: string;
}

export interface SellerQuestion {
  id: string;
  text: string;
  /** Whether to include this question (user can deselect) */
  selected: boolean;
}

export interface ListingData {
  /** Unique ID extracted from Facebook URL (e.g., "1234567890") */
  listingId: string | null;
  /** Normalized URL */
  url: string;
  title: string | null;
  price: PriceInfo;
  year: number | null;
  make: string | null;
  model: string | null;
  mileage: MileageInfo;
  transmission: string | null;
  fuelType: string | null;
  location: string | null;
  condition: string | null;
  /** Full seller-provided description text */
  description: string | null;
  /** Timestamp when this data was extracted */
  extractedAt: number;
  /** Whether extraction used manual fallback */
  isManual: boolean;
  /** Flagged phrases from description */
  flaggedPhrases: FlaggedPhrase[];
  /** Suggested questions */
  suggestedQuestions: SellerQuestion[];
}

export interface PriceSnapshot {
  value: number | null;
  raw: string;
  currency: Currency;
  type: PriceType;
  timestamp: number;
}

export interface SavedListing {
  id: string; // listingId or url-hash
  data: ListingData;
  /** Price history — first entry is earliest observed */
  priceHistory: PriceSnapshot[];
  /** User-written notes — clearly separated from extracted data */
  notes: string;
  status: ListingStatus;
  savedAt: number;
  updatedAt: number;
  /** Whether user has manually edited any extracted fields */
  hasUserEdits: boolean;
}

export interface ComparisonField {
  label: string;
  values: Array<string | null>;
}

// ─── Buyer Shield & Deal Analysis Types ────────────────────────────────────────

export type DealRiskLevel = 'low' | 'caution' | 'high';

export interface DealRiskVerdict {
  level: DealRiskLevel;
  scoreLabel: string;
  summary: string;
  badgeColor: string;
  reasons: string[];
}

export interface MileageAnalysis {
  annualUsage: number | null;
  unit: string;
  assessment: 'low' | 'average' | 'high' | 'unknown';
  label: string;
  detail: string;
}

export interface MissingDisclosure {
  key: string;
  label: string;
  severity: 'warning' | 'info';
  detail: string;
}

