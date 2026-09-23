import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { AIProductAnalysis, BuyVerdict, UniversalListingContext } from '../types/ai';
import type { UserSubscription, ProPlan } from '../types/subscription';
import { analyzeWithGemini } from '../services/gemini';
import {
  getUserSubscription,
  checkQuotaStatus,
  decrementFreeQuota,
} from '../services/subscription';
import {
  createStripeCheckoutSession,
  openStripeCustomerPortal,
  syncSubscriptionWithServer,
} from '../services/backendApi';
import { DEMO_ANALYSIS } from '../services/mockData';
import {
  getPreferences,
  savePreferences,
  ACCENT_PALETTES,
  DEFAULT_PREFERENCES,
  type UserPreferences,
  type AccentColor,
} from '../services/settings';

// ─── Derived verdict helpers (tolerate older cached analyses) ───────────────

const VERDICT_FROM_RATING: Record<string, BuyVerdict> = {
  great_deal: 'good_buy',
  fair_deal: 'negotiate',
  overpriced: 'caution',
  extreme_ripoff: 'walk_away',
  suspiciously_cheap: 'caution',
};

const SCORE_FROM_RATING: Record<string, number> = {
  great_deal: 84,
  fair_deal: 66,
  overpriced: 40,
  extreme_ripoff: 15,
  suspiciously_cheap: 28,
};

const VERDICT_PILL_TEXT: Record<BuyVerdict | 'unknown', string> = {
  buy_now: '⚡ Buy Now',
  good_buy: '✓ Good Buy',
  negotiate: '🤝 Negotiate First',
  caution: '⚠ Caution',
  walk_away: '✕ Walk Away',
  unknown: 'AI Appraisal',
};

function scoreColor(score: number): string {
  if (score >= 75) return '#34D399';
  if (score >= 50) return '#FBBF24';
  return '#F87171';
}

// ─── Animated score ring ────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [display, setDisplay] = useState(0);
  const [offset, setOffset] = useState(C);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(target);
      setOffset(C - (C * target) / 100);
      return;
    }
    const start = performance.now();
    const duration = 1150;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * target));
      setOffset(C - (C * eased * target) / 100);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div className="score-ring-wrap" style={{ color }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle className="score-ring-track" cx="48" cy="48" r={R} stroke="currentColor" />
        <circle
          className="score-ring-fill"
          cx="48"
          cy="48"
          r={R}
          stroke={color}
          strokeDasharray={C}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-center">
        <span className="score-ring-number">{display}</span>
        <span className="score-ring-label">SCORE</span>
      </div>
    </div>
  );
}

// ─── Main Popup ─────────────────────────────────────────────────────────────

