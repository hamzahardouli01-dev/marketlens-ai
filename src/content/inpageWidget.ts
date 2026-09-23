/**
 * MarketLens AI — In-Page Listing Button, Grid Badges & AI Appraisal Overlay
 *
 * Features:
 * 1. Smart floating badges on listing cards in Marketplace feed.
 * 2. Floating action button on individual listing pages.
 * 3. In-page Slide-Out Drawer with Gemini 3.8 Flash Vision appraisal.
 * 4. Full customization: Toggle floating buttons, auto-open listing, Dark/Light theme, and Accent colors.
 * 5. Real-time live synchronization with extension storage.
 */

import {
  harvestUniversalListing,
  convertImageToBase64,
  isIndividualListing,
  isMarketplacePage,
  waitForListingElements,
} from './universalExtractor';
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
  verifyCheckoutSession,
} from '../services/backendApi';
import type { AIProductAnalysis, BuyVerdict, UniversalListingContext } from '../types/ai';
import type { ProPlan, UserSubscription } from '../types/subscription';
import { DEMO_ANALYSIS } from '../services/mockData';
import {
  getPreferences,
  savePreferences,
  ACCENT_PALETTES,
  DEFAULT_PREFERENCES,
  type UserPreferences,
  type ThemeMode,
  type AccentColor,
} from '../services/settings';

const BTN_ID = 'marketlens-inpage-btn';
const MODAL_ID = 'marketlens-inpage-modal';

let currentPrefs: UserPreferences = { ...DEFAULT_PREFERENCES };
let currentUserSub: UserSubscription | null = null;
let currentSelectedPlan: ProPlan = 'annual';
let isAutoAnalyzing = false;
let activeDrawerTab: 'appraisal' | 'settings' = 'appraisal';
let latestAnalysis: { analysis: AIProductAnalysis; context: UniversalListingContext; isDemo: boolean } | null = null;

// ─── Initialization ──────────────────────────────────────────────────────────

async function checkStripeRedirectReturn(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hasStatus = urlParams.get('marketlens_status') === 'success';
    const sessionId = urlParams.get('session_id') || undefined;

    if (hasStatus || sessionId) {
      // Clean query params from URL bar so it doesn't clutter
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      const synced = await syncSubscriptionWithServer(sessionId);
      currentUserSub = synced;
      updateDrawerProPill();

      if (synced.isPro) {
        console.log('[MarketLens] Pro membership successfully activated from Stripe redirect return!');
        createModalBase(false);
        renderProActivatedSuccess();
      }
    }
  } catch (err) {
    console.warn('[MarketLens] Error checking Stripe redirect:', err);
  }
}

export function initInpageWidget(): void {
  injectStyles();

  // Load subscription and background sync with server
  getUserSubscription().then((sub) => {
    currentUserSub = sub;
    updateDrawerProPill();
    syncSubscriptionWithServer()
      .then((synced) => {
        currentUserSub = synced;
        updateDrawerProPill();
      })
      .catch(() => {});
  });

  // Check if returning from Stripe Checkout
  checkStripeRedirectReturn();

  // Load preferences
  getPreferences().then((prefs) => {
    currentPrefs = prefs;
    applyTheme();
    checkAndInject();
  });

  // Listen to live settings changes from popup or options
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['marketlens_preferences']) {
        const val = changes['marketlens_preferences'].newValue;
        if (val && typeof val === 'object') {
          currentPrefs = { ...DEFAULT_PREFERENCES, ...(val as Partial<UserPreferences>) };
          applyTheme();
          checkAndInject();
        }
      }
    });
  }

  // Check immediately and on scheduled ticks for dynamic SPAs
  setTimeout(checkAutoAnalyze, 300);
  setTimeout(checkAutoAnalyze, 800);
  setTimeout(checkAutoAnalyze, 1600);

  // Throttled observer for infinite scrolling feeds & SPA transitions
  let timer: any = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      checkAndInject();
      timer = null;
    }, 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => checkAndInject());
}

function checkAndInject(): void {
  // If we are NOT on a supported marketplace page (e.g. user navigated to Facebook News Feed or non-marketplace site):
  // Clean up any existing floating button and card badges immediately!
  if (!isMarketplacePage()) {
    const existingBtn = document.getElementById(BTN_ID);
    if (existingBtn) existingBtn.style.display = 'none';
    const existingBadges = document.querySelectorAll('.ml-card-badge');
    existingBadges.forEach((el) => el.remove());
    return;
  }

  checkAndInjectDetailButton();
  injectGridCardBadges();
  checkAutoAnalyze();

  // If the in-page drawer is currently open displaying the "Ready to Appraise" guide,
  // and the user navigates into an item (e.g. clicked an item card on FB or eBay),
  // automatically transition from the guide into analyzing the item immediately!
  const modal = document.getElementById(MODAL_ID);
  if (
    modal &&
    modal.style.display !== 'none' &&
    modal.querySelector('.ml-no-listing-container') &&
    isDetailPage()
  ) {
    openInpageModal();
  }
}

// ─── Theme & Appearance ───────────────────────────────────────────────────────

function applyTheme(): void {
  const isDark =
    currentPrefs.theme === 'dark' ||
    (currentPrefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const palette = ACCENT_PALETTES[currentPrefs.accentColor] || ACCENT_PALETTES.blue;

  document.documentElement.style.setProperty('--ml-accent', palette.primary);
  document.documentElement.style.setProperty('--ml-accent-hover', palette.hover);
  document.documentElement.style.setProperty('--ml-accent-soft', palette.soft);

  const drawer = document.getElementById(MODAL_ID);
  if (drawer) {
    drawer.setAttribute('data-theme', isDark ? 'dark' : 'light');
    drawer.setAttribute('data-accent', currentPrefs.accentColor);
  }
}

// ─── Buyer Verdict Fallbacks (tolerate older cached analyses) ────────────────

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

// ─── Auto-Analyze on Listing Open ───────────────────────────────────────────

async function checkAutoAnalyze(): Promise<void> {
  if (isAutoAnalyzing) return;

  let rawTimestamp: string | null = null;
  try {
    rawTimestamp = localStorage.getItem('marketlens_auto_analyze');
  } catch {
    return;
  }

  if (!rawTimestamp) return;

  const timestamp = parseInt(rawTimestamp, 10);
  const elapsed = Date.now() - timestamp;

  // TTL: 45 seconds to prevent stale triggering
  if (isNaN(timestamp) || elapsed > 45000) {
    try {
      localStorage.removeItem('marketlens_auto_analyze');
    } catch {}
    return;
  }

  // Must be on an actual detail page or modal
  if (!isDetailPage()) return;

  isAutoAnalyzing = true;
  try {
    localStorage.removeItem('marketlens_auto_analyze');
  } catch {}

  await waitForListingElements(document, 4000);
  openInpageModal();
  isAutoAnalyzing = false;
}

// ─── 1. In-Page Detail Floating Action Button ─────────────────────────────────

function isDetailPage(): boolean {
  const url = window.location.href;
  return isIndividualListing(url, document);
}

function checkAndInjectDetailButton(): void {
  const existingBtn = document.getElementById(BTN_ID);

  // 1. Must be on a supported marketplace page (e.g. Facebook Marketplace, eBay, Craigslist)
  if (!isMarketplacePage()) {
    if (existingBtn) existingBtn.style.display = 'none';
    return;
  }

  // 2. If user disabled detail button in settings
  if (!currentPrefs.showDetailPageButton) {
    if (existingBtn) existingBtn.style.display = 'none';
    return;
  }

  // 3. Must be on an actual detail listing page
  const onListing = isDetailPage();
  if (!onListing) {
    if (existingBtn) existingBtn.style.display = 'none';
    return;
  }

  if (existingBtn) {
    existingBtn.style.display = 'inline-flex';
    return;
  }

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.innerHTML = `
    <span class="ml-btn-sparkle">✨</span>
    <span class="ml-btn-label">AI Deal Appraisal</span>
  `;
  btn.title = 'Appraise this deal with Gemini 3.8 Flash Vision';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openInpageModal();
  });

  document.body.appendChild(btn);
}

// ─── 2. Smart Floating Grid Badges on Every Listing Card ──────────────────────

function injectGridCardBadges(): void {
  // 1. Must be on a supported marketplace page
  if (!isMarketplacePage()) {
    const existing = document.querySelectorAll('.ml-card-badge');
    existing.forEach((el) => el.remove());
    return;
  }

  // 2. If user disabled grid badges in settings, remove any existing badges and exit
  if (!currentPrefs.showGridBadges) {
    const existing = document.querySelectorAll('.ml-card-badge');
    existing.forEach((el) => el.remove());
    return;
  }

  // Find listing item links on Marketplace feed
  const cardLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]')
  );

  for (const card of cardLinks) {
    if (card.querySelector('.ml-card-badge')) continue;

    const img = card.querySelector('img');
    if (!img) continue;

    const computedPos = window.getComputedStyle(card).position;
    if (computedPos === 'static') {
      card.style.position = 'relative';
    }

    const badge = document.createElement('button');
    badge.className = 'ml-card-badge';
    badge.innerHTML = `<span class="ml-badge-sparkle">✨</span> AI Deal`;
    badge.title = 'Appraise this deal with Gemini 3.8 Flash';

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (currentPrefs.autoAnalyzeOnCardClick) {
        try {
          localStorage.setItem('marketlens_auto_analyze', Date.now().toString());
        } catch {}

        badge.innerHTML = `<span class="ml-badge-sparkle">⏳</span> Opening…`;
        badge.style.opacity = '0.9';

        if (e.metaKey || e.ctrlKey) {
          window.open(card.href, '_blank');
        } else {
          window.location.href = card.href;
        }
      } else {
        openInpageModalForCard(card);
      }
    });

    card.appendChild(badge);
  }
}

// ─── 3. In-Feed Card Context Harvester ────────────────────────────────────────

