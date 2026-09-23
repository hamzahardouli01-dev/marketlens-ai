/**
 * Stripe Payment & Subscription Management
 *
 * Implements Stripe Checkout Sessions, Customer Portal, and Webhooks for MarketLens Pro.
 */

import 'dotenv/config';
import Stripe from 'stripe';
import { setProStatus, setProByCustomerId } from './quota.js';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey || stripeKey === 'sk_test_placeholder' || stripeKey.includes('placeholder')) {
    throw new Error('STRIPE_CONFIG_ERROR: STRIPE_SECRET_KEY is missing or set to placeholder in server/.env. Please check your Stripe secret key.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
  }
  return stripeClient;
}

export const stripe = {
  get checkout() {
    return getStripe().checkout;
  },
  get billingPortal() {
    return getStripe().billingPortal;
  },
  get webhooks() {
    return getStripe().webhooks;
  },
};

export interface CheckoutSessionOptions {
  userId: string;
  plan: 'monthly' | 'annual';
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

function isValidPriceId(id?: string): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  return (
    trimmed.startsWith('price_') &&
    !trimmed.includes('...') &&
    !trimmed.includes('placeholder') &&
    !trimmed.includes('price_annual') &&
    !trimmed.includes('price_monthly')
  );
}

export async function createProCheckoutSession(options: CheckoutSessionOptions): Promise<{ url: string; sessionId: string }> {
  const { userId, plan, customerEmail, successUrl, cancelUrl } = options;

  const defaultSuccessUrl =
    process.env.CLIENT_SUCCESS_URL || 'https://marketlens.ai/success?session_id={CHECKOUT_SESSION_ID}';
  const defaultCancelUrl = process.env.CLIENT_CANCEL_URL || 'https://marketlens.ai/cancel';

  const monthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const annualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];

  if (plan === 'annual' && isValidPriceId(annualPriceId)) {
    lineItems = [{ price: annualPriceId!.trim(), quantity: 1 }];
  } else if (plan === 'monthly' && isValidPriceId(monthlyPriceId)) {
    lineItems = [{ price: monthlyPriceId!.trim(), quantity: 1 }];
  } else {
    // Dynamic price fallback if explicit price IDs are not configured yet
    const unitAmount = plan === 'annual' ? 6900 : 999; // $69/yr vs $9.99/mo in cents
    const interval: 'year' | 'month' = plan === 'annual' ? 'year' : 'month';

    lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan === 'annual' ? 'MarketLens AI Pro (Annual)' : 'MarketLens AI Pro (Monthly)',
            description: 'Unlimited AI deal appraisals, feed sniper, resale profit matrix & priority vision auditing.',
          },
          unit_amount: unitAmount,
          recurring: { interval },
        },
        quantity: 1,
      },
    ];
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: lineItems,
    client_reference_id: userId,
    metadata: {
      userId,
      plan,
    },
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
    success_url: successUrl || defaultSuccessUrl,
    cancel_url: cancelUrl || defaultCancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe failed to return checkout session URL.');
  }

  return { url: session.url, sessionId: session.id };
}

export async function createCustomerPortalSession(stripeCustomerId: string, returnUrl?: string): Promise<{ url: string }> {
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl || 'https://marketlens.ai',
  });

  return { url: portalSession.url };
}

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<{ received: boolean; event: string }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  if (webhookSecret) {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } else {
    // Development fallback if webhook secret is not set
    event = JSON.parse(payload.toString());
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      const plan = (session.metadata?.plan as 'monthly' | 'annual') || 'monthly';
      const customerId = session.customer as string;

      if (userId) {
        setProStatus(userId, true, plan, customerId);
        console.log(`[Stripe] Successfully upgraded User ${userId} to Pro (${plan})`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      setProByCustomerId(customerId, false);
      console.log(`[Stripe] Canceled subscription for customer ${customerId}`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      setProByCustomerId(customerId, isActive);
      break;
    }
  }

  return { received: true, event: event.type };
}

/**
 * Verifies if a user has completed payment in Stripe.
 *
 * Checks either by specific sessionId, or queries recent completed checkout sessions
 * matching the user's ID. This guarantees Pro activation even when local webhooks
 * are not reachable or during localhost testing!
 */
export async function verifyUserStripeStatus(
  userId: string,
  sessionId?: string
): Promise<{ isPro: boolean; plan?: 'monthly' | 'annual'; customerId?: string }> {
  try {
    const stripeClient = getStripe();

    // 1. If specific sessionId provided, inspect that session directly
    if (sessionId) {
      try {
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        if (session.status === 'complete' || session.payment_status === 'paid') {
          const plan = (session.metadata?.plan as 'monthly' | 'annual') || 'monthly';
          const customerId = session.customer as string;
          setProStatus(userId, true, plan, customerId);
          console.log(`[Stripe Auto-Verify] Verified session ${sessionId} -> User ${userId} upgraded to Pro (${plan})`);
          return { isPro: true, plan, customerId };
        }
      } catch (e: any) {
        console.warn(`[Stripe Auto-Verify] Error retrieving session ${sessionId}:`, e.message);
      }
    }

    // 2. Query recent completed checkout sessions for this userId
    const sessions = await stripeClient.checkout.sessions.list({ limit: 25 });
    const matchingSession = sessions.data.find(
      (s) =>
        (s.client_reference_id === userId || s.metadata?.userId === userId) &&
        (s.status === 'complete' || s.payment_status === 'paid')
    );

    if (matchingSession) {
      const plan = (matchingSession.metadata?.plan as 'monthly' | 'annual') || 'monthly';
      const customerId = matchingSession.customer as string;
      setProStatus(userId, true, plan, customerId);
      console.log(`[Stripe Auto-Verify] Found completed checkout for user ${userId} -> Upgraded to Pro (${plan})`);
      return { isPro: true, plan, customerId };
    }
  } catch (err: any) {
    console.warn('[Stripe Auto-Verify] Could not query Stripe sessions:', err.message);
  }

  return { isPro: false };
}