export default function Popup() {
  const [state, setState] = useState<'loading' | 'analyzing' | 'results' | 'paywall' | 'settings' | 'error'>('loading');
  const [listingContext, setListingContext] = useState<UniversalListingContext | null>(null);
  const [analysis, setAnalysis] = useState<AIProductAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedOffer, setCopiedOffer] = useState<boolean>(false);
  const [copiedQuestions, setCopiedQuestions] = useState<boolean>(false);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<number>(1);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<ProPlan>('annual');
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string>('');

  // Pin scroll to top whenever results view or paywall is opened
  useEffect(() => {
    if (state === 'results' || state === 'paywall') {
      const body = document.querySelector('.popup-body');
      if (body) body.scrollTop = 0;
    }
  }, [state]);

  // Initialize: Load preferences, user subscription, and check active tab
  useEffect(() => {
    getPreferences().then((p) => setPrefs(p));

    (async () => {
      try {
        const synced = await syncSubscriptionWithServer();
        setSub(synced);
      } catch {
        const local = await getUserSubscription();
        setSub(local);
      }
      checkAndAnalyze();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAndAnalyze = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    setCheckoutError('');

    try {
      const quota = await checkQuotaStatus();
      if (!quota.allowed) {
        setState('paywall');
        return;
      }

      // Query active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active browser tab detected.');

      // Inject content script if needed
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });

      // Request listing extraction from page
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_AI_CONTEXT' });
      if (!resp.success || !resp.data) {
        throw new Error(resp.error || 'Could not harvest item details from this page.');
      }

      const ctx: UniversalListingContext = resp.data;
      setListingContext(ctx);

      // Multi-step animated analysis progress
      setState('analyzing');
      setAnalysisStep(1);

      const t1 = setTimeout(() => setAnalysisStep(2), 750);
      const t2 = setTimeout(() => setAnalysisStep(3), 1600);
      const t3 = setTimeout(() => setAnalysisStep(4), 2500);

      const aiResult = await analyzeWithGemini(ctx);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      // Decrement client-side free quota count
      await decrementFreeQuota();
      const updatedSub = await getUserSubscription();
      setSub(updatedSub);

      setAnalysis(aiResult);
      setIsDemo(false);
      setState('results');
    } catch (err: any) {
      const message = err?.message || String(err);
      if (message.includes('QUOTA_EXHAUSTED')) {
        setState('paywall');
      } else {
        setErrorMsg(message);
        setState('error');
      }
    }
  }, []);

  const handleUpgradeToStripe = async (plan: ProPlan) => {
    setIsCheckingOut(true);
    setCheckoutError('');
    const res = await createStripeCheckoutSession(plan);
    setIsCheckingOut(false);
    if (res.success && res.url) {
      window.open(res.url, '_blank');
      // Background poll for Stripe completion
      let polls = 0;
      const interval = setInterval(async () => {
        if (polls++ > 30) {
          clearInterval(interval);
          return;
        }
        const synced = await syncSubscriptionWithServer(res.sessionId);
        if (synced.isPro) {
          clearInterval(interval);
          setSub(synced);
          checkAndAnalyze();
        }
      }, 2500);
    } else {
      setCheckoutError(res.error || 'Failed to start Stripe checkout session.');
    }
  };

  const handleManageBilling = async () => {
    const res = await openStripeCustomerPortal();
    if (res.success && res.url) {
      window.open(res.url, '_blank');
    } else {
      setCheckoutError(res.error || 'Unable to open Stripe customer portal.');
    }
  };

  const handleUpdatePref = async (changes: Partial<UserPreferences>) => {
    const updated = await savePreferences(changes);
    setPrefs(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1800);
  };

  const handleRunDemo = () => {
    setIsDemo(true);
    setAnalysis(DEMO_ANALYSIS);
    setState('results');
  };

  const handleCopyOffer = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.negotiation.counterOfferMessage);
      setCopiedOffer(true);
      setTimeout(() => setCopiedOffer(false), 2500);
    } catch {
      setCopiedOffer(false);
    }
  };

  const handleCopyQuestions = async () => {
    const questions = analysis?.questionsToAsk;
    if (!questions?.length) return;
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
      setCopiedQuestions(true);
      setTimeout(() => setCopiedQuestions(false), 2500);
    } catch {
      setCopiedQuestions(false);
    }
  };

  // ─── Derived display values ───────────────────────────────────────────────

  const askingPriceDisplay = useMemo(() => {
    if (analysis?.pricing.askingPrice) {
      return `$${analysis.pricing.askingPrice.toLocaleString()}`;
    }
    return listingContext?.priceRaw || 'Price Not Found';
  }, [analysis, listingContext]);

  // Visual Price Position (0% to 100% position on bar)
  const barPos = useMemo(() => {
    if (analysis?.pricing.askingPrice && analysis.pricing.estimatedNewPrice) {
      return Math.min(100, Math.max(6, Math.round((analysis.pricing.askingPrice / analysis.pricing.estimatedNewPrice) * 100)));
    }
    return 50;
  }, [analysis]);

  const discountPercent = useMemo(() => {
    if (analysis?.pricing.askingPrice && analysis.pricing.estimatedNewPrice) {
      const asking = analysis.pricing.askingPrice;
      const msrp = analysis.pricing.estimatedNewPrice;
      if (msrp > asking) {
        return Math.round(((msrp - asking) / msrp) * 100);
      }
    }
    return null;
  }, [analysis]);

  const buyScore = useMemo(() => {
    if (!analysis) return 0;
    if (typeof analysis.buyScore === 'number') return analysis.buyScore;
    return SCORE_FROM_RATING[analysis.pricing.dealRating] ?? 50;
  }, [analysis]);

  const buyVerdict: BuyVerdict | 'unknown' = useMemo(() => {
    if (!analysis) return 'unknown';
    return analysis.buyVerdict || VERDICT_FROM_RATING[analysis.pricing.dealRating] || 'unknown';
  }, [analysis]);

  const ringColor = scoreColor(buyScore);

  const marketChip = useMemo(() => {
    const pct = analysis?.pricing.percentageVsMarket;
    if (typeof pct !== 'number' || !isFinite(pct)) return null;
    if (pct <= -3) return { cls: 'under', text: `${pct}% vs market` };
    if (pct >= 3) return { cls: 'over', text: `+${pct}% vs market` };
    return { cls: 'fair', text: 'At market rate' };
  }, [analysis]);

  // Current Theme
  const isDark =
    prefs.theme === 'dark' ||
    (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const palette = ACCENT_PALETTES[prefs.accentColor] || ACCENT_PALETTES.blue;

  const redFlags = analysis?.redFlags ?? [];
  const questions = analysis?.questionsToAsk ?? [];
  const conditionScore = analysis?.visualAudit.conditionScore ?? 'good';

  return (
    <div
      className="popup-root"
      data-theme={isDark ? 'dark' : 'light'}
      data-accent={prefs.accentColor}
      style={{
        ['--ml-accent' as any]: palette.primary,
        ['--ml-accent-hover' as any]: palette.hover,
        ['--ml-accent-soft' as any]: palette.soft,
      }}
    >
      {/* ─── Top Nav Bar ────────────────────────────────────────────── */}
      <header className="popup-header">
        <div className="brand-lockup">
          <div className="brand-badge">✨</div>
          <div className="brand-text-col">
            <span className="brand-name">MarketLens AI</span>
            <span className="brand-model-tag">AI Buying Assistant</span>
          </div>
        </div>
        <div className="header-actions">
          {sub?.isPro ? (
            <span className="pro-chip pro-chip-active">💎 PRO</span>
          ) : (
            <button
              className="pro-chip pro-chip-upgrade"
              onClick={() => setState('paywall')}
              title="Upgrade to MarketLens Pro"
            >
              ✨ {sub?.freeAppraisalsRemaining ?? 1} Free · Upgrade
            </button>
          )}
          <button
            className={`icon-btn ${state === 'settings' ? 'active' : ''}`}
            onClick={() => setState(state === 'settings' ? (analysis ? 'results' : 'paywall') : 'settings')}
            title="Customization & Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* ─── Main Body ──────────────────────────────────────────────── */}
      <main className="popup-body">
        {/* 1. Pro Paywall & Subscription View */}
        {state === 'paywall' && (
          <div className="card paywall-card fade-in">
            <div className="paywall-hero-badge">💎 MARKETLENS PRO</div>
            <h2 className="paywall-title">Unlimited Secondhand Deal Appraisals</h2>
            <p className="paywall-desc">
              Never overpay or get scammed again. Zero setup, instant vision inspection, and live resale profit calculation.
            </p>

            <div className="plan-toggle-row">
              <button
                className={`plan-tab ${selectedPlan === 'annual' ? 'active' : ''}`}
                onClick={() => setSelectedPlan('annual')}
              >
                <div className="plan-tab-header">
                  <span className="plan-name">Annual Plan</span>
                  <span className="plan-badge">Save 42%</span>
                </div>
                <div className="plan-price-row">
                  <span className="plan-price">$5.75</span>
                  <span className="plan-period">/ mo</span>
                </div>
                <span className="plan-sub">$69 billed annually</span>
              </button>

              <button
                className={`plan-tab ${selectedPlan === 'monthly' ? 'active' : ''}`}
                onClick={() => setSelectedPlan('monthly')}
              >
                <div className="plan-tab-header">
                  <span className="plan-name">Monthly Plan</span>
                  <span className="plan-badge plan-badge-neutral">Flexible</span>
                </div>
                <div className="plan-price-row">
                  <span className="plan-price">$9.99</span>
                  <span className="plan-period">/ mo</span>
                </div>
                <span className="plan-sub">Billed monthly, cancel anytime</span>
              </button>
            </div>

            <div className="paywall-features">
              <div className="feature-line">
                <span className="check-icon">✓</span>
                <span><strong>Unlimited Real-Time Appraisals</strong> across all marketplaces</span>
              </div>
              <div className="feature-line">
                <span className="check-icon">✓</span>
                <span><strong>Deep Gemini 3.8 Vision Audits</strong> for hidden damage & authenticity</span>
              </div>
              <div className="feature-line">
                <span className="check-icon">✓</span>
                <span><strong>Live Flip & Resale Margins</strong> computed against local secondhand sales</span>
              </div>
              <div className="feature-line">
                <span className="check-icon">✓</span>
                <span><strong>Zero Setup Required</strong> — powered by high-speed cloud infrastructure</span>
              </div>
            </div>

            {checkoutError && (
              <div className="checkout-error-banner">⚠️ {checkoutError}</div>
            )}

            <button
              className="btn-primary btn-stripe-checkout"
              disabled={isCheckingOut}
              onClick={() => handleUpgradeToStripe(selectedPlan)}
            >
              {isCheckingOut ? (
                <span className="spinner-dots">Preparing Checkout…</span>
              ) : (
                `Upgrade to Pro — ${selectedPlan === 'annual' ? '$69 / Year' : '$9.99 / Month'}`
              )}
            </button>

            <span className="stripe-secure-notice">🔒 Secured by Stripe · Cancel anytime with 1-click</span>
          </div>
        )}

        {/* 2. Customization & Membership Settings View */}
        {state === 'settings' && (
          <div className="results-stream fade-in">
            <div className="section-header-row">
              <h3 className="section-title">Settings & Customization</h3>
              <button
                className="btn-secondary-sm"
                onClick={() => setState(analysis ? 'results' : 'paywall')}
              >
                Done
              </button>
            </div>

            {/* A. Subscription Status Card */}
            <div className="card member-card">
              <div className="member-row">
                <div className="member-title-group">
                  <span className="member-icon">{sub?.isPro ? '💎' : '⚡'}</span>
                  <div>
                    <h4 className="setting-card-title" style={{ margin: 0 }}>
                      {sub?.isPro ? 'MarketLens Pro Member' : 'MarketLens Free Tier'}
                    </h4>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>
                      {sub?.isPro
                        ? 'Unlimited AI deal appraisals active'
                        : `${sub?.freeAppraisalsRemaining ?? 1} of 1 free appraisal remaining`}
                    </span>
                  </div>
                </div>
                {sub?.isPro ? (
                  <button className="btn-secondary-sm" onClick={handleManageBilling}>
                    Manage in Stripe ↗
                  </button>
                ) : (
                  <button className="btn-primary-sm" onClick={() => setState('paywall')}>
                    Upgrade to Pro 💎
                  </button>
                )}
              </div>
            </div>

            {/* B. Floating Badges & Navigation */}
            <div className="card">
              <h4 className="setting-card-title">Floating Smart Buttons</h4>

              <div className="setting-toggle-row">
                <div className="setting-label-col">
                  <span className="setting-title">Marketplace Grid Badges</span>
                  <span className="setting-desc">Show '✨ AI Deal' floating badge on every feed item</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.showGridBadges}
                    onChange={(e) => handleUpdatePref({ showGridBadges: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="setting-label-col">
                  <span className="setting-title">Listing Action Button</span>
                  <span className="setting-desc">Show floating action button in bottom right of item page</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.showDetailPageButton}
                    onChange={(e) => handleUpdatePref({ showDetailPageButton: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="setting-label-col">
                  <span className="setting-title">Auto-Open on Card Click</span>
                  <span className="setting-desc">Open listing page with instant real AI appraisal on badge click</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={prefs.autoAnalyzeOnCardClick}
                    onChange={(e) => handleUpdatePref({ autoAnalyzeOnCardClick: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {/* B. Visual Theme & Accent Colors */}
            <div className="card">
              <h4 className="setting-card-title">Theme & Color Palette</h4>

              <div className="setting-group-col">
                <span className="setting-title">Color Theme</span>
                <div className="theme-toggle-group">
                  <button
                    className={`theme-btn ${prefs.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleUpdatePref({ theme: 'dark' })}
                  >
                    🌙 Dark
                  </button>
                  <button
                    className={`theme-btn ${prefs.theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleUpdatePref({ theme: 'light' })}
                  >
                    ☀️ Light
                  </button>
                  <button
                    className={`theme-btn ${prefs.theme === 'system' ? 'active' : ''}`}
                    onClick={() => handleUpdatePref({ theme: 'system' })}
                  >
                    💻 System
                  </button>
                </div>
              </div>

              <div className="setting-group-col">
                <span className="setting-title">Accent Highlight Color</span>
                <div className="swatch-row">
                  {(Object.keys(ACCENT_PALETTES) as AccentColor[]).map((color) => (
                    <button
                      key={color}
                      className={`color-swatch ${prefs.accentColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: ACCENT_PALETTES[color].primary }}
                      title={ACCENT_PALETTES[color].name}
                      onClick={() => handleUpdatePref({ accentColor: color })}
                    ></button>
                  ))}
                </div>
              </div>
            </div>

            {saveSuccess && (
              <div className="save-banner">✓ Settings saved & applied live!</div>
            )}
          </div>
        )}

        {/* 3. Loading Context State */}
        {state === 'loading' && (
          <div className="loading-stage fade-in">
            <div className="orb-wrap">
              <div className="orb-glow" />
              <div className="orb-ring" />
              <div className="orb-core">✨</div>
            </div>
            <p className="loading-title">Capturing Page & Photos…</p>
            <p className="loading-sub">Connecting to the listing and preparing visual evidence.</p>
          </div>
        )}

        {/* 4. AI Analyzing State (Multi-step) */}
        {state === 'analyzing' && (
          <div className="loading-stage fade-in">
            <div className="orb-wrap">
              <div className="orb-glow" />
              <div className="orb-ring" />
              <div className="orb-core">🧠</div>
            </div>
            <h3 className="loading-title">Auditing this listing…</h3>
            <p className="loading-sub">Gemini 3.8 Flash is checking price, condition and safety.</p>

            <div className="analysis-steps">
              <div className={`step-item ${analysisStep >= 1 ? (analysisStep > 1 ? 'done' : 'active') : ''}`}>
                <span className="step-icon">{analysisStep > 1 ? '✓' : '👁️'}</span>
                <span>Scanning photos for condition & flaws</span>
              </div>
              <div className={`step-item ${analysisStep >= 2 ? (analysisStep > 2 ? 'done' : 'active') : ''}`}>
                <span className="step-icon">{analysisStep > 2 ? '✓' : '🏷️'}</span>
                <span>Comparing against real market prices</span>
              </div>
              <div className={`step-item ${analysisStep >= 3 ? (analysisStep > 3 ? 'done' : 'active') : ''}`}>
                <span className="step-icon">{analysisStep > 3 ? '✓' : '🛡️'}</span>
                <span>Running scam & red-flag detection</span>
              </div>
              <div className={`step-item ${analysisStep >= 4 ? 'active' : ''}`}>
                <span className="step-icon">⚖️</span>
                <span>Scoring: should you buy it?</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. Error & Guidance State */}
        {state === 'error' && (
          <div className="card error-card fade-in">
            {errorMsg.includes('NOT_A_LISTING') ? (
              <div>
                <div className="onboarding-icon" style={{ width: 52, height: 52, fontSize: 24 }}>🛍️</div>
                <h3 className="onboarding-title" style={{ fontSize: 15 }}>Open an Item Listing First</h3>
                <p className="onboarding-desc" style={{ marginBottom: 16 }}>
                  You are browsing the Marketplace grid feed. Click any item to view its details, or tap the floating <strong>✨ AI Deal</strong> button on a card!
                </p>
                <div className="btn-row">
                  <button className="btn-primary" onClick={() => checkAndAnalyze()}>
                    ↻ Re-Check Active Page
                  </button>
                  <button className="btn-secondary" onClick={handleRunDemo}>
                    Preview Demo
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="error-badge">Analysis Notice</div>
                <p className="error-message">{errorMsg}</p>
                <div className="btn-row">
                  <button className="btn-primary" onClick={() => checkAndAnalyze()}>
                    ↻ Try Again
                  </button>
                  <button className="btn-secondary" onClick={handleRunDemo}>
                    View Demo Sample
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 6. Comprehensive AI Results View */}
        {state === 'results' && analysis && (
          <div className="results-stream">
            {isDemo && (
              <div className="demo-banner">
                <span>⚡ Demo appraisal — add your free Gemini key in ⚙️ to analyze live listings.</span>
              </div>
            )}

            {/* A. Verdict Hero — Buy Score */}
            {(() => {
              const resolvedVerdictLabel =
                analysis.buyVerdictLabel ||
                analysis.pricing?.dealVerdictLabel ||
                (buyVerdict === 'walk_away'
                  ? 'Walk Away — Poor Deal or High Risk'
                  : buyVerdict === 'buy_now'
                  ? 'Great Buy — Act Fast'
                  : buyVerdict === 'good_buy'
                  ? 'Good Buy — Fair Price'
                  : buyVerdict === 'negotiate'
                  ? 'Negotiate First — Overpriced'
                  : 'Caution Advised');

              const resolvedProductName =
                analysis.identifiedProduct?.name ||
                listingContext?.title ||
                'Marketplace Item';

              const resolvedSummary =
                analysis.aiSummary ||
                'Comprehensive AI appraisal completed for this listing.';

              return (
                <div
                  className="card verdict-hero stagger"
                  style={{ ['--i' as any]: 0, ['--hero-glow' as any]: `${ringColor}2E` }}
                >
                  <div className="verdict-hero-top">
                    <ScoreRing score={buyScore} color={ringColor} />
                    <div className="verdict-info">
                      <span className={`verdict-pill v-${buyVerdict}`}>
                        {VERDICT_PILL_TEXT[buyVerdict]}
                      </span>
                      <h2 className="verdict-label">
                        {resolvedVerdictLabel}
                      </h2>
                      <div className="verdict-product">
                        {resolvedProductName}
                      </div>
                    </div>
                  </div>
                  <p className="verdict-summary">{resolvedSummary}</p>
                </div>
              );
            })()}

            {/* B. Price Intelligence */}
            <div className="card stagger" style={{ ['--i' as any]: 1 }}>
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-icon">🏷️</span>
                  <div>
                    <h3 className="card-title">Price Intelligence</h3>
                    <p className="card-subtitle">Asking vs real market value</p>
                  </div>
                </div>
                {marketChip && (
                  <span className={`market-chip ${marketChip.cls}`}>{marketChip.text}</span>
                )}
              </div>

              {/* Visual Price Comparison Bar */}
              <div className="price-gauge-wrap">
                <div className="gauge-track">
                  <div className="gauge-segment seg-great" />
                  <div className="gauge-segment seg-fair" />
                  <div className="gauge-segment seg-high" />
                  <div
                    className="gauge-pin"
                    style={{ left: `${barPos}%`, ['--pin-color' as any]: ringColor }}
                    title="Asking Price Position"
                  />
                </div>
                <div className="gauge-labels">
                  <span>Under Market</span>
                  <span>Fair Used</span>
                  <span>Retail MSRP</span>
                </div>
              </div>

              {/* 3-Way Pricing Comparison Pods */}
              <div className="price-pods">
                <div className="price-pod pod-highlight">
                  <span className="pod-label">Asking</span>
                  <span className="pod-value">{askingPriceDisplay}</span>
                  <span className="pod-sub">Listed price</span>
                </div>

                <div className="price-pod">
                  <span className="pod-label">Fair Used</span>
                  <span className="pod-value">
                    ${analysis.pricing.fairUsedMarketRange.min}–${analysis.pricing.fairUsedMarketRange.max}
                  </span>
                  <span className="pod-sub">
                    Avg ${analysis.pricing.fairUsedMarketRange.fairAverage}
                  </span>
                </div>

                <div className="price-pod">
                  <span className="pod-label">
                    {analysis.identifiedProduct?.modelYear
                      ? `MSRP (${analysis.identifiedProduct.modelYear})`
                      : 'New MSRP'}
                  </span>
                  <span className="pod-value">
                    {analysis.pricing.estimatedNewPrice
                      ? `$${analysis.pricing.estimatedNewPrice.toLocaleString()}`
                      : 'N/A'}
                  </span>
                  <span className="pod-sub">
                    {analysis.identifiedProduct?.modelYear &&
                    new Date().getFullYear() - analysis.identifiedProduct.modelYear >= 5
                      ? `Original in ${analysis.identifiedProduct.modelYear}`
                      : discountPercent
                      ? `Save ${discountPercent}% vs new`
                      : 'When new'}
                  </span>
                </div>
              </div>
            </div>

            {/* C. Safety Check — Red Flags */}
            <div className="card stagger" style={{ ['--i' as any]: 2 }}>
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-icon">🛡️</span>
                  <div>
                    <h3 className="card-title">Safety Check</h3>
                    <p className="card-subtitle">Scam & risk detection</p>
                  </div>
                </div>
              </div>

              {redFlags.length > 0 ? (
                <div className="flag-list">
                  {redFlags.map((flag, i) => (
                    <div
                      key={i}
                      className={`flag-row sev-${flag.severity}`}
                      style={{ ['--i' as any]: i }}
                    >
                      <span className="flag-icon">
                        {flag.severity === 'critical' ? '⛔' : flag.severity === 'warning' ? '⚠️' : 'ℹ️'}
                      </span>
                      <span>{flag.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="all-clear">
                  <span className="check-dot">✓</span>
                  <span>No scam signals or red flags detected in this listing.</span>
                </div>
              )}
            </div>

            {/* D. Visual Condition Audit */}
            <div className="card stagger" style={{ ['--i' as any]: 3 }}>
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-icon">👁️</span>
                  <div>
                    <h3 className="card-title">Condition Audit</h3>
                    <p className="card-subtitle">AI photo inspection</p>
                  </div>
                </div>
                <span className={`grade-pill g-${conditionScore}`}>
                  {conditionScore}
                </span>
              </div>

              {listingContext?.imageUrl && (
                <div className="product-strip">
                  <div className="product-thumb-wrap">
                    <img src={listingContext.imageUrl} alt="Listing" className="product-thumb" />
                    <span className="vision-badge">AI AUDITED</span>
                  </div>
                  <div className="product-strip-info">
                    <div className="hero-chip-row">
                      <span className="category-tag">{analysis.identifiedProduct.category}</span>
                    </div>
                    <span className="brand-model">
                      {analysis.identifiedProduct.brand} · {analysis.identifiedProduct.model}
                    </span>
                  </div>
                </div>
              )}

              <div className="auth-row">
                <span className={`auth-tag ${analysis.visualAudit.isAuthenticUserPhoto ? 'good' : 'warn'}`}>
                  {analysis.visualAudit.isAuthenticUserPhoto
                    ? '✓ Authentic seller photo'
                    : '⚠ Possible stock / catalog image'}
                </span>
              </div>

              {analysis.identifiedProduct.conditionReport && (
                <p className="condition-report">{analysis.identifiedProduct.conditionReport}</p>
              )}

              {analysis.visualAudit.detectedFlawsOrWear.length > 0 ? (
                <>
                  <div className="chips-label">Spotted by AI</div>
                  <div className="flaw-chips">
                    {analysis.visualAudit.detectedFlawsOrWear.map((flaw, i) => (
                      <span key={i} className="flaw-chip" style={{ ['--i' as any]: i }}>
                        ⚠ {flaw}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="clean-notice">
                  ✓ No visible scratches, cracks, or damage detected in photos.
                </div>
              )}

              {analysis.visualAudit.accessoriesVisible.length > 0 && (
                <>
                  <div className="chips-label">Included / Visible</div>
                  <div className="flaw-chips">
                    {analysis.visualAudit.accessoriesVisible.map((acc, i) => (
                      <span key={i} className="accessory-chip" style={{ ['--i' as any]: i }}>
                        ✓ {acc}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* E. Questions to Ask the Seller */}
            {questions.length > 0 && (
              <div className="card stagger" style={{ ['--i' as any]: 4 }}>
                <div className="card-header-row">
                  <div className="card-title-group">
                    <span className="card-icon">❓</span>
                    <div>
                      <h3 className="card-title">Ask the Seller</h3>
                      <p className="card-subtitle">Before you commit</p>
                    </div>
                  </div>
                </div>

                <div className="question-list">
                  {questions.map((q, i) => (
                    <div key={i} className="question-row" style={{ ['--i' as any]: i }}>
                      <span className="q-num">{i + 1}</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>

                <button
                  className={`copy-all-btn ${copiedQuestions ? 'copied' : ''}`}
                  onClick={handleCopyQuestions}
                >
                  {copiedQuestions ? '✓ Questions copied!' : '📋 Copy All Questions'}
                </button>
              </div>
            )}

            {/* F. Negotiation Assistant */}
            <div className="card stagger" style={{ ['--i' as any]: 5 }}>
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-icon">💬</span>
                  <div>
                    <h3 className="card-title">Negotiation</h3>
                    <p className="card-subtitle">Ready-to-send counter-offer</p>
                  </div>
                </div>
                <span className="offer-pill">
                  Offer ${analysis.negotiation.recommendedOffer}
                </span>
              </div>

              <div className="chat-stage">
                <div className="chat-bubble">
                  {analysis.negotiation.counterOfferMessage}
                </div>
                <div className="chat-meta">Drafted for Messenger · tap below to copy</div>
              </div>

              <button
                className="btn-primary"
                onClick={handleCopyOffer}
                style={copiedOffer ? { background: 'linear-gradient(135deg,#10B981,#059669)' } : undefined}
              >
                {copiedOffer ? '✓ Copied — paste it in Messenger' : '💬 Copy Counter-Offer Message'}
              </button>
            </div>

            {/* G. Resale & Value Retention (secondary) */}
            <div className="card stagger" style={{ ['--i' as any]: 6 }}>
              <div className="card-header-row">
                <div className="card-title-group">
                  <span className="card-icon">📈</span>
                  <div>
                    <h3 className="card-title">Resale & Value Retention</h3>
                    <p className="card-subtitle">If you sell it later</p>
                  </div>
                </div>
                <div className="resale-score-badge">
                  <span className="score-num">{analysis.flipPotential.score}</span>
                  <span className="score-max">/10</span>
                </div>
              </div>

              <div className="metric-grid">
                <div className="metric-box">
                  <span className="metric-label">Resells For</span>
                  <span className="metric-value">
                    ${analysis.flipPotential.estimatedResaleValue}
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Net Margin</span>
                  <span className={`metric-value ${analysis.flipPotential.estimatedNetProfit >= 0 ? 'positive' : 'negative'}`}>
                    {analysis.flipPotential.estimatedNetProfit >= 0 ? '+' : '−'}$
                    {Math.abs(analysis.flipPotential.estimatedNetProfit)}
                  </span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Sells In</span>
                  <span className="metric-value">
                    {analysis.flipPotential.resaleTimeframe}
                  </span>
                </div>
              </div>

              {analysis.flipPotential.estimatedNetProfit < 0 && (
                <div className="loss-notice" style={{
                  background: 'var(--red-soft)',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  fontSize: 11.5,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  marginTop: 10,
                  lineHeight: 1.4,
                  fontWeight: 600
                }}>
                  ⚠️ Reselling at open market rate would result in an estimated ${Math.abs(analysis.flipPotential.estimatedNetProfit)} loss. Best for personal use, not flipping.
                </div>
              )}

              <p className="resale-summary">{analysis.flipPotential.flipSummary}</p>
            </div>

            {/* H. Action Bar */}
            <div className="action-bar stagger" style={{ ['--i' as any]: 7 }}>
              <button className="btn-rescan" onClick={() => checkAndAnalyze()}>
                ↻ Re-Analyze This Listing
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
