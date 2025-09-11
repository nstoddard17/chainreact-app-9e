# Stripe Webhooks Setup Guide

## Overview
ChainReact uses TWO separate Stripe webhook endpoints:

1. **Billing Webhook** - For ChainReact subscription payments
2. **Integration Webhook** - For customer workflow triggers

## Webhook Endpoints

### 1. Billing Webhook (Your Business)
- **Endpoint URL**: 
  - Production: `https://chainreact.app/api/webhooks/stripe-billing`
  - Alternative: `https://chainreact.app/api/webhooks/stripe` (backwards compatible)
- **Environment Variable**: `STRIPE_BILLING_WEBHOOK_SECRET`
- **Purpose**: Handles your business subscriptions (Pro plans, etc.)
- **Events to Subscribe**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### 2. Integration Webhook (Customer Workflows)
- **Endpoint URL**: `https://chainreact.app/api/webhooks/stripe-integration`
- **Environment Variable**: `STRIPE_INTEGRATION_WEBHOOK_SECRET`
- **Purpose**: Triggers customer workflows based on their Stripe events
- **Events to Subscribe**: All events that customers might want to trigger workflows from:
  - `payment_intent.succeeded`
  - `payment_intent.failed`
  - `charge.succeeded`
  - `charge.failed`
  - `customer.created`
  - `customer.updated`
  - `invoice.paid`
  - `subscription.created`
  - `subscription.updated`
  - etc.

## Environment Variables Setup

Add these to your `.env.local` file:

```bash
# Your business Stripe account (for ChainReact billing)
STRIPE_SECRET_KEY="sk_test_..." # Your Stripe secret key
STRIPE_PUBLISHABLE_KEY="pk_test_..." # Your Stripe publishable key
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..." # From Stripe Dashboard for billing endpoint

# For customer Stripe integrations (workflow triggers)
STRIPE_INTEGRATION_WEBHOOK_SECRET="whsec_..." # From Stripe Dashboard for integration endpoint
```

## Stripe Dashboard Configuration

### Setting up Billing Webhook:
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter endpoint URL: `https://chainreact.app/api/webhooks/stripe-billing`
4. Select events (see list above)
5. Copy the signing secret → Set as `STRIPE_BILLING_WEBHOOK_SECRET`

### Setting up Integration Webhook:
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter endpoint URL: `https://chainreact.app/api/webhooks/stripe-integration`
4. Select events (see list above)
5. Copy the signing secret → Set as `STRIPE_INTEGRATION_WEBHOOK_SECRET`

## Local Development Testing

### For Billing Webhook:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe-billing
# Copy the webhook signing secret and use as STRIPE_BILLING_WEBHOOK_SECRET
```

### For Integration Webhook:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe-integration
# Copy the webhook signing secret and use as STRIPE_INTEGRATION_WEBHOOK_SECRET
```

## Testing Webhooks

### Test Billing Webhook:
```bash
stripe trigger checkout.session.completed
```

### Test Integration Webhook:
```bash
stripe trigger payment_intent.succeeded
```

## Verification in Logs

You should see different log prefixes:
- `[Stripe Billing Webhook]` - For billing events
- `[Stripe Integration Webhook]` - For workflow trigger events

## Backwards Compatibility

The original `/api/webhooks/stripe` endpoint still works and will:
1. First check for `STRIPE_BILLING_WEBHOOK_SECRET`
2. Fall back to `STRIPE_WEBHOOK_SECRET` if not found

This ensures existing setups continue working while you migrate.

## Migration Steps

1. Add new environment variables
2. Update Stripe Dashboard webhooks
3. Test both endpoints
4. Monitor logs to ensure events are being received
5. Once confirmed working, you can remove old `STRIPE_WEBHOOK_SECRET`

## Troubleshooting

### Events not showing in Supabase:
1. Check webhook endpoint is accessible
2. Verify webhook secret matches
3. Check Stripe Dashboard → Webhooks → View webhook attempts
4. Look for errors in server logs
5. Ensure required events are selected in Stripe Dashboard

### Signature Verification Failing:
1. Make sure you're using the correct webhook secret for each endpoint
2. Don't mix up billing and integration secrets
3. For local testing, ensure you're using the secret from Stripe CLI

### Database Not Updating:
1. Check Supabase connection
2. Verify table permissions
3. Check for required fields in tables
4. Look for error logs in webhook handlers