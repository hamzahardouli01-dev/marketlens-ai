/**
 * MarketLens AI — Content Script Entry Point
 *
 * Listens for messages from popup/service worker,
 * initializes in-page floating AI Deal Appraisal button,
 * and extracts universal listing context.
 */

import { extractListing } from './extractor';
import { harvestUniversalListing } from './universalExtractor';
import { initInpageWidget, openInpageModal, toggleInpageModal } from './inpageWidget';
import type { ListingData } from '../types/listing';
import type { UniversalListingContext } from '../types/ai';

// Initialize the in-page floating button automatically
try {
  initInpageWidget();
} catch (e) {
  console.warn('[MarketLens AI] In-page widget initialization warning:', e);
}

type ContentMessage =
  | { type: 'EXTRACT_AI_CONTEXT' }
  | { type: 'EXTRACT_LISTING' }
  | { type: 'TOGGLE_INPAGE_DRAWER' }
  | { type: 'OPEN_INPAGE_DRAWER' }
  | { type: 'PING' };

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TOGGLE_INPAGE_DRAWER') {
    toggleInpageModal()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err?.message }));
    return true;
  }

  if (message.type === 'OPEN_INPAGE_DRAWER') {
    openInpageModal()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err?.message }));
    return true;
  }

  if (message.type === 'EXTRACT_AI_CONTEXT') {
    harvestUniversalListing()
      .then((context: UniversalListingContext) => {
        sendResponse({ success: true, data: context });
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : 'AI context extraction failed.',
        });
      });
    return true; // async response
  }

  if (message.type === 'EXTRACT_LISTING') {
    try {
      const data: ListingData = extractListing();
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : 'Vehicle extraction failed.',
      });
    }
    return true;
  }

  return false;
});
