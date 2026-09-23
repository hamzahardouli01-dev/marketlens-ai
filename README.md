# MarketLens AI — Gemini Deal & Flip Analyzer

A Chrome extension powered by **Google Gemini Vision** that appraises secondhand listings on Facebook Marketplace, eBay, Craigslist, and anywhere on the web. It inspects product photos for defects, compares retail MSRP against used market prices, evaluates resale flip potential, and generates 1-click counter-offer messages.

---

## Requirements

- Node.js v18 or later
- npm v9 or later
- Google Chrome (version 120+)
- Free Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) (no credit card required)

---

## Setup & Build

### 1. Install dependencies

```bash
npm install
```

### 2. Build the production bundle

```bash
npm run release
```

The built extension will be in the `dist/` directory, and a ready-to-upload zip will be created at `carlisting-lens-v1.0.0.zip`.

---

## Loading the Extension in Chrome

1. **Open Chrome** and go to `chrome://extensions`.
2. **Enable Developer Mode** (toggle in top right).
3. **Click "Load unpacked"** and select the `dist/` folder in this project.
4. Click the **MarketLens AI** icon in your toolbar, enter your free Gemini API key (or click "Preview Demo"), and you're ready to inspect any deal!
   You should see the CarListing Lens icon (a magnifying glass over a car) in your Chrome toolbar.
   
   > If you don't see it, click the puzzle-piece icon in Chrome's toolbar, then pin CarListing Lens.

---

## Using the Extension

### Analyze a listing (Zero-Click Auto-Scan)

1. Go to any Facebook Marketplace vehicle listing page  
   Example URL pattern: `https://www.facebook.com/marketplace/item/123456789`

2. Click the **CarListing Lens** icon in the Chrome toolbar.

3. **It scans automatically in 0.3s:**
   - **Deal Risk Verdict**: High-impact badge (🟢 *Low Risk / Clean*, 🟡 *Caution*, 🔴 *High Risk / Money Pit*)
   - **Price Trap Alert**: Instantly flags if the listed price is actually a down payment or monthly payment
   - **Red Flags & Disclosures**: Plain-English breakdown of hidden transmission/engine issues, salvage titles, or as-is clauses
   - **Vehicle Reality Check**: Computes annual mileage wear (miles or km per year) and flags omitted VINs or unstated titles
   - **1-Click Messenger Assistant**: Single click copies a customized, ready-to-send inquiry directly to your clipboard to paste into Facebook Messenger

4. Click **"+ Save to Compare"** to bookmark it for side-by-side comparison.

### Manual entry (for any page)

If you're not on a Facebook Marketplace listing, click **"✏️ Enter listing manually"** and fill in the form. Phrase detection still works on the pasted description.

### View & compare saved vehicles

1. Click **"View saved"** in the popup, or right-click the extension icon and select "Options".
2. In the Saved Vehicles page, you can:
   - **Edit** status (Interested / Contacted / Viewing Scheduled / Archived) and add personal notes
   - **Compare** up to 5 vehicles side-by-side
   - **Delete** individual listings or all data
   - **Search** your saved listings

### Compare vehicles

1. On the Saved Vehicles page, click **"⇄ Compare"** on 2–5 listings.
2. Click **"⇄ Compare X vehicles"** button (or the Compare nav tab).
3. A side-by-side table compares price, mileage, transmission, flags, missing info, your notes, and more.
4. Original mileage units are preserved. Prices in different currencies are not ranked against each other.

---

## Running Tests

```bash
npm test
```

To watch for changes:

```bash
npm run test:watch
```

> Tests use synthetic fixtures (not live Facebook listings). 47 tests covering phrase detection, mileage, price disambiguation, storage, French language, negation, and XSS safety.

---

## Manual Verification Checklist

After loading the unpacked extension, verify:

- [ ] Extension icon appears in Chrome toolbar
- [ ] On a non-Marketplace page: popup shows landing state with "Enter manually" option
- [ ] On a FB Marketplace listing: "Analyze this listing" button is enabled
- [ ] After analysis: overview fields display, flagged phrases appear in "Items to Review"
- [ ] Questions tab shows relevant questions; "Copy" button works
- [ ] Save listing → status badge appears; re-analyzing the same listing offers "Update saved"
- [ ] Open saved page: listing card shows with all fields
- [ ] Edit listing: change status and notes; confirm they persist after closing
- [ ] Compare: select 2 listings, click Compare, table appears
- [ ] Delete a listing: confirm it's removed
- [ ] Delete all data: confirm empty state appears
- [ ] Manual entry: fill form on a non-FB page, analyze, save, and compare
- [ ] Close Chrome completely, reopen → saved listings are still present

---

## Project Structure

```
dist/               ← Load this as unpacked extension
src/
  content/          ← DOM extractor + phrase highlighter (runs in page context)
  background/       ← Minimal MV3 service worker
  popup/            ← React popup UI
  options/          ← React full-page (saved + compare)
  storage/          ← chrome.storage.local wrapper
  types/            ← Shared TypeScript types
  utils/            ← Question generator, i18n stub
tests/              ← vitest test suite with synthetic fixtures
public/             ← manifest.json + icons (copied to dist on build)
```

---

## Known Limitations & Live-Site Notes

- **Facebook extraction is best-effort**: Facebook's layout uses generated class names and changes frequently. The extractor uses layered strategies (ARIA labels, semantic structure, text patterns) but cannot guarantee 100% accuracy on all listing variations.
- **Tested with fixtures, not live Facebook**: The automated tests use synthetic data. Live Facebook extraction accuracy has not been verified in an automated test environment.
- **No background monitoring**: Price history only builds when you manually save or re-analyze a listing. There is no passive background tracking.
- **SPA navigation**: Navigating between listings via Facebook's single-page routing should work (the popup re-checks the current URL on open), but some edge cases with modal listings may require reopening the popup.
- **French language**: Phrase detection supports common French patterns. Full French UI is planned for a future release.

---

## License

Private / Not published. Do not distribute.
