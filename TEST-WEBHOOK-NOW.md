# 🧪 Test Your Webhook Now

## Quick Test (2 methods)

### Method 1: Stripe Dashboard Test (Fastest)
1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click your webhook endpoint
3. Click "Send test webhook"
4. Select `checkout.session.completed` from the dropdown
5. Click "Send test webhook"
6. Check:
   - Response should show 200 OK
   - Your logs should show `[Stripe Webhook] Processing checkout.session.completed`
   - Note: Test webhooks won't create Supabase records (no real metadata)

### Method 2: Real Test Purchase (Best)
1. Go to your app's billing page
2. Click "Upgrade to Pro"
3. Use test card: `4242 4242 4242 4242`
   - Any future expiry (12/34)
   - Any CVC (123)
   - Any ZIP (12345)
4. Complete the checkout

## What to Check After Test

### 1. Stripe Dashboard
- Go to: https://dashboard.stripe.com/test/webhooks
- Click your endpoint → "Webhook attempts"
- Look for NEW `checkout.session.completed` event
- Should show "200 Success"

### 2. Production Logs
Look for these key log entries:
```
[Stripe Webhook] Processing event: checkout.session.completed
[Stripe Webhook] handleCheckoutCompleted - Session ID: cs_test_xxx
[Stripe Webhook] Processing for user: [your-user-id], plan: pro, cycle: monthly
[Stripe Webhook] Successfully upserted subscription
```

### 3. Supabase Database
Check subscriptions table:
- Should have new record with your user_id
- Status should be "active"
- Should have stripe_subscription_id starting with "sub_"

## If It Still Doesn't Work

Run this diagnostic:
```bash
# Check what events are actually being sent
node test-webhook-production.mjs
```

Then check:
1. ✅ Webhook events include `checkout.session.completed`?
2. ✅ Webhook secret matches (starts with `whsec_`)?
3. ✅ Environment variable is `STRIPE_BILLING_WEBHOOK_SECRET`?
4. ✅ You redeployed after any env changes?

## Expected Result
After a successful test purchase, you should see:
- ✅ Success toast in your app
- ✅ Subscription record in Supabase
- ✅ 200 OK in Stripe webhook attempts
- ✅ Complete logs showing the flow