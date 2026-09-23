/**
 * MarketLens AI — Client Subscription & Quota Manager
 *
 * Manages anonymous user identity, free appraisal quotas,
 * and Pro membership status synced with Chrome storage and backend.
 */

import type { UserSubscription, QuotaStatus, ProPlan } from '../types/subscription';

const STORAGE_KEY_USER = 'marketlens_user_subscription';
const DEFAULT_FREE_QUOTA = 1;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'usr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export async function getUserSubscription(): Promise<UserSubscription> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const res = await chrome.storage.sync.get(STORAGE_KEY_USER);
      if (res[STORAGE_KEY_USER]) {
        return res[STORAGE_KEY_USER] as UserSubscription;
      }
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(STORAGE_KEY_USER);
      if (res[STORAGE_KEY_USER]) {
        return res[STORAGE_KEY_USER] as UserSubscription;
      }
    }
  } catch {
    // fallback
  }

  // Check localStorage as fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  // Initialize new anonymous user
  const initialUser: UserSubscription = {
    userId: generateUUID(),
    isPro: false,
    freeAppraisalsRemaining: DEFAULT_FREE_QUOTA,
    totalFreeAppraisals: DEFAULT_FREE_QUOTA,
    lastSyncedAt: Date.now(),
  };

  await saveUserSubscription(initialUser);
  return initialUser;
}

export async function saveUserSubscription(sub: UserSubscription): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      await chrome.storage.sync.set({ [STORAGE_KEY_USER]: sub });
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_USER]: sub });
    }
  } catch {}

  try {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(sub));
  } catch {}
}

export async function checkQuotaStatus(): Promise<QuotaStatus> {
  const sub = await getUserSubscription();
  if (sub.isPro) {
    return {
      allowed: true,
      isPro: true,
      remaining: 999,
      total: 999,
    };
  }

  return {
    allowed: sub.freeAppraisalsRemaining > 0,
    isPro: false,
    remaining: Math.max(0, sub.freeAppraisalsRemaining),
    total: sub.totalFreeAppraisals,
  };
}

export async function decrementFreeQuota(): Promise<number> {
  const sub = await getUserSubscription();
  if (!sub.isPro && sub.freeAppraisalsRemaining > 0) {
    sub.freeAppraisalsRemaining -= 1;
    await saveUserSubscription(sub);
  }
  return sub.freeAppraisalsRemaining;
}

export async function setProMembership(isPro: boolean, plan?: ProPlan, stripeCustomerId?: string): Promise<UserSubscription> {
  const sub = await getUserSubscription();
  sub.isPro = isPro;
  if (plan) sub.plan = plan;
  if (stripeCustomerId) sub.stripeCustomerId = stripeCustomerId;
  sub.lastSyncedAt = Date.now();
  await saveUserSubscription(sub);
  return sub;
}