async function harvestCardContext(card: HTMLAnchorElement): Promise<UniversalListingContext> {
  const url = card.href || window.location.href;
  const imgEl = card.querySelector<HTMLImageElement>('img');
  const imageUrl = imgEl?.src || imgEl?.currentSrc || '';

  const clean = (s: string) => s.replace(/[\u00A0\u202F\u2007\u200B]/g, ' ').trim();
  const textElements = Array.from(card.querySelectorAll('span, div'))
    .map((el) => clean(el.textContent || ''))
    .filter((t): t is string => Boolean(t && t.length > 0));

  let priceRaw = '';
  for (const t of textElements) {
    if (/^(?:free|gratuit)$/i.test(t)) {
      priceRaw = '$0 (Free)';
      break;
    }
    const m = t.match(
      /^(?:(?:CA|US|AU|NZ|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,.]+(?:\.\d{2})?$|^[\d\s,.]+\s*(?:[$€£¥]|CAD|USD|AUD|EUR|GBP)$/i
    );
    if (m) {
      priceRaw = t;
      break;
    }
  }

  if (!priceRaw) {
    const aria = clean(card.getAttribute('aria-label') || '');
    const m = aria.match(/(?:(?:CA|US|AU|NZ|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,.]+/i);
    priceRaw = m ? m[0] : '$0';
  }

  let title = '';
  for (const t of textElements) {
    if (
      t !== priceRaw &&
      t.length > 3 &&
      !/^\d+\s*(miles|km)/i.test(t) &&
      !/away$/i.test(t) &&
      !/ships to you/i.test(t) &&
      !/^(?:free|gratuit)$/i.test(t)
    ) {
      title = t;
      break;
    }
  }

  if (!title && imgEl?.alt && imgEl.alt.length > 3 && !/profile|photo|user/i.test(imgEl.alt)) {
    title = imgEl.alt;
  }
  if (!title && card.getAttribute('aria-label')) {
    title = card.getAttribute('aria-label') || '';
  }

  let currency = 'USD';
  if (/CAD|\bC\$|\bCA\$/i.test(card.textContent || '')) currency = 'CAD';
  else if (/EUR|€/i.test(priceRaw)) currency = 'EUR';
  else if (/GBP|£/i.test(priceRaw)) currency = 'GBP';
  else if (/AUD|\bAU\$|\bA\$/i.test(priceRaw)) currency = 'AUD';

  let imageBase64: string | undefined;
  let imageMimeType = 'image/jpeg';

  if (imageUrl) {
    const res = await convertImageToBase64(imageUrl, imgEl);
    if (res.base64) {
      imageBase64 = res.base64;
      imageMimeType = res.mimeType;
    }
  }

  return {
    url,
    title: title || 'Marketplace Listing',
    priceRaw,
    currency,
    description: `Listing from Facebook Marketplace feed: ${title} (${priceRaw})`,
    imageUrl,
    imageBase64,
    imageMimeType,
  };
}

async function openInpageModalForCard(card: HTMLAnchorElement): Promise<void> {
  createModalBase();
  try {
    const context = await harvestCardContext(card);
    await executeAppraisal(context);
  } catch (err: any) {
    showModalError(err?.message || String(err));
  }
}

// ─── 4. In-Page Slide-out Modal & AI Appraisal ────────────────────────────────

export async function toggleInpageModal(): Promise<void> {
  const modal = document.getElementById(MODAL_ID);
  if (modal && modal.style.display === 'flex') {
    modal.style.display = 'none';
    return;
  }
  await openInpageModal();
}

export async function openInpageModal(): Promise<void> {
  activeDrawerTab = 'appraisal';

  // 1. Check if we are currently on an actual individual listing page
  if (!isDetailPage()) {
    createModalBase(false); // Don't show loading orb
    renderNoListingGuide();
    return;
  }

  // 2. If we already appraised this exact listing page, show results immediately without re-fetching
  if (latestAnalysis && latestAnalysis.context.url === window.location.href) {
    createModalBase(false);
    renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo);
    return;
  }

  // 3. We ARE on an individual listing: Show loading orb and execute appraisal
  createModalBase(true);
  try {
    await waitForListingElements(document, 1500);
    const context: UniversalListingContext = await harvestUniversalListing();
    await executeAppraisal(context);
  } catch (err: any) {
    showModalError(err?.message || String(err));
  }
}

function renderNoListingGuide(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  const url = window.location.href;
  const isFb = url.includes('facebook.com');
  const isEbay = url.includes('ebay.');
  const isCraigslist = url.includes('craigslist.');
  const isMarketplaceSite = isFb || isEbay || isCraigslist;

  body.innerHTML = `
    <div class="ml-no-listing-container">
      <div class="ml-no-listing-badge">🔍 READY TO APPRAISE</div>
      <h2 class="ml-no-listing-title">Open a Listing to Start</h2>
      <p class="ml-no-listing-sub">
        ${
          isMarketplaceSite
            ? 'MarketLens AI activates when you view an individual item. You are currently browsing the feed or search results.'
            : 'MarketLens AI audits items on Facebook Marketplace, eBay, and Craigslist. Open any item listing to get an instant AI valuation.'
        }
      </p>

      <div class="ml-guide-list">
        <div class="ml-guide-item">
          <div class="ml-guide-icon-box">🛍️</div>
          <div class="ml-guide-content">
            <span class="ml-guide-step-title">1. Open Any Listing</span>
            <span class="ml-guide-step-desc">Click any item in the marketplace grid to view its full listing details and photos.</span>
          </div>
        </div>

        <div class="ml-guide-item">
          <div class="ml-guide-icon-box">✨</div>
          <div class="ml-guide-content">
            <span class="ml-guide-step-title">2. Use Floating Badges</span>
            <span class="ml-guide-step-desc">Click the '✨ AI Deal' button on any feed card to auto-open and appraise immediately.</span>
          </div>
        </div>

        <div class="ml-guide-item">
          <div class="ml-guide-icon-box">⚡</div>
          <div class="ml-guide-content">
            <span class="ml-guide-step-title">3. Instant AI Verdict</span>
            <span class="ml-guide-step-desc">MarketLens will audit price fairness, inspect photos for defects, and draft counter-offers.</span>
          </div>
        </div>
      </div>

      <div class="ml-no-listing-actions">
        <button class="ml-btn-secondary" id="ml-preview-demo-trigger">
          ✨ Preview Sample Demo Appraisal
        </button>
      </div>

      <div class="ml-supported-badge-row">
        <span class="ml-supported-tag">Facebook Marketplace</span>
        <span class="ml-supported-tag">eBay</span>
        <span class="ml-supported-tag">Craigslist</span>
      </div>
    </div>
  `;

  document.getElementById('ml-preview-demo-trigger')?.addEventListener('click', () => {
    const mockCtx: UniversalListingContext = {
      url: window.location.href,
      title: '2019 MacBook Pro 16" (Space Gray, 16GB RAM, 512GB SSD)',
      priceRaw: '$680',
      currency: 'USD',
      description: 'Barely used, clean condition, original charger included.',
      imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
    };
    renderInpageResults(DEMO_ANALYSIS, mockCtx, true);
  });
}

function createModalBase(showLoading: boolean = true): void {
  let modal = document.getElementById(MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    document.body.appendChild(modal);
  }

  const isDark =
    currentPrefs.theme === 'dark' ||
    (currentPrefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  modal.setAttribute('data-theme', isDark ? 'dark' : 'light');
  modal.setAttribute('data-accent', currentPrefs.accentColor);
  modal.style.display = 'flex';

  modal.innerHTML = `
    <div class="ml-overlay">
      <div class="ml-drawer">
        <!-- Top Bar -->
        <div class="ml-drawer-header">
          <div class="ml-header-brand">
            <div class="ml-brand-badge">✨</div>
            <div class="ml-brand-text-col">
              <div class="ml-brand-name">MarketLens AI</div>
              <div class="ml-brand-model">AI Buying Assistant</div>
            </div>
          </div>
          <div class="ml-header-actions">
            <button class="ml-pro-header-pill" id="ml-header-pro-pill" title="MarketLens Pro"></button>
            <button class="ml-action-icon-btn ${activeDrawerTab === 'settings' ? 'active' : ''}" id="ml-modal-settings" title="Customization & Settings">⚙️</button>
            <button class="ml-action-icon-btn" id="ml-modal-close" title="Close Drawer">✕</button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="ml-drawer-body" id="ml-drawer-body">
          ${
            showLoading
              ? `
            <div class="ml-loading-box">
              <div class="ml-orb-stage">
                <div class="ml-orb-glow"></div>
                <div class="ml-orb-spinner"></div>
                <div class="ml-orb-core">✨</div>
              </div>
              <p class="ml-loading-title">Auditing this listing…</p>
              <p class="ml-loading-sub">Gemini 3.8 Flash is checking price, condition and safety signals.</p>
            </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `;

  updateDrawerProPill();

  // Close button
  document.getElementById('ml-modal-close')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  // Close when clicking outside the drawer onto the backdrop
  const overlay = modal.querySelector('.ml-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay && modal) {
      modal.style.display = 'none';
    }
  });

  // Close when pressing Escape
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      modal.style.display = 'none';
    }
  };
  window.removeEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onKeyDown);

  document.getElementById('ml-modal-settings')?.addEventListener('click', () => {
    if (activeDrawerTab === 'settings') {
      activeDrawerTab = 'appraisal';
      if (latestAnalysis) {
        renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo);
      }
    } else {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    }
  });
}

function updateDrawerProPill(): void {
  const pill = document.getElementById('ml-header-pro-pill') as HTMLButtonElement | null;
  if (!pill) return;

  if (currentUserSub?.isPro) {
    pill.className = 'ml-pro-header-pill ml-pill-active';
    pill.innerHTML = '💎 PRO';
    pill.onclick = () => {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    };
  } else {
    const remaining = currentUserSub?.freeAppraisalsRemaining ?? 1;
    pill.className = 'ml-pro-header-pill ml-pill-upgrade';
    pill.innerHTML = `✨ ${remaining} Free`;
    pill.onclick = () => {
      renderInpagePaywall();
    };
  }
}

function renderInpagePaywall(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  body.innerHTML = `
    <div class="ml-card ml-inpage-paywall">
      <div class="ml-paywall-badge">💎 MARKETLENS PRO</div>
      <h2 class="ml-paywall-title">Unlimited Secondhand Deal Appraisals</h2>
      <p class="ml-paywall-sub">
        You have used your free AI appraisal. Upgrade to Pro for zero setup, unlimited visual inspections, and live resale margins.
      </p>

      <div class="ml-plan-toggle">
        <button class="ml-plan-box ${currentSelectedPlan === 'annual' ? 'active' : ''}" id="ml-plan-annual">
          <div class="ml-plan-box-top">
            <span class="ml-plan-name">Annual Plan</span>
            <span class="ml-plan-save-tag">Save 42%</span>
          </div>
          <div class="ml-plan-price-row">
            <span class="ml-plan-num">$5.75</span>
            <span class="ml-plan-per">/ mo</span>
          </div>
          <span class="ml-plan-billed">$69 billed annually</span>
        </button>

        <button class="ml-plan-box ${currentSelectedPlan === 'monthly' ? 'active' : ''}" id="ml-plan-monthly">
          <div class="ml-plan-box-top">
            <span class="ml-plan-name">Monthly Plan</span>
            <span class="ml-plan-flex-tag">Flexible</span>
          </div>
          <div class="ml-plan-price-row">
            <span class="ml-plan-num">$9.99</span>
            <span class="ml-plan-per">/ mo</span>
          </div>
          <span class="ml-plan-billed">Billed monthly, cancel anytime</span>
        </button>
      </div>

      <div class="ml-paywall-checklist">
        <div class="ml-check-item"><span>✓</span> <div><strong>Unlimited AI Appraisals</strong> across Facebook, eBay & Craigslist</div></div>
        <div class="ml-check-item"><span>✓</span> <div><strong>Deep Visual Photo Inspection</strong> for hidden flaws, dents & scratches</div></div>
        <div class="ml-check-item"><span>✓</span> <div><strong>Live Resale Margins</strong> anchored against true secondhand comps</div></div>
        <div class="ml-check-item"><span>✓</span> <div><strong>Zero Setup Required</strong> — no API keys or technical configuration</div></div>
      </div>

      <div id="ml-paywall-action-slot" style="width:100%;">
        <div id="ml-checkout-err-container" style="width:100%; display:none;"></div>
        <button class="ml-btn-primary" id="ml-inpage-checkout-btn">
          Upgrade to Pro — ${currentSelectedPlan === 'annual' ? '$69 / Year' : '$9.99 / Month'}
        </button>
      </div>

      <div class="ml-paywall-guarantee">
        🔒 Secured by Stripe · 1-click cancel anytime via Customer Portal
      </div>

      <div class="ml-paywall-sample-row">
        <button class="ml-btn-ghost" id="ml-inpage-demo-preview">✨ Preview Sample Appraisal Demo</button>
      </div>
    </div>
  `;

  // Attach plan toggle listeners
  document.getElementById('ml-plan-annual')?.addEventListener('click', () => {
    currentSelectedPlan = 'annual';
    renderInpagePaywall();
  });

  document.getElementById('ml-plan-monthly')?.addEventListener('click', () => {
    currentSelectedPlan = 'monthly';
    renderInpagePaywall();
  });

  // Attach checkout button listener
  document.getElementById('ml-inpage-checkout-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ml-inpage-checkout-btn') as HTMLButtonElement | null;
    const errContainer = document.getElementById('ml-checkout-err-container');
    const actionSlot = document.getElementById('ml-paywall-action-slot');

    if (btn) {
      btn.innerText = 'Preparing Secure Checkout…';
      btn.disabled = true;
    }
    if (errContainer) errContainer.style.display = 'none';

    const res = await createStripeCheckoutSession(currentSelectedPlan);
    if (res.success && res.url) {
      window.open(res.url, '_blank');

      if (actionSlot) {
        actionSlot.innerHTML = `
          <div class="ml-awaiting-card">
            <div class="ml-awaiting-pulse"></div>
            <div class="ml-awaiting-title">Stripe Checkout Opened</div>
            <div class="ml-awaiting-sub">Complete payment in Stripe, then click below to activate Pro:</div>
            <button class="ml-btn-primary" id="ml-confirm-payment-btn" style="margin-top:8px; width:100%;">
              ✓ I Completed Payment — Activate Pro
            </button>
            <div class="ml-awaiting-sub" style="font-size:10.5px; opacity:0.8; margin-top:2px;">
              Auto-checking payment status in background…
            </div>
          </div>
        `;

        let isPolling = true;

        const checkPaymentCompletion = async () => {
          const confirmBtn = document.getElementById('ml-confirm-payment-btn') as HTMLButtonElement | null;
          if (confirmBtn) {
            confirmBtn.innerText = 'Verifying with Stripe…';
            confirmBtn.disabled = true;
          }

          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro) {
            isPolling = false;
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          } else {
            if (confirmBtn) {
              confirmBtn.innerText = '✓ I Completed Payment — Activate Pro';
              confirmBtn.disabled = false;
            }
          }
        };

        document.getElementById('ml-confirm-payment-btn')?.addEventListener('click', checkPaymentCompletion);

        // Auto poll every 2.5s for 90s
        let polls = 0;
        const interval = setInterval(async () => {
          if (!isPolling || polls++ > 36) {
            clearInterval(interval);
            return;
          }
          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro) {
            isPolling = false;
            clearInterval(interval);
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          }
        }, 2500);

        // Also check immediately when user switches back to this tab
        const onWindowFocus = async () => {
          if (!isPolling) return;
          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro) {
            isPolling = false;
            clearInterval(interval);
            window.removeEventListener('focus', onWindowFocus);
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          }
        };
        window.addEventListener('focus', onWindowFocus);
      }
    } else {
      if (btn) {
        btn.innerText = `Upgrade to Pro — ${currentSelectedPlan === 'annual' ? '$69 / Year' : '$9.99 / Month'}`;
        btn.disabled = false;
      }
      if (errContainer) {
        errContainer.innerHTML = `<div class="ml-checkout-err">⚠️ ${res.error || 'Checkout initiation failed.'}</div>`;
        errContainer.style.display = 'block';
      }
    }
  });

  // Attach sample demo preview
  document.getElementById('ml-inpage-demo-preview')?.addEventListener('click', () => {
    const mockCtx: UniversalListingContext = {
      url: window.location.href,
      title: '2021 Apple iPad Air 4th Gen 64GB (Sky Blue)',
      priceRaw: '$340',
      currency: 'USD',
      description: 'Clean cosmetic condition, original box, charger included.',
      imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80',
    };
    renderInpageResults(
      DEMO_ANALYSIS,
      mockCtx,
      true
    );
  });

  document.getElementById('ml-goto-settings-btn')?.addEventListener('click', () => {
    activeDrawerTab = 'settings';
    renderInpageSettings();
  });
}

function renderProActivatedSuccess(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  body.innerHTML = `
    <div class="ml-paywall-wrap" style="align-items:center; justify-content:center; text-align:center;">
      <div class="ml-pro-success-card">
        <div class="ml-pro-success-icon">🎉</div>
        <div class="ml-pro-success-title">Welcome to MarketLens Pro!</div>
        <div class="ml-pro-success-sub">
          Your payment was confirmed. You now have unlimited AI deal appraisals, visual flaw inspection, and real-time resale margins unlocked!
        </div>
        <button class="ml-btn-primary" id="ml-pro-continue-btn" style="margin-top:8px; width:100%;">
          ⚡ Start AI Appraisal Now
        </button>
      </div>
    </div>
  `;

  const continueAppraisal = async () => {
    createModalBase(true);
    try {
      const context = await harvestUniversalListing();
      await executeAppraisal(context);
    } catch (err: any) {
      showModalError(err?.message || String(err));
    }
  };

  document.getElementById('ml-pro-continue-btn')?.addEventListener('click', continueAppraisal);

  // Automatically start appraisal after 1.8 seconds
  setTimeout(continueAppraisal, 1800);
}

async function executeAppraisal(context: UniversalListingContext): Promise<void> {
  // Sync with server first to make sure any recent Pro purchase or quota state is refreshed!
  try {
    currentUserSub = await syncSubscriptionWithServer();
    updateDrawerProPill();
  } catch {}

  const quota = await checkQuotaStatus();
  if (!quota.allowed) {
    renderInpagePaywall();
    return;
  }

  try {
    const analysis = await analyzeWithGemini(context);
    await decrementFreeQuota();
    currentUserSub = await getUserSubscription();
    latestAnalysis = { analysis, context, isDemo: false };
    if (activeDrawerTab === 'appraisal') {
      renderInpageResults(analysis, context, false);
    }
    updateDrawerProPill();
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('QUOTA_EXHAUSTED')) {
      renderInpagePaywall();
    } else {
      showModalError(msg);
    }
  }
}

function showModalError(msg: string): void {
  const body = document.getElementById('ml-drawer-body');
  if (body) {
    body.innerHTML = `
      <div class="ml-error-card">
        <div class="ml-error-icon">⚠️</div>
        <div class="ml-error-title">Analysis Notice</div>
        <p class="ml-error-msg">${msg}</p>
        <div class="ml-error-footer">
          MarketLens AI uses high-precision Gemini Vision models. Please verify your connection or upgrade to Pro.
        </div>
      </div>
    `;
  }
}

// ─── 5. High-End Results Presentation ─────────────────────────────────────────

function renderInpageResults(
  analysis: AIProductAnalysis,
  context: UniversalListingContext,
  isDemo: boolean
): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  // Pin scroll to top so the hero card is fully visible and never scrolled out of view
  body.scrollTop = 0;

  const askingDisplay = context.priceRaw || (analysis.pricing.askingPrice ? `$${analysis.pricing.askingPrice}` : 'N/A');

  // ── Buyer-first derived values (fall back for older cached analyses) ──
  const buyScore =
    typeof analysis.buyScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(analysis.buyScore)))
      : SCORE_FROM_RATING[analysis.pricing.dealRating] ?? 50;
  const buyVerdict: BuyVerdict | 'unknown' =
    analysis.buyVerdict || VERDICT_FROM_RATING[analysis.pricing.dealRating] || 'unknown';
  const ringColor = scoreColor(buyScore);
  const redFlags = analysis.redFlags ?? [];
  const questions = analysis.questionsToAsk ?? [];
  const conditionScore = analysis.visualAudit.conditionScore ?? 'good';

  // Score ring geometry (96×96 viewBox, r=42)
  const RING_C = 2 * Math.PI * 42;
  const ringTarget = RING_C - (RING_C * buyScore) / 100;

  // Compute percentage savings vs MSRP if available
  let discountPct: number | null = null;
  if (analysis.pricing.askingPrice && analysis.pricing.estimatedNewPrice) {
    const asking = analysis.pricing.askingPrice;
    const msrp = analysis.pricing.estimatedNewPrice;
    if (msrp > asking) {
      discountPct = Math.round(((msrp - asking) / msrp) * 100);
    }
  }

  // Market position chip from % vs fair market value
  let marketChipHtml = '';
  const pctVsMarket = analysis.pricing.percentageVsMarket;
  if (typeof pctVsMarket === 'number' && isFinite(pctVsMarket)) {
    if (pctVsMarket <= -3) {
      marketChipHtml = `<span class="ml-market-chip ml-chip-under">${pctVsMarket}% vs market</span>`;
    } else if (pctVsMarket >= 3) {
      marketChipHtml = `<span class="ml-market-chip ml-chip-over">+${pctVsMarket}% vs market</span>`;
    } else {
      marketChipHtml = `<span class="ml-market-chip ml-chip-fair">At market rate</span>`;
    }
  }

  // Visual Price Position (0% to 100% position on bar)
  let barPos = 50;
  if (analysis.pricing.askingPrice && analysis.pricing.estimatedNewPrice) {
    barPos = Math.min(100, Math.max(6, Math.round((analysis.pricing.askingPrice / analysis.pricing.estimatedNewPrice) * 100)));
  }

  const netProfit = analysis.flipPotential.estimatedNetProfit;

  // Staggered entrance order (the questions card is conditional)
  let staggerIdx = 0;
  const heroI = staggerIdx++;
  const priceI = staggerIdx++;
  const safetyI = staggerIdx++;
  const conditionI = staggerIdx++;
  const questionsI = questions.length > 0 ? staggerIdx++ : 0;
  const negotiationI = staggerIdx++;
  const resaleI = staggerIdx++;

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
    context.title ||
    'Marketplace Item';

  const resolvedSummary =
    analysis.aiSummary ||
    'Comprehensive AI appraisal completed for this listing.';

  body.innerHTML = `
    ${isDemo ? `
      <div class="ml-demo-banner">
        <span class="ml-demo-sparkle">⚡</span>
        <div>
          <strong>Demo Appraisal.</strong> Add your free Gemini key in ⚙️ to analyze live listings!
        </div>
      </div>
    ` : ''}

    <!-- 1. Verdict Hero — Buy Score -->
    <div class="ml-card ml-verdict-hero ml-stagger" style="--i:${heroI}; --ml-hero-glow:${ringColor}2E">
      <div class="ml-verdict-hero-top">
        <div class="ml-score-ring" style="color:${ringColor}">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="ml-score-ring-track" cx="48" cy="48" r="42"></circle>
            <circle
              class="ml-score-ring-fill"
              id="ml-score-ring-fill"
              cx="48" cy="48" r="42"
              stroke-dasharray="${RING_C.toFixed(2)}"
              stroke-dashoffset="${RING_C.toFixed(2)}"
            ></circle>
          </svg>
          <div class="ml-score-ring-center">
            <span class="ml-score-num" id="ml-score-num-val">0</span>
            <span class="ml-score-caption">Buy Score</span>
          </div>
        </div>
        <div class="ml-verdict-info">
          <span class="ml-verdict-pill v-${buyVerdict}">${VERDICT_PILL_TEXT[buyVerdict]}</span>
          <h2 class="ml-verdict-label">${resolvedVerdictLabel}</h2>
          <div class="ml-verdict-product">${resolvedProductName}</div>
        </div>
      </div>
      <p class="ml-verdict-summary">${resolvedSummary}</p>
    </div>

    <!-- 2. Price Intelligence -->
    <div class="ml-card ml-stagger" style="--i:${priceI}">
      <div class="ml-card-header-row">
        <div class="ml-card-title-group">
          <span class="ml-card-icon">🏷️</span>
          <div>
            <h3 class="ml-card-title">Price Intelligence</h3>
            <p class="ml-card-subtitle">Asking vs real market value</p>
          </div>
        </div>
        ${marketChipHtml}
      </div>

      <!-- Price Comparison Gauge Bar -->
      <div class="ml-price-gauge-wrap">
        <div class="ml-gauge-track">
          <div class="ml-gauge-segment ml-seg-great"></div>
          <div class="ml-gauge-segment ml-seg-fair"></div>
          <div class="ml-gauge-segment ml-seg-high"></div>
          <div class="ml-gauge-pin" style="left:${barPos}%; --ml-pin-color:${ringColor};" title="Asking Price Position"></div>
        </div>
        <div class="ml-gauge-labels">
          <span>Under Market</span>
          <span>Fair Used</span>
          <span>Retail MSRP</span>
        </div>
      </div>

      <!-- 3-Way Price Pods -->
      <div class="ml-price-pods">
        <div class="ml-price-pod ml-pod-highlight">
          <span class="ml-pod-label">Asking</span>
          <span class="ml-pod-value">${askingDisplay}</span>
          <span class="ml-pod-sub">Listed price</span>
        </div>
        <div class="ml-price-pod">
          <span class="ml-pod-label">Fair Used</span>
          <span class="ml-pod-value">$${analysis.pricing.fairUsedMarketRange.min}–$${analysis.pricing.fairUsedMarketRange.max}</span>
          <span class="ml-pod-sub">Avg $${analysis.pricing.fairUsedMarketRange.fairAverage}</span>
        </div>
        <div class="ml-price-pod">
          <span class="ml-pod-label">${analysis.identifiedProduct?.modelYear ? `MSRP (${analysis.identifiedProduct.modelYear})` : 'New MSRP'}</span>
          <span class="ml-pod-value">${analysis.pricing.estimatedNewPrice ? `$${analysis.pricing.estimatedNewPrice.toLocaleString()}` : 'N/A'}</span>
          <span class="ml-pod-sub">${analysis.identifiedProduct?.modelYear && (new Date().getFullYear() - analysis.identifiedProduct.modelYear >= 5) ? `Original in ${analysis.identifiedProduct.modelYear}` : discountPct ? `Save ${discountPct}% vs new` : 'When new'}</span>
        </div>
      </div>
    </div>

    <!-- 3. Safety Check — Red Flags -->
    <div class="ml-card ml-stagger" style="--i:${safetyI}">
      <div class="ml-card-header-row">
        <div class="ml-card-title-group">
          <span class="ml-card-icon">🛡️</span>
          <div>
            <h3 class="ml-card-title">Safety Check</h3>
            <p class="ml-card-subtitle">Scam & risk detection</p>
          </div>
        </div>
      </div>

      ${redFlags.length > 0 ? `
        <div class="ml-flag-list">
          ${redFlags.map((flag, i) => `
            <div class="ml-flag-row sev-${flag.severity}" style="--i:${i}">
              <span class="ml-flag-icon">${flag.severity === 'critical' ? '⛔' : flag.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
              <span>${flag.text}</span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="ml-all-clear">
          <span class="ml-check-dot">✓</span>
          <span>No scam signals or red flags detected in this listing.</span>
        </div>
      `}
    </div>

    <!-- 4. Condition Audit -->
    <div class="ml-card ml-stagger" style="--i:${conditionI}">
      <div class="ml-card-header-row">
        <div class="ml-card-title-group">
          <span class="ml-card-icon">👁️</span>
          <div>
            <h3 class="ml-card-title">Condition Audit</h3>
            <p class="ml-card-subtitle">AI photo inspection</p>
          </div>
        </div>
        <span class="ml-grade-pill g-${conditionScore}">${conditionScore}</span>
      </div>

      ${context.imageUrl ? `
        <div class="ml-product-strip">
          <div class="ml-product-thumb-wrap">
            <img src="${context.imageUrl}" alt="Listing" class="ml-product-thumb" />
            <span class="ml-vision-badge">AI AUDITED</span>
          </div>
          <div class="ml-product-strip-info">
            <div class="ml-chip-row">
              <span class="ml-category-tag">${analysis.identifiedProduct.category}</span>
            </div>
            <span class="ml-brand-model">${analysis.identifiedProduct.brand} · ${analysis.identifiedProduct.model}</span>
          </div>
        </div>
      ` : ''}

      <div class="ml-auth-row">
        <span class="ml-auth-tag ${analysis.visualAudit.isAuthenticUserPhoto ? 'ml-auth-good' : 'ml-auth-warn'}">${analysis.visualAudit.isAuthenticUserPhoto ? '✓ Authentic seller photo' : '⚠ Possible stock / catalog image'}</span>
      </div>

      ${analysis.identifiedProduct.conditionReport ? `<p class="ml-condition-report">${analysis.identifiedProduct.conditionReport}</p>` : ''}

      ${analysis.visualAudit.detectedFlawsOrWear.length > 0 ? `
        <div class="ml-chips-label">Spotted by AI</div>
        <div class="ml-chip-cloud">
          ${analysis.visualAudit.detectedFlawsOrWear.map((flaw, i) => `<span class="ml-flaw-chip" style="--i:${i}">⚠ ${flaw}</span>`).join('')}
        </div>
      ` : '<div class="ml-clean-notice">✓ No visible scratches, cracks, or damage detected in photos.</div>'}

      ${analysis.visualAudit.accessoriesVisible.length > 0 ? `
        <div class="ml-chips-label">Included / Visible</div>
        <div class="ml-chip-cloud">
          ${analysis.visualAudit.accessoriesVisible.map((acc, i) => `<span class="ml-accessory-chip" style="--i:${i}">✓ ${acc}</span>`).join('')}
        </div>
      ` : ''}
    </div>

    <!-- 5. Ask the Seller -->
    ${questions.length > 0 ? `
      <div class="ml-card ml-stagger" style="--i:${questionsI}">
        <div class="ml-card-header-row">
          <div class="ml-card-title-group">
            <span class="ml-card-icon">❓</span>
            <div>
              <h3 class="ml-card-title">Ask the Seller</h3>
              <p class="ml-card-subtitle">Before you commit</p>
            </div>
          </div>
        </div>

        <div class="ml-question-list">
          ${questions.map((q, i) => `
            <div class="ml-question-row" style="--i:${i}">
              <span class="ml-q-num">${i + 1}</span>
              <span>${q}</span>
            </div>
          `).join('')}
        </div>

        <button class="ml-btn-ghost" id="ml-copy-questions-btn">📋 Copy All Questions</button>
      </div>
    ` : ''}

    <!-- 6. Negotiation Assistant -->
    <div class="ml-card ml-stagger" style="--i:${negotiationI}">
      <div class="ml-card-header-row">
        <div class="ml-card-title-group">
          <span class="ml-card-icon">💬</span>
          <div>
            <h3 class="ml-card-title">Negotiation</h3>
            <p class="ml-card-subtitle">Ready-to-send counter-offer</p>
          </div>
        </div>
        <span class="ml-offer-pill">Offer $${analysis.negotiation.recommendedOffer}</span>
      </div>

      <div class="ml-chat-stage">
        <div class="ml-chat-bubble">${analysis.negotiation.counterOfferMessage}</div>
        <div class="ml-chat-meta">Drafted for Messenger · tap below to copy</div>
      </div>

      <button class="ml-btn-primary ml-copy-offer-btn" id="ml-copy-inpage-btn">
        💬 Copy Message for Messenger
      </button>
    </div>

    <!-- 7. Resale & Value Retention (secondary) -->
    <div class="ml-card ml-stagger" style="--i:${resaleI}">
      <div class="ml-card-header-row">
        <div class="ml-card-title-group">
          <span class="ml-card-icon">📈</span>
          <div>
            <h3 class="ml-card-title">Resale & Value Retention</h3>
            <p class="ml-card-subtitle">If you sell it later</p>
          </div>
        </div>
        <div class="ml-resale-score-badge">
          <span class="ml-score-num">${analysis.flipPotential.score}</span>
          <span class="ml-score-max">/10</span>
        </div>
      </div>

      <div class="ml-metric-grid">
        <div class="ml-metric-box">
          <span class="ml-metric-label">Resells For</span>
          <span class="ml-metric-value">$${analysis.flipPotential.estimatedResaleValue}</span>
        </div>
        <div class="ml-metric-box">
          <span class="ml-metric-label">Net Margin</span>
          <span class="ml-metric-value ${netProfit >= 0 ? 'ml-positive' : 'ml-negative'}">${netProfit >= 0 ? '+' : '−'}$${Math.abs(netProfit)}</span>
        </div>
        <div class="ml-metric-box">
          <span class="ml-metric-label">Sells In</span>
          <span class="ml-metric-value">${analysis.flipPotential.resaleTimeframe}</span>
        </div>
      </div>

      ${netProfit < 0 ? `
        <div class="ml-loss-notice">
          ⚠️ Reselling this item at open market rate would result in an estimated $${Math.abs(netProfit)} loss. Best for personal use, not flipping.
        </div>
      ` : ''}

      <p class="ml-resale-summary">${analysis.flipPotential.flipSummary}</p>
    </div>
  `;

  // ── Animate the score ring + count-up once the markup is mounted ──
  const ringEl = document.getElementById('ml-score-ring-fill');
  const numEl = document.getElementById('ml-score-num-val');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    if (ringEl) ringEl.style.strokeDashoffset = ringTarget.toFixed(2);
    if (numEl) numEl.textContent = String(buyScore);
  } else {
    // Double rAF: let the initial full-offset state paint, then transition to target
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ringEl) ringEl.style.strokeDashoffset = ringTarget.toFixed(2);
      });
    });

    if (numEl) {
      const start = performance.now();
      const duration = 1100;
      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        const eased = 1 - Math.pow(1 - t, 3);
        numEl.textContent = String(Math.round(eased * buyScore));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  document.getElementById('ml-copy-questions-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
      btn.innerText = '✓ Questions copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerText = '📋 Copy All Questions';
        btn.classList.remove('copied');
      }, 2500);
    } catch {
      // fallback
    }
  });

  document.getElementById('ml-copy-inpage-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(analysis.negotiation.counterOfferMessage);
      btn.innerText = '✓ Copied to Clipboard! Ready to paste';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerText = '💬 Copy Message for Messenger';
        btn.classList.remove('copied');
      }, 2500);
    } catch {
      // fallback
    }
  });
}

