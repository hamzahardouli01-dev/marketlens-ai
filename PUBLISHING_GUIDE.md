# MarketLens AI — Complete Chrome Web Store Publishing Guide 🚀

This step-by-step guide will take you from local development to live on the **Chrome Web Store** and earning subscription revenue via **Stripe**.

---

## 📋 Overview of What Needs to Happen
1. **Deploy your backend (`server/`) to the cloud** so users worldwide can connect without your local Mac running.
2. **Set the cloud server URL** in the extension.
3. **Build the extension ZIP package** (`npm run release`).
4. **Publish to Google Chrome Web Store**.
5. **Switch Stripe to Live Mode** to collect real credit card payments.

---

## Step 1: Deploy Backend Server to the Cloud (Free & 5 Minutes)

The backend (`server/`) handles Gemini Vision and Stripe subscriptions. It needs to run 24/7 on a cloud host.

### Recommended Host: Render.com (Easiest & Free/Cheap)
1. Go to **[Render.com](https://render.com)** and sign up with GitHub.
2. Push your project to GitHub (or push just the `server/` directory).
3. In Render, click **New +** → **Web Service**.
4. Connect your repository.
5. Set the settings:
   - **Name:** `marketlens-server`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
6. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`: *(Your Google Gemini API Key)*
   - `STRIPE_SECRET_KEY`: *(Your Stripe Secret Key — start with `sk_test_...` or use `sk_live_...` when live)*
   - `STRIPE_WEBHOOK_SECRET`: *(From Stripe Webhook section)*
7. Click **Create Web Service**.
8. Render will provide a free HTTPS URL like:
   `https://marketlens-server.onrender.com`

*(Alternative hosts: [Railway.app](https://railway.app) or [Fly.io](https://fly.io) with the exact same build & start commands).*

---

## Step 2: Point Extension to Your Cloud Server

1. Open [src/services/backendApi.ts](file:///Users/hamzahardouli/Documents/plugij/src/services/backendApi.ts).
2. Change line 15 from:
   ```typescript
   export const DEFAULT_BACKEND_URL = 'http://localhost:3001';
   ```
   To your new cloud URL:
   ```typescript
   export const DEFAULT_BACKEND_URL = 'https://marketlens-server.onrender.com';
   ```

---

## Step 3: Package Extension for Chrome Web Store

Run the release script in your project root:
```bash
npm run release
```

This automatically:
- Checks TypeScript types
- Generates all retina icons (16px, 32px, 48px, 128px)
- Compiles the React UI and standalone content scripts
- Bundles everything into **`marketlens-ai-v1.0.0.zip`** in your project folder!

---

## Step 4: Submit to Google Chrome Web Store

### 1. Developer Account Registration
1. Go to the **[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)**.
2. Sign in with your Google account.
3. Pay the one-time Google registration fee ($5).

### 2. Upload Your Extension
1. Click **+ Add new item**.
2. Drag and drop your **`marketlens-ai-v1.0.0.zip`** file.

### 3. Store Listing Information
Copy and paste directly from [STORE_DESCRIPTION.md](file:///Users/hamzahardouli/Documents/plugij/STORE_DESCRIPTION.md):
- **Name:** `MarketLens AI — Smart Buying Assistant`
- **Summary (132 chars):**
  > AI deal appraisal with Gemini Vision. Compares retail MSRP vs used market price, inspects photos for flaws & scores resale flip profit.
- **Description:** *(Copy the full formatted markdown text from [STORE_DESCRIPTION.md](file:///Users/hamzahardouli/Documents/plugij/STORE_DESCRIPTION.md))*
- **Category:** `Shopping` or `Productivity`
- **Language:** `English`

### 4. Visual Graphic Assets
Google requires a few images to display your extension in the store:
- **Screenshots:** At least 1 screenshot of MarketLens running on Facebook Marketplace or eBay:
  - Resolution: **1280 x 800 px** or **640 x 400 px**.
- **Small Promo Tile:** **440 x 280 px** (App title + logo badge).

### 5. Privacy Practices Tab
- **Single Purpose Description:**
  > "MarketLens AI helps shoppers assess the fairness and condition of secondhand marketplace listings using AI-driven price comparisons, visual flaw inspection, and deal scoring."
- **Permissions Justification:**
  - `activeTab` / `scripting`: Needed to display the slide-out appraisal drawer on marketplace listing pages.
  - `storage`: Needed to remember your remaining free appraisal quota and subscription preferences locally.
  - `host_permissions` (`https://*/*`): Needed to communicate with the MarketLens backend API for AI valuations.
- **Privacy Policy URL:**
  Upload [PRIVACY_POLICY.md](file:///Users/hamzahardouli/Documents/plugij/PRIVACY_POLICY.md) to GitHub Pages, Notion, or your website and paste the public URL.

---

## Step 5: Switch Stripe to Live Mode (Collect Real Money)

When you're ready to charge real credit cards:
1. In your **[Stripe Dashboard](https://dashboard.stripe.com)**, toggle the switch from **Test mode** to **Live mode** (top right).
2. Go to **Developers** → **API Keys**.
3. Copy your live secret key: `sk_live_...`
4. Update `STRIPE_SECRET_KEY` in your Render cloud environment variables.
5. In Stripe Dashboard → **Developers** → **Webhooks**:
   - Click **Add an endpoint**.
   - URL: `https://your-server.onrender.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`.
   - Copy the Signing Secret (`whsec_...`) into your cloud environment variable `STRIPE_WEBHOOK_SECRET`.

---

## Step 6: Click "Submit for Review"

In the Chrome Web Store Developer Console, click **Submit for Review**.
Google typically approves extensions within **24 to 72 hours**. Once approved, MarketLens AI will be live for anyone in the world to install! 🎉
