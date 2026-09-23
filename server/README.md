# MarketLens AI — Production Backend Server

The official zero-setup backend for **MarketLens AI**. Securely manages Gemini 2.5 Flash appraisals, anonymous user quotas, and Stripe subscriptions.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in:
- `GEMINI_API_KEY`: Get your free key from [Google AI Studio](https://aistudio.google.com/).
- `STRIPE_SECRET_KEY`: Get test key from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys).
- `STRIPE_WEBHOOK_SECRET`: (Optional for local testing) from `stripe listen --forward-to localhost:3001/api/stripe/webhook`.

### 3. Run Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3001`.

---

## 🌐 1-Click Deployment Options

### Deploy to Render (Recommended Free/Low Cost)
1. Push your repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) > **New Web Service**.
3. Select this repo, set **Root Directory** to `server`.
4. Build Command: `npm install && npm run build`
5. Start Command: `npm run start`
6. Add Environment Variables: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
7. Copy your deployed Render URL (e.g., `https://marketlens-api.onrender.com`) into the extension settings or backend config!

### Deploy to Railway
1. Go to [Railway.app](https://railway.app/).
2. Select **New Project** > **Deploy from GitHub repo**.
3. Set root directory to `/server`.
4. Add environment variables.

---

## 💳 Stripe Webhook Setup
To automatically upgrade users to Pro upon successful payment:
1. In Stripe Dashboard > **Developers** > **Webhooks** > **Add destination**.
2. URL: `https://your-server-url.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the Signing Secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