// ─── 6. In-Drawer Customization & Settings View ───────────────────────────────

function renderInpageSettings(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  const isPro = currentUserSub?.isPro ?? false;
  const remaining = currentUserSub?.freeAppraisalsRemaining ?? 5;

  body.innerHTML = `
    <div class="ml-settings-container">
      <div class="ml-settings-header-row">
        <h3 class="ml-settings-title">⚙️ Customization & Preferences</h3>
        <button class="ml-back-btn" id="ml-back-to-appraisal">← Back to Appraisal</button>
      </div>
      <p class="ml-settings-desc">
        Manage membership, floating buttons, visual appearance, and custom keys. Changes save instantly.
      </p>

      <!-- 0. Membership & Billing -->
      <div class="ml-card ml-settings-card">
        <h4 class="ml-setting-group-title">💎 Membership & Billing</h4>
        <div class="ml-setting-row">
          <div class="ml-setting-text">
            <span class="ml-setting-name">${isPro ? 'MarketLens Pro Member' : 'MarketLens Free Tier'}</span>
            <span class="ml-setting-sub">
              ${isPro ? 'Unlimited AI deal appraisals active' : `${remaining} of 5 free appraisals remaining`}
            </span>
          </div>
          ${
            isPro
              ? `<button class="ml-btn-portal" id="ml-settings-portal-btn">Manage Billing ↗</button>`
              : `<button class="ml-btn-upgrade-pill" id="ml-settings-upgrade-btn">Upgrade 💎</button>`
          }
        </div>
      </div>

      <!-- 1. Floating Widgets Toggles -->
      <div class="ml-card ml-settings-card">
        <h4 class="ml-setting-group-title">Floating Smart Buttons</h4>

        <div class="ml-setting-row">
          <div class="ml-setting-text">
            <span class="ml-setting-name">Feed Grid Badges</span>
            <span class="ml-setting-sub">Show '✨ AI Deal' buttons on marketplace grid cards</span>
          </div>
          <label class="ml-switch">
            <input type="checkbox" id="pref-grid-badges" ${currentPrefs.showGridBadges ? 'checked' : ''} />
            <span class="ml-slider"></span>
          </label>
        </div>

        <div class="ml-setting-row">
          <div class="ml-setting-text">
            <span class="ml-setting-name">Listing Page Button</span>
            <span class="ml-setting-sub">Show floating appraisal action button on detail pages</span>
          </div>
          <label class="ml-switch">
            <input type="checkbox" id="pref-detail-btn" ${currentPrefs.showDetailPageButton ? 'checked' : ''} />
            <span class="ml-slider"></span>
          </label>
        </div>

        <div class="ml-setting-row">
          <div class="ml-setting-text">
            <span class="ml-setting-name">Auto-Open on Card Click</span>
            <span class="ml-setting-sub">Navigate to listing page with real AI appraisal on badge click</span>
          </div>
          <label class="ml-switch">
            <input type="checkbox" id="pref-auto-analyze" ${currentPrefs.autoAnalyzeOnCardClick ? 'checked' : ''} />
            <span class="ml-slider"></span>
          </label>
        </div>
      </div>

      <!-- 2. Appearance & Theme -->
      <div class="ml-card ml-settings-card">
        <h4 class="ml-setting-group-title">Theme & Color Palette</h4>

        <div class="ml-setting-col">
          <span class="ml-setting-name">Color Theme</span>
          <div class="ml-theme-selector">
            <button class="ml-theme-btn ${currentPrefs.theme === 'dark' ? 'active' : ''}" data-theme-val="dark">
              🌙 Dark Mode
            </button>
            <button class="ml-theme-btn ${currentPrefs.theme === 'light' ? 'active' : ''}" data-theme-val="light">
              ☀️ Light Mode
            </button>
            <button class="ml-theme-btn ${currentPrefs.theme === 'system' ? 'active' : ''}" data-theme-val="system">
              💻 System
            </button>
          </div>
        </div>

        <div class="ml-setting-col" style="margin-top: 14px;">
          <span class="ml-setting-name">Accent Highlight Color</span>
          <div class="ml-color-swatches">
            ${(Object.keys(ACCENT_PALETTES) as AccentColor[])
              .map(
                (color) => `
                <button
                  class="ml-swatch ${currentPrefs.accentColor === color ? 'active' : ''}"
                  data-color-val="${color}"
                  style="background-color: ${ACCENT_PALETTES[color].primary};"
                  title="${ACCENT_PALETTES[color].name}"
                ></button>
              `
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="ml-save-feedback" id="ml-save-feedback">✓ Preferences saved & active!</div>
    </div>
  `;

  // Attach event listeners for settings
  document.getElementById('ml-back-to-appraisal')?.addEventListener('click', () => {
    activeDrawerTab = 'appraisal';
    if (latestAnalysis) {
      renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo);
    } else {
      openInpageModal();
    }
  });

  document.getElementById('ml-settings-upgrade-btn')?.addEventListener('click', () => {
    renderInpagePaywall();
  });

  document.getElementById('ml-settings-portal-btn')?.addEventListener('click', async () => {
    const portalBtn = document.getElementById('ml-settings-portal-btn') as HTMLButtonElement | null;
    if (portalBtn) portalBtn.innerText = 'Opening Portal…';
    const res = await openStripeCustomerPortal();
    if (portalBtn) portalBtn.innerText = 'Manage Billing ↗';
    if (!res.success) {
      alert(res.error || 'Failed to open customer portal');
    }
  });

  const triggerSave = async (updated: Partial<UserPreferences>) => {
    currentPrefs = await savePreferences(updated);
    applyTheme();
    checkAndInject();

    const fb = document.getElementById('ml-save-feedback');
    if (fb) {
      fb.classList.add('show');
      setTimeout(() => fb.classList.remove('show'), 1800);
    }
  };

  document.getElementById('pref-grid-badges')?.addEventListener('change', (e) => {
    triggerSave({ showGridBadges: (e.target as HTMLInputElement).checked });
  });

  document.getElementById('pref-detail-btn')?.addEventListener('change', (e) => {
    triggerSave({ showDetailPageButton: (e.target as HTMLInputElement).checked });
  });

  document.getElementById('pref-auto-analyze')?.addEventListener('change', (e) => {
    triggerSave({ autoAnalyzeOnCardClick: (e.target as HTMLInputElement).checked });
  });

  document.querySelectorAll('.ml-theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-theme-val') as ThemeMode;
      if (val) {
        document.querySelectorAll('.ml-theme-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        triggerSave({ theme: val });
      }
    });
  });

  document.querySelectorAll('.ml-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const val = swatch.getAttribute('data-color-val') as AccentColor;
      if (val) {
        document.querySelectorAll('.ml-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        triggerSave({ accentColor: val });
      }
    });
  });
}

