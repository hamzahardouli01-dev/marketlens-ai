/**
 * MarketLens AI — Universal Listing & Item Harvester
 *
 * Extracts product photos, title, price, and description across
 * Facebook Marketplace (all categories & locales), eBay, Craigslist, Amazon,
 * or any individual secondhand listing page.
 */

import type { UniversalListingContext } from '../types/ai';

export function getListingRoot(doc: Document = document): Element {
  // Check open dialogs first (excluding MarketLens's own modal and chat/messenger flyouts)
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>('div[role="dialog"]')).filter((d) => {
    if (d.id === 'marketlens-inpage-modal' || d.closest('#marketlens-inpage-modal')) return false;
    const aria = (d.getAttribute('aria-label') || '').toLowerCase();
    // Exclude chats, conversations, notifications, search menus
    if (
      aria.includes('chat') ||
      aria.includes('messenger') ||
      aria.includes('conversation') ||
      aria.includes('notification')
    ) {
      return false;
    }
    // Must look like a product listing: contains price or product images
    const text = d.textContent || '';
    const hasPrice = /(?:(?:CA|US|AU|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,.]+|[\d\s,.]+\s*(?:[$€£¥]|CAD|USD|EUR|GBP)|\b(?:free|gratuit)\b/i.test(text);
    const hasImage = Boolean(
      d.querySelector('img[src*="fbcdn"], img[src*="scontent"], img[data-visualcompletion]')
    );
    const hasHeading = Boolean(d.querySelector('h1, [role="heading"], span[dir="auto"]'));
    return (hasPrice || hasImage) && hasHeading;
  });

  if (dialogs.length > 0) {
    // Return the dialog with the richest content
    return dialogs.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0))[0];
  }

  // Next check role="main"
  const main = doc.querySelector('div[role="main"]');
  if (main) {
    return main;
  }

  return doc.body;
}

/**
 * Verifies whether the provided URL belongs to a supported marketplace ecosystem
 * (e.g. Facebook Marketplace specifically, eBay, Craigslist for-sale, OfferUp, Mercari, Poshmark).
 * Returns false for non-marketplace websites (Google, YouTube, etc.) and non-marketplace
 * areas of platforms (e.g. Facebook News Feed, Facebook Groups, Facebook Messages).
 */
export function isMarketplacePage(url: string = typeof window !== 'undefined' ? window.location.href : ''): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // 1. Facebook: MUST be on /marketplace (strictly excludes News Feed, Groups, Messenger, Watch, Profile)
    if (host.includes('facebook.com')) {
      return path.startsWith('/marketplace');
    }

    // 2. eBay: Must be item listing, search, category, or product page
    if (host.includes('ebay.')) {
      return path.startsWith('/itm') || path.startsWith('/sch') || path.startsWith('/b/') || path.startsWith('/p/');
    }

    // 3. Craigslist: Exclude non-marketplace help/forum/about pages
    if (host.includes('craigslist.org')) {
      if (
        host.startsWith('forums.') ||
        path.startsWith('/about') ||
        path.startsWith('/help') ||
        path.startsWith('/forums')
      ) {
        return false;
      }
      return true;
    }

    // 4. OfferUp, Mercari, Poshmark
    if (host.includes('offerup.com')) return true;
    if (host.includes('mercari.com')) return true;
    if (host.includes('poshmark.com')) return true;

    return false;
  } catch {
    return false;
  }
}

