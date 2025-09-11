# Stripe Quick Setup Guide

## Required Environment Variables

Add these to your `.env.local` file:

```env
# Stripe Configuration (REQUIRED)
STRIPE_SECRET_KEY=sk_test_...           # Your Stripe secret key
STRIPE_PUBLISHABLE_KEY=pk_test_...      # Your Stripe publishable key  
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret (for production)

# App URL (REQUIRED for redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Change to your production URL when deploying
```

## Step-by-Step Setup

### 1. Get Your Stripe Keys

1. Go to https://dashboard.stripe.com/apikeys
2. Copy your test keys:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`)
3. Add them to your `.env.local` file

### 2. Create Products and Prices in Stripe

1. Go to https://dashboard.stripe.com/products
2. Click "Add product"
3. Create the Pro product:
   - **Name**: ChainReact Pro
   - **Description**: Advanced features for professionals and growing teams

4. Add pricing:
   - **Monthly Price**: 
     - Amount: $20.00
     - Billing period: Monthly
     - Copy the price ID (starts with `price_`)
   
   - **Annual Price**:
     - Amount: $180.00 (or $15/month)
     - Billing period: Yearly  
     - Copy the price ID (starts with `price_`)

### 3. Update Your Database

#### Option A: Using SQL (Easiest)

1. Go to your Supabase SQL Editor
2. Run this query (replace the price IDs):

```sql
UPDATE plans 
SET 
  stripe_price_id_monthly = 'price_YOUR_MONTHLY_ID_HERE',
  stripe_price_id_yearly = 'price_YOUR_ANNUAL_ID_HERE'
WHERE name = 'Pro';
```

#### Option B: Using the Script

1. Edit `scripts/update-stripe-prices.ts`
2. Replace the placeholder price IDs with your actual ones
3. Run: `npx ts-node scripts/update-stripe-prices.ts`

### 4. Test Your Setup

1. Restart your dev server: `npm run dev`
2. Go to Settings → Billing
3. Click "Upgrade to Pro"
4. Use test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC
   - Any ZIP code

## Troubleshooting

### Error: "Stripe price IDs not configured"
- You need to update the database with real Stripe price IDs (see Step 3)

### Error: "STRIPE_NOT_CONFIGURED"  
- Add `STRIPE_SECRET_KEY` to your `.env.local` file
- Restart your development server

### Error: "Unauthorized"
- Make sure you're logged in
- Try signing out and back in

### Stuck on "Processing..."
- Check browser console for errors
- Verify all environment variables are set
- Make sure Stripe price IDs are updated in database

## Current Status

✅ **Fixed Issues:**
- Authentication now properly sent to billing API
- Stripe initialization moved inside request handler with error handling
- Added timeout to prevent indefinite hanging

❌ **Remaining Setup:**
- You need to create Stripe products and get real price IDs
- Update the database with these price IDs

## Test vs Production

Currently using **test keys** (sk_test_...). For production:
1. Get live keys from Stripe Dashboard
2. Update all environment variables with live keys
3. Create live products and prices
4. Update database with live price IDs