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

// ─── Hosted Privacy Policy for Chrome Web Store ───
app.get('/privacy', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — MarketLens AI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #f8fafc; }
    .card { background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); }
    h1 { color: #0f172a; margin-top: 0; font-size: 28px; }
    h2 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 28px; font-size: 20px; }
    h3 { color: #334155; margin-top: 20px; font-size: 16px; }
    p, li { color: #475569; font-size: 15px; }
    ul { padding-left: 20px; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    footer { margin-top: 32px; font-size: 13px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Official Compliance Document</div>
    <h1>Privacy Policy for MarketLens AI</h1>
    <p><strong>Last Updated:</strong> September 2026</p>
    <p>MarketLens AI ("we", "our", or "the Extension") respects your privacy. This Privacy Policy describes how MarketLens AI handles information when you use our browser extension and backend services.</p>

    <h2>1. Information We Collect</h2>
    <h3>A. Listing Data for Deal Appraisals</h3>
    <p>When you click <strong>"AI Deal Appraisal"</strong> on a marketplace listing (such as Facebook Marketplace, eBay, or Craigslist), MarketLens AI extracts:</p>
    <ul>
      <li>Public listing title</li>
      <li>Asking price and currency</li>
      <li>Seller's public item description</li>
      <li>Public listing photos</li>
    </ul>
    <p>This information is processed solely for the purpose of generating the AI appraisal, condition inspection, and price comparison requested by you.</p>

    <h3>B. Anonymous Usage & Quota Identifier</h3>
    <p>We assign an anonymous random UUID (e.g., <code>usr_xxxx</code>) stored locally in your browser (via <code>chrome.storage</code>) to count free appraisals and link your MarketLens Pro subscription. We do <strong>not</strong> collect your name, physical address, browsing history, or personal identity unless you voluntarily provide an email during Stripe Checkout.</p>

    <h3>C. Payment & Billing Information</h3>
    <p>Subscription payments are processed directly by <strong>Stripe</strong>. We do <strong>not</strong> store or have access to your credit card numbers or banking credentials. Stripe handles all financial data under <a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe's Privacy Policy</a>.</p>

    <h2>2. What We Do NOT Collect</h2>
    <ul>
      <li>We do <strong>NOT</strong> track or record your general web browsing history.</li>
      <li>We do <strong>NOT</strong> inspect, read, or access your social media feed, private messages, personal profile, friends list, or unrelated web pages.</li>
      <li>We do <strong>NOT</strong> sell, rent, or monetize your personal information or data to third-party data brokers or advertisers.</li>
    </ul>

    <h2>3. How Information is Used</h2>
    <p>The extracted listing context is sent securely (via HTTPS) to our backend service to query Google Gemini Vision models (with real-time Google Search grounding) to produce your deal appraisal. The data is only used to generate the requested analysis.</p>

    <h2>4. Data Security</h2>
    <p>All communication between the Chrome extension and our backend server is encrypted using industry-standard Transport Layer Security (TLS/HTTPS).</p>

    <h2>5. Contact & Support</h2>
    <p>If you have any questions or feedback regarding this Privacy Policy, please contact:</p>
    <p><strong>Email:</strong> support@marketlens.ai</p>
  </div>
  <footer>&copy; 2026 MarketLens AI. All rights reserved.</footer>
</body>
</html>`);
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
