# Update Stripe Webhook Events

Your webhook is now configured to store both subscriptions and invoices. To fully track payment history, you should add these events to your Stripe webhook configuration:

## Current Events (Working)
✅ `checkout.session.completed` - Handles initial subscription creation

## Additional Events to Add
Add these in your Stripe Dashboard at:
https://dashboard.stripe.com/webhooks/[your-webhook-id]

1. **`invoice.payment_succeeded`** - Records successful payments (recurring charges)
2. **`invoice.payment_failed`** - Tracks failed payment attempts  
3. **`customer.subscription.updated`** - Updates subscription status changes
4. **`customer.subscription.deleted`** - Marks subscriptions as canceled

## Why Both Tables?

### Subscriptions Table
- **Current subscription state** - Active, canceled, past_due
- **Access control** - Check if user has active subscription
- **Plan management** - Current plan, billing cycle
- **Quick lookups** - One row per user subscription

### Invoices Table  
- **Payment history** - All successful and failed charges
- **Financial records** - For accounting and taxes
- **Receipts** - Historical record even after cancellation
- **Audit trail** - Complete billing history

## Summary
The webhook is now ready to:
- ✅ Create subscription records on checkout
- ✅ Store invoice records for payment history
- ✅ Handle both initial and recurring payments
- ✅ Track failed payments

Once you add the additional webhook events, you'll have complete billing tracking!