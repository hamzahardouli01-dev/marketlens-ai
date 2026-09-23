/**
 * Subscription & Quota Management Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _store } from './setup';
import {
  getUserSubscription,
  saveUserSubscription,
  checkQuotaStatus,
  decrementFreeQuota,
  setProMembership,
} from '../src/services/subscription';

beforeEach(() => {
  Object.keys(_store).forEach((k) => delete _store[k]);
  localStorage.clear();
});

describe('Subscription Service', () => {
  it('creates an anonymous user with 1 free appraisal by default', async () => {
    const sub = await getUserSubscription();

    expect(sub.userId).toBeDefined();
    expect(sub.userId.length).toBeGreaterThan(5);
    expect(sub.isPro).toBe(false);
    expect(sub.freeAppraisalsRemaining).toBe(1);
    expect(sub.totalFreeAppraisals).toBe(1);
  });

  it('checks quota allowance accurately for free tier', async () => {
    let quota = await checkQuotaStatus();
    expect(quota.allowed).toBe(true);
    expect(quota.isPro).toBe(false);
    expect(quota.remaining).toBe(1);

    // Use the 1 free appraisal
    await decrementFreeQuota();

    quota = await checkQuotaStatus();
    expect(quota.allowed).toBe(false);
    expect(quota.isPro).toBe(false);
    expect(quota.remaining).toBe(0);

    // Extra decrement does not go negative
    const rem = await decrementFreeQuota();
    expect(rem).toBe(0);
  });

  it('activates Pro membership and provides unlimited scans', async () => {
    const updated = await setProMembership(true, 'annual', 'cus_test123');

    expect(updated.isPro).toBe(true);
    expect(updated.plan).toBe('annual');
    expect(updated.stripeCustomerId).toBe('cus_test123');

    const quota = await checkQuotaStatus();
    expect(quota.allowed).toBe(true);
    expect(quota.isPro).toBe(true);
    expect(quota.remaining).toBeGreaterThan(100);

    // Decrementing while Pro does not reduce free appraisals
    const rem = await decrementFreeQuota();
    expect(rem).toBe(1);
  });

  it('persists subscription updates across fetches', async () => {
    const initial = await getUserSubscription();
    initial.freeAppraisalsRemaining = 2;
    await saveUserSubscription(initial);

    const reloaded = await getUserSubscription();
    expect(reloaded.userId).toBe(initial.userId);
    expect(reloaded.freeAppraisalsRemaining).toBe(2);
  });
});
