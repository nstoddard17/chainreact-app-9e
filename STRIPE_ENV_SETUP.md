# Stripe Environment Variables Setup

## Required Environment Variables

Add ALL of these to your `.env.local` file:

```env
# STRIPE CONFIGURATION (ALL REQUIRED)
# =====================================

# 1. Secret Key (REQUIRED)
# Get from: https://dashboard.stripe.com/apikeys
# Make sure it matches your price IDs (test vs live)
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE

# 2. Publishable Key (OPTIONAL but recommended)
# Get from: https://dashboard.stripe.com/apikeys
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE

# 3. Webhook Secret (REQUIRED for production, optional for testing)
# Get this after setting up webhooks in Stripe Dashboard
# For local testing, use Stripe CLI: stripe listen --forward-to localhost:3000/api/billing/webhooks
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# 4. App URL (REQUIRED)
# This is used for redirect URLs after checkout
# For local development:
NEXT_PUBLIC_APP_URL=http://localhost:3000
# For production, change to your actual domain:
# NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## IMPORTANT: Test vs Live Mode

The error `No such price: 'price_1S5T7fE0kRcRLm9RMhTf19VJ'` usually means one of these:

### 1. Mode Mismatch
- Your price ID starts with `price_1S5T...` which is a LIVE mode price
- But your secret key starts with `sk_test_` which is TEST mode
- **They must match!**

### Solution A: Use Test Mode (Recommended for Development)
1. Create products in TEST mode: https://dashboard.stripe.com/test/products
2. Use test keys (sk_test_... and pk_test_...)
3. Price IDs will work with test keys

### Solution B: Use Live Mode (For Production)
1. Create products in LIVE mode: https://dashboard.stripe.com/products
2. Use live keys (sk_live_... and pk_live_...)
3. Price IDs will work with live keys

## Quick Diagnostic

Run this checklist:

1. **Check your secret key**:
   - `sk_test_...` = TEST mode
   - `sk_live_...` = LIVE mode

2. **Check where you created the products**:
   - URL has `/test/` = TEST mode products
   - URL without `/test/` = LIVE mode products

3. **They MUST match**:
   - Test keys + Test products ✅
   - Live keys + Live products ✅
   - Test keys + Live products ❌ (This causes your error!)
   - Live keys + Test products ❌

## Fix for Your Specific Case

Since your price ID (`price_1S5T7fE0kRcRLm9RMhTf19VJ`) appears to be a LIVE mode price:

### Option 1: Switch to Live Keys (Not recommended for development)
```env
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_KEY_HERE
```

### Option 2: Create New Test Products (Recommended)
1. Go to https://dashboard.stripe.com/test/products
2. Create new products in TEST mode
3. Update your database with the new TEST price IDs

## Verify Your Setup

After setting environment variables, restart your dev server:
```bash
npm run dev
```

Then check the API logs when you click "Upgrade to Pro". You should see:
- `[Checkout API] Stripe configured`
- `[Checkout API] Creating Stripe session with price ID: price_...`

If you still get "No such price", the price ID and API key modes don't match!