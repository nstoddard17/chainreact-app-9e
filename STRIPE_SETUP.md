# Stripe Billing Setup Guide

This guide will help you set up Stripe for the billing system in ChainReact.

## Prerequisites

- Stripe account (create one at https://stripe.com)
- Access to your Supabase database
- Environment variables configured

## Step 1: Set Up Stripe Products and Prices

### 1.1 Create the Pro Product in Stripe Dashboard

1. Go to https://dashboard.stripe.com/products
2. Click "Add product"
3. Configure the product:
   - **Name**: ChainReact Pro
   - **Description**: Advanced features for professionals and growing teams
   - **Image**: (optional) Add your product image

### 1.2 Create Pricing for the Product

1. In the product page, click "Add price"
2. Create Monthly Price:
   - **Pricing model**: Standard pricing
   - **Price**: $20.00
   - **Billing period**: Monthly
   - Save and note the Price ID (starts with `price_`)

3. Create Annual Price:
   - Click "Add another price"
   - **Pricing model**: Standard pricing
   - **Price**: $180.00 
   - **Billing period**: Yearly
   - Save and note the Price ID (starts with `price_`)

## Step 2: Configure Environment Variables

Add these to your `.env.local` file:

```env
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_... # Your publishable key from Stripe Dashboard
STRIPE_SECRET_KEY=sk_test_...      # Your secret key from Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_...    # Will get this after setting up webhook

# App URL (needed for redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Change to your production URL when deploying
```

## Step 3: Set Up Database

### 3.1 Run the SQL Script

Execute the SQL script to set up your plans in Supabase:

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `/scripts/seed-billing-plans.sql`
4. Update the Stripe price IDs in the script:
   - Replace `price_XXXXX` with your monthly price ID
   - Replace `price_YYYYY` with your yearly price ID
5. Run the script

### 3.2 Verify Database Setup

Check that the following tables exist and have data:
- `plans` - Should have 2 rows (Free and Pro)
- `subscriptions` - Will store user subscriptions

## Step 4: Set Up Stripe Webhook

### 4.1 For Local Development

Use Stripe CLI to forward webhooks to your local server:

```bash
# Install Stripe CLI (if not already installed)
# Mac: brew install stripe/stripe-cli/stripe
# Windows: Download from https://github.com/stripe/stripe-cli/releases

# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/billing/webhooks

# Copy the webhook signing secret (starts with whsec_)
# Add it to your .env.local as STRIPE_WEBHOOK_SECRET
```

### 4.2 For Production

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Configure:
   - **Endpoint URL**: `https://your-domain.com/api/billing/webhooks`
   - **Events to send**: Select these events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Copy the signing secret and add to your production environment variables

## Step 5: Install Required Packages

Make sure you have the Stripe package installed:

```bash
npm install stripe
```

## Step 6: Test the Integration

### 6.1 Test Checkout Flow

1. Start your development server: `npm run dev`
2. Navigate to Settings → Billing
3. Click "Select Pro" on the Pro plan
4. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
5. Complete the checkout
6. Verify you're redirected back and see the success message

### 6.2 Test Webhook

With Stripe CLI running, the webhook should process the subscription:
- Check your Supabase database - the `subscriptions` table should be updated
- The UI should show your Pro subscription status

## Step 7: Production Deployment

Before going live:

1. **Switch to Live Mode in Stripe**:
   - Create live products and prices
   - Update environment variables with live keys
   - Update database with live price IDs

2. **Update Environment Variables**:
   ```env
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_APP_URL=https://your-production-domain.com
   ```

3. **Set Up Production Webhook**:
   - Add production endpoint URL
   - Update STRIPE_WEBHOOK_SECRET

4. **Test with Real Payment**:
   - Make a small test purchase
   - Verify webhook processing
   - Check subscription status updates

## Troubleshooting

### Common Issues

1. **"STRIPE_NOT_CONFIGURED" Error**:
   - Ensure STRIPE_SECRET_KEY is set in environment variables
   - Restart your development server after adding env variables

2. **Webhook Not Processing**:
   - Check Stripe CLI is running (for local development)
   - Verify STRIPE_WEBHOOK_SECRET is correct
   - Check webhook endpoint URL is accessible

3. **Checkout Not Working**:
   - Verify price IDs are correctly set in database
   - Check browser console for errors
   - Ensure user is authenticated

4. **Subscription Not Updating**:
   - Check Supabase RLS policies allow subscription updates
   - Verify webhook events are being received (check Stripe Dashboard)
   - Check server logs for errors

## Support

For issues or questions:
- Check Stripe documentation: https://stripe.com/docs
- Review Supabase docs: https://supabase.com/docs
- Check application logs for detailed error messages