# 🚨 Stripe Webhook Not Saving - Quick Fix Guide

## Immediate Steps to Fix

### 1. Test Your Setup (Run These Now)
```bash
# Test Supabase connection and webhook endpoint
node test-webhook-production.mjs

# Send a test webhook manually
node test-manual-webhook.mjs
```

### 2. Add Temporary Logging Webhook in Stripe
While debugging, add this endpoint to Stripe Dashboard:
- **URL**: `https://chainreact.app/api/webhooks/stripe-log`
- **Events**: Select `checkout.session.completed`
- This logs WITHOUT signature verification - helps identify if webhooks are arriving

### 3. Check These in Stripe Dashboard

Go to: https://dashboard.stripe.com/test/webhooks

1. **Verify Endpoint URL is EXACTLY**:
   ```
   https://chainreact.app/api/webhooks/stripe-billing
   ```
   (Not `/stripe`, not `/webhook`, must be `/stripe-billing`)

2. **Copy the Signing Secret**:
   - Click on your webhook endpoint
   - Click "Reveal" under Signing secret
   - Copy the `whsec_xxx` value

3. **Check Webhook Attempts**:
   - Click "Webhook attempts" tab
   - Look for recent attempts
   - Check status codes:
     - ✅ 200 = Success
     - ❌ 400 = Signature mismatch
     - ❌ 500 = Server error
     - ⚠️ No attempts = URL wrong

### 4. Update Production Environment Variables

In Vercel/your hosting platform, ensure these are set:
```env
STRIPE_SECRET_KEY=sk_live_xxx (or sk_test_xxx)
STRIPE_BILLING_WEBHOOK_SECRET=whsec_xxx (from step 3)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 5. Common Issues & Quick Fixes

#### "No webhook attempts showing"
- **Fix**: URL is wrong. Must be `https://chainreact.app/api/webhooks/stripe-billing`

#### "400 Bad Request"
- **Fix**: Webhook secret mismatch. Copy from Stripe Dashboard, update `STRIPE_BILLING_WEBHOOK_SECRET`

#### "500 Internal Server Error"
- **Fix**: Check production logs for `[Stripe Billing Webhook]` errors

#### "200 Success but no data"
- **Fix**: Metadata missing. The checkout has been updated to include:
  - user_id
  - user_email (backup)
  - plan_id
  - billing_cycle

### 6. Emergency Manual Fix

If you need to manually add a subscription NOW:

1. Get the subscription ID from Stripe Dashboard
2. Get the user ID from your database
3. Run in Supabase SQL editor:

```sql
INSERT INTO subscriptions (
  user_id,
  plan_id,
  stripe_customer_id,
  stripe_subscription_id,
  status,
  billing_cycle,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
) VALUES (
  'YOUR-USER-UUID-HERE',
  'pro',
  'cus_xxx', -- from Stripe
  'sub_xxx', -- from Stripe
  'active',
  'monthly', -- or 'yearly'
  NOW(),
  NOW() + INTERVAL '1 month', -- or '1 year'
  NOW(),
  NOW()
);
```

## What We Fixed

1. **Enhanced webhook handler** with:
   - Better logging
   - Fallback to email lookup if no user_id
   - Minimal record creation on errors
   - Default values for missing fields

2. **Checkout session** now includes:
   - Metadata on both session AND subscription
   - User email as backup identifier
   - Extra logging for debugging

3. **New debugging tools**:
   - `/api/webhooks/stripe-log` - Logs all webhooks without verification
   - `test-webhook-production.mjs` - Tests your setup
   - `test-manual-webhook.mjs` - Sends test webhooks

## Next Steps After Fix

1. Remove the logging webhook from Stripe Dashboard (security)
2. Monitor production logs for successful webhooks
3. Check Supabase subscriptions table for new records

## Still Not Working?

Run this checklist:
- [ ] Webhook URL ends with `/stripe-billing` (not `/stripe`)
- [ ] Webhook secret starts with `whsec_`
- [ ] Environment variable is `STRIPE_BILLING_WEBHOOK_SECRET`
- [ ] Redeployed after updating environment variables
- [ ] Stripe Dashboard shows webhook attempts
- [ ] Production logs show `[Stripe Billing Webhook]` entries

If all above are checked and still not working, the issue is likely:
- Supabase RLS policies blocking inserts
- Missing columns in subscriptions table
- Network/firewall blocking webhooks