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
  extractUniversalPrice,
  getListingRoot,
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
import {
  LOCALES,
  LOCALE_INFO,
  PAGE_LOCALE_KEY,
  detectAutoLocale,
  detectLocale,
  getDir,
  getLocale,
  intlLocale,
  setLocale,
  t,
  tn,
  type LanguagePreference,
} from '../i18n';
import { icon, type IconName } from './icons';
import { buildPriceScale, esc, money, timeAgo } from '../utils/format';
import { listingKey } from '../utils/listing';
import {
  OFFER_TONES,
  buildDealSummary,
  buildOfferMessage,
  offerStep,
  offerToneLabel,
  shortItemName,
  type OfferTone,
} from '../utils/dealText';
import {
  ANALYSIS_CACHE_KEY,
  buildAnalysisIndex,
  clearAnalysisHistory,
  countCachedAnalyses,
  getAnalysisIndex,
  getCachedAnalysis,
  saveCachedAnalysis,
  type AnalysisIndexEntry,
} from '../storage/analysisCache';
import {
  attachAnalysis,
  getWatchItem,
  getWatchlist,
  priceChangeSinceSaved,
  recordObservedPrice,
  removeFromWatchlist,
  saveToWatchlist,
  type PriceChange,
} from '../storage/watchlist';

const BTN_ID = 'marketlens-inpage-btn';
const MODAL_ID = 'marketlens-inpage-modal';

let currentPrefs: UserPreferences = { ...DEFAULT_PREFERENCES };
let currentUserSub: UserSubscription | null = null;
let currentSelectedPlan: ProPlan = 'annual';
let isAutoAnalyzing = false;
let activeDrawerTab: 'appraisal' | 'settings' = 'appraisal';
let latestAnalysis: {
  analysis: AIProductAnalysis;
  context: UniversalListingContext;
  isDemo: boolean;
  analyzedAt?: number;
} | null = null;
/** Runs a fresh (uncached) analysis of whatever the drawer is currently showing. */
let reanalyzeAction: (() => void) | null = null;
/** Buy score per listing key from the analysis history, for feed badges. */
let analysisIndex: Record<string, AnalysisIndexEntry> = {};
/** Re-renders the drawer's current screen (used when the language changes). */
let rerenderCurrentView: (() => void) | null = null;
let lastStoredPageLocale: string | null = null;

// ─── Language ─────────────────────────────────────────────────────────────────

/** Pick the UI language: Settings choice, then page language, then browser. Returns true if it changed. */
function refreshLocale(): boolean {
  const changed = setLocale(
    detectLocale({
      preference: currentPrefs.language,
      pageLang: document.documentElement?.lang,
      browserLangs: navigator.languages ?? [navigator.language],
    })
  );
  // Remember the language of the marketplace page so the Saved page can match it
  const detected = detectAutoLocale();
  if (detected !== lastStoredPageLocale) {
    lastStoredPageLocale = detected;
    try {
      chrome.storage.local.set({ [PAGE_LOCALE_KEY]: detected });
    } catch {}
  }
  return changed;
}

/** Re-apply text after a language change: launchers, badges and the open drawer. */
function applyLocaleToUi(): void {
  const btn = document.getElementById(BTN_ID);
  if (btn) btn.remove(); // recreated with new text and side by checkAndInject
  refreshCardBadges();
  checkAndInject();
  const modal = document.getElementById(MODAL_ID);
  if (modal && modal.style.display === 'flex') {
    createModalBase(false);
    rerenderCurrentView?.();
  }
}
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
  refreshLocale();

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

  // Load analysis history so feed badges can show known scores
  getAnalysisIndex()
    .then((index) => {
      analysisIndex = index;
      refreshCardBadges();
    })
    .catch(() => {});

  // Load preferences
  getPreferences().then((prefs) => {
    currentPrefs = prefs;
    if (refreshLocale()) applyLocaleToUi();
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
          if (refreshLocale()) applyLocaleToUi();
          applyTheme();
          checkAndInject();
        }
      }
      if (area === 'local' && changes[ANALYSIS_CACHE_KEY]) {
        analysisIndex = buildAnalysisIndex(changes[ANALYSIS_CACHE_KEY].newValue);
        refreshCardBadges();
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

const VERDICT_TONE: Record<BuyVerdict | 'unknown', Tone> = {
  buy_now: 'positive',
  good_buy: 'positive',
  negotiate: 'warning',
  caution: 'warning',
  walk_away: 'danger',
  unknown: 'info',
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
    description: '',
    imageUrl: '',
  };
}

/** The sample analysis with its text in the active language. */
function localizedSampleAnalysis(): AIProductAnalysis {
  const d = DEMO_ANALYSIS;
  return {
    ...d,
    buyVerdictLabel: t('demo.verdictLabel'),
    aiSummary: t('demo.summary'),
    redFlags: [{ severity: 'info', text: t('demo.flag') }],
    questionsToAsk: [t('demo.q1'), t('demo.q2'), t('demo.q3')],
    identifiedProduct: { ...d.identifiedProduct, category: t('demo.category'), conditionReport: t('demo.condition') },
    pricing: { ...d.pricing, dealVerdictLabel: t('demo.verdictLabel') },
    flipPotential: { ...d.flipPotential, flipSummary: t('demo.flipSummary'), resaleTimeframe: t('demo.timeframe') },
    visualAudit: {
      ...d.visualAudit,
      detectedFlawsOrWear: [t('demo.obs1'), t('demo.obs2'), t('demo.obs3')],
      accessoriesVisible: [t('demo.inc1'), t('demo.inc2'), t('demo.inc3')],
    },
    negotiation: { ...d.negotiation, counterOfferMessage: t('demo.offerMsg') },
  };
}

