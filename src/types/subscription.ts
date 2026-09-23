/**
 * MarketLens AI — Subscription & Quota Types
 */

export type ProPlan = 'monthly' | 'annual';

export interface UserSubscription {
  userId: string;
  isPro: boolean;
  plan?: ProPlan;
  freeAppraisalsRemaining: number;
  totalFreeAppraisals: number;
  stripeCustomerId?: string;
  lastSyncedAt?: number;
}

export interface QuotaStatus {
  allowed: boolean;
  isPro: boolean;
  remaining: number;
  total: number;
}

export interface CheckoutResponse {
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

export interface PortalResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export const PLAN_PRICING = {
  monthly: {
    id: 'monthly',
    name: 'Pro Monthly',
    priceDisplay: '$9.99',
    period: '/ month',
    badge: 'Flexible',
    subtext: 'Cancel anytime',
  },
  annual: {
    id: 'annual',
    name: 'Pro Annual',
    priceDisplay: '$5.75',
    period: '/ month',
    billedDisplay: '$69 billed annually',
    badge: 'Best Value · Save 42%',
    subtext: 'Billed as $69/year',
  },
} as const;
