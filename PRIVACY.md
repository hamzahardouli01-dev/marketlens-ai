# Privacy Policy for MarketLens AI

**Last Updated:** October 2026

MarketLens AI ("we", "our", or "the Extension") respects your privacy. This Privacy Policy describes how MarketLens AI handles information when you use our browser extension and backend services.

---

## 1. Information We Collect

### A. Listing Data for Appraisals
When you click **"Analyze deal"** on a marketplace listing (Facebook Marketplace, eBay, Craigslist), MarketLens AI extracts:
- Public listing title
- Asking price & currency
- Seller's public item description
- Public listing photos

This information is processed solely for the purpose of generating the AI appraisal, condition inspection, and price comparison requested by you.

### B. Anonymous Usage & Quota Identifier
We assign an anonymous random UUID (e.g., `usr_xxxx`) stored locally in your browser (`chrome.storage.sync` or `chrome.storage.local`) to count free appraisals and link your MarketLens Pro subscription. We do **not** collect your name, physical address, browsing history, or personal identity unless you provide an email during Stripe Checkout.

### C. Payment & Billing Information
Subscription payments are processed directly by **Stripe**. We do **not** store or have access to your credit card numbers or banking credentials. Stripe handles all financial data under [Stripe's Privacy Policy](https://stripe.com/privacy).

### D. Data Stored Only on Your Device
To make saved listings, price-drop alerts and instant re-opening of past analyses work, MarketLens AI keeps the following in your browser's local extension storage (`chrome.storage.local`):
- Listings you choose to save, with their analysis, the prices observed when you revisit them, and any status or notes you add
- Your most recent analyses (up to 60), without listing photos

This data never leaves your device and is not sent to our servers. You can delete it at any time from **Settings → Analysis history → Clear** in the drawer, or **Delete all** on the Saved listings page. Uninstalling the extension also removes it.

---

## 2. What We Do NOT Collect
- We do **NOT** track or record your general web browsing history.
- We do **NOT** inspect, read, or access your social media feed, private messages, personal profile, friends list, or unrelated web pages.
- We do **NOT** sell, rent, or monetize your personal information or data to third-party data brokers or advertisers.

---

## 3. How Information is Used
The extracted listing context is sent securely (via HTTPS) to our backend service to query Google Gemini Vision models (with real-time Google Search grounding) to produce your deal appraisal. The data is only used to generate the requested analysis.

---

## 4. Data Security
All communication between the Chrome extension and our backend server is encrypted using industry-standard Transport Layer Security (TLS/HTTPS).

---

## 5. Contact & Support
If you have any questions or feedback regarding this Privacy Policy, please contact:
- **Email:** support@marketlens.ai
