# Webhook Debugging Checklist

## 🔍 Quick Diagnosis Steps

### 1. Check Stripe Dashboard
Go to: https://dashboard.stripe.com/test/webhooks (or /live for production)
- Click on your webhook endpoint
- Check "Webhook attempts" tab
- Look for:
  - ✅ Success (200 status)
  - ❌ Failed attempts (4xx or 5xx status)
  - ⚠️ No attempts (webhook not triggered)

### 2. Common Issues & Solutions

#### Issue: "No webhook attempts showing"
**Cause**: Webhook endpoint URL is wrong or not configured
**Solution**: 
- Verify URL in Stripe Dashboard matches your deployment
- Should be: `https://chainreact.app/api/webhooks/stripe-billing`
- Or: `https://chainreact.app/api/webhooks/stripe`

#### Issue: "400 Bad Request - Invalid signature"
**Cause**: Webhook secret mismatch
**Solution**:
1. Copy webhook signing secret from Stripe Dashboard
2. Update in Vercel/deployment environment:
   - `STRIPE_BILLING_WEBHOOK_SECRET="whsec_xxx"`
   - Or `STRIPE_WEBHOOK_SECRET="whsec_xxx"`
3. Redeploy

#### Issue: "500 Internal Server Error"
**Cause**: Database connection or table issues
**Solution**:
1. Run: `node test-supabase-insert.mjs`
2. Check if tables exist in Supabase
3. Verify environment variables in production

#### Issue: "200 Success but no data in Supabase"
**Cause**: Silent failures in webhook handler
**Solution**:
1. Check production logs (Vercel Functions logs)
2. Look for `[Stripe Billing Webhook]` entries
3. Check for missing metadata (user_id, plan_id)

### 3. Test Your Webhook Endpoint

#### Test if endpoint is accessible:
```bash
curl -X GET https://chainreact.app/api/webhooks/stripe-test
```

#### Test webhook processing:
```bash
curl -X POST https://chainreact.app/api/webhooks/stripe-test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### 4. Verify Environment Variables

In your production environment (Vercel, etc.), ensure these are set:
```
STRIPE_SECRET_KEY=sk_live_xxx (or sk_test_xxx for test mode)
STRIPE_BILLING_WEBHOOK_SECRET=whsec_xxx (from Stripe Dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 5. Check Metadata in Checkout Session

The checkout session MUST include:
```javascript
metadata: {
  user_id: "actual-user-id",
  plan_id: "pro",
  billing_cycle: "monthly"
}
```

### 6. Database Tables Required

Ensure these tables exist in Supabase:

#### subscriptions table:
- user_id (uuid)
- plan_id (text)
- stripe_customer_id (text)
- stripe_subscription_id (text, unique)
- status (text)
- billing_cycle (text)
- current_period_start (timestamp)
- current_period_end (timestamp)
- And all the additional fields we added

#### invoices table:
- stripe_invoice_id (text, unique)
- user_id (uuid)
- amount_paid (numeric)
- status (text)
- And all the additional fields we added

### 7. Manual Test in Production

1. Go to Stripe Dashboard → Webhooks
2. Click your endpoint
3. Click "Send test webhook"
4. Select `checkout.session.completed`
5. Send test
6. Check:
   - Response status in Stripe
   - Server logs
   - Supabase tables

### 8. Production Logs

Check your hosting provider's logs:
- **Vercel**: Dashboard → Functions → Logs
- **Railway**: Dashboard → Deployments → Logs
- **Heroku**: `heroku logs --tail`

Look for:
- `[Stripe Billing Webhook]` entries
- Error messages
- Supabase connection errors

### 9. Quick Fix Commands

#### Re-trigger failed webhooks:
```bash
# In Stripe Dashboard
# Webhooks → Select endpoint → Webhook attempts → Resend
```

#### Test with Stripe CLI:
```bash
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.user_id=test-user-id \
  --add checkout_session:metadata.plan_id=pro \
  --add checkout_session:metadata.billing_cycle=monthly
```

### 10. Emergency Fallback

If webhooks aren't working, manually create subscription:
1. Get Stripe subscription ID from Dashboard
2. Run in Supabase SQL editor:
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
  created_at
) VALUES (
  'user-uuid-here',
  'pro',
  'cus_xxx',
  'sub_xxx',
  'active',
  'monthly',
  NOW(),
  NOW() + INTERVAL '1 month',
  NOW()
);