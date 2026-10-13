/**
 * MarketLens AI — In-Page Listing Button, Grid Badges & AI Appraisal Overlay
 *
 * Features:
 * 1. Smart floating badges on listing cards in Marketplace feed.
 * 2. Floating action button on individual listing pages.
 * 3. In-page slide-out drawer with the AI deal appraisal.
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
import { buildInpageStyles } from './inpageStyles';
import { icon, type IconName } from './icons';
import { buildPriceScale, esc, money } from '../utils/format';

const BTN_ID = 'marketlens-inpage-btn';
const MODAL_ID = 'marketlens-inpage-modal';

let currentPrefs: UserPreferences = { ...DEFAULT_PREFERENCES };
let currentUserSub: UserSubscription | null = null;
let currentSelectedPlan: ProPlan = 'annual';
let isAutoAnalyzing = false;
let activeDrawerTab: 'appraisal' | 'settings' = 'appraisal';
let latestAnalysis: { analysis: AIProductAnalysis; context: UniversalListingContext; isDemo: boolean } | null = null;
/** Re-runs whatever produced the current error screen (listing page or feed card). */
let retryLastAction: (() => void) | null = null;

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

type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'accent';

const VERDICT_BADGE: Record<BuyVerdict | 'unknown', { text: string; tone: Tone }> = {
  buy_now: { text: 'Buy now', tone: 'positive' },
  good_buy: { text: 'Good buy', tone: 'positive' },
  negotiate: { text: 'Negotiate first', tone: 'warning' },
  caution: { text: 'Caution', tone: 'warning' },
  walk_away: { text: 'Walk away', tone: 'danger' },
  unknown: { text: 'Appraisal', tone: 'info' },
};

const CONDITION_TONE: Record<string, Tone> = {
  mint: 'positive',
  good: 'positive',
  fair: 'warning',
  poor: 'danger',
};

function scoreTone(score: number): Tone {
  if (score >= 70) return 'positive';
  if (score >= 45) return 'warning';
  return 'danger';
}

/** Swap a button's label (and optional icon) without losing its markup structure. */
function setButtonLabel(btn: HTMLElement, label: string, iconName?: IconName): void {
  btn.innerHTML = `${iconName ? icon(iconName) : ''}<span>${esc(label)}</span>`;
}

function sampleListingContext(): UniversalListingContext {
  return {
    url: window.location.href,
    title: DEMO_ANALYSIS.identifiedProduct.name,
    priceRaw: money(DEMO_ANALYSIS.pricing.askingPrice),
    currency: 'USD',
    description: 'Sample listing used to preview a MarketLens analysis.',
    imageUrl: '',
  };
}

function showSampleAnalysis(): void {
  activeDrawerTab = 'appraisal';
  renderInpageResults(DEMO_ANALYSIS, sampleListingContext(), true);
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
  btn.innerHTML = `${icon('sparkles', 18)}<span>Analyze deal</span>`;
  btn.title = 'Analyze this listing with MarketLens AI';
  btn.setAttribute('aria-label', 'Analyze this listing with MarketLens AI');

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
    badge.innerHTML = `${icon('sparkles', 13)}<span>Analyze</span>`;
    badge.title = 'Analyze this listing with MarketLens AI';

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (currentPrefs.autoAnalyzeOnCardClick) {
        try {
          localStorage.setItem('marketlens_auto_analyze', Date.now().toString());
        } catch {}

        badge.innerHTML = `<span>Opening…</span>`;

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
  retryLastAction = () => openInpageModalForCard(card);
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
    createModalBase(false);
    renderNoListingGuide();
    return;
  }

  // 2. If we already appraised this exact listing page, show results immediately without re-fetching
  if (latestAnalysis && latestAnalysis.context.url === window.location.href) {
    createModalBase(false);
    renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo);
    return;
  }

  // 3. We ARE on an individual listing: show the loading state and execute appraisal
  retryLastAction = () => openInpageModal();
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
  const isMarketplaceSite = url.includes('facebook.com') || url.includes('ebay.') || url.includes('craigslist.');

  body.innerHTML = `
    <div class="ml-empty ml-no-listing-container ml-stagger">
      <div class="ml-empty-icon">${icon('search', 22)}</div>
      <h2 class="ml-empty-title">Open a listing to analyze it</h2>
      <p class="ml-empty-sub">
        ${
          isMarketplaceSite
            ? 'You’re browsing a feed or search results. Open an individual item and MarketLens will analyze it automatically.'
            : 'MarketLens analyzes items on Facebook Marketplace, eBay and Craigslist. Open any item listing to get a price check and risk review.'
        }
      </p>

      <ol class="ml-steps">
        <li class="ml-step">
          <span class="ml-step-num">1</span>
          <div>
            <div class="ml-step-title">Open an item listing</div>
            <div class="ml-step-desc">Select any item to view its full details and photos.</div>
          </div>
        </li>
        <li class="ml-step">
          <span class="ml-step-num">2</span>
          <div>
            <div class="ml-step-title">Or use the Analyze badge</div>
            <div class="ml-step-desc">On Facebook Marketplace, each item card in the feed has an Analyze badge.</div>
          </div>
        </li>
        <li class="ml-step">
          <span class="ml-step-num">3</span>
          <div>
            <div class="ml-step-title">Review the verdict</div>
            <div class="ml-step-desc">See the fair price, risk signals, photo condition and a ready-to-send offer.</div>
          </div>
        </li>
      </ol>

      <div class="ml-empty-actions">
        <button class="ml-btn ml-btn-secondary is-block" id="ml-preview-demo-trigger">View a sample analysis</button>
      </div>
      <p class="ml-supported">Works on Facebook Marketplace, eBay and Craigslist</p>
    </div>
  `;

  document.getElementById('ml-preview-demo-trigger')?.addEventListener('click', showSampleAnalysis);
}

