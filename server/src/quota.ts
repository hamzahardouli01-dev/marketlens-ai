/**
 * User Quota & Subscription Store
 *
 * Tracks anonymous users, remaining free appraisals, and active Pro subscriptions.
 * Production-ready with in-memory map and easy persistence integration.
 */

export interface UserRecord {
  userId: string;
  isPro: boolean;
  plan?: 'monthly' | 'annual';
  freeAppraisalsRemaining: number;
  totalFreeAppraisals: number;
  stripeCustomerId?: string;
  createdAt: number;
  lastActiveAt: number;
}

const DEFAULT_FREE_APPRAISALS = 1;

import fs from 'fs';
import path from 'path';

// In-memory store backed by local JSON file for persistence across restarts
const DATA_FILE = path.resolve(process.cwd(), '.users.json');
const users = new Map<string, UserRecord>();
const customerIdToUserId = new Map<string, string>();

function loadPersistedUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const u of list) {
          users.set(u.userId, u);
          if (u.stripeCustomerId) {
            customerIdToUserId.set(u.stripeCustomerId, u.userId);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Quota Store] Could not load persisted users:', err);
  }
}

function savePersistedUsers() {
  try {
    const list = Array.from(users.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Quota Store] Could not save persisted users:', err);
  }
}

// Initial load on server boot
loadPersistedUsers();

export function getOrCreateUser(userId: string): UserRecord {
  const existing = users.get(userId);
  if (existing) {
    existing.lastActiveAt = Date.now();
    return existing;
  }

  const newUser: UserRecord = {
    userId,
    isPro: false,
    freeAppraisalsRemaining: DEFAULT_FREE_APPRAISALS,
    totalFreeAppraisals: DEFAULT_FREE_APPRAISALS,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  users.set(userId, newUser);
  savePersistedUsers();
  return newUser;
}

export function canAppraise(userId: string): {
  allowed: boolean;
  isPro: boolean;
  remaining: number;
  total: number;
} {
  const user = getOrCreateUser(userId);
  if (user.isPro) {
    return { allowed: true, isPro: true, remaining: 999, total: 999 };
  }
  return {
    allowed: user.freeAppraisalsRemaining > 0,
    isPro: false,
    remaining: user.freeAppraisalsRemaining,
    total: user.totalFreeAppraisals,
  };
}

export function recordAppraisal(userId: string): UserRecord {
  const user = getOrCreateUser(userId);
  if (!user.isPro && user.freeAppraisalsRemaining > 0) {
    user.freeAppraisalsRemaining -= 1;
  }
  user.lastActiveAt = Date.now();
  savePersistedUsers();
  return user;
}

export function setProStatus(
  userId: string,
  isPro: boolean,
  plan?: 'monthly' | 'annual',
  stripeCustomerId?: string
): UserRecord {
  const user = getOrCreateUser(userId);
  user.isPro = isPro;
  if (plan) user.plan = plan;
  if (stripeCustomerId) {
    user.stripeCustomerId = stripeCustomerId;
    customerIdToUserId.set(stripeCustomerId, userId);
  }
  savePersistedUsers();
  return user;
}

export function setProByCustomerId(
  stripeCustomerId: string,
  isPro: boolean,
  plan?: 'monthly' | 'annual'
): UserRecord | null {
  const userId = customerIdToUserId.get(stripeCustomerId);
  if (!userId) return null;
  return setProStatus(userId, isPro, plan, stripeCustomerId);
}
