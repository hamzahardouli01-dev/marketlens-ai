/**
 * MarketLens AI — Production Backend Server
 *
 * Provides:
 * 1. Zero-Setup Gemini Vision AI Deal Appraisals
 * 2. Stripe Checkout Sessions for MarketLens Pro ($9.99/mo or $69/yr)
 * 3. Stripe Customer Portal & Webhook synchronization
 * 4. Anonymous user quota management (5 free appraisals per user)
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { canAppraise, recordAppraisal, getOrCreateUser } from './quota.js';
import { analyzeListingOnServer, UniversalListingContext } from './gemini.js';
import {
  createProCheckoutSession,
  createCustomerPortalSession,
  handleStripeWebhook,
  verifyUserStripeStatus,
} from './stripe.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for Chrome extensions & web clients
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Chrome extension origins and local development
      if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for API proxying
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  })
);

// ─── Stripe Webhook (MUST use raw body for cryptographic signature verification) ───
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      res.status(400).send('Missing stripe-signature header.');
      return;
    }

    try {
      const result = await handleStripeWebhook(req.body, signature);
      res.json(result);
    } catch (err: any) {
      console.error('[Stripe Webhook Error]:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// Standard JSON parser for all other endpoints (with 15MB limit for high-res photo payloads)
app.use(express.json({ limit: '15mb' }));

// ─── Health Check ───
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'MarketLens AI Backend',
    timestamp: Date.now(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

// ─── User Status & Quota ───
app.get('/api/user/status', async (req: Request, res: Response) => {
  const userId = (req.headers['x-user-id'] as string) || (req.query.userId as string);
  if (!userId) {
    res.status(400).json({ error: 'Missing userId parameter.' });
    return;
  }

  let user = getOrCreateUser(userId);

  // If user is not yet marked as Pro, auto-verify with Stripe API
  if (!user.isPro) {
    const sessionId = req.query.sessionId as string | undefined;
    const verified = await verifyUserStripeStatus(userId, sessionId);
    if (verified.isPro) {
      user = getOrCreateUser(userId);
    }
  }

  res.json({
    userId: user.userId,
    isPro: user.isPro,
    plan: user.plan,
    freeAppraisalsRemaining: user.freeAppraisalsRemaining,
    totalFreeAppraisals: user.totalFreeAppraisals,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
  });
});

// ─── Instant Stripe Session Verification ───
app.post('/api/stripe/verify-session', async (req: Request, res: Response) => {
  try {
    const { userId, sessionId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId parameter in request body.' });
      return;
    }

    const verified = await verifyUserStripeStatus(userId, sessionId);
    const user = getOrCreateUser(userId);

    res.json({
      success: true,
      isPro: user.isPro,
      plan: user.plan,
      freeAppraisalsRemaining: user.freeAppraisalsRemaining,
    });
  } catch (err: any) {
    console.error('[Verify Session Error]:', err);
    res.status(500).json({
      error: 'VERIFICATION_FAILED',
      message: err.message || 'Failed to verify session.',
    });
  }
});

// ─── Zero-Setup AI Appraisal ───
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || req.body.userId;
    if (!userId) {
      res.status(400).json({ error: 'Missing x-user-id header or userId in request body.' });
      return;
    }

    const quota = canAppraise(userId);
    if (!quota.allowed) {
      res.status(403).json({
        error: 'QUOTA_EXHAUSTED',
        message: 'You have used all 5 free AI appraisals. Upgrade to MarketLens Pro for unlimited deal analysis.',
        isPro: false,
        remaining: 0,
        upgradeUrl: '/api/stripe/create-checkout-session',
      });
      return;
    }

    const context: UniversalListingContext = req.body.context || req.body;
    if (!context || (!context.title && !context.description && !context.imageBase64)) {
      res.status(400).json({ error: 'Invalid listing context provided.' });
      return;
    }

    // Execute Gemini multimodal appraisal on server
    const analysis = await analyzeListingOnServer(context);

    // Decrement free quota if not Pro
    const updatedUser = recordAppraisal(userId);

    res.json({
      success: true,
      analysis,
      user: {
        isPro: updatedUser.isPro,
        freeAppraisalsRemaining: updatedUser.freeAppraisalsRemaining,
        totalFreeAppraisals: updatedUser.totalFreeAppraisals,
      },
    });
  } catch (err: any) {
    console.error('[Appraisal Error]:', err);
    res.status(500).json({
      error: 'ANALYSIS_FAILED',
      message: err.message || 'Server failed to analyze listing.',
    });
  }
});

// ─── Stripe Checkout Session ───
app.post('/api/stripe/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const { userId, plan, customerEmail, successUrl, cancelUrl } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId in request body.' });
      return;
    }

    const targetPlan: 'monthly' | 'annual' = plan === 'annual' ? 'annual' : 'monthly';

    const session = await createProCheckoutSession({
      userId,
      plan: targetPlan,
      customerEmail,
      successUrl,
      cancelUrl,
    });

    res.json({ success: true, url: session.url, sessionId: session.sessionId });
  } catch (err: any) {
    console.error('[Stripe Checkout Error]:', err);
    res.status(500).json({
      error: 'STRIPE_ERROR',
      message: err.message || 'Failed to create Stripe checkout session.',
    });
  }
});

// ─── Stripe Customer Portal (Self-serve subscription management) ───
app.post('/api/stripe/customer-portal', async (req: Request, res: Response) => {
  try {
    const { userId, returnUrl } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId parameter.' });
      return;
    }

    const user = getOrCreateUser(userId);
    if (!user.stripeCustomerId) {
      res.status(404).json({ error: 'No active Stripe customer found for this user.' });
      return;
    }

    const portal = await createCustomerPortalSession(user.stripeCustomerId, returnUrl);
    res.json({ success: true, url: portal.url });
  } catch (err: any) {
    console.error('[Stripe Portal Error]:', err);
    res.status(500).json({
      error: 'PORTAL_ERROR',
      message: err.message || 'Failed to open customer portal.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`⚡ MarketLens AI Server running on http://localhost:${PORT}`);
  console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   - Gemini API Key: ${process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Missing ❌'}`);
  console.log(`   - Stripe Secret Key: ${process.env.STRIPE_SECRET_KEY ? 'Configured ✅' : 'Placeholder ⚠️'}`);
});