function closeDrawer(): void {
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.style.display = 'none';
}

function onDrawerKeyDown(e: KeyboardEvent): void {
  const modal = document.getElementById(MODAL_ID);
  if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
    closeDrawer();
  }
}

function loadingMarkup(): string {
  return `
    <div class="ml-loading" aria-live="polite">
      <div class="ml-loading-status">
        <span class="ml-spinner" role="status" aria-label="Loading"></span>
        <div>
          <p class="ml-loading-title">Analyzing this listing…</p>
          <p class="ml-loading-sub">Checking market prices, photos and risk signals.</p>
        </div>
      </div>
    </div>
    <div class="ml-section">
      <span class="ml-skel" style="width:55%"></span>
      <div class="ml-skel-row" style="margin-top:16px">
        <span class="ml-skel ml-skel-circle"></span>
        <div class="ml-skel-col">
          <span class="ml-skel" style="width:40%"></span>
          <span class="ml-skel" style="width:90%;height:16px"></span>
          <span class="ml-skel" style="width:70%;height:16px"></span>
        </div>
      </div>
      <span class="ml-skel" style="margin-top:18px;height:52px;border-radius:8px"></span>
    </div>
    <div class="ml-section">
      <span class="ml-skel" style="width:35%"></span>
      <span class="ml-skel" style="margin-top:22px;height:8px"></span>
      <span class="ml-skel" style="margin-top:18px;width:100%"></span>
      <span class="ml-skel" style="width:100%"></span>
    </div>
    <div class="ml-section">
      <span class="ml-skel" style="width:30%"></span>
      <span class="ml-skel" style="margin-top:16px;height:38px;border-radius:8px"></span>
    </div>
  `;
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
      <aside class="ml-drawer" role="dialog" aria-modal="true" aria-label="MarketLens AI">
        <header class="ml-drawer-header">
          <div class="ml-header-brand">
            <div class="ml-brand-mark">${icon('logo', 16)}</div>
            <div class="ml-brand-name">MarketLens <span>AI</span></div>
          </div>
          <div class="ml-header-actions">
            <button class="ml-plan-pill" id="ml-header-pro-pill"></button>
            <button class="ml-icon-btn ${activeDrawerTab === 'settings' ? 'active' : ''}" id="ml-modal-settings" title="Settings" aria-label="Settings">${icon('sliders', 17)}</button>
            <button class="ml-icon-btn" id="ml-modal-close" title="Close" aria-label="Close">${icon('x', 18)}</button>
          </div>
        </header>

        <div class="ml-drawer-body" id="ml-drawer-body">
          ${showLoading ? loadingMarkup() : ''}
        </div>
      </aside>
    </div>
  `;

  updateDrawerProPill();

  document.getElementById('ml-modal-close')?.addEventListener('click', closeDrawer);

  // Close when clicking outside the drawer onto the backdrop
  const overlay = modal.querySelector('.ml-overlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer();
  });

  // Close when pressing Escape (same function reference, so it is only ever registered once)
  window.removeEventListener('keydown', onDrawerKeyDown);
  window.addEventListener('keydown', onDrawerKeyDown);

  document.getElementById('ml-modal-settings')?.addEventListener('click', () => {
    if (activeDrawerTab === 'settings') {
      activeDrawerTab = 'appraisal';
      if (latestAnalysis) {
        renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo);
      } else {
        openInpageModal();
      }
    } else {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    }
  });
}

function setSettingsButtonActive(active: boolean): void {
  document.getElementById('ml-modal-settings')?.classList.toggle('active', active);
}

function updateDrawerProPill(): void {
  const pill = document.getElementById('ml-header-pro-pill') as HTMLButtonElement | null;
  if (!pill) return;

  if (currentUserSub?.isPro) {
    pill.className = 'ml-plan-pill is-pro';
    pill.innerHTML = `${icon('gem', 13)}<span>Pro</span>`;
    pill.title = 'MarketLens Pro — manage your plan';
    pill.onclick = () => {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    };
  } else {
    const remaining = currentUserSub?.freeAppraisalsRemaining ?? 1;
    pill.className = 'ml-plan-pill';
    pill.innerHTML =
      remaining > 0
        ? `<span>${remaining} free left</span>`
        : `${icon('gem', 13)}<span class="ml-pill-upgrade">Upgrade</span>`;
    pill.title = 'Upgrade to MarketLens Pro';
    pill.onclick = () => {
      renderInpagePaywall();
    };
  }
}

function checkoutLabel(): string {
  return `Continue with ${currentSelectedPlan === 'annual' ? 'annual — $69/year' : 'monthly — $9.99/month'}`;
}

function renderInpagePaywall(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  activeDrawerTab = 'appraisal';
  setSettingsButtonActive(false);

  const remaining = currentUserSub?.freeAppraisalsRemaining ?? 0;
  const subCopy =
    remaining > 0
      ? `You have ${remaining} free ${remaining === 1 ? 'analysis' : 'analyses'} left. Pro removes the limit so you can check every listing before you buy.`
      : 'You’ve used your free analysis. Upgrade to keep checking prices, photos and risk signals on every listing.';

  body.innerHTML = `
    <div class="ml-section ml-stagger">
      <span class="ml-eyebrow">${icon('gem')}MarketLens Pro</span>
      <h2 class="ml-paywall-title">Unlimited deal analysis</h2>
      <p class="ml-paywall-sub">${subCopy}</p>

      <div class="ml-plans" role="radiogroup" aria-label="Billing period">
        <button class="ml-plan ${currentSelectedPlan === 'annual' ? 'active' : ''}" id="ml-plan-annual" role="radio" aria-checked="${currentSelectedPlan === 'annual'}">
          <span class="ml-plan-save">Save 42%</span>
          <span class="ml-plan-top"><span class="ml-plan-name">Annual</span><span class="ml-plan-radio"></span></span>
          <span class="ml-plan-price">$5.75<small> /mo</small></span>
          <span class="ml-plan-note">$69 billed yearly</span>
        </button>
        <button class="ml-plan ${currentSelectedPlan === 'monthly' ? 'active' : ''}" id="ml-plan-monthly" role="radio" aria-checked="${currentSelectedPlan === 'monthly'}">
          <span class="ml-plan-top"><span class="ml-plan-name">Monthly</span><span class="ml-plan-radio"></span></span>
          <span class="ml-plan-price">$9.99<small> /mo</small></span>
          <span class="ml-plan-note">Cancel anytime</span>
        </button>
      </div>

      <ul class="ml-features">
        <li>${icon('check')}<div><strong>Unlimited analyses</strong> on Facebook Marketplace, eBay and Craigslist</div></li>
        <li>${icon('check')}<div><strong>Photo inspection</strong> for wear, damage and stock images</div></li>
        <li>${icon('check')}<div><strong>Live market pricing</strong> from recent secondhand sales</div></li>
        <li>${icon('check')}<div><strong>Ready-to-send offers</strong> and questions for the seller</div></li>
      </ul>

      <div id="ml-paywall-action-slot">
        <div id="ml-checkout-err-container" style="display:none;"></div>
        <button class="ml-btn ml-btn-primary is-block" id="ml-inpage-checkout-btn">${esc(checkoutLabel())}</button>
      </div>

      <p class="ml-fineprint">${icon('lock')}Secure checkout with Stripe · Cancel anytime</p>
    </div>

    <div class="ml-center">
      <button class="ml-btn ml-btn-link" id="ml-inpage-demo-preview">View a sample analysis</button>
    </div>
  `;

  document.getElementById('ml-plan-annual')?.addEventListener('click', () => {
    currentSelectedPlan = 'annual';
    renderInpagePaywall();
  });

  document.getElementById('ml-plan-monthly')?.addEventListener('click', () => {
    currentSelectedPlan = 'monthly';
    renderInpagePaywall();
  });

  document.getElementById('ml-inpage-checkout-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ml-inpage-checkout-btn') as HTMLButtonElement | null;
    const errContainer = document.getElementById('ml-checkout-err-container');
    const actionSlot = document.getElementById('ml-paywall-action-slot');

    if (btn) {
      btn.textContent = 'Opening secure checkout…';
      btn.disabled = true;
    }
    if (errContainer) errContainer.style.display = 'none';

    const res = await createStripeCheckoutSession(currentSelectedPlan);
    if (res.success && res.url) {
      window.open(res.url, '_blank');

      if (actionSlot) {
        actionSlot.innerHTML = `
          <div class="ml-awaiting">
            <div class="ml-awaiting-head">
              <span class="ml-spinner"></span>
              <div>
                <div class="ml-awaiting-title">Waiting for payment</div>
                <div class="ml-awaiting-sub">Finish checkout in the Stripe tab. Pro activates here automatically once payment is confirmed.</div>
              </div>
            </div>
            <button class="ml-btn ml-btn-secondary is-block" id="ml-confirm-payment-btn">I’ve completed payment</button>
          </div>
        `;

        let isPolling = true;

        const checkPaymentCompletion = async () => {
          const confirmBtn = document.getElementById('ml-confirm-payment-btn') as HTMLButtonElement | null;
          if (confirmBtn) {
            confirmBtn.textContent = 'Checking with Stripe…';
            confirmBtn.disabled = true;
          }

          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro) {
            isPolling = false;
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          } else if (confirmBtn) {
            confirmBtn.textContent = 'Payment not confirmed yet — check again';
            confirmBtn.disabled = false;
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
          if (synced.isPro && isPolling) {
            isPolling = false;
            clearInterval(interval);
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          }
        }, 2500);

        // Also check immediately when user switches back to this tab
        const onWindowFocus = async () => {
          if (!isPolling) {
            window.removeEventListener('focus', onWindowFocus);
            return;
          }
          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro && isPolling) {
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
        btn.textContent = checkoutLabel();
        btn.disabled = false;
      }
      if (errContainer) {
        errContainer.innerHTML = `<div class="ml-notice tone-danger ml-checkout-err">${icon('alert')}<span>${esc(res.error || 'Checkout couldn’t be started. Please try again.')}</span></div>`;
        errContainer.style.display = 'block';
      }
    }
  });

  document.getElementById('ml-inpage-demo-preview')?.addEventListener('click', showSampleAnalysis);
}

function renderProActivatedSuccess(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  body.innerHTML = `
    <div class="ml-empty ml-stagger">
      <div class="ml-empty-icon tone-positive">${icon('checkCircle', 24)}</div>
      <h2 class="ml-empty-title">You’re on MarketLens Pro</h2>
      <p class="ml-empty-sub">Payment confirmed. Unlimited analyses are now active on this browser.</p>
      <div class="ml-empty-actions">
        <button class="ml-btn ml-btn-primary is-block" id="ml-pro-continue-btn">Analyze this listing</button>
      </div>
    </div>
  `;

  let started = false;
  const continueAppraisal = async () => {
    if (started) return;
    started = true;
    if (!isDetailPage()) {
      openInpageModal();
      return;
    }
    retryLastAction = () => openInpageModal();
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
  if (!body) return;

  body.innerHTML = `
    <div class="ml-empty ml-stagger">
      <div class="ml-empty-icon tone-danger">${icon('alert', 22)}</div>
      <h2 class="ml-empty-title">We couldn’t analyze this listing</h2>
      <p class="ml-empty-sub">Check your connection and try again. Some listing layouts may not be supported yet.</p>
      <p class="ml-error-msg">${esc(msg)}</p>
      <div class="ml-empty-actions">
        ${retryLastAction ? `<button class="ml-btn ml-btn-primary is-block" id="ml-error-retry">${icon('refresh')}<span>Try again</span></button>` : ''}
        <button class="ml-btn ml-btn-link" id="ml-error-demo">View a sample analysis</button>
      </div>
    </div>
  `;

  document.getElementById('ml-error-retry')?.addEventListener('click', () => retryLastAction?.());
  document.getElementById('ml-error-demo')?.addEventListener('click', showSampleAnalysis);
}

// ─── 5. Results Presentation ──────────────────────────────────────────────────

function sectionHead(iconName: IconName, title: string, meta = ''): string {
  return `
    <div class="ml-section-head">
      ${icon(iconName)}
      <h3 class="ml-section-title">${esc(title)}</h3>
      ${meta ? `<div class="ml-section-meta">${meta}</div>` : ''}
    </div>
  `;
}

function renderInpageResults(
  analysis: AIProductAnalysis,
  context: UniversalListingContext,
  isDemo: boolean
): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  setSettingsButtonActive(false);

  // Pin scroll to top so the verdict is the first thing visible
  body.scrollTop = 0;

  const { pricing, visualAudit, flipPotential, negotiation, identifiedProduct } = analysis;

  // ── Buyer-first derived values (fall back for older cached analyses) ──
  const buyScore =
    typeof analysis.buyScore === 'number'
      ? Math.max(0, Math.min(100, Math.round(analysis.buyScore)))
      : SCORE_FROM_RATING[pricing.dealRating] ?? 50;
  const buyVerdict: BuyVerdict | 'unknown' =
    analysis.buyVerdict || VERDICT_FROM_RATING[pricing.dealRating] || 'unknown';
  const verdictBadge = VERDICT_BADGE[buyVerdict];
  const tone = scoreTone(buyScore);
  const redFlags = analysis.redFlags ?? [];
  const questions = analysis.questionsToAsk ?? [];
  const conditionScore = visualAudit.conditionScore ?? 'good';
  const flaws = visualAudit.detectedFlawsOrWear ?? [];
  const accessories = visualAudit.accessoriesVisible ?? [];

  // Score ring geometry (76×76 viewBox, r=33)
  const RING_R = 33;
  const RING_C = 2 * Math.PI * RING_R;
  const ringTarget = RING_C - (RING_C * buyScore) / 100;

  const askingNum = pricing.askingPrice;
  const askingDisplay = context.priceRaw || money(askingNum);
  const fair = pricing.fairUsedMarketRange;
  const msrp = pricing.estimatedNewPrice;

  let discountPct: number | null = null;
  if (askingNum && msrp && msrp > askingNum) {
    discountPct = Math.round(((msrp - askingNum) / msrp) * 100);
  }

  // Market position badge from % vs fair market value
  let marketBadge = '';
  const pctVsMarket = pricing.percentageVsMarket;
  if (typeof pctVsMarket === 'number' && isFinite(pctVsMarket)) {
    if (pctVsMarket <= -3) {
      marketBadge = `<span class="ml-badge tone-positive">${Math.abs(Math.round(pctVsMarket))}% below market</span>`;
    } else if (pctVsMarket >= 3) {
      marketBadge = `<span class="ml-badge tone-danger">${Math.round(pctVsMarket)}% above market</span>`;
    } else {
      marketBadge = `<span class="ml-badge">At market price</span>`;
    }
  }

  // Price range chart on one shared axis
  const scale = buildPriceScale({ asking: askingNum, fairMin: fair?.min, fairMax: fair?.max, msrp });
  const labelAlign =
    scale.asking === null ? '' : scale.asking < 18 ? 'align-start' : scale.asking > 82 ? 'align-end' : '';
  const rangeChart =
    scale.asking !== null || scale.bandStart !== null
      ? `
      <div class="ml-range" aria-hidden="true">
        <div class="ml-range-track">
          ${scale.bandStart !== null && scale.bandEnd !== null ? `<div class="ml-range-band" style="left:${scale.bandStart}%;width:${Math.max(0, scale.bandEnd - scale.bandStart)}%"></div>` : ''}
          ${scale.msrp !== null ? `<div class="ml-range-tick" style="left:${scale.msrp}%"></div>` : ''}
          ${scale.asking !== null ? `<div class="ml-range-marker" style="left:${scale.asking}%"></div><div class="ml-range-label ${labelAlign}" style="left:${scale.asking}%">Asking ${esc(money(askingNum))}</div>` : ''}
        </div>
        <div class="ml-range-legend">
          ${scale.asking !== null ? '<span><i class="ml-legend-dot"></i>Asking</span>' : ''}
          ${scale.bandStart !== null ? '<span><i class="ml-legend-swatch"></i>Fair used range</span>' : ''}
          ${scale.msrp !== null ? '<span><i class="ml-legend-tick"></i>Retail (new)</span>' : ''}
        </div>
      </div>`
      : '';

  const modelYear = identifiedProduct?.modelYear;
  const msrpLabel = modelYear ? `Retail when new (${modelYear})` : 'Retail when new';

  const resolvedVerdictLabel =
    analysis.buyVerdictLabel ||
    pricing?.dealVerdictLabel ||
    (buyVerdict === 'walk_away'
      ? 'Walk away — poor deal or high risk'
      : buyVerdict === 'buy_now'
      ? 'Great buy — act fast'
      : buyVerdict === 'good_buy'
      ? 'Good buy at a fair price'
      : buyVerdict === 'negotiate'
      ? 'Negotiate before buying'
      : 'Proceed with caution');

  const resolvedProductName = identifiedProduct?.name || context.title || 'Marketplace item';
  const resolvedSummary = analysis.aiSummary || 'Appraisal completed for this listing.';

  const criticalCount = redFlags.filter((f) => f.severity === 'critical').length;
  const warningCount = redFlags.filter((f) => f.severity === 'warning').length;
  const flagsBadge =
    redFlags.length === 0
      ? `<span class="ml-badge tone-positive">No issues</span>`
      : criticalCount > 0
      ? `<span class="ml-badge tone-danger">${criticalCount} critical</span>`
      : warningCount > 0
      ? `<span class="ml-badge tone-warning">${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}</span>`
      : `<span class="ml-badge tone-info">${redFlags.length} ${redFlags.length === 1 ? 'note' : 'notes'}</span>`;

  const FLAG_STYLE: Record<string, { tone: Tone; icon: IconName }> = {
    critical: { tone: 'danger', icon: 'octagon' },
    warning: { tone: 'warning', icon: 'alert' },
    info: { tone: 'info', icon: 'info' },
  };

  const netProfit = flipPotential.estimatedNetProfit;
  const brandModel = [identifiedProduct?.brand, identifiedProduct?.model].filter(Boolean).join(' · ');
  const imageUrl = context.imageUrl || analysis.imageUrl || '';

  let staggerIdx = 0;
  const next = () => staggerIdx++;

  body.innerHTML = `
    ${isDemo ? `
      <div class="ml-notice tone-info ml-stagger" style="--i:${next()}">
        ${icon('info')}
        <div><strong>Sample analysis.</strong> This is example data, not the page you’re viewing.</div>
      </div>
    ` : ''}

    <section class="ml-section ml-stagger tone-${tone}" style="--i:${next()}">
      <div class="ml-hero-product">${esc(resolvedProductName)}</div>
      <div class="ml-hero-main">
        <div class="ml-score-ring" role="img" aria-label="Buy score ${buyScore} out of 100">
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle class="ml-score-ring-track" cx="38" cy="38" r="${RING_R}"></circle>
            <circle
              class="ml-score-ring-fill"
              id="ml-score-ring-fill"
              cx="38" cy="38" r="${RING_R}"
              stroke-dasharray="${RING_C.toFixed(2)}"
              stroke-dashoffset="${RING_C.toFixed(2)}"
            ></circle>
          </svg>
          <div class="ml-score-ring-center">
            <span class="ml-score-num" id="ml-score-num-val">0</span>
            <span class="ml-score-of">Buy score</span>
          </div>
        </div>
        <div class="ml-hero-verdict">
          <span class="ml-badge has-dot tone-${verdictBadge.tone}">${verdictBadge.text}</span>
          <h2 class="ml-hero-title">${esc(resolvedVerdictLabel)}</h2>
        </div>
      </div>
      <p class="ml-hero-summary">${esc(resolvedSummary)}</p>
      <div class="ml-keystats">
        <div class="ml-keystat">
          <span class="ml-keystat-label">Asking</span>
          <span class="ml-keystat-value" title="${esc(askingDisplay)}">${esc(askingDisplay)}</span>
        </div>
        <div class="ml-keystat">
          <span class="ml-keystat-label">Fair value</span>
          <span class="ml-keystat-value">${esc(money(fair?.fairAverage))}</span>
        </div>
        <div class="ml-keystat">
          <span class="ml-keystat-label">Suggested offer</span>
          <span class="ml-keystat-value is-accent">${esc(money(negotiation?.recommendedOffer))}</span>
        </div>
      </div>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('tag', 'Price check', marketBadge)}
      ${rangeChart}
      <div class="ml-kv">
        <div class="ml-kv-row"><span class="ml-kv-key">Asking price</span><span class="ml-kv-val">${esc(askingDisplay)}</span></div>
        <div class="ml-kv-row"><span class="ml-kv-key">Fair used range</span><span class="ml-kv-val">${esc(money(fair?.min))} – ${esc(money(fair?.max))}<small>avg ${esc(money(fair?.fairAverage))}</small></span></div>
        <div class="ml-kv-row"><span class="ml-kv-key">${esc(msrpLabel)}</span><span class="ml-kv-val">${msrp ? esc(money(msrp)) : '—'}${discountPct ? `<small>${discountPct}% less</small>` : ''}</span></div>
      </div>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('shield', 'Risk check', flagsBadge)}
      ${redFlags.length > 0 ? `
        <div class="ml-list">
          ${redFlags.map((flag) => {
            const style = FLAG_STYLE[flag.severity] ?? FLAG_STYLE.info;
            return `<div class="ml-flag tone-${style.tone}">${icon(style.icon)}<span>${esc(flag.text)}</span></div>`;
          }).join('')}
        </div>
      ` : `
        <div class="ml-flag tone-positive">${icon('shieldCheck')}<span>No scam signals or red flags found in this listing.</span></div>
      `}
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('camera', 'Condition', `<span class="ml-badge tone-${CONDITION_TONE[conditionScore] ?? 'info'}">${esc(conditionScore.charAt(0).toUpperCase() + conditionScore.slice(1))}</span>`)}
      <div class="ml-media">
        ${imageUrl ? `<img src="${esc(imageUrl)}" alt="" class="ml-media-thumb" />` : ''}
        <div class="ml-media-info">
          ${brandModel ? `<span class="ml-media-title">${esc(brandModel)}</span>` : ''}
          ${identifiedProduct?.category ? `<span class="ml-media-sub">${esc(identifiedProduct.category)}</span>` : ''}
          ${visualAudit.isAuthenticUserPhoto
            ? `<span class="ml-auth tone-positive">${icon('checkCircle', 13)}Original seller photo</span>`
            : `<span class="ml-auth tone-warning">${icon('alert', 13)}May be a stock or catalog image</span>`}
        </div>
      </div>
      ${identifiedProduct?.conditionReport ? `<p class="ml-body-text">${esc(identifiedProduct.conditionReport)}</p>` : ''}

      <h4 class="ml-subhead">Observations</h4>
      ${flaws.length > 0
        ? `<ul class="ml-bullets">${flaws.map((f) => `<li><span class="ml-dot"></span><span>${esc(f)}</span></li>`).join('')}</ul>`
        : `<ul class="ml-bullets is-check"><li>${icon('check')}<span>No visible scratches, cracks or damage in the photos.</span></li></ul>`}

      ${accessories.length > 0 ? `
        <h4 class="ml-subhead">Included</h4>
        <ul class="ml-bullets is-check">${accessories.map((a) => `<li>${icon('check')}<span>${esc(a)}</span></li>`).join('')}</ul>
      ` : ''}
    </section>

    ${questions.length > 0 ? `
      <section class="ml-section ml-stagger" style="--i:${next()}">
        ${sectionHead('help', 'Ask the seller', `<button class="ml-btn ml-btn-ghost is-sm" id="ml-copy-questions-btn">${icon('copy')}<span>Copy</span></button>`)}
        <ol class="ml-questions">
          ${questions.map((q, i) => `<li><span class="ml-q-num">${i + 1}</span><span>${esc(q)}</span></li>`).join('')}
        </ol>
      </section>
    ` : ''}

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('message', 'Counter-offer', `<span class="ml-badge tone-accent">Offer ${esc(money(negotiation.recommendedOffer))}</span>`)}
      <div class="ml-message">${esc(negotiation.counterOfferMessage)}</div>
      <button class="ml-btn ml-btn-primary is-block" id="ml-copy-inpage-btn">${icon('copy')}<span>Copy message</span></button>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('trendingUp', 'Resale outlook', `<span class="ml-badge">${esc(flipPotential.score)} / 10</span>`)}
      <div class="ml-stats">
        <div class="ml-stat">
          <span class="ml-stat-label">Resale value</span>
          <span class="ml-stat-value">${esc(money(flipPotential.estimatedResaleValue))}</span>
        </div>
        <div class="ml-stat">
          <span class="ml-stat-label">Net margin</span>
          <span class="ml-stat-value ${netProfit >= 0 ? 'is-positive' : 'is-negative'}">${netProfit >= 0 ? '+' : ''}${esc(money(netProfit))}</span>
        </div>
        <div class="ml-stat">
          <span class="ml-stat-label">Time to sell</span>
          <span class="ml-stat-value" title="${esc(flipPotential.resaleTimeframe)}">${esc(flipPotential.resaleTimeframe)}</span>
        </div>
      </div>
      ${netProfit < 0 ? `
        <div class="ml-notice tone-warning">${icon('alert')}<span>Reselling at today’s market price would lose about ${esc(money(Math.abs(netProfit)))}. Better for personal use than flipping.</span></div>
      ` : ''}
      ${flipPotential.flipSummary ? `<p class="ml-body-text">${esc(flipPotential.flipSummary)}</p>` : ''}
    </section>

    <p class="ml-disclaimer">AI estimates based on the listing and recent market data. Always inspect the item before paying.</p>
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
      const duration = 900;
      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        const eased = 1 - Math.pow(1 - t, 3);
        numEl.textContent = String(Math.round(eased * buyScore));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  const wireCopy = (id: string, text: string, label: string, doneLabel: string) => {
    document.getElementById(id)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(text);
        setButtonLabel(btn, doneLabel, 'check');
        btn.classList.add('is-done');
        setTimeout(() => {
          setButtonLabel(btn, label, 'copy');
          btn.classList.remove('is-done');
        }, 2200);
      } catch {
        // Clipboard can be blocked by the host page's permissions policy
      }
    });
  };

  wireCopy('ml-copy-questions-btn', questions.map((q, i) => `${i + 1}. ${q}`).join('\n'), 'Copy', 'Copied');
  wireCopy('ml-copy-inpage-btn', negotiation.counterOfferMessage, 'Copy message', 'Copied — paste it in chat');
}