// ─── 7. Premium Styles Injection ──────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('marketlens-styles')) return;

  const style = document.createElement('style');
  style.id = 'marketlens-styles';
  style.textContent = `
    :root {
      --ml-accent: #0866FF;
      --ml-accent-hover: #1877F2;
      --ml-accent-soft: rgba(8, 102, 255, 0.15);
    }

    /* ── Reset & Isolation ── */
    #${MODAL_ID}, #${MODAL_ID} * {
      box-sizing: border-box;
    }

    /* ── Design Tokens (scoped to the drawer root so nothing leaks) ── */
    #${MODAL_ID} {
      --ml-bg: #0A0D14;
      --ml-card: rgba(255, 255, 255, 0.045);
      --ml-card-hover: rgba(255, 255, 255, 0.07);
      --ml-border: rgba(255, 255, 255, 0.08);
      --ml-border-strong: rgba(255, 255, 255, 0.14);
      --ml-text: #F4F6FB;
      --ml-text-2: #A6AFC3;
      --ml-text-3: #66708A;
      --ml-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
      --ml-pod-bg: rgba(255, 255, 255, 0.035);
      --ml-stage-bg: rgba(0, 0, 0, 0.25);

      --ml-green: #34D399;
      --ml-green-strong: #10B981;
      --ml-green-soft: rgba(52, 211, 153, 0.14);
      --ml-amber: #FBBF24;
      --ml-amber-strong: #F59E0B;
      --ml-amber-soft: rgba(251, 191, 36, 0.14);
      --ml-red: #F87171;
      --ml-red-strong: #EF4444;
      --ml-red-soft: rgba(248, 113, 113, 0.14);
      --ml-violet: #8B5CF6;

      --ml-green-text: #34D399;
      --ml-amber-text: #FBBF24;
      --ml-red-text: #F87171;
      --ml-critical-text: #FECACA;
      --ml-warning-text: #FDE68A;
      --ml-info-text: #C7D5FF;
      --ml-clear-text: #A7F3D0;

      --ml-radius-lg: 18px;
      --ml-radius-md: 13px;
      --ml-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
      --ml-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    #${MODAL_ID}[data-theme="light"] {
      --ml-bg: #EEF1F7;
      --ml-card: #FFFFFF;
      --ml-card-hover: #F7F9FD;
      --ml-border: rgba(15, 23, 42, 0.08);
      --ml-border-strong: rgba(15, 23, 42, 0.14);
      --ml-text: #0F172A;
      --ml-text-2: #475569;
      --ml-text-3: #94A3B8;
      --ml-shadow: 0 4px 18px rgba(15, 23, 42, 0.07);
      --ml-pod-bg: #F8FAFD;
      --ml-stage-bg: #F1F5FB;

      --ml-green-text: #10B981;
      --ml-amber-text: #F59E0B;
      --ml-red-text: #EF4444;
      --ml-critical-text: #991B1B;
      --ml-warning-text: #92400E;
      --ml-info-text: #1E40AF;
      --ml-clear-text: #065F46;
    }

    /* ── Keyframes ── */
    @keyframes ml-fade-up {
      from { opacity: 0; transform: translateY(16px) scale(0.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ml-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes ml-pop-in {
      0% { opacity: 0; transform: scale(0.82); }
      70% { transform: scale(1.04); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes ml-pin-settle {
      0% { opacity: 0; transform: translateX(-50%) scale(0.4); }
      60% { transform: translateX(-50%) scale(1.25); }
      100% { opacity: 1; transform: translateX(-50%) scale(1); }
    }
    @keyframes ml-check-pop {
      0% { transform: scale(0); }
      70% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
    @keyframes ml-orb-pulse {
      0%, 100% { transform: scale(1); opacity: 0.85; filter: blur(18px); }
      50% { transform: scale(1.22); opacity: 1; filter: blur(24px); }
    }
    @keyframes ml-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ml-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes ml-drawer-in {
      from { opacity: 0; transform: translateY(26px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Floating Smart Grid Badge ── */
    .ml-card-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 999;
      background: linear-gradient(135deg, var(--ml-accent) 0%, var(--ml-accent-hover) 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 99px;
      padding: 6px 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: -0.01em;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.22);
      transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, filter 0.2s ease;
      backdrop-filter: blur(8px);
      user-select: none;
      pointer-events: auto;
    }
    .ml-card-badge:hover {
      transform: translateY(-2px) scale(1.05);
      filter: brightness(1.08);
      box-shadow: 0 8px 20px var(--ml-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }
    .ml-card-badge:active { transform: scale(0.96); }
    .ml-badge-sparkle { font-size: 12px; }

    /* ── Floating Detail Page Button ── */
    #${BTN_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483640;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: linear-gradient(135deg, var(--ml-accent) 0%, var(--ml-accent-hover) 100%);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 99px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.22);
      transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, filter 0.2s ease;
      user-select: none;
    }
    #${BTN_ID}:hover {
      transform: translateY(-2px) scale(1.03);
      filter: brightness(1.08);
      box-shadow: 0 8px 24px var(--ml-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }
    #${BTN_ID}:active { transform: scale(0.97); }
    .ml-btn-sparkle { font-size: 15px; }

    /* ── Overlay & Drawer Shell ── */
    #${MODAL_ID} {
      display: none;
    }

    #${MODAL_ID} .ml-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(4, 6, 12, 0.62);
      backdrop-filter: blur(6px);
      z-index: 2147483645;
      display: flex;
      justify-content: flex-end;
      animation: ml-fade-in 0.3s ease both;
    }

    #${MODAL_ID} .ml-drawer {
      width: 440px;
      height: 100%;
      color: var(--ml-text);
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(120% 60% at 100% 0%, rgba(139, 92, 246, 0.1) 0%, transparent 55%),
        radial-gradient(120% 55% at 0% 0%, color-mix(in srgb, var(--ml-accent) 14%, transparent) 0%, transparent 50%),
        var(--ml-bg);
      box-shadow: -12px 0 44px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
      animation: ml-drawer-in 0.5s var(--ml-ease-out) both;
      overflow: hidden;
    }
    #${MODAL_ID}[data-theme="light"] .ml-drawer {
      background:
        radial-gradient(120% 60% at 100% 0%, rgba(139, 92, 246, 0.07) 0%, transparent 55%),
        radial-gradient(120% 55% at 0% 0%, color-mix(in srgb, var(--ml-accent) 10%, transparent) 0%, transparent 50%),
        var(--ml-bg);
      box-shadow: -12px 0 44px rgba(15, 23, 42, 0.12);
    }

    /* ── Drawer Header ── */
    #${MODAL_ID} .ml-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 18px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--ml-border);
      backdrop-filter: blur(14px);
      flex-shrink: 0;
    }
    #${MODAL_ID}[data-theme="light"] .ml-drawer-header {
      background: rgba(255, 255, 255, 0.65);
    }
    #${MODAL_ID} .ml-header-brand {
      display: flex;
      align-items: center;
      gap: 11px;
    }
    #${MODAL_ID} .ml-brand-badge {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--ml-accent) 0%, #8B5CF6 100%);
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      box-shadow: 0 4px 14px var(--ml-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      animation: ml-float 4.5s ease-in-out infinite;
    }
    #${MODAL_ID} .ml-brand-text-col { display: flex; flex-direction: column; gap: 1px; }
    #${MODAL_ID} .ml-brand-name {
      font-size: 14.5px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-brand-model {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-header-actions { display: flex; align-items: center; gap: 8px; }
    #${MODAL_ID} .ml-action-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--ml-text-2);
      border-radius: 10px;
      width: 34px;
      height: 34px;
      cursor: pointer;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.18s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-action-icon-btn:hover,
    #${MODAL_ID} .ml-action-icon-btn.active {
      background: var(--ml-card-hover);
      border-color: var(--ml-border);
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-action-icon-btn:active { transform: scale(0.92); }

    /* ── Content Stream ── */
    #${MODAL_ID} .ml-drawer-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: rgba(128, 138, 160, 0.35) transparent;
    }
    #${MODAL_ID} .ml-drawer-body > * {
      flex-shrink: 0;
      min-width: 0;
    }
    #${MODAL_ID} .ml-drawer-body::-webkit-scrollbar { width: 5px; }
    #${MODAL_ID} .ml-drawer-body::-webkit-scrollbar-track { background: transparent; }
    #${MODAL_ID} .ml-drawer-body::-webkit-scrollbar-thumb {
      background: rgba(128, 138, 160, 0.35);
      border-radius: 99px;
    }

    /* ── Cards Common & Staggered Entrance ── */
    #${MODAL_ID} .ml-card {
      background: var(--ml-card);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-radius-lg);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      backdrop-filter: blur(12px);
      flex-shrink: 0;
      min-height: fit-content;
      width: 100%;
    }
    #${MODAL_ID}[data-theme="light"] .ml-card {
      box-shadow: var(--ml-shadow);
      backdrop-filter: none;
    }
    #${MODAL_ID} .ml-stagger {
      opacity: 0;
      animation: ml-fade-up 0.55s var(--ml-ease-out) forwards;
      animation-delay: calc(var(--i, 0) * 75ms);
    }

    /* Card Header Rows */
    #${MODAL_ID} .ml-card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #${MODAL_ID} .ml-card-title-group {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    #${MODAL_ID} .ml-card-icon {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
      background: var(--ml-accent-soft);
    }
    #${MODAL_ID} .ml-card-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ml-text);
      margin: 0;
    }
    #${MODAL_ID} .ml-card-subtitle {
      font-size: 10.5px;
      font-weight: 500;
      color: var(--ml-text-3);
      margin: 1px 0 0;
    }

    /* 1. Verdict Hero — Buy Score */
    #${MODAL_ID} .ml-verdict-hero {
      overflow: hidden;
      flex-shrink: 0;
      min-height: fit-content;
      width: 100%;
    }
    #${MODAL_ID} .ml-verdict-hero::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0.55;
      background: radial-gradient(90% 120% at 12% 0%, var(--ml-hero-glow, var(--ml-accent-soft)) 0%, transparent 60%);
    }
    #${MODAL_ID} .ml-verdict-hero-top {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
      min-height: 96px;
      flex-shrink: 0;
    }
    #${MODAL_ID} .ml-score-ring {
      position: relative;
      width: 96px;
      height: 96px;
      min-width: 96px;
      min-height: 96px;
      flex-shrink: 0;
      animation: ml-pop-in 0.6s var(--ml-ease-spring) 0.1s both;
    }
    #${MODAL_ID} .ml-score-ring svg {
      width: 96px;
      height: 96px;
      transform: rotate(-90deg);
      display: block;
    }
    #${MODAL_ID} .ml-score-ring-track {
      fill: none;
      stroke: currentColor;
      stroke-width: 8;
      opacity: 0.16;
    }
    #${MODAL_ID} .ml-score-ring-fill {
      fill: none;
      stroke: currentColor;
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 1.1s var(--ml-ease-out);
      filter: drop-shadow(0 0 6px currentColor);
    }
    #${MODAL_ID} .ml-score-ring-center {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    #${MODAL_ID} .ml-score-ring-center .ml-score-num {
      font-size: 27px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-score-caption {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--ml-text-3);
      margin-top: 3px;
    }
    #${MODAL_ID} .ml-verdict-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #${MODAL_ID} .ml-verdict-pill {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 7px;
      animation: ml-pop-in 0.45s var(--ml-ease-spring) 0.25s both;
    }
    #${MODAL_ID} .ml-verdict-pill.v-buy_now,
    #${MODAL_ID} .ml-verdict-pill.v-good_buy { background: var(--ml-green-soft); color: var(--ml-green-text); }
    #${MODAL_ID} .ml-verdict-pill.v-negotiate,
    #${MODAL_ID} .ml-verdict-pill.v-caution { background: var(--ml-amber-soft); color: var(--ml-amber-text); }
    #${MODAL_ID} .ml-verdict-pill.v-walk_away { background: var(--ml-red-soft); color: var(--ml-red-text); }
    #${MODAL_ID} .ml-verdict-pill.v-unknown { background: var(--ml-accent-soft); color: var(--ml-accent); }
    #${MODAL_ID} .ml-verdict-label {
      display: block;
      font-size: 16.5px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: var(--ml-text);
      margin: 0 0 4px;
    }
    #${MODAL_ID} .ml-verdict-product {
      display: -webkit-box;
      font-size: 11.5px;
      font-weight: 500;
      color: var(--ml-text-2);
      line-height: 1.35;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    #${MODAL_ID} .ml-verdict-summary {
      display: block;
      position: relative;
      margin: 1px 0 0;
      padding-top: 12px;
      border-top: 1px solid var(--ml-border);
      font-size: 12px;
      line-height: 1.55;
      color: var(--ml-text-2);
    }

    /* 2. Price Intelligence — Market Chip, Gauge & Pods */
    #${MODAL_ID} .ml-market-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 10.5px;
      font-weight: 750;
      white-space: nowrap;
    }
    #${MODAL_ID} .ml-market-chip.ml-chip-under { background: var(--ml-green-soft); color: var(--ml-green-text); }
    #${MODAL_ID} .ml-market-chip.ml-chip-over { background: var(--ml-red-soft); color: var(--ml-red-text); }
    #${MODAL_ID} .ml-market-chip.ml-chip-fair { background: var(--ml-amber-soft); color: var(--ml-amber-text); }
    #${MODAL_ID} .ml-price-gauge-wrap {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 2px 0;
    }
    #${MODAL_ID} .ml-gauge-track {
      position: relative;
      height: 10px;
      border-radius: 99px;
      display: flex;
      overflow: visible;
    }
    #${MODAL_ID} .ml-gauge-segment { height: 100%; }
    #${MODAL_ID} .ml-gauge-segment.ml-seg-great {
      width: 34%;
      border-radius: 99px 0 0 99px;
      background: linear-gradient(90deg, #059669, var(--ml-green));
    }
    #${MODAL_ID} .ml-gauge-segment.ml-seg-fair {
      width: 38%;
      background: linear-gradient(90deg, var(--ml-amber-strong), var(--ml-amber));
    }
    #${MODAL_ID} .ml-gauge-segment.ml-seg-high {
      width: 28%;
      border-radius: 0 99px 99px 0;
      background: linear-gradient(90deg, var(--ml-red-strong), var(--ml-red));
    }
    #${MODAL_ID} .ml-gauge-pin {
      position: absolute;
      top: 50%;
      width: 18px;
      height: 18px;
      margin-top: -9px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 3.5px solid var(--ml-pin-color, var(--ml-accent));
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
      transform: translateX(-50%);
      animation: ml-pin-settle 0.7s var(--ml-ease-spring) 0.5s both;
      transition: left 0.9s var(--ml-ease-out);
      z-index: 2;
    }
    #${MODAL_ID} .ml-gauge-labels {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 650;
      letter-spacing: 0.02em;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-price-pods {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    #${MODAL_ID} .ml-price-pod {
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-radius-md);
      padding: 10px 9px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: transform 0.18s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-price-pod:hover { transform: translateY(-2px); }
    #${MODAL_ID} .ml-price-pod.ml-pod-highlight {
      border-color: var(--ml-accent);
      background: var(--ml-accent-soft);
    }
    #${MODAL_ID} .ml-pod-label {
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-pod-value {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-pod-sub {
      font-size: 9.5px;
      color: var(--ml-text-3);
      font-variant-numeric: tabular-nums;
    }

    /* 3. Safety Check — Red Flags */
    #${MODAL_ID} .ml-flag-list { display: flex; flex-direction: column; gap: 7px; }
    #${MODAL_ID} .ml-flag-row {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 9px 11px;
      border-radius: var(--ml-radius-md);
      font-size: 11.5px;
      line-height: 1.45;
      animation: ml-fade-up 0.4s var(--ml-ease-out) both;
      animation-delay: calc(var(--i, 0) * 60ms);
    }
    #${MODAL_ID} .ml-flag-row .ml-flag-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      margin-top: 1px;
    }
    #${MODAL_ID} .ml-flag-row.sev-critical { background: var(--ml-red-soft); color: var(--ml-critical-text); }
    #${MODAL_ID} .ml-flag-row.sev-critical .ml-flag-icon { background: rgba(239, 68, 68, 0.22); }
    #${MODAL_ID} .ml-flag-row.sev-warning { background: var(--ml-amber-soft); color: var(--ml-warning-text); }
    #${MODAL_ID} .ml-flag-row.sev-warning .ml-flag-icon { background: rgba(245, 158, 11, 0.22); }
    #${MODAL_ID} .ml-flag-row.sev-info { background: var(--ml-accent-soft); color: var(--ml-info-text); }
    #${MODAL_ID} .ml-flag-row.sev-info .ml-flag-icon { background: color-mix(in srgb, var(--ml-accent) 20%, transparent); }
    #${MODAL_ID} .ml-all-clear {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 13px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-green-soft);
      font-size: 12px;
      font-weight: 600;
      color: var(--ml-clear-text);
    }
    #${MODAL_ID} .ml-check-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--ml-green-strong);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
      animation: ml-check-pop 0.5s var(--ml-ease-spring) 0.3s both;
    }

    /* 4. Condition Audit */
    #${MODAL_ID} .ml-grade-pill {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 99px;
    }
    #${MODAL_ID} .ml-grade-pill.g-mint { background: var(--ml-green-soft); color: var(--ml-green-text); }
    #${MODAL_ID} .ml-grade-pill.g-good { background: var(--ml-accent-soft); color: var(--ml-accent); }
    #${MODAL_ID} .ml-grade-pill.g-fair { background: var(--ml-amber-soft); color: var(--ml-amber-text); }
    #${MODAL_ID} .ml-grade-pill.g-poor { background: var(--ml-red-soft); color: var(--ml-red-text); }
    #${MODAL_ID} .ml-product-strip {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #${MODAL_ID} .ml-product-thumb-wrap {
      position: relative;
      width: 58px;
      height: 58px;
      flex-shrink: 0;
      border-radius: var(--ml-radius-md);
      overflow: hidden;
      border: 1px solid var(--ml-border-strong);
    }
    #${MODAL_ID} .ml-product-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #${MODAL_ID} .ml-vision-badge {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      padding: 2px 0;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-align: center;
      color: #FFFFFF;
      background: linear-gradient(90deg, rgba(16, 185, 129, 0.92), rgba(5, 150, 105, 0.92));
    }
    #${MODAL_ID} .ml-product-strip-info { flex: 1; min-width: 0; }
    #${MODAL_ID} .ml-chip-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 5px;
    }
    #${MODAL_ID} .ml-category-tag {
      font-size: 9.5px;
      font-weight: 750;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 99px;
      background: var(--ml-accent-soft);
      color: var(--ml-accent);
    }
    #${MODAL_ID} .ml-brand-model {
      font-size: 11px;
      color: var(--ml-text-3);
      display: block;
    }
    #${MODAL_ID} .ml-auth-row { display: flex; }
    #${MODAL_ID} .ml-auth-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 650;
      padding: 5px 10px;
      border-radius: 99px;
    }
    #${MODAL_ID} .ml-auth-tag.ml-auth-good { background: var(--ml-green-soft); color: var(--ml-green-text); }
    #${MODAL_ID} .ml-auth-tag.ml-auth-warn { background: var(--ml-amber-soft); color: var(--ml-amber-text); }
    #${MODAL_ID} .ml-condition-report {
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--ml-text-2);
      margin: 0;
    }
    #${MODAL_ID} .ml-chips-label {
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ml-text-3);
      margin: 0;
    }
    #${MODAL_ID} .ml-chip-cloud { display: flex; flex-wrap: wrap; gap: 6px; }
    #${MODAL_ID} .ml-flaw-chip {
      font-size: 10.5px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 99px;
      line-height: 1.3;
      background: var(--ml-amber-soft);
      color: var(--ml-warning-text);
      animation: ml-pop-in 0.35s var(--ml-ease-spring) both;
      animation-delay: calc(var(--i, 0) * 50ms);
    }
    #${MODAL_ID} .ml-accessory-chip {
      font-size: 10.5px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 99px;
      line-height: 1.3;
      background: var(--ml-green-soft);
      color: var(--ml-clear-text);
      animation: ml-pop-in 0.35s var(--ml-ease-spring) both;
      animation-delay: calc(var(--i, 0) * 50ms);
    }
    #${MODAL_ID} .ml-clean-notice {
      font-size: 11.5px;
      font-weight: 600;
      padding: 10px 12px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-green-soft);
      color: var(--ml-clear-text);
    }

    /* 5. Ask the Seller — Questions */
    #${MODAL_ID} .ml-question-list { display: flex; flex-direction: column; gap: 7px; }
    #${MODAL_ID} .ml-question-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 9px 11px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--ml-text-2);
      animation: ml-fade-up 0.4s var(--ml-ease-out) both;
      animation-delay: calc(var(--i, 0) * 60ms);
    }
    #${MODAL_ID} .ml-q-num {
      flex-shrink: 0;
      width: 19px;
      height: 19px;
      border-radius: 6px;
      background: var(--ml-accent-soft);
      color: var(--ml-accent);
      font-size: 10px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
    }

    /* ── Buttons ── */
    #${MODAL_ID} .ml-btn-primary {
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-radius: var(--ml-radius-md);
      background: linear-gradient(135deg, var(--ml-accent) 0%, var(--ml-accent-hover) 100%);
      color: #FFFFFF;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.01em;
      cursor: pointer;
      box-shadow: 0 4px 16px var(--ml-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.22);
      transition: transform 0.16s var(--ml-ease-out), box-shadow 0.2s ease, filter 0.2s ease;
    }
    #${MODAL_ID} .ml-btn-primary:hover {
      transform: translateY(-1px);
      filter: brightness(1.08);
      box-shadow: 0 7px 22px var(--ml-accent-soft), inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }
    #${MODAL_ID} .ml-btn-primary:active { transform: translateY(0) scale(0.97); }
    #${MODAL_ID} .ml-copy-offer-btn.copied {
      background: linear-gradient(135deg, #10B981, #059669);
    }
    #${MODAL_ID} .ml-btn-ghost {
      width: 100%;
      padding: 10px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-accent-soft);
      border: 1px dashed transparent;
      color: var(--ml-accent);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-btn-ghost:hover { border-color: var(--ml-accent); }
    #${MODAL_ID} .ml-btn-ghost:active { transform: scale(0.98); }
    #${MODAL_ID} .ml-btn-ghost.copied {
      background: var(--ml-green-soft);
      color: var(--ml-green-text);
    }

    /* 6. Negotiation — Chat Stage */
    #${MODAL_ID} .ml-offer-pill {
      font-size: 11px;
      font-weight: 800;
      padding: 5px 11px;
      border-radius: 99px;
      background: var(--ml-green-soft);
      color: var(--ml-green-text);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    #${MODAL_ID} .ml-chat-stage {
      border-radius: var(--ml-radius-md);
      padding: 12px;
      background: var(--ml-stage-bg);
    }
    #${MODAL_ID} .ml-chat-bubble {
      position: relative;
      max-width: 92%;
      margin-left: auto;
      padding: 10px 13px;
      border-radius: 15px 15px 4px 15px;
      background: linear-gradient(135deg, var(--ml-accent) 0%, var(--ml-accent-hover) 100%);
      color: #FFFFFF;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      box-shadow: 0 3px 12px var(--ml-accent-soft);
      animation: ml-fade-up 0.5s var(--ml-ease-out) 0.2s both;
    }
    #${MODAL_ID} .ml-chat-meta {
      text-align: right;
      font-size: 9.5px;
      color: var(--ml-text-3);
      margin-top: 5px;
      font-weight: 600;
    }

    /* 7. Resale & Value Retention */
    #${MODAL_ID} .ml-resale-score-badge {
      display: flex;
      align-items: baseline;
      gap: 3px;
      padding: 5px 11px;
      border-radius: 99px;
      background: var(--ml-accent-soft);
    }
    #${MODAL_ID} .ml-resale-score-badge .ml-score-num {
      font-size: 15px;
      font-weight: 800;
      color: var(--ml-accent);
      font-variant-numeric: tabular-nums;
    }
    #${MODAL_ID} .ml-resale-score-badge .ml-score-max {
      font-size: 9.5px;
      font-weight: 700;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-metric-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    #${MODAL_ID} .ml-metric-box {
      border-radius: var(--ml-radius-md);
      padding: 9px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 3px;
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
    }
    #${MODAL_ID} .ml-metric-label {
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-metric-value {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-metric-value.ml-positive { color: var(--ml-green-text); }
    #${MODAL_ID} .ml-metric-value.ml-negative { color: var(--ml-red-text); }
    #${MODAL_ID} .ml-resale-summary {
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--ml-text-2);
      margin: 0;
    }

    /* ── Settings Panel in Drawer ── */
    #${MODAL_ID} .ml-settings-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    #${MODAL_ID} .ml-settings-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #${MODAL_ID} .ml-settings-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--ml-text);
      margin: 0;
    }
    #${MODAL_ID} .ml-back-btn {
      background: transparent;
      border: none;
      color: var(--ml-accent);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    #${MODAL_ID} .ml-back-btn:hover { text-decoration: underline; }
    #${MODAL_ID} .ml-settings-desc {
      font-size: 11.5px;
      color: var(--ml-text-3);
      margin: 0;
      line-height: 1.4;
    }
    #${MODAL_ID} .ml-settings-card { gap: 14px; }
    #${MODAL_ID} .ml-setting-group-title {
      font-size: 12px;
      font-weight: 750;
      color: var(--ml-text);
      margin: 0;
      border-bottom: 1px solid var(--ml-border);
      padding-bottom: 8px;
    }
    #${MODAL_ID} .ml-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
    }
    #${MODAL_ID} .ml-setting-col {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    #${MODAL_ID} .ml-setting-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    #${MODAL_ID} .ml-setting-name { font-size: 12px; font-weight: 650; color: var(--ml-text); }
    #${MODAL_ID} .ml-setting-sub { font-size: 10.5px; color: var(--ml-text-3); line-height: 1.4; }

    /* iOS Style Switch */
    #${MODAL_ID} .ml-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 23px;
      flex-shrink: 0;
      cursor: pointer;
    }
    #${MODAL_ID} .ml-switch input { opacity: 0; width: 0; height: 0; }
    #${MODAL_ID} .ml-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(255, 255, 255, 0.14);
      transition: background 0.25s var(--ml-ease-out);
      border-radius: 99px;
    }
    #${MODAL_ID}[data-theme="light"] .ml-slider { background-color: rgba(15, 23, 42, 0.16); }
    #${MODAL_ID} .ml-slider:before {
      position: absolute;
      content: "";
      height: 17px;
      width: 17px;
      left: 3px;
      top: 3px;
      background-color: #FFFFFF;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
      transition: transform 0.25s var(--ml-ease-spring);
      border-radius: 50%;
    }
    #${MODAL_ID} .ml-switch input:checked + .ml-slider {
      background: linear-gradient(135deg, var(--ml-accent), var(--ml-accent-hover));
    }
    #${MODAL_ID} .ml-switch input:checked + .ml-slider:before { transform: translateX(17px); }
    #${MODAL_ID} .ml-switch input:focus-visible + .ml-slider {
      box-shadow: 0 0 0 3px var(--ml-accent-soft);
    }

    /* Theme & Swatches */
    #${MODAL_ID} .ml-theme-selector {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 7px;
    }
    #${MODAL_ID} .ml-theme-btn {
      padding: 9px 6px;
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-radius-md);
      color: var(--ml-text-2);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.18s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-theme-btn:hover { transform: translateY(-1px); }
    #${MODAL_ID} .ml-theme-btn.active {
      border-color: var(--ml-accent);
      background: var(--ml-accent-soft);
      color: var(--ml-accent);
      box-shadow: 0 0 0 2px var(--ml-accent-soft);
    }
    #${MODAL_ID} .ml-color-swatches { display: flex; gap: 10px; }
    #${MODAL_ID} .ml-swatch {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      transition: transform 0.2s var(--ml-ease-spring);
    }
    #${MODAL_ID} .ml-swatch:hover { transform: scale(1.12); }
    #${MODAL_ID} .ml-swatch:active { transform: scale(0.95); }
    #${MODAL_ID} .ml-swatch.active {
      box-shadow: 0 0 0 2.5px var(--ml-bg), 0 0 0 5px rgba(128, 138, 160, 0.85);
    }
    #${MODAL_ID} .ml-save-feedback {
      display: none;
      background: var(--ml-green-soft);
      color: var(--ml-green-text);
      padding: 10px;
      border-radius: var(--ml-radius-md);
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }
    #${MODAL_ID} .ml-save-feedback.show {
      display: block;
      animation: ml-fade-up 0.35s var(--ml-ease-out) both;
    }

    /* ── Loading Orb ── */
    #${MODAL_ID} .ml-loading-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 56px 24px;
    }
    #${MODAL_ID} .ml-orb-stage {
      position: relative;
      width: 84px;
      height: 84px;
      margin-bottom: 22px;
    }
    #${MODAL_ID} .ml-orb-glow {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 50%;
      background: radial-gradient(circle, var(--ml-accent) 0%, transparent 70%);
      animation: ml-orb-pulse 2s ease-in-out infinite;
    }
    #${MODAL_ID} .ml-orb-spinner {
      position: absolute;
      top: 8px; left: 8px; right: 8px; bottom: 8px;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: var(--ml-accent);
      border-right-color: var(--ml-accent);
      animation: ml-spin 0.9s linear infinite;
    }
    #${MODAL_ID} .ml-orb-core {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      animation: ml-float 3s ease-in-out infinite;
    }
    #${MODAL_ID} .ml-loading-title {
      font-size: 15px;
      font-weight: 750;
      letter-spacing: -0.01em;
      color: var(--ml-text);
      margin: 0 0 5px;
    }
    #${MODAL_ID} .ml-loading-sub {
      font-size: 11.5px;
      color: var(--ml-text-3);
      margin: 0;
      max-width: 300px;
      line-height: 1.5;
    }

    /* ── Demo Banner & Error Card ── */
    #${MODAL_ID} .ml-demo-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 13px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-amber-soft);
      border: 1px solid color-mix(in srgb, var(--ml-amber) 30%, transparent);
      font-size: 11px;
      font-weight: 650;
      line-height: 1.4;
      color: var(--ml-warning-text);
      animation: ml-fade-up 0.4s var(--ml-ease-out) both;
    }
    #${MODAL_ID} .ml-demo-sparkle { font-size: 16px; }

    #${MODAL_ID} .ml-error-card {
      background: var(--ml-red-soft);
      border: 1px solid color-mix(in srgb, var(--ml-red) 35%, transparent);
      border-radius: var(--ml-radius-lg);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #${MODAL_ID} .ml-error-icon { font-size: 24px; }
    #${MODAL_ID} .ml-error-title { font-size: 14px; font-weight: 800; color: var(--ml-red-text); }
    #${MODAL_ID} .ml-error-msg {
      font-size: 12.5px;
      color: var(--ml-text);
      line-height: 1.45;
      margin: 0;
    }
    #${MODAL_ID} .ml-error-footer {
      font-size: 11.5px;
      color: var(--ml-text-3);
      border-top: 1px solid var(--ml-border);
      padding-top: 8px;
    }

    /* ── Pro Header Pill ── */
    #${MODAL_ID} .ml-pro-header-pill {
      font-size: 11px;
      font-weight: 800;
      padding: 5px 10px;
      border-radius: 99px;
      cursor: pointer;
      font-family: inherit;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-pill-active {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(99, 102, 241, 0.25));
      color: #A78BFA;
      border-color: rgba(167, 139, 250, 0.35);
    }
    #${MODAL_ID} .ml-pill-upgrade {
      background: linear-gradient(135deg, rgba(8, 102, 255, 0.15), rgba(139, 92, 246, 0.15));
      color: var(--ml-accent);
      border-color: var(--ml-accent-soft);
    }
    #${MODAL_ID} .ml-pill-upgrade:hover {
      transform: scale(1.04);
      background: linear-gradient(135deg, var(--ml-accent), #7C3AED);
      color: #FFFFFF;
    }

    /* ── Pro Paywall Card & Plan Selector ── */
    #${MODAL_ID} .ml-inpage-paywall {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
      border: 1px solid var(--ml-border-strong);
    }
    #${MODAL_ID} .ml-paywall-badge {
      display: inline-flex;
      padding: 5px 12px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2));
      color: #A78BFA;
      border: 1px solid rgba(167, 139, 250, 0.35);
    }
    #${MODAL_ID} .ml-paywall-title {
      font-size: 19px;
      font-weight: 850;
      color: var(--ml-text);
      margin: 0;
      line-height: 1.25;
    }
    #${MODAL_ID} .ml-paywall-sub {
      font-size: 12.5px;
      color: var(--ml-text-2);
      margin: 0;
      line-height: 1.5;
      max-width: 360px;
    }
    #${MODAL_ID} .ml-plan-toggle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      width: 100%;
      margin: 4px 0;
    }
    #${MODAL_ID} .ml-plan-box {
      background: var(--ml-pod-bg);
      border: 1.5px solid var(--ml-border);
      border-radius: var(--ml-radius-md);
      padding: 12px 10px;
      cursor: pointer;
      text-align: left;
      font-family: inherit;
      color: var(--ml-text);
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: all 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-plan-box:hover {
      border-color: var(--ml-border-strong);
      transform: translateY(-1px);
    }
    #${MODAL_ID} .ml-plan-box.active {
      border-color: var(--ml-accent);
      background: var(--ml-accent-soft);
      box-shadow: 0 0 0 1px var(--ml-accent);
    }
    #${MODAL_ID} .ml-plan-box-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #${MODAL_ID} .ml-plan-name {
      font-size: 12px;
      font-weight: 750;
    }
    #${MODAL_ID} .ml-plan-save-tag {
      font-size: 10px;
      font-weight: 800;
      background: var(--ml-green-soft);
      color: var(--ml-green-text);
      padding: 2px 6px;
      border-radius: 99px;
    }
    #${MODAL_ID} .ml-plan-flex-tag {
      font-size: 10px;
      font-weight: 750;
      background: rgba(255, 255, 255, 0.08);
      color: var(--ml-text-2);
      padding: 2px 6px;
      border-radius: 99px;
    }
    #${MODAL_ID} .ml-plan-price-row {
      display: flex;
      align-items: baseline;
      gap: 3px;
      margin: 2px 0;
    }
    #${MODAL_ID} .ml-plan-num {
      font-size: 20px;
      font-weight: 850;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-plan-per {
      font-size: 11px;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-plan-billed {
      font-size: 10.5px;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-paywall-checklist {
      display: flex;
      flex-direction: column;
      gap: 7px;
      text-align: left;
      width: 100%;
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-radius-md);
      padding: 12px 14px;
      font-size: 11.5px;
      color: var(--ml-text-2);
      line-height: 1.4;
    }
    #${MODAL_ID} .ml-check-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    #${MODAL_ID} .ml-check-item span {
      color: var(--ml-green);
      font-weight: 800;
    }
    #${MODAL_ID} .ml-check-item strong {
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-btn-stripe {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: var(--ml-radius-md);
      background: linear-gradient(135deg, #6366F1, #8B5CF6);
      color: #FFFFFF;
      font-size: 13.5px;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
      transition: all 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-btn-stripe:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.55);
    }
    #${MODAL_ID} .ml-btn-stripe:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    #${MODAL_ID} .ml-stripe-guarantee {
      font-size: 11px;
      color: var(--ml-text-3);
      margin: -6px 0 0;
    }
    #${MODAL_ID} .ml-paywall-foot {
      display: flex;
      gap: 12px;
      width: 100%;
      justify-content: center;
      margin-top: 4px;
    }
    #${MODAL_ID} .ml-ghost-btn {
      background: transparent;
      border: none;
      color: var(--ml-text-3);
      font-size: 11.5px;
      font-weight: 650;
      cursor: pointer;
      font-family: inherit;
      transition: color 0.15s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-ghost-btn:hover {
      color: var(--ml-text);
      text-decoration: underline;
    }
    #${MODAL_ID} .ml-checkout-err {
      width: 100%;
      background: var(--ml-red-soft);
      border: 1px solid var(--ml-red);
      color: var(--ml-red-text);
      padding: 8px 12px;
      border-radius: var(--ml-radius-sm);
      font-size: 11.5px;
      font-weight: 650;
    }
    #${MODAL_ID} .ml-awaiting-card {
      width: 100%;
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: var(--ml-radius-md);
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 6px;
    }
    #${MODAL_ID} .ml-awaiting-pulse {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #6366f1;
      box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
      animation: mlPulse 1.6s infinite;
      margin-bottom: 2px;
    }
    @keyframes mlPulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
    }
    #${MODAL_ID} .ml-awaiting-title {
      font-size: 13px;
      font-weight: 750;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-awaiting-sub {
      font-size: 11px;
      color: var(--ml-text-2);
      line-height: 1.35;
    }
    #${MODAL_ID} .ml-pro-success-card {
      width: 100%;
      background: rgba(16, 185, 129, 0.09);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: var(--ml-radius-md);
      padding: 20px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }
    #${MODAL_ID} .ml-pro-success-icon {
      font-size: 36px;
      line-height: 1;
    }
    #${MODAL_ID} .ml-pro-success-title {
      font-size: 15.5px;
      font-weight: 800;
      color: #10b981;
    }
    #${MODAL_ID} .ml-pro-success-sub {
      font-size: 12px;
      color: var(--ml-text);
      line-height: 1.4;
    }

    /* ── Settings Membership & Key Inputs ── */
    #${MODAL_ID} .ml-btn-portal, #${MODAL_ID} .ml-btn-upgrade-pill {
      background: linear-gradient(135deg, #6366F1, #8B5CF6);
      color: #FFFFFF;
      border: none;
      padding: 7px 12px;
      border-radius: 99px;
      font-size: 11.5px;
      font-weight: 750;
      cursor: pointer;
      font-family: inherit;
      flex-shrink: 0;
      transition: transform 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-btn-portal:hover, #${MODAL_ID} .ml-btn-upgrade-pill:hover {
      transform: translateY(-1px);
    }
    #${MODAL_ID} .ml-loss-notice {
      background: var(--ml-red-soft);
      border: 1px solid color-mix(in srgb, var(--ml-red) 30%, transparent);
      color: var(--ml-red-text);
      font-size: 11.5px;
      padding: 9px 12px;
      border-radius: var(--ml-radius-sm);
      margin-top: 10px;
      line-height: 1.45;
      font-weight: 600;
    }

    /* ── No Listing Open — Helpful Guide State ── */
    #${MODAL_ID} .ml-no-listing-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 36px 20px 24px;
      gap: 12px;
      animation: ml-fade-up 0.4s var(--ml-ease-out) both;
    }
    #${MODAL_ID} .ml-no-listing-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 5px 12px;
      border-radius: 99px;
      background: var(--ml-accent-soft);
      color: var(--ml-accent);
      border: 1px solid color-mix(in srgb, var(--ml-accent) 25%, transparent);
    }
    #${MODAL_ID} .ml-no-listing-title {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ml-text);
      margin: 2px 0 0;
    }
    #${MODAL_ID} .ml-no-listing-sub {
      font-size: 12px;
      line-height: 1.5;
      color: var(--ml-text-2);
      margin: 0;
      max-width: 320px;
    }
    #${MODAL_ID} .ml-guide-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
      width: 100%;
      margin: 10px 0 4px;
    }
    #${MODAL_ID} .ml-guide-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border);
      border-radius: var(--ml-radius-md);
      padding: 12px 14px;
      text-align: left;
      transition: border-color 0.2s, transform 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-guide-item:hover {
      border-color: var(--ml-border-strong);
      transform: translateY(-1px);
    }
    #${MODAL_ID} .ml-guide-icon-box {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--ml-accent-soft);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    #${MODAL_ID} .ml-guide-content {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #${MODAL_ID} .ml-guide-step-title {
      font-size: 12.5px;
      font-weight: 750;
      color: var(--ml-text);
    }
    #${MODAL_ID} .ml-guide-step-desc {
      font-size: 11px;
      line-height: 1.4;
      color: var(--ml-text-3);
    }
    #${MODAL_ID} .ml-no-listing-actions {
      width: 100%;
      margin-top: 4px;
    }
    #${MODAL_ID} .ml-btn-secondary {
      width: 100%;
      padding: 11px 16px;
      border-radius: var(--ml-radius-md);
      background: var(--ml-pod-bg);
      border: 1px solid var(--ml-border-strong);
      color: var(--ml-text);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s var(--ml-ease-out);
    }
    #${MODAL_ID} .ml-btn-secondary:hover {
      background: var(--ml-card-hover);
      border-color: var(--ml-accent);
      color: var(--ml-accent);
    }
    #${MODAL_ID} .ml-supported-badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 8px;
    }
    #${MODAL_ID} .ml-supported-tag {
      font-size: 10.5px;
      font-weight: 650;
      padding: 3px 9px;
      border-radius: 99px;
      background: var(--ml-card);
      border: 1px solid var(--ml-border);
      color: var(--ml-text-3);
    }

    /* ── Reduced Motion ── */
    @media (prefers-reduced-motion: reduce) {
      #${MODAL_ID} *, #${MODAL_ID} *::before, #${MODAL_ID} *::after,
      .ml-card-badge, #${BTN_ID} {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}
