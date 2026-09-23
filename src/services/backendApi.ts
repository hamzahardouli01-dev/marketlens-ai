/**
 * MarketLens AI — Backend & Stripe API Client
 *
 * Facilitates zero-setup appraisals and Stripe Checkout integration.
 */

import type { UniversalListingContext, AIProductAnalysis } from '../types/ai';
import type { ProPlan, CheckoutResponse, PortalResponse, UserSubscription } from '../types/subscription';
import {
  getUserSubscription,
  saveUserSubscription,
} from './subscription';

// Default backend API URL (Live Render cloud deployment)
export const DEFAULT_BACKEND_URL = 'https://marketlens-backend-nqg2.onrender.com';
const STORAGE_KEY_BACKEND_URL = 'marketlens_backend_url';

export async function getBackendUrl(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(STORAGE_KEY_BACKEND_URL);
      if (res[STORAGE_KEY_BACKEND_URL]) {
        return res[STORAGE_KEY_BACKEND_URL] as string;
      }
    }
  } catch {}
  return localStorage.getItem(STORAGE_KEY_BACKEND_URL) || DEFAULT_BACKEND_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_BACKEND_URL]: clean });
    }
  } catch {}
  localStorage.setItem(STORAGE_KEY_BACKEND_URL, clean);
}

interface BackendApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

async function sendBackendRequest<T = any>(
  endpoint: string,
  options: { method?: string; headers?: Record<string, string>; body?: any } = {}
): Promise<BackendApiResponse<T>> {
  const backendUrl = await getBackendUrl();
  const fullUrl = `${backendUrl}${endpoint}`;

  // 1. In Chrome Extension context, route through background service worker
  // to avoid webpage CSP, mixed-content (HTTP on HTTPS sites like Facebook), and CORS blocks!
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'BACKEND_API_REQUEST',
        url: fullUrl,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
      });

      if (resp && typeof resp.status === 'number') {
        return {
          ok: Boolean(resp.success),
          status: resp.status,
          data: resp.data,
          error: resp.error,
        };
      }
    } catch {
      // Background worker unreachable, fallback to direct fetch
    }
  }

  // 2. Fallback: Direct fetch (e.g. during unit tests or options tab)
  try {
    const response = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? undefined : (data?.message || text),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null as any,
      error:
        'Could not connect to MarketLens backend server at http://localhost:3001. Please make sure the server is running ("cd server && npm run dev").',
    };
  }
}

/**
 * Execute zero-setup AI appraisal via the secure backend
 */
export async function analyzeViaBackend(
  context: UniversalListingContext
): Promise<AIProductAnalysis> {
  const sub = await getUserSubscription();

  const res = await sendBackendRequest('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': sub.userId,
    },
    body: {
      userId: sub.userId,
      context,
    },
  });

  if (res.status === 403) {
    throw new Error(
      res.data?.message ||
        'QUOTA_EXHAUSTED: You have used your free AI appraisal. Upgrade to Pro for unlimited deal analysis.'
    );
  }

  if (!res.ok) {
    throw new Error(
      res.error || res.data?.message || `Backend appraisal failed with HTTP ${res.status}`
    );
  }

  const result = res.data;

  // Update user quota state from server response
  if (result?.user) {
    sub.isPro = result.user.isPro;
    sub.freeAppraisalsRemaining = result.user.freeAppraisalsRemaining;
    sub.totalFreeAppraisals = result.user.totalFreeAppraisals;
    sub.lastSyncedAt = Date.now();
    await saveUserSubscription(sub);
  }

  return result.analysis;
}

/**
 * Create Stripe Checkout Session for MarketLens Pro
 */
export async function createStripeCheckoutSession(plan: ProPlan = 'monthly'): Promise<CheckoutResponse> {
  const sub = await getUserSubscription();

  const currentBase =
    typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : 'https://www.facebook.com/marketplace';

  const successUrl = `${currentBase}?marketlens_status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = typeof window !== 'undefined' ? window.location.href : 'https://www.facebook.com/marketplace';

  const res = await sendBackendRequest('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': sub.userId,
    },
    body: {
      userId: sub.userId,
      plan,
      cancelUrl,
      successUrl,
    },
  });

  if (!res.ok) {
    return { success: false, error: res.error || `HTTP ${res.status}` };
  }

  return { success: true, url: res.data.url, sessionId: res.data.sessionId };
}

/**
 * Open Stripe Customer Portal for managing/canceling subscription
 */
export async function openStripeCustomerPortal(): Promise<PortalResponse> {
  const sub = await getUserSubscription();

  const res = await sendBackendRequest('/api/stripe/customer-portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': sub.userId,
    },
    body: {
      userId: sub.userId,
      returnUrl: typeof window !== 'undefined' ? window.location.href : 'https://marketlens.ai',
    },
  });

  if (!res.ok) {
    return { success: false, error: res.error || `HTTP ${res.status}` };
  }

  return { success: true, url: res.data.url };
}

/**
 * Synchronize subscription status with server
 */
export async function syncSubscriptionWithServer(sessionId?: string): Promise<UserSubscription> {
  const sub = await getUserSubscription();

  let queryUrl = `/api/user/status?userId=${encodeURIComponent(sub.userId)}`;
  if (sessionId) {
    queryUrl += `&sessionId=${encodeURIComponent(sessionId)}`;
  }

  const res = await sendBackendRequest(queryUrl, {
    headers: { 'x-user-id': sub.userId },
  });

  if (res.ok && res.data) {
    sub.isPro = Boolean(res.data.isPro);
    if (res.data.plan) sub.plan = res.data.plan;
    sub.freeAppraisalsRemaining = res.data.freeAppraisalsRemaining;
    sub.totalFreeAppraisals = res.data.totalFreeAppraisals;
    sub.lastSyncedAt = Date.now();
    await saveUserSubscription(sub);
  }

  return sub;
}

/**
 * Explicitly verify a Stripe checkout session and activate Pro
 */
export async function verifyCheckoutSession(
  sessionId: string
): Promise<{ success: boolean; isPro: boolean; plan?: string }> {
  const sub = await getUserSubscription();

  const res = await sendBackendRequest('/api/stripe/verify-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': sub.userId,
    },
    body: {
      userId: sub.userId,
      sessionId,
    },
  });

  if (res.ok && res.data && res.data.isPro) {
    sub.isPro = true;
    if (res.data.plan) sub.plan = res.data.plan;
    sub.lastSyncedAt = Date.now();
    await saveUserSubscription(sub);
    return { success: true, isPro: true, plan: res.data.plan };
  }

  return { success: false, isPro: false };
}