// ─── 6. In-Drawer Settings View ───────────────────────────────────────────────

function renderInpageSettings(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  setSettingsButtonActive(true);

  const isPro = currentUserSub?.isPro ?? false;
  const remaining = currentUserSub?.freeAppraisalsRemaining ?? 1;
  const freeLeftText =
    remaining > 0 ? `${remaining} free ${remaining === 1 ? 'analysis' : 'analyses'} left` : 'No free analyses left';

  const toggleRow = (id: string, name: string, sub: string, checked: boolean) => `
    <div class="ml-setting-row">
      <div class="ml-setting-text">
        <span class="ml-setting-name">${name}</span>
        <span class="ml-setting-sub">${sub}</span>
      </div>
      <label class="ml-switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} aria-label="${name}" />
        <span class="ml-slider"></span>
      </label>
    </div>
  `;

  const themeBtn = (val: ThemeMode, label: string, iconName: IconName) => `
    <button class="ml-theme-btn ${currentPrefs.theme === val ? 'active' : ''}" data-theme-val="${val}">${icon(iconName)}<span>${label}</span></button>
  `;

  body.innerHTML = `
    <div class="ml-subheader">
      <button class="ml-icon-btn" id="ml-back-to-appraisal" title="Back" aria-label="Back">${icon('arrowLeft', 18)}</button>
      <h2 class="ml-subheader-title">Settings</h2>
    </div>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">Plan</h3>
      <div class="ml-setting-row">
        <div class="ml-setting-text">
          <span class="ml-setting-name">${isPro ? 'MarketLens Pro' : 'Free plan'}</span>
          <span class="ml-setting-sub">${isPro ? 'Unlimited analyses' : freeLeftText}</span>
        </div>
        ${
          isPro
            ? `<button class="ml-btn ml-btn-secondary is-sm" id="ml-settings-portal-btn"><span>Manage billing</span>${icon('external')}</button>`
            : `<button class="ml-btn ml-btn-primary is-sm" id="ml-settings-upgrade-btn">${icon('gem')}<span>Upgrade</span></button>`
        }
      </div>
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">On-page buttons</h3>
      ${toggleRow('pref-grid-badges', 'Feed badges', 'Show an Analyze badge on Facebook Marketplace feed cards', currentPrefs.showGridBadges)}
      ${toggleRow('pref-detail-btn', 'Listing button', 'Show the floating Analyze button on item pages', currentPrefs.showDetailPageButton)}
      ${toggleRow('pref-auto-analyze', 'Open and analyze', 'Clicking a feed badge opens the listing and analyzes it', currentPrefs.autoAnalyzeOnCardClick)}
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">Appearance</h3>
      <div class="ml-setting-stack">
        <span class="ml-setting-name">Theme</span>
        <div class="ml-segmented" role="group" aria-label="Theme">
          ${themeBtn('light', 'Light', 'sun')}
          ${themeBtn('dark', 'Dark', 'moon')}
          ${themeBtn('system', 'System', 'monitor')}
        </div>
      </div>
      <div class="ml-setting-stack">
        <span class="ml-setting-name">Accent color</span>
        <div class="ml-color-swatches">
          ${(Object.keys(ACCENT_PALETTES) as AccentColor[])
            .map(
              (color) => `
              <button
                class="ml-swatch ${currentPrefs.accentColor === color ? 'active' : ''}"
                data-color-val="${color}"
                style="background-color: ${ACCENT_PALETTES[color].primary};"
                title="${ACCENT_PALETTES[color].name}"
                aria-label="${ACCENT_PALETTES[color].name}"
              ></button>
            `
            )
            .join('')}
        </div>
      </div>
    </section>

    <div class="ml-toast" id="ml-save-feedback" role="status">${icon('check')}Saved</div>
  `;

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
    if (portalBtn) {
      setButtonLabel(portalBtn, 'Opening…');
      portalBtn.disabled = true;
    }
    const res = await openStripeCustomerPortal();
    if (portalBtn) {
      portalBtn.innerHTML = `<span>Manage billing</span>${icon('external')}`;
      portalBtn.disabled = false;
    }
    if (!res.success) {
      alert(res.error || 'Couldn’t open the billing portal. Please try again.');
    }
  });

  const triggerSave = async (updated: Partial<UserPreferences>) => {
    currentPrefs = await savePreferences(updated);
    applyTheme();
    checkAndInject();

    const fb = document.getElementById('ml-save-feedback');
    if (fb) {
      fb.classList.remove('show');
      void fb.offsetWidth; // restart the animation on repeated saves
      fb.classList.add('show');
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

  document.querySelectorAll(`#${MODAL_ID} .ml-theme-btn`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-theme-val') as ThemeMode;
      if (val) {
        document.querySelectorAll(`#${MODAL_ID} .ml-theme-btn`).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        triggerSave({ theme: val });
      }
    });
  });

  document.querySelectorAll(`#${MODAL_ID} .ml-swatch`).forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const val = swatch.getAttribute('data-color-val') as AccentColor;
      if (val) {
        document.querySelectorAll(`#${MODAL_ID} .ml-swatch`).forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        triggerSave({ accentColor: val });
      }
    });
  });
}

// ─── 7. Styles Injection ──────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('marketlens-styles')) return;

  const style = document.createElement('style');
  style.id = 'marketlens-styles';
  style.textContent = buildInpageStyles(BTN_ID, MODAL_ID);
  (document.head || document.documentElement).appendChild(style);
}
