# Privacy Policy — CarListing Lens

**Last updated: September 2026**

---

## Summary

CarListing Lens is a browser extension that helps you analyze, save, and compare used-car listings. It operates **entirely locally** — no data is ever sent to any server, no account is required, and no third-party services are used.

---

## Data Collected and How It Is Used

| What | Where stored | Purpose |
|------|-------------|---------|
| Extracted listing data (title, price, mileage, description, etc.) | `chrome.storage.local` on your device | Allows you to save, view, and compare listings |
| Your personal notes and status labels | `chrome.storage.local` on your device | Persists your notes between browser sessions |
| Price snapshots with timestamps | `chrome.storage.local` on your device | Shows price history for listings you have saved |

**No data is transmitted off your device.** There is no server, no cloud sync, no analytics, no telemetry, and no account registration.

---

## Permissions Used

| Permission | Why it is needed |
|-----------|----------------|
| `activeTab` | Allows the extension to read the content of the tab you are actively viewing, only when you click the extension icon |
| `scripting` | Required by Chrome MV3 to inject the content script into the active tab on demand |
| `storage` | Allows saving listing data to `chrome.storage.local` on your device |

The extension does **not** use:
- Broad host permissions (`<all_urls>` beyond web-accessible resources)
- `tabs` or `history` permissions
- Network access to any external URL
- `identity` or `cookies` permissions

---

## How Extraction Works

When you click "Analyze this listing," the extension reads the visible page content of the Facebook Marketplace listing you are viewing. It extracts structured information (price, mileage, description, etc.) from the DOM.

- **Extraction only happens after your explicit action** (clicking the Analyze button).
- **No background crawling or monitoring** occurs.
- Extraction is limited to the listing page you are viewing; the extension does not read suggested listings, your Facebook feed, messages, or any other pages.

---

## Listing Text as Untrusted Input

Seller-provided descriptions are treated as untrusted text. They are stored as plain strings and rendered safely by React (which escapes HTML by default), preventing cross-site scripting (XSS) attacks.

---

## Data Deletion

You can delete your data at any time:
- **Delete one listing**: Click "🗑" on any saved listing card.
- **Delete all data**: Use the "Delete all" button at the bottom of the Saved Vehicles page.
- **Browser-level deletion**: Go to `chrome://extensions` → CarListing Lens → "Remove extension" to delete all stored data along with the extension.

---

## Children's Privacy

This extension is not directed at children. No personal information of any kind is collected.

---

## Changes to This Policy

If the extension's data practices change in a future version, this document will be updated and the version number will be incremented.

---

## Contact

This is an open-source / personal project. For questions, open an issue in the project repository.
