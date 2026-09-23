/**
 * MarketLens AI — MV3 Service Worker
 *
 * Handles context menus ("Analyze Deal with MarketLens AI"),
 * message routing, and CORS-free image base64 conversion for Gemini Vision.
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'marketlens-analyze',
    title: '🔍 Analyze Deal & Flip with MarketLens AI',
    contexts: ['image', 'selection', 'page', 'link'],
  });
});

/**
 * Top Toolbar Icon Click: Open the full in-page appraisal drawer directly on the active tab!
 * Solves the "half-screen popup" issue by seamlessly sliding out the full-height drawer.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url) return;

  // Don't inject on internal browser pages
  if (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('about:')
  ) {
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INPAGE_DRAWER' });
    if (res?.success) return;
  } catch {
    // If content script was not already running on this tab, dynamically inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      setTimeout(async () => {
        try {
          if (tab.id) {
            await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_INPAGE_DRAWER' });
          }
        } catch {}
      }, 150);
    } catch (err) {
      console.warn('[MarketLens AI] Could not inject content script:', err);
      chrome.runtime.openOptionsPage();
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'marketlens-analyze' && tab?.id) {
    chrome.storage.local.set({
      pending_ai_context: {
        imageUrl: info.srcUrl || '',
        selectedText: info.selectionText || '',
        pageUrl: info.pageUrl || tab.url || '',
        timestamp: Date.now(),
      },
    });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_INPAGE_DRAWER' });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        setTimeout(async () => {
          try {
            if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_INPAGE_DRAWER' });
          } catch {}
        }, 150);
      } catch {}
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  // Cross-Origin image fetcher for Gemini Vision (bypasses webpage CORS restrictions)
  if (message.type === 'FETCH_IMAGE_BASE64') {
    const imageUrl = message.url;
    if (!imageUrl) {
      sendResponse({ success: false, error: 'No image URL provided.' });
      return true;
    }

    (async () => {
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status} when fetching image.` });
          return;
        }
        const blob = await res.blob();
        const mimeType = blob.type || 'image/jpeg';
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const base64 = btoa(binary);
        sendResponse({ success: true, base64, mimeType });
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || 'Failed to fetch image.' });
      }
    })();

    return true; // async sendResponse
  }

  // Cross-Origin / Mixed-Content Backend API Proxy for Content Scripts
  // Content scripts on HTTPS pages (like Facebook/eBay) cannot directly fetch http://localhost
  // due to browser mixed-content and page CSP rules. The service worker has full host permissions.
  if (message.type === 'BACKEND_API_REQUEST') {
    (async () => {
      try {
        const { url, method, headers, body } = message;
        const res = await fetch(url, {
          method: method || 'GET',
          headers: headers || {},
          body: body ? JSON.stringify(body) : undefined,
        });

        const status = res.status;
        const ok = res.ok;
        const text = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        sendResponse({
          success: ok,
          status,
          data,
          error: ok ? undefined : (data?.message || text),
        });
      } catch (err: any) {
        sendResponse({
          success: false,
          status: 0,
          error:
            err?.message ||
            'Could not reach MarketLens backend server. Please verify the server is running on http://localhost:3001.',
        });
      }
    })();

    return true; // async sendResponse
  }

  return false;
});