export function isIndividualListing(url: string, doc: Document = document): boolean {
  if (!url) return false;

  // 1. Must be on a supported marketplace site first
  if (!isMarketplacePage(url)) {
    return false;
  }

  // 2. Direct individual listing URL patterns
  if (/facebook\.com\/marketplace\/item\//i.test(url)) return true;
  if (/ebay\.[a-z.]+\/itm\//i.test(url)) return true;
  if (/craigslist\.[a-z.]+\/.*?\d+\.html/i.test(url)) return true;
  if (/poshmark\.[a-z.]+\/listing\//i.test(url)) return true;
  if (/mercari\.[a-z.]+\/item\//i.test(url)) return true;
  if (/offerup\.[a-z.]+\/item\/detail\//i.test(url)) return true;

  // 3. Facebook Marketplace: Check if an item modal / dialog is currently active
  if (/facebook\.com\/marketplace/i.test(url)) {
    const dialogs = Array.from(doc.querySelectorAll('div[role="dialog"]')).filter((d) => {
      if (d.id === 'marketlens-inpage-modal' || d.closest('#marketlens-inpage-modal')) return false;
      const aria = (d.getAttribute('aria-label') || '').toLowerCase();
      if (aria.includes('chat') || aria.includes('messenger') || aria.includes('conversation')) return false;
      const hasPrice = /(?:(?:CA|US|AU|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,.]+|[\d\s,.]+\s*(?:[$€£¥]|CAD|USD|EUR|GBP)|\b(?:free|gratuit)\b/i.test(d.textContent || '');
      const hasImg = Boolean(d.querySelector('img[src*="scontent"], img[src*="fbcdn"], img[data-visualcompletion]'));
      return hasPrice && hasImg;
    });

    return dialogs.length > 0;
  }

  // 4. Known browse/search pages on supported platforms are definitely NOT individual listings
  if (/ebay\.[a-z.]+/i.test(url) && !/ebay\.[a-z.]+\/itm\//i.test(url)) return false;
  if (/craigslist\.[a-z.]+/i.test(url) && !/\/\d+\.html/i.test(url)) return false;

  // 5. Otherwise, not an individual listing page
  return false;
}

export function extractUniversalTitle(container: Element, doc: Document = document): string {
  let title = '';

  // 1. Check h1 inside container or document
  const h1Candidates = [
    container.querySelector('h1'),
    doc.querySelector('div[role="main"] h1'),
    doc.querySelector('div[role="dialog"] h1'),
    doc.querySelector('h1'),
  ];

  for (const h1 of h1Candidates) {
    if (h1) {
      const txt = h1.textContent?.trim();
      if (txt && txt.length > 2 && !/^(?:facebook|marketplace|log into facebook)$/i.test(txt)) {
        title = txt;
        break;
      }
    }
  }

  // 2. Check [role="heading"]
  if (!title) {
    const headings = Array.from(container.querySelectorAll('[role="heading"]'));
    for (const h of headings) {
      const txt = h.textContent?.trim();
      if (
        txt &&
        txt.length > 3 &&
        txt.length < 140 &&
        !/^(?:marketplace|categories|seller information|seller's description|overview|filters)$/i.test(txt)
      ) {
        title = txt;
        break;
      }
    }
  }

  // 3. Facebook Marketplace details heading (prominent spans in details section)
  if (!title) {
    const candidateSpans = Array.from(
      container.querySelectorAll('span[dir="auto"], div[dir="auto"], h2')
    );
    for (const el of candidateSpans) {
      const txt = el.textContent?.trim();
      if (
        txt &&
        txt.length > 4 &&
        txt.length < 140 &&
        !/^(marketplace|notifications|inbox|categories|create new|share|save|message|hide|report|details|about|overview|filters)$/i.test(txt) &&
        !/^(?:(?:CA|US|AU|C|A)?[$€£¥]|CAD|USD)\s*[\d,.]+/i.test(txt) &&
        !/^\d+\s*(?:miles?|km)\s*away$/i.test(txt) &&
        !/^(?:free|gratuit)$/i.test(txt) &&
        !/^(?:listed\s|in\s|door\s*pickup|public\s*meetup)/i.test(txt)
      ) {
        title = txt;
        break;
      }
    }
  }

  // 4. OpenGraph metadata
  if (!title) {
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
    if (ogTitle && !/^(?:facebook\s*marketplace|log into facebook|facebook)$/i.test(ogTitle)) {
      title = ogTitle
        .replace(/\s*[|•·–-]\s*(?:Facebook\s*Marketplace|Facebook|eBay|Craigslist|Amazon).*$/i, '')
        .trim();
    }
  }

  // 5. Clean document title
  if (!title) {
    let dt = doc.title || '';
    // Strip notification counter prefix like "(1) " or "(2) "
    dt = dt.replace(/^\(\d+\)\s*/, '');
    // Strip trailing site identifiers
    dt = dt
      .replace(/\s*[|•·–-]\s*(?:Facebook\s*Marketplace|Facebook|eBay|Craigslist|Amazon).*$/i, '')
      .replace(/^(?:Marketplace\s*[-|•·–]\s*)/i, '')
      .trim();
    if (dt && dt.length > 2 && !/^(?:facebook|marketplace|log into facebook)$/i.test(dt)) {
      title = dt;
    }
  }

  return title || 'Marketplace Item';
}

export function extractUniversalPrice(
  container: Element,
  doc: Document = document
): { priceRaw: string; currency: string } {
  let priceRaw = '';
  let currency = 'USD';

  // 1. JSON-LD structured data
  try {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of Array.from(scripts)) {
      const txt = s.textContent?.trim();
      if (!txt) continue;
      const data = JSON.parse(txt);
      const offers =
        data.offers ||
        (Array.isArray(data['@graph']) ? data['@graph'].find((g: any) => g?.offers)?.offers : null);
      if (offers) {
        const val = offers.price ?? offers.lowPrice;
        const curr = offers.priceCurrency || 'USD';
        if (val !== undefined && val !== null) {
          currency = curr;
          priceRaw = `${curr === 'CAD' ? 'CA$' : curr === 'USD' ? '$' : curr + ' '}${val}`;
          break;
        }
      }
    }
  } catch {}

  // 2. OpenGraph / Meta tags
  if (!priceRaw) {
    const ogPrice =
      doc.querySelector('meta[property="product:price:amount"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:price:amount"]')?.getAttribute('content');
    const ogCurr =
      doc.querySelector('meta[property="product:price:currency"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:price:currency"]')?.getAttribute('content');

    if (ogPrice && parseFloat(ogPrice) > 0) {
      currency = ogCurr || 'USD';
      priceRaw = `${currency === 'CAD' ? 'CA$' : currency === 'USD' ? '$' : currency + ' '}${ogPrice}`;
    }
  }

  // Normalize non-breaking spaces and unicode whitespace, collapsing extra spaces
  const clean = (s: string) =>
    s
      .replace(/[\u00A0\u202F\u2007\u200B]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // 3. Specialized Marketplace Selectors
  if (!priceRaw) {
    const priceSelectors = [
      '[data-testid*="price" i]',
      '[aria-label*="price" i]',
      '[aria-label*="prix" i]',
      '.x-price-primary', // eBay
      '.x-bin-price',     // eBay
      '[itemprop="price"]',
      '.price',           // Craigslist
      '.a-price .a-offscreen', // Amazon
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.x193iq5w',        // Facebook Marketplace price class
    ];

    for (const sel of priceSelectors) {
      const els = Array.from(container.querySelectorAll(sel));
      for (const el of els) {
        const txt = clean(el.textContent || '');
        if (!txt) continue;

        // Free
        if (/^(?:free|gratuit|0\s*[$€£¥]?)$/i.test(txt)) {
          priceRaw = '$0 (Free)';
          break;
        }

        // Standard price patterns: $120, CA$120, C$120, US$120, AU$120, 150 €, 1 200 $, etc.
        const match = txt.match(
          /^(?:(?:CA|US|AU|NZ|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,]+(?:\.\d{2})?$|^[\d\s,.]+\s*(?:[$€£¥]|CAD|USD|AUD|EUR|GBP)$/i
        );
        if (match) {
          priceRaw = txt;
          break;
        }
      }
      if (priceRaw) break;
    }
  }

  // 4. Heuristic text search in container (starting from top/details column)
  if (!priceRaw) {
    const candidateNodes = Array.from(container.querySelectorAll('span, div, h2, h3'));
    for (const el of candidateNodes) {
      if (el.children.length > 3) continue;
      const txt = clean(el.textContent || '');
      if (txt.length > 40) continue;

      if (/^(?:free|gratuit)$/i.test(txt)) {
        priceRaw = '$0 (Free)';
        break;
      }

      const m = txt.match(
        /(?:(?:CA|US|AU|NZ|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,]+(?:\.\d{2})?|[\d\s,.]+\s*(?:[$€£¥]|CAD|USD|AUD|EUR|GBP)/i
      );
      if (m && m[0]) {
        if (!/shipping|delivery|save|off\b|discount|down\s*pay|deposit/i.test(txt)) {
          priceRaw = m[0].trim();
          break;
        }
      }
    }
  }

  // Fallback regex search on full container text if still nothing found
  if (!priceRaw) {
    const fullText = clean(container.textContent || '');
    const m = fullText.match(
      /(?:(?:CA|US|AU|NZ|C|A)?[$€£¥]|CAD|USD|AUD|EUR|GBP)\s*[\d,]+(?:\.\d{2})?/i
    );
    if (m && m[0]) {
      priceRaw = m[0].trim();
    }
  }

  // Currency detection
  const contextStr = (priceRaw + ' ' + (doc.body.textContent || '')).slice(0, 3000);
  if (/CAD|\bC\$|\bCA\$|canadian/i.test(contextStr)) {
    currency = 'CAD';
  } else if (/EUR|€/i.test(priceRaw)) {
    currency = 'EUR';
  } else if (/GBP|£/i.test(priceRaw)) {
    currency = 'GBP';
  } else if (/AUD|\bAU\$|\bA\$/i.test(priceRaw)) {
    currency = 'AUD';
  }

  // Normalize price spacing e.g. "$ 1,200" -> "$1,200"
  if (priceRaw) {
    priceRaw = priceRaw.replace(/^([$€£¥])\s+(\d)/, '$1$2').trim();
  }

  return { priceRaw, currency };
}

export function extractUniversalDescription(container: Element, doc: Document = document): string {
  let description = '';

  // 1. Look for multi-language description header markers
  const headerKeywords = [
    "seller's description",
    "seller’s description",
    "description du vendeur",
    "descripción del vendedor",
    "beschreibung des verkäufers",
    "item description",
    "about this item",
    "à propos de cet article",
    "description",
    "details",
    "détails",
    "detalles",
  ];

  const candidateHeaderEls = Array.from(container.querySelectorAll('span, div, h2, h3, h4'));
  for (const el of candidateHeaderEls) {
    const txt = el.textContent?.trim().toLowerCase();
    if (txt && headerKeywords.includes(txt)) {
      const candidateContainers = [
        el.nextElementSibling,
        el.parentElement?.nextElementSibling,
        el.parentElement?.parentElement?.nextElementSibling,
      ].filter(Boolean) as Element[];

      for (const parent of candidateContainers) {
        const textBlocks = Array.from(parent.querySelectorAll('div[dir="auto"], span[dir="auto"], p, span'))
          .map((n) => n.textContent?.trim() || '')
          .filter(
            (t) =>
              t.length > 15 &&
              !headerKeywords.includes(t.toLowerCase()) &&
              !/^(see more|see less|afficher plus|afficher moins|ver más|mehr anzeigen)$/i.test(t) &&
              !/send seller a message|is this available/i.test(t)
          );

        if (textBlocks.length > 0) {
          const unique = Array.from(new Set(textBlocks));
          description = unique.join('\n\n').trim();
          break;
        }

        const directText = parent.textContent?.trim();
        if (
          directText &&
          directText.length > 20 &&
          !headerKeywords.includes(directText.toLowerCase())
        ) {
          description = directText.replace(/\s*(?:See more|See less|Afficher plus)\s*$/i, '').trim();
          break;
        }
      }

      if (description) break;
    }
  }

  // 2. Specialized marketplace description selectors
  if (!description) {
    const descSelectors = [
      'div[data-testid="x-item-description"]', // eBay
      '.d-item-description',                   // eBay
      '#itemDescription',
      '#viTabs_0_is',
      '#postingbody',                          // Craigslist
      '#productDescription',                   // Amazon
      '#feature-bullets',
      '[data-testid*="description" i]',
      '[aria-label*="description" i]',
    ];

    for (const sel of descSelectors) {
      const el = container.querySelector(sel) || doc.querySelector(sel);
      if (el) {
        let t = el.textContent?.trim() || '';
        t = t.replace(/QR Code Link to This Post/gi, '').trim();
        if (t.length > 15) {
          description = t;
          break;
        }
      }
    }
  }

  // 3. Fallback: Find longest meaningful content block inside listing container
  if (!description) {
    const textNodes = Array.from(container.querySelectorAll('div[dir="auto"], span[dir="auto"], p'));
    const candidates: string[] = [];
    for (const n of textNodes) {
      const t = n.textContent?.trim() || '';
      if (
        t.length > 30 &&
        t.length < 5000 &&
        !/^(marketplace|notifications|inbox|categories|create new|share|save|message|details|door pickup|public meetup|seller information)/i.test(t)
      ) {
        candidates.push(t);
      }
    }
    if (candidates.length > 0) {
      description = candidates.sort((a, b) => b.length - a.length)[0];
    }
  }

  // 4. OpenGraph description fallback
  if (!description) {
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim();
    if (
      ogDesc &&
      ogDesc.length > 15 &&
      !/Marketplace is a convenient destination on Facebook/i.test(ogDesc)
    ) {
      description = ogDesc;
    }
  }

  // 5. Prepend user-selected text if present
  try {
    const selected = window.getSelection()?.toString().trim();
    if (selected && selected.length > 8) {
      description = `[Highlighted by user]: ${selected}\n\n${description}`;
    }
  } catch {}

  return description.slice(0, 3500);
}

export function extractUniversalImages(
  container: Element,
  doc: Document = document
): { imageUrl: string; galleryImages: string[] } {
  let imageUrl = '';
  const galleryImages: string[] = [];

  const imgSelectors = [
    'img[data-visualcompletion="media-vc-image"]',
    'div[aria-label*="photo" i] img',
    'div[aria-label*="image" i] img',
    'div[role="main"] img[src*="fbcdn"]',
    'div[role="main"] img[src*="scontent"]',
    'img[src*="fbcdn.net"]',
    'img[src*="scontent"]',
    '#icImg',                                // eBay
    '.ux-image-filmstrip-carousel img',      // eBay
    '.ux-image-carousel-item img',           // eBay
    '.slide.first img',                      // Craigslist
    '#thumbs img',                           // Craigslist
    '#landingImage',                         // Amazon
    'div[role="main"] img',
    'img',
  ];

  const candidateImgs: HTMLImageElement[] = [];

  for (const sel of imgSelectors) {
    const found = Array.from(container.querySelectorAll<HTMLImageElement>(sel));
    for (const img of found) {
      if (!candidateImgs.includes(img)) {
        candidateImgs.push(img);
      }
    }
  }

  // Filter valid product images
  const validImages: Array<{ img: HTMLImageElement; src: string; score: number }> = [];

  for (const img of candidateImgs) {
    const src = img.currentSrc || img.src || '';
    if (!src || src.startsWith('data:image/svg') || src.startsWith('data:image/gif')) continue;

    // Skip icons, emojis, badges, map previews, and user profile pictures
    if (
      /emoji|icon|rsrc\.php|static_map|maps\.googleapis|favicon/i.test(src) ||
      /profile|avatar/i.test(src) ||
      /profile|avatar/i.test(img.alt || '') ||
      Boolean(img.closest('[aria-label*="profile" i], [aria-label*="seller" i]'))
    ) {
      continue;
    }

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;

    // Filter out tiny icons
    if (w > 0 && h > 0 && (w < 80 || h < 80)) continue;

    let score = w * h;
    // Prefer FB marketplace visualcompletion media images
    if (img.getAttribute('data-visualcompletion') === 'media-vc-image') score += 500000;
    if (img.closest('div[aria-label*="photo" i], div[aria-label*="image" i]')) score += 300000;
    if (/scontent|fbcdn\.net/i.test(src)) score += 100000;

    let bestSrc = src;
    if (img.srcset) {
      const entries = img.srcset.split(',').map((e) => e.trim().split(/\s+/));
      if (entries.length > 0) {
        const last = entries[entries.length - 1][0];
        if (last && last.startsWith('http')) bestSrc = last;
      }
    }

    validImages.push({ img, src: bestSrc, score });
  }

  if (validImages.length > 0) {
    validImages.sort((a, b) => b.score - a.score);
    imageUrl = validImages[0].src;

    for (let i = 1; i < validImages.length && galleryImages.length < 4; i++) {
      if (!galleryImages.includes(validImages[i].src) && validImages[i].src !== imageUrl) {
        galleryImages.push(validImages[i].src);
      }
    }
  }

  // Fallback 1: Elements with CSS background-image
  if (!imageUrl) {
    const bgEls = Array.from(container.querySelectorAll<HTMLElement>('[style*="background-image"]'));
    for (const el of bgEls) {
      const bg = el.style.backgroundImage || '';
      const m = bg.match(/url\(['"]?(https?:\/\/[^'"]+)['"]?\)/i);
      if (m && m[1] && /fbcdn\.net|scontent/i.test(m[1]) && !/profile|avatar/i.test(m[1])) {
        imageUrl = m[1];
        break;
      }
    }
  }

  // Fallback 2: OpenGraph image
  if (!imageUrl) {
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage && !/logo|favicon|facebook_logo/i.test(ogImage)) {
      imageUrl = ogImage;
    }
  }

  return { imageUrl, galleryImages };
}

export async function convertImageToBase64(
  imageUrl: string,
  imgEl?: HTMLImageElement | null
): Promise<{ base64?: string; mimeType: string }> {
  if (!imageUrl) return { mimeType: 'image/jpeg' };

  // Attempt 1: Fast in-page Canvas conversion if image element is loaded in DOM
  if (imgEl && imgEl.complete && (imgEl.naturalWidth > 0 || imgEl.width > 0)) {
    try {
      const canvas = document.createElement('canvas');
      const w = imgEl.naturalWidth || imgEl.width || 600;
      const h = imgEl.naturalHeight || imgEl.height || 600;
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '').trim();
        if (base64 && base64.length > 100) {
          return { base64, mimeType: 'image/jpeg' };
        }
      }
    } catch {
      // Canvas tainted due to cross-origin, fall back to background worker
    }
  }

  // Attempt 2: Background service worker fetch (bypasses CORS restrictions)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const bgRes = await new Promise<{ success: boolean; base64?: string; mimeType?: string }>((resolve) => {
        const timer = setTimeout(() => resolve({ success: false }), 6000);
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_BASE64', url: imageUrl }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ success: false });
          } else {
            resolve(res || { success: false });
          }
        });
      });

      if (bgRes && bgRes.success && bgRes.base64) {
        return {
          base64: bgRes.base64,
          mimeType: bgRes.mimeType || 'image/jpeg',
        };
      }
    }
  } catch {
    // Network or message error
  }

  return { mimeType: 'image/jpeg' };
}