function showSampleAnalysis(): void {
  activeDrawerTab = 'appraisal';
  renderInpageResults(localizedSampleAnalysis(), sampleListingContext(), true);
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
  btn.innerHTML = `${icon('sparkles', 18)}<span>${esc(t('fab.label'))}</span>`;
  btn.title = t('fab.title');
  btn.setAttribute('aria-label', t('fab.title'));
  btn.lang = getLocale();
  btn.classList.toggle('is-rtl', getDir() === 'rtl');

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
    badge.dataset.mlKey = listingKey(card.href);
    renderCardBadge(badge);

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (currentPrefs.autoAnalyzeOnCardClick) {
        try {
          localStorage.setItem('marketlens_auto_analyze', Date.now().toString());
        } catch {}

        badge.innerHTML = `<span>${esc(t('badge.opening'))}</span>`;

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

function renderCardBadge(badge: HTMLElement): void {
  const entry = analysisIndex[badge.dataset.mlKey || ''];
  badge.lang = getLocale();
  badge.classList.toggle('is-rtl', getDir() === 'rtl');
  if (entry && entry.score !== null) {
    badge.classList.add('has-score');
    badge.dataset.tone = scoreTone(entry.score);
    badge.innerHTML = `<span class="ml-badge-dot"></span><span>${entry.score}</span>`;
    badge.title = t('badge.scoreTitle', { score: entry.score });
  } else {
    badge.classList.remove('has-score');
    delete badge.dataset.tone;
    badge.innerHTML = `${icon('sparkles', 13)}<span>${esc(t('badge.analyze'))}</span>`;
    badge.title = t('fab.title');
  }
}

function refreshCardBadges(): void {
  document.querySelectorAll<HTMLElement>('.ml-card-badge').forEach(renderCardBadge);
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

async function runCardAnalysis(card: HTMLAnchorElement): Promise<void> {
  retryLastAction = () => runCardAnalysis(card);
  createModalBase(true);
  try {
    const context = await harvestCardContext(card);
    await executeAppraisal(context);
  } catch (err: any) {
    showModalError(err?.message || String(err));
  }
}

async function openInpageModalForCard(card: HTMLAnchorElement): Promise<void> {
  activeDrawerTab = 'appraisal';
  reanalyzeAction = () => runCardAnalysis(card);
  if (await showCachedAnalysis(card.href)) return;
  await runCardAnalysis(card);
}

/** Show a previously stored analysis for this listing, if there is one. */
async function showCachedAnalysis(url: string): Promise<boolean> {
  const key = listingKey(url);
  if (!key) return false;

  if (latestAnalysis && !latestAnalysis.isDemo && listingKey(latestAnalysis.context.url) === key) {
    createModalBase(false);
    showLatestAnalysis();
    return true;
  }

  const cached = await getCachedAnalysis(url).catch(() => null);
  if (!cached) return false;

  latestAnalysis = {
    analysis: cached.analysis,
    context: { ...cached.context, url, description: '' },
    isDemo: false,
    analyzedAt: cached.analyzedAt,
  };
  createModalBase(false);
  showLatestAnalysis();
  return true;
}

function showLatestAnalysis(): void {
  if (!latestAnalysis) return;
  renderInpageResults(latestAnalysis.analysis, latestAnalysis.context, latestAnalysis.isDemo, latestAnalysis.analyzedAt);
}

async function runListingAnalysis(): Promise<void> {
  retryLastAction = () => runListingAnalysis();
  createModalBase(true);
  try {
    await waitForListingElements(document, 1500);
    const context: UniversalListingContext = await harvestUniversalListing();
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

  // 2. If this listing was analyzed before (this session or earlier), show it instantly
  reanalyzeAction = () => runListingAnalysis();
  if (await showCachedAnalysis(window.location.href)) return;

  // 3. Otherwise run a fresh analysis
  await runListingAnalysis();
}

// ─── Watchlist price tracking ─────────────────────────────────────────────────

/** Current price on the page, but only when the page is the listing being shown. */
function readLivePrice(shownUrl: string): string {
  if (!isDetailPage() || listingKey(shownUrl) !== listingKey(window.location.href)) return '';
  try {
    return extractUniversalPrice(getListingRoot(document), document).priceRaw;
  } catch {
    return '';
  }
}

/** On a saved listing's page, record today's price and surface any change since saving. */
async function checkWatchedPrice(shownUrl: string): Promise<void> {
  const url = window.location.href;
  // Only read the page price when the drawer is showing this page's listing
  if (!isDetailPage() || listingKey(shownUrl) !== listingKey(url)) return;
  const item = await getWatchItem(url).catch(() => null);
  if (!item) return;

  const priceRaw = readLivePrice(shownUrl);

  const result = priceRaw ? await recordObservedPrice(url, priceRaw).catch(() => null) : null;
  const change = result ? result.change : priceChangeSinceSaved(item);
  if (change) showPriceChangeNotice(change);
}

function showPriceChangeNotice(change: PriceChange): void {
  const slot = document.getElementById('ml-price-change-slot');
  if (!slot) return;
  const dropped = change.delta < 0;
  slot.innerHTML = `
    <div class="ml-notice tone-${dropped ? 'positive' : 'warning'}">
      ${icon(dropped ? 'trendingDown' : 'trendingUp')}
      <div>${esc(t(dropped ? 'results.priceDropped' : 'results.priceRose', { amount: money(Math.abs(change.delta)), from: money(change.from), to: money(change.to) }))}</div>
    </div>
  `;
}

function renderNoListingGuide(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;

  const url = window.location.href;
  const isMarketplaceSite = url.includes('facebook.com') || url.includes('ebay.') || url.includes('craigslist.');

  rerenderCurrentView = renderNoListingGuide;
  const step = (n: number, title: string, desc: string) => `
        <li class="ml-step">
          <span class="ml-step-num">${n}</span>
          <div>
            <div class="ml-step-title">${esc(title)}</div>
            <div class="ml-step-desc">${esc(desc)}</div>
          </div>
        </li>`;
  const keys = `<bdi class="ml-kbd-group" dir="ltr"><kbd class="ml-kbd">Alt</kbd><kbd class="ml-kbd">Shift</kbd><kbd class="ml-kbd">M</kbd></bdi>`;

  body.innerHTML = `
    <div class="ml-empty ml-no-listing-container ml-stagger">
      <div class="ml-empty-icon">${icon('search', 22)}</div>
      <h2 class="ml-empty-title">${esc(t('guide.title'))}</h2>
      <p class="ml-empty-sub">${esc(t(isMarketplaceSite ? 'guide.subFeed' : 'guide.subOther'))}</p>

      <ol class="ml-steps">
        ${step(1, t('guide.step1Title'), t('guide.step1Desc'))}
        ${step(2, t('guide.step2Title'), t('guide.step2Desc'))}
        ${step(3, t('guide.step3Title'), t('guide.step3Desc'))}
      </ol>

      <div class="ml-empty-actions">
        <button class="ml-btn ml-btn-secondary is-block" id="ml-preview-demo-trigger">${esc(t('common.viewSample'))}</button>
      </div>
      <p class="ml-supported">${esc(t('guide.supported'))}</p>
      <p class="ml-supported ml-tip">${icon('keyboard', 14)}<span>${esc(t('guide.tip')).replace('{keys}', keys)}</span></p>
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
        <span class="ml-spinner" role="status" aria-label="${esc(t('common.loading'))}"></span>
        <div>
          <p class="ml-loading-title">${esc(t('loading.title'))}</p>
          <p class="ml-loading-sub">${esc(t('loading.sub'))}</p>
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
  modal.setAttribute('lang', getLocale());
  modal.setAttribute('dir', getDir());
  modal.style.display = 'flex';
  if (showLoading) rerenderCurrentView = null;

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
            <button class="ml-icon-btn" id="ml-open-saved" title="${esc(t('header.saved'))}" aria-label="${esc(t('header.saved'))}">${icon('bookmark', 17)}</button>
            <button class="ml-icon-btn ${activeDrawerTab === 'settings' ? 'active' : ''}" id="ml-modal-settings" title="${esc(t('header.settings'))}" aria-label="${esc(t('header.settings'))}">${icon('sliders', 17)}</button>
            <button class="ml-icon-btn" id="ml-modal-close" title="${esc(t('header.close'))}" aria-label="${esc(t('header.close'))}">${icon('x', 18)}</button>
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
  document.getElementById('ml-open-saved')?.addEventListener('click', openSavedPage);

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
        showLatestAnalysis();
      } else {
        openInpageModal();
      }
    } else {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    }
  });
}

function openSavedPage(): void {
  try {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  } catch {
    // Extension context can be invalidated after an update; nothing useful to do here
  }
}

function setSettingsButtonActive(active: boolean): void {
  document.getElementById('ml-modal-settings')?.classList.toggle('active', active);
}

function updateDrawerProPill(): void {
  const pill = document.getElementById('ml-header-pro-pill') as HTMLButtonElement | null;
  if (!pill) return;

  if (currentUserSub?.isPro) {
    pill.className = 'ml-plan-pill is-pro';
    pill.innerHTML = `${icon('gem', 13)}<span>${esc(t('plan.pro'))}</span>`;
    pill.title = t('plan.proTitle');
    pill.onclick = () => {
      activeDrawerTab = 'settings';
      renderInpageSettings();
    };
  } else {
    const remaining = currentUserSub?.freeAppraisalsRemaining ?? 1;
    pill.className = 'ml-plan-pill';
    pill.innerHTML =
      remaining > 0
        ? `<span>${esc(tn('plan.freeLeft', remaining))}</span>`
        : `${icon('gem', 13)}<span class="ml-pill-upgrade">${esc(t('plan.upgrade'))}</span>`;
    pill.title = t('plan.upgradeTitle');
    pill.onclick = () => {
      renderInpagePaywall();
    };
  }
}

function checkoutLabel(): string {
  return t(currentSelectedPlan === 'annual' ? 'paywall.continueAnnual' : 'paywall.continueMonthly');
}

function renderInpagePaywall(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  activeDrawerTab = 'appraisal';
  rerenderCurrentView = renderInpagePaywall;
  setSettingsButtonActive(false);

  const remaining = currentUserSub?.freeAppraisalsRemaining ?? 0;
  const subCopy = remaining > 0 ? tn('paywall.subRemaining', remaining) : t('paywall.subNone');
  const feature = (title: string, desc: string) =>
    `<li>${icon('check')}<div><strong>${esc(title)}</strong><span>${esc(desc)}</span></div></li>`;

  body.innerHTML = `
    <div class="ml-section ml-stagger">
      <span class="ml-eyebrow">${icon('gem')}${esc(t('paywall.eyebrow'))}</span>
      <h2 class="ml-paywall-title">${esc(t('paywall.title'))}</h2>
      <p class="ml-paywall-sub">${esc(subCopy)}</p>

      <div class="ml-plans" role="radiogroup" aria-label="${esc(t('paywall.billingPeriod'))}">
        <button class="ml-plan ${currentSelectedPlan === 'annual' ? 'active' : ''}" id="ml-plan-annual" role="radio" aria-checked="${currentSelectedPlan === 'annual'}">
          <span class="ml-plan-save">${esc(t('paywall.saveBadge'))}</span>
          <span class="ml-plan-top"><span class="ml-plan-name">${esc(t('paywall.annual'))}</span><span class="ml-plan-radio"></span></span>
          <span class="ml-plan-price"><bdi>$5.75</bdi><small> ${esc(t('paywall.perMonth'))}</small></span>
          <span class="ml-plan-note">${esc(t('paywall.billedYearly'))}</span>
        </button>
        <button class="ml-plan ${currentSelectedPlan === 'monthly' ? 'active' : ''}" id="ml-plan-monthly" role="radio" aria-checked="${currentSelectedPlan === 'monthly'}">
          <span class="ml-plan-top"><span class="ml-plan-name">${esc(t('paywall.monthly'))}</span><span class="ml-plan-radio"></span></span>
          <span class="ml-plan-price"><bdi>$9.99</bdi><small> ${esc(t('paywall.perMonth'))}</small></span>
          <span class="ml-plan-note">${esc(t('paywall.cancelAnytime'))}</span>
        </button>
      </div>

      <ul class="ml-features">
        ${feature(t('paywall.f1Title'), t('paywall.f1Desc'))}
        ${feature(t('paywall.f2Title'), t('paywall.f2Desc'))}
        ${feature(t('paywall.f3Title'), t('paywall.f3Desc'))}
        ${feature(t('paywall.f4Title'), t('paywall.f4Desc'))}
      </ul>

      <div id="ml-paywall-action-slot">
        <div id="ml-checkout-err-container" style="display:none;"></div>
        <button class="ml-btn ml-btn-primary is-block" id="ml-inpage-checkout-btn">${esc(checkoutLabel())}</button>
      </div>

      <p class="ml-fineprint">${icon('lock')}${esc(t('paywall.secure'))}</p>
    </div>

    <div class="ml-center">
      <button class="ml-btn ml-btn-link" id="ml-inpage-demo-preview">${esc(t('common.viewSample'))}</button>
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
      btn.textContent = t('paywall.opening');
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
                <div class="ml-awaiting-title">${esc(t('paywall.waitingTitle'))}</div>
                <div class="ml-awaiting-sub">${esc(t('paywall.waitingSub'))}</div>
              </div>
            </div>
            <button class="ml-btn ml-btn-secondary is-block" id="ml-confirm-payment-btn">${esc(t('paywall.completed'))}</button>
          </div>
        `;

        let isPolling = true;

        const checkPaymentCompletion = async () => {
          const confirmBtn = document.getElementById('ml-confirm-payment-btn') as HTMLButtonElement | null;
          if (confirmBtn) {
            confirmBtn.textContent = t('paywall.checking');
            confirmBtn.disabled = true;
          }

          const synced = await syncSubscriptionWithServer(res.sessionId);
          if (synced.isPro) {
            isPolling = false;
            currentUserSub = synced;
            updateDrawerProPill();
            renderProActivatedSuccess();
          } else if (confirmBtn) {
            confirmBtn.textContent = t('paywall.notYet');
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
        errContainer.innerHTML = `<div class="ml-notice tone-danger ml-checkout-err">${icon('alert')}<span>${esc(res.error || t('paywall.checkoutError'))}</span></div>`;
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
      <h2 class="ml-empty-title">${esc(t('pro.title'))}</h2>
      <p class="ml-empty-sub">${esc(t('pro.sub'))}</p>
      <div class="ml-empty-actions">
        <button class="ml-btn ml-btn-primary is-block" id="ml-pro-continue-btn">${esc(t('pro.cta'))}</button>
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
    reanalyzeAction = () => runListingAnalysis();
    await runListingAnalysis();
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
    const analysis = await analyzeWithGemini({ ...context, responseLanguage: getLocale() });
    await decrementFreeQuota();
    currentUserSub = await getUserSubscription();
    const analyzedAt = Date.now();
    latestAnalysis = { analysis, context, isDemo: false, analyzedAt };
    saveCachedAnalysis(context, analysis, analyzedAt).catch(() => {});
    attachAnalysis(context.url, analysis, analyzedAt).catch(() => {});
    if (activeDrawerTab === 'appraisal') {
      renderInpageResults(analysis, context, false, analyzedAt);
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
  rerenderCurrentView = () => showModalError(msg);

  body.innerHTML = `
    <div class="ml-empty ml-stagger">
      <div class="ml-empty-icon tone-danger">${icon('alert', 22)}</div>
      <h2 class="ml-empty-title">${esc(t('error.title'))}</h2>
      <p class="ml-empty-sub">${esc(t('error.sub'))}</p>
      <p class="ml-error-msg" dir="auto">${esc(msg)}</p>
      <div class="ml-empty-actions">
        ${retryLastAction ? `<button class="ml-btn ml-btn-primary is-block" id="ml-error-retry">${icon('refresh')}<span>${esc(t('error.retry'))}</span></button>` : ''}
        <button class="ml-btn ml-btn-link" id="ml-error-demo">${esc(t('common.viewSample'))}</button>
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
  isDemo: boolean,
  analyzedAt?: number
): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  setSettingsButtonActive(false);
  rerenderCurrentView = isDemo ? showSampleAnalysis : () => renderInpageResults(analysis, context, false, analyzedAt);

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
  const verdictTone = VERDICT_TONE[buyVerdict];
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
      marketBadge = `<span class="ml-badge tone-positive">${esc(t('price.belowMarket', { pct: Math.abs(Math.round(pctVsMarket)) }))}</span>`;
    } else if (pctVsMarket >= 3) {
      marketBadge = `<span class="ml-badge tone-danger">${esc(t('price.aboveMarket', { pct: Math.round(pctVsMarket) }))}</span>`;
    } else {
      marketBadge = `<span class="ml-badge">${esc(t('price.atMarket'))}</span>`;
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
          ${scale.asking !== null ? `<div class="ml-range-marker" style="left:${scale.asking}%"></div><div class="ml-range-label ${labelAlign}" style="left:${scale.asking}%">${esc(t('price.askingMarker', { amount: money(askingNum) }))}</div>` : ''}
        </div>
        <div class="ml-range-legend">
          ${scale.asking !== null ? `<span><i class="ml-legend-dot"></i>${esc(t('price.legendAsking'))}</span>` : ''}
          ${scale.bandStart !== null ? `<span><i class="ml-legend-swatch"></i>${esc(t('price.legendFair'))}</span>` : ''}
          ${scale.msrp !== null ? `<span><i class="ml-legend-tick"></i>${esc(t('price.legendRetail'))}</span>` : ''}
        </div>
      </div>`
      : '';

  const modelYear = identifiedProduct?.modelYear;
  const msrpLabel = modelYear ? t('price.retailNewYear', { year: modelYear }) : t('price.retailNew');

  const resolvedVerdictLabel =
    analysis.buyVerdictLabel ||
    pricing?.dealVerdictLabel ||
    t(`verdictLabel.${(buyVerdict as string) === 'unknown' ? 'caution' : (buyVerdict as BuyVerdict)}` as const);

  const resolvedProductName = identifiedProduct?.name || context.title || t('results.marketItem');
  const resolvedSummary = analysis.aiSummary || t('results.summaryFallback');

  const criticalCount = redFlags.filter((f) => f.severity === 'critical').length;
  const warningCount = redFlags.filter((f) => f.severity === 'warning').length;
  const flagsBadge =
    redFlags.length === 0
      ? `<span class="ml-badge tone-positive">${esc(t('risk.noIssues'))}</span>`
      : criticalCount > 0
      ? `<span class="ml-badge tone-danger">${esc(tn('risk.critical', criticalCount))}</span>`
      : warningCount > 0
      ? `<span class="ml-badge tone-warning">${esc(tn('risk.warnings', warningCount))}</span>`
      : `<span class="ml-badge tone-info">${esc(tn('risk.notes', redFlags.length))}</span>`;

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
        <div><strong>${esc(t('results.sampleTitle'))}</strong> ${esc(t('results.sampleBody'))}</div>
      </div>
    ` : `
      <div class="ml-toolbar ml-stagger" style="--i:${next()}">
        <button class="ml-btn ml-btn-secondary is-sm" id="ml-save-btn">${icon('bookmark')}<span>${esc(t('common.save'))}</span></button>
        <button class="ml-btn ml-btn-secondary is-sm" id="ml-share-btn">${icon('fileText')}<span>${esc(t('results.copySummary'))}</span></button>
        <span class="ml-toolbar-meta" ${analyzedAt ? `title="${esc(new Date(analyzedAt).toLocaleString(intlLocale()))}"` : ''}>
          ${analyzedAt ? `${icon('clock', 13)}<span>${esc(timeAgo(analyzedAt))}</span>` : ''}
        </span>
        ${reanalyzeAction ? `<button class="ml-icon-btn is-sm" id="ml-reanalyze-btn" title="${esc(t(currentUserSub?.isPro ? 'results.reanalyzeTitle' : 'results.reanalyzeTitleFree'))}" aria-label="${esc(t('results.reanalyze'))}">${icon('refresh', 15)}</button>` : ''}
      </div>
      <div id="ml-price-change-slot"></div>
    `}

    <section class="ml-section ml-stagger tone-${tone}" style="--i:${next()}">
      <div class="ml-hero-product" dir="auto">${esc(resolvedProductName)}</div>
      <div class="ml-hero-main">
        <div class="ml-score-ring" role="img" aria-label="${esc(t('results.buyScoreAria', { score: buyScore }))}">
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
            <span class="ml-score-of">${esc(t('results.buyScore'))}</span>
          </div>
        </div>
        <div class="ml-hero-verdict">
          <span class="ml-badge has-dot tone-${verdictTone}">${esc(t(`verdict.${buyVerdict}` as const))}</span>
          <h2 class="ml-hero-title" dir="auto">${esc(resolvedVerdictLabel)}</h2>
        </div>
      </div>
      <p class="ml-hero-summary" dir="auto">${esc(resolvedSummary)}</p>
      <div class="ml-keystats">
        <div class="ml-keystat">
          <span class="ml-keystat-label">${esc(t('results.asking'))}</span>
          <span class="ml-keystat-value" title="${esc(askingDisplay)}">${esc(askingDisplay)}</span>
        </div>
        <div class="ml-keystat">
          <span class="ml-keystat-label">${esc(t('results.fairValue'))}</span>
          <span class="ml-keystat-value">${esc(money(fair?.fairAverage))}</span>
        </div>
        <div class="ml-keystat">
          <span class="ml-keystat-label">${esc(t('results.suggestedOffer'))}</span>
          <span class="ml-keystat-value is-accent">${esc(money(negotiation?.recommendedOffer))}</span>
        </div>
      </div>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('tag', t('price.title'), marketBadge)}
      ${rangeChart}
      <div class="ml-kv">
        <div class="ml-kv-row"><span class="ml-kv-key">${esc(t('price.askingPrice'))}</span><span class="ml-kv-val"><bdi>${esc(askingDisplay)}</bdi></span></div>
        <div class="ml-kv-row"><span class="ml-kv-key">${esc(t('price.fairRange'))}</span><span class="ml-kv-val"><bdi>${esc(money(fair?.min))} – ${esc(money(fair?.max))}</bdi><small>${esc(t('price.avg', { amount: money(fair?.fairAverage) }))}</small></span></div>
        <div class="ml-kv-row"><span class="ml-kv-key">${esc(msrpLabel)}</span><span class="ml-kv-val">${msrp ? esc(money(msrp)) : '—'}${discountPct ? `<small>${esc(t('price.pctLess', { pct: discountPct }))}</small>` : ''}</span></div>
      </div>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('shield', t('risk.title'), flagsBadge)}
      ${redFlags.length > 0 ? `
        <div class="ml-list">
          ${redFlags.map((flag) => {
            const style = FLAG_STYLE[flag.severity] ?? FLAG_STYLE.info;
            return `<div class="ml-flag tone-${style.tone}">${icon(style.icon)}<span dir="auto">${esc(flag.text)}</span></div>`;
          }).join('')}
        </div>
      ` : `
        <div class="ml-flag tone-positive">${icon('shieldCheck')}<span>${esc(t('risk.allClear'))}</span></div>
      `}
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('camera', t('condition.title'), `<span class="ml-badge tone-${CONDITION_TONE[conditionScore] ?? 'info'}">${esc(CONDITION_TONE[conditionScore] ? t(`condition.${conditionScore}` as const) : conditionScore)}</span>`)}
      <div class="ml-media">
        ${imageUrl ? `<img src="${esc(imageUrl)}" alt="" class="ml-media-thumb" />` : ''}
        <div class="ml-media-info">
          ${brandModel ? `<span class="ml-media-title">${esc(brandModel)}</span>` : ''}
          ${identifiedProduct?.category ? `<span class="ml-media-sub">${esc(identifiedProduct.category)}</span>` : ''}
          ${visualAudit.isAuthenticUserPhoto
            ? `<span class="ml-auth tone-positive">${icon('checkCircle', 13)}${esc(t('condition.originalPhoto'))}</span>`
            : `<span class="ml-auth tone-warning">${icon('alert', 13)}${esc(t('condition.stockPhoto'))}</span>`}
        </div>
      </div>
      ${identifiedProduct?.conditionReport ? `<p class="ml-body-text" dir="auto">${esc(identifiedProduct.conditionReport)}</p>` : ''}

      <h4 class="ml-subhead">${esc(t('condition.observations'))}</h4>
      ${flaws.length > 0
        ? `<ul class="ml-bullets">${flaws.map((f) => `<li><span class="ml-dot"></span><span dir="auto">${esc(f)}</span></li>`).join('')}</ul>`
        : `<ul class="ml-bullets is-check"><li>${icon('check')}<span>${esc(t('condition.noDamage'))}</span></li></ul>`}

      ${accessories.length > 0 ? `
        <h4 class="ml-subhead">${esc(t('condition.included'))}</h4>
        <ul class="ml-bullets is-check">${accessories.map((a) => `<li>${icon('check')}<span dir="auto">${esc(a)}</span></li>`).join('')}</ul>
      ` : ''}
    </section>

    ${questions.length > 0 ? `
      <section class="ml-section ml-stagger" style="--i:${next()}">
        ${sectionHead('help', t('questions.title'), `<button class="ml-btn ml-btn-ghost is-sm" id="ml-copy-questions-btn">${icon('copy')}<span>${esc(t('common.copy'))}</span></button>`)}
        <ol class="ml-questions">
          ${questions.map((q, i) => `<li><span class="ml-q-num">${i + 1}</span><span dir="auto">${esc(q)}</span></li>`).join('')}
        </ol>
      </section>
    ` : ''}

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('message', t('offer.title'), `<span class="ml-badge tone-accent">${esc(t('offer.suggested', { amount: money(negotiation.recommendedOffer) }))}</span>`)}
      <div class="ml-offer-controls">
        <div class="ml-stepper" role="group" aria-label="${esc(t('offer.amountAria'))}" dir="ltr">
          <button class="ml-stepper-btn" id="ml-offer-dec" aria-label="${esc(t('offer.lower'))}">${icon('minus', 14)}</button>
          <span class="ml-stepper-value" id="ml-offer-amount" aria-live="polite"></span>
          <button class="ml-stepper-btn" id="ml-offer-inc" aria-label="${esc(t('offer.raise'))}">${icon('plus', 14)}</button>
        </div>
        <span class="ml-offer-delta" id="ml-offer-delta"></span>
      </div>
      <div class="ml-tabs" role="tablist" aria-label="${esc(t('offer.styleAria'))}">
        ${OFFER_TONES.map((tone) => `<button class="ml-tab" role="tab" data-tone="${tone}">${esc(offerToneLabel(tone))}</button>`).join('')}
      </div>
      <div class="ml-message" id="ml-offer-message" dir="auto"></div>
      <button class="ml-btn ml-btn-primary is-block" id="ml-copy-inpage-btn">${icon('copy')}<span>${esc(t('offer.copy'))}</span></button>
    </section>

    <section class="ml-section ml-stagger" style="--i:${next()}">
      ${sectionHead('trendingUp', t('resale.title'), `<span class="ml-badge"><bdi>${esc(flipPotential.score)} / 10</bdi></span>`)}
      <div class="ml-stats">
        <div class="ml-stat">
          <span class="ml-stat-label">${esc(t('resale.value'))}</span>
          <span class="ml-stat-value">${esc(money(flipPotential.estimatedResaleValue))}</span>
        </div>
        <div class="ml-stat">
          <span class="ml-stat-label">${esc(t('resale.margin'))}</span>
          <span class="ml-stat-value ${netProfit >= 0 ? 'is-positive' : 'is-negative'}"><bdi>${netProfit >= 0 ? '+' : ''}${esc(money(netProfit))}</bdi></span>
        </div>
        <div class="ml-stat">
          <span class="ml-stat-label">${esc(t('resale.time'))}</span>
          <span class="ml-stat-value" title="${esc(flipPotential.resaleTimeframe)}">${esc(flipPotential.resaleTimeframe)}</span>
        </div>
      </div>
      ${netProfit < 0 ? `
        <div class="ml-notice tone-warning">${icon('alert')}<span>${esc(t('resale.loss', { amount: money(Math.abs(netProfit)) }))}</span></div>
      ` : ''}
      ${flipPotential.flipSummary ? `<p class="ml-body-text" dir="auto">${esc(flipPotential.flipSummary)}</p>` : ''}
    </section>

    <p class="ml-disclaimer">${esc(t('results.disclaimer'))}</p>
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

  const wireCopy = (id: string, getText: () => string, label: string, doneLabel: string, iconName: IconName = 'copy') => {
    document.getElementById(id)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(getText());
        setButtonLabel(btn, doneLabel, 'check');
        btn.classList.add('is-done');
        setTimeout(() => {
          setButtonLabel(btn, label, iconName);
          btn.classList.remove('is-done');
        }, 2200);
      } catch {
        // Clipboard can be blocked by the host page's permissions policy
      }
    });
  };

  wireCopy('ml-copy-questions-btn', () => questions.map((q, i) => `${i + 1}. ${q}`).join('\n'), t('common.copy'), t('common.copied'));
  wireCopy('ml-copy-inpage-btn', () => document.getElementById('ml-offer-message')?.textContent || '', t('offer.copy'), t('offer.copied'));
  wireCopy('ml-share-btn', () => buildDealSummary(analysis, context), t('results.copySummary'), t('results.summaryCopied'), 'fileText');

  // ── Counter-offer builder ──
  const asking = askingNum ?? null;
  const recommended = Math.max(1, Math.round(negotiation?.recommendedOffer || (asking ? asking * 0.9 : 0) || 1));
  const hasAiDraft = Boolean(negotiation?.counterOfferMessage);
  const offerItem = shortItemName(analysis, t('offer.itemFallback'));
  let offerAmount = recommended;
  let offerTone: OfferTone = hasAiDraft ? 'ai' : 'friendly';

  const renderOffer = () => {
    const amountEl = document.getElementById('ml-offer-amount');
    const deltaEl = document.getElementById('ml-offer-delta');
    const msgEl = document.getElementById('ml-offer-message');
    if (amountEl) amountEl.textContent = money(offerAmount);
    if (deltaEl) {
      if (asking && asking > 0) {
        const diff = asking - offerAmount;
        deltaEl.textContent =
          diff > 0
            ? t('offer.below', { amount: money(diff) })
            : diff < 0
            ? t('offer.above', { amount: money(-diff) })
            : t('offer.matches');
        deltaEl.className = `ml-offer-delta${diff < 0 ? ' is-over' : ''}`;
      } else {
        deltaEl.textContent = '';
      }
    }
    if (msgEl) {
      msgEl.textContent =
        offerTone === 'ai'
          ? negotiation.counterOfferMessage
          : buildOfferMessage(offerTone, { item: offerItem, amount: offerAmount, fairAverage: fair?.fairAverage });
    }
    document.querySelectorAll<HTMLButtonElement>(`#${MODAL_ID} .ml-tab`).forEach((tab) => {
      const active = tab.dataset.tone === offerTone;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      if (tab.dataset.tone === 'ai') tab.disabled = !hasAiDraft;
    });
  };

  const adjustOffer = (direction: 1 | -1) => {
    const step = offerStep(offerAmount);
    const next = direction > 0 ? Math.floor(offerAmount / step) * step + step : Math.ceil(offerAmount / step) * step - step;
    offerAmount = Math.max(step, next);
    // The AI draft quotes its own amount, so switch to a template once the amount changes
    if (offerTone === 'ai' && offerAmount !== recommended) offerTone = 'friendly';
    renderOffer();
  };

  document.getElementById('ml-offer-dec')?.addEventListener('click', () => adjustOffer(-1));
  document.getElementById('ml-offer-inc')?.addEventListener('click', () => adjustOffer(1));
  document.querySelectorAll<HTMLButtonElement>(`#${MODAL_ID} .ml-tab`).forEach((tab) => {
    tab.addEventListener('click', () => {
      offerTone = (tab.dataset.tone as OfferTone) || 'friendly';
      if (offerTone === 'ai') offerAmount = recommended;
      renderOffer();
    });
  });
  renderOffer();

  // ── Toolbar: save / re-analyze ──
  if (!isDemo) {
    const saveBtn = document.getElementById('ml-save-btn') as HTMLButtonElement | null;
    const setSaved = (saved: boolean) => {
      if (!saveBtn) return;
      setButtonLabel(saveBtn, t(saved ? 'common.saved' : 'common.save'), saved ? 'bookmarkCheck' : 'bookmark');
      saveBtn.classList.toggle('is-active', saved);
      saveBtn.title = t(saved ? 'save.removeTitle' : 'save.addTitle');
      saveBtn.dataset.saved = String(saved);
    };

    getWatchItem(context.url)
      .then((item) => setSaved(Boolean(item)))
      .catch(() => setSaved(false));

    saveBtn?.addEventListener('click', async () => {
      const saved = saveBtn.dataset.saved === 'true';
      saveBtn.disabled = true;
      try {
        if (saved) {
          const item = await getWatchItem(context.url);
          if (item) await removeFromWatchlist(item.id);
          setSaved(false);
          showToast(t('toast.removed'));
        } else {
          // Start price tracking from today's price, not the (possibly older) analyzed one
          const livePrice = readLivePrice(context.url);
          await saveToWatchlist({ ...context, priceRaw: livePrice || context.priceRaw }, analysis, analyzedAt);
          setSaved(true);
          showToast(t('toast.saved'));
        }
      } catch {
        showToast(t('toast.saveError'));
      } finally {
        saveBtn.disabled = false;
      }
    });

    document.getElementById('ml-reanalyze-btn')?.addEventListener('click', () => {
      latestAnalysis = null;
      reanalyzeAction?.();
    });

    checkWatchedPrice(context.url).catch(() => {});
  }
}

function showToast(message: string): void {
  const drawer = document.querySelector(`#${MODAL_ID} .ml-drawer`);
  if (!drawer) return;
  let toast = drawer.querySelector<HTMLElement>('.ml-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'ml-toast';
    toast.setAttribute('role', 'status');
    drawer.appendChild(toast);
  }
  toast.innerHTML = `${icon('check')}<span>${esc(message)}</span>`;
  toast.classList.remove('show');
  void toast.offsetWidth; // restart the animation on repeated toasts
  toast.classList.add('show');
}

// ─── 6. In-Drawer Settings View ───────────────────────────────────────────────

function renderInpageSettings(): void {
  const body = document.getElementById('ml-drawer-body');
  if (!body) return;
  setSettingsButtonActive(true);
  rerenderCurrentView = renderInpageSettings;

  const isPro = currentUserSub?.isPro ?? false;
  const remaining = currentUserSub?.freeAppraisalsRemaining ?? 1;
  const freeLeftText = remaining > 0 ? tn('settings.freeLeft', remaining) : t('settings.noneLeft');

  const toggleRow = (id: string, name: string, sub: string, checked: boolean) => `
    <div class="ml-setting-row">
      <div class="ml-setting-text">
        <span class="ml-setting-name">${esc(name)}</span>
        <span class="ml-setting-sub">${esc(sub)}</span>
      </div>
      <label class="ml-switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} aria-label="${esc(name)}" />
        <span class="ml-slider"></span>
      </label>
    </div>
  `;

  const themeBtn = (val: ThemeMode, label: string, iconName: IconName) => `
    <button class="ml-theme-btn ${currentPrefs.theme === val ? 'active' : ''}" data-theme-val="${val}">${icon(iconName)}<span>${esc(label)}</span></button>
  `;

  const autoLocale = detectAutoLocale();
  const languageOptions = [
    `<option value="auto" ${currentPrefs.language === 'auto' ? 'selected' : ''}>${esc(t('settings.languageAuto', { language: LOCALE_INFO[autoLocale].nativeName }))}</option>`,
    ...LOCALES.map(
      (code) =>
        `<option value="${code}" lang="${code}" ${currentPrefs.language === code ? 'selected' : ''}>${esc(LOCALE_INFO[code].nativeName)}</option>`
    ),
  ].join('');

  body.innerHTML = `
    <div class="ml-subheader">
      <button class="ml-icon-btn ml-flip-rtl" id="ml-back-to-appraisal" title="${esc(t('common.back'))}" aria-label="${esc(t('common.back'))}">${icon('arrowLeft', 18)}</button>
      <h2 class="ml-subheader-title">${esc(t('settings.title'))}</h2>
    </div>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.plan'))}</h3>
      <div class="ml-setting-row">
        <div class="ml-setting-text">
          <span class="ml-setting-name">${esc(t(isPro ? 'settings.proPlan' : 'settings.freePlan'))}</span>
          <span class="ml-setting-sub">${esc(isPro ? t('settings.unlimited') : freeLeftText)}</span>
        </div>
        ${
          isPro
            ? `<button class="ml-btn ml-btn-secondary is-sm" id="ml-settings-portal-btn"><span>${esc(t('settings.manageBilling'))}</span>${icon('external')}</button>`
            : `<button class="ml-btn ml-btn-primary is-sm" id="ml-settings-upgrade-btn">${icon('gem')}<span>${esc(t('plan.upgrade'))}</span></button>`
        }
      </div>
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.language'))}</h3>
      <div class="ml-setting-stack">
        <select class="ml-select" id="pref-language" aria-label="${esc(t('settings.language'))}">${languageOptions}</select>
      </div>
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.onPage'))}</h3>
      ${toggleRow('pref-grid-badges', t('settings.feedBadges'), t('settings.feedBadgesSub'), currentPrefs.showGridBadges)}
      ${toggleRow('pref-detail-btn', t('settings.listingButton'), t('settings.listingButtonSub'), currentPrefs.showDetailPageButton)}
      ${toggleRow('pref-auto-analyze', t('settings.autoOpen'), t('settings.autoOpenSub'), currentPrefs.autoAnalyzeOnCardClick)}
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.savedHistory'))}</h3>
      <div class="ml-setting-row">
        <div class="ml-setting-text">
          <span class="ml-setting-name">${esc(t('settings.savedListings'))}</span>
          <span class="ml-setting-sub" id="ml-saved-count">${esc(t('settings.savedSub'))}</span>
        </div>
        <button class="ml-btn ml-btn-secondary is-sm" id="ml-settings-open-saved"><span>${esc(t('common.open'))}</span>${icon('external')}</button>
      </div>
      <div class="ml-setting-row">
        <div class="ml-setting-text">
          <span class="ml-setting-name">${esc(t('settings.history'))}</span>
          <span class="ml-setting-sub" id="ml-history-count">${esc(t('settings.historySub'))}</span>
        </div>
        <button class="ml-btn ml-btn-ghost is-sm" id="ml-clear-history-btn">${esc(t('settings.clear'))}</button>
      </div>
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.shortcut'))}</h3>
      <div class="ml-setting-row">
        <div class="ml-setting-text">
          <span class="ml-setting-name">${esc(t('settings.openMarketLens'))}</span>
          <span class="ml-setting-sub">${esc(t('settings.shortcutSub'))}</span>
        </div>
        <bdi class="ml-kbd-group" dir="ltr"><kbd class="ml-kbd">Alt</kbd><kbd class="ml-kbd">Shift</kbd><kbd class="ml-kbd">M</kbd></bdi>
      </div>
    </section>

    <section class="ml-section ml-settings-group">
      <h3 class="ml-settings-group-title">${esc(t('settings.appearance'))}</h3>
      <div class="ml-setting-stack">
        <span class="ml-setting-name">${esc(t('settings.theme'))}</span>
        <div class="ml-segmented" role="group" aria-label="${esc(t('settings.theme'))}">
          ${themeBtn('light', t('settings.light'), 'sun')}
          ${themeBtn('dark', t('settings.dark'), 'moon')}
          ${themeBtn('system', t('settings.system'), 'monitor')}
        </div>
      </div>
      <div class="ml-setting-stack">
        <span class="ml-setting-name">${esc(t('settings.accent'))}</span>
        <div class="ml-color-swatches">
          ${(Object.keys(ACCENT_PALETTES) as AccentColor[])
            .map(
              (color) => `
              <button
                class="ml-swatch ${currentPrefs.accentColor === color ? 'active' : ''}"
                data-color-val="${color}"
                style="background-color: ${ACCENT_PALETTES[color].primary};"
                title="${esc(t(`accent.${color}` as const))}"
                aria-label="${esc(t(`accent.${color}` as const))}"
              ></button>
            `
            )
            .join('')}
        </div>
      </div>
    </section>

  `;

  document.getElementById('ml-back-to-appraisal')?.addEventListener('click', () => {
    activeDrawerTab = 'appraisal';
    if (latestAnalysis) {
      showLatestAnalysis();
    } else {
      openInpageModal();
    }
  });

  document.getElementById('ml-settings-upgrade-btn')?.addEventListener('click', () => {
    renderInpagePaywall();
  });

  document.getElementById('ml-settings-open-saved')?.addEventListener('click', openSavedPage);

  const updateCounts = async () => {
    const [saved, history] = await Promise.all([
      getWatchlist().then((l) => l.length).catch(() => 0),
      countCachedAnalyses().catch(() => 0),
    ]);
    const savedEl = document.getElementById('ml-saved-count');
    const historyEl = document.getElementById('ml-history-count');
    const clearBtn = document.getElementById('ml-clear-history-btn') as HTMLButtonElement | null;
    if (savedEl) savedEl.textContent = saved > 0 ? tn('settings.savedCount', saved) : t('settings.nothingSaved');
    if (historyEl) {
      historyEl.textContent = history > 0 ? tn('settings.historyCount', history) : t('settings.noHistory');
    }
    if (clearBtn) clearBtn.disabled = history === 0;
  };
  updateCounts();

  document.getElementById('ml-clear-history-btn')?.addEventListener('click', async () => {
    await clearAnalysisHistory().catch(() => {});
    await updateCounts();
    showToast(t('toast.historyCleared'));
  });

  document.getElementById('ml-settings-portal-btn')?.addEventListener('click', async () => {
    const portalBtn = document.getElementById('ml-settings-portal-btn') as HTMLButtonElement | null;
    if (portalBtn) {
      setButtonLabel(portalBtn, t('settings.opening'));
      portalBtn.disabled = true;
    }
    const res = await openStripeCustomerPortal();
    if (portalBtn) {
      portalBtn.innerHTML = `<span>${esc(t('settings.manageBilling'))}</span>${icon('external')}`;
      portalBtn.disabled = false;
    }
    if (!res.success) {
      alert(res.error || t('settings.portalError'));
    }
  });

  const triggerSave = async (updated: Partial<UserPreferences>) => {
    currentPrefs = await savePreferences(updated);
    applyTheme();
    checkAndInject();

    showToast(t('toast.prefsSaved'));
  };

  document.getElementById('pref-language')?.addEventListener('change', async (e) => {
    const value = (e.target as HTMLSelectElement).value as LanguagePreference;
    currentPrefs = await savePreferences({ language: value });
    // Re-render everything in the new language (settings stays open)
    if (refreshLocale()) applyLocaleToUi();
    showToast(t('toast.prefsSaved'));
  });

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