export async function waitForListingElements(
  doc: Document = document,
  timeoutMs = 2500
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const root = getListingRoot(doc);
    const hasImage = Boolean(
      root.querySelector(
        'img[src*="scontent"], img[src*="fbcdn"], img[data-visualcompletion], .ux-image-filmstrip-carousel img, #icImg'
      )
    );
    const hasTitle = Boolean(root.querySelector('h1, [role="heading"], span[dir="auto"]'));
    const text = root.textContent || '';
    const hasPrice = /(?:(?:CA|US|AU|C|A)?[$€£¥]|CAD|USD)\s*[\d,.]+|[\d,.]+\s*[$€£¥]|\b(?:free|gratuit)\b/i.test(
      text
    );

    if ((hasImage || hasPrice) && hasTitle) {
      await new Promise((r) => setTimeout(r, 200));
      return true;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function harvestUniversalListing(doc: Document = document): Promise<UniversalListingContext> {
  const url = typeof window !== 'undefined' ? window.location.href : '';

  // 1. Verify that this is an individual listing or open item dialog
  if (!isIndividualListing(url, doc)) {
    throw new Error(
      'NOT_A_LISTING: You are viewing the general Marketplace feed. Please click on any item to open its listing, or click the floating "✨ AI Deal Appraisal" button on the listing!'
    );
  }

  // 2. Wait up to 1.2s if listing is still actively hydrating
  await waitForListingElements(doc, 1200);

  // 3. Locate the actual listing container
  const container = getListingRoot(doc);

  // 4. Extract Title, Price, Description
  const title = extractUniversalTitle(container, doc);
  const { priceRaw, currency } = extractUniversalPrice(container, doc);
  const description = extractUniversalDescription(container, doc);

  // 5. Extract Hero and Gallery Images
  const { imageUrl, galleryImages } = extractUniversalImages(container, doc);

  // 6. Convert Primary Hero Image to Base64
  let imageBase64: string | undefined;
  let imageMimeType = 'image/jpeg';
  const additionalImagesBase64: Array<{ base64: string; mimeType: string }> = [];

  if (imageUrl) {
    const heroImgEl = Array.from(container.querySelectorAll<HTMLImageElement>('img')).find(
      (img) => (img.currentSrc || img.src) === imageUrl
    );
    const res = await convertImageToBase64(imageUrl, heroImgEl);
    if (res.base64) {
      imageBase64 = res.base64;
      imageMimeType = res.mimeType;
    }
  }

  // 7. Convert up to 2 gallery images if available
  if (galleryImages.length > 0) {
    for (const gUrl of galleryImages.slice(0, 2)) {
      const gImgEl = Array.from(container.querySelectorAll<HTMLImageElement>('img')).find(
        (img) => (img.currentSrc || img.src) === gUrl
      );
      const res = await convertImageToBase64(gUrl, gImgEl);
      if (res.base64) {
        additionalImagesBase64.push({ base64: res.base64, mimeType: res.mimeType });
      }
    }
  }

  return {
    url,
    title: title || 'Marketplace Item',
    priceRaw,
    currency,
    description,
    imageUrl,
    imageBase64,
    imageMimeType,
    galleryImages,
    additionalImagesBase64: additionalImagesBase64.length > 0 ? additionalImagesBase64 : undefined,
  };
}

