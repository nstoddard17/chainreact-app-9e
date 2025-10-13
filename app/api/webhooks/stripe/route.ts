import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

import { logger } from '@/lib/utils/logger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil",
})

// This webhook handles billing events for ChainReact subscriptions
// Use /api/webhooks/stripe-integration for workflow triggers
const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  logger.debug("[Stripe Billing Webhook] Received billing webhook request")
  
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    logger.debug(`[Stripe Webhook] Event type: ${event.type}, ID: ${event.id}`)
  } catch (error: any) {
    logger.error("[Stripe Webhook] Signature verification failed:", error.message)
    return errorResponse("Invalid signature" , 400)
  }

  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    logger.debug(`[Stripe Webhook] Processing event: ${event.type}`)
    
    switch (event.type) {
      case "checkout.session.completed":
        logger.debug("[Stripe Webhook] Processing checkout.session.completed")
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase, stripe)
        break

      case "customer.subscription.created":
        logger.debug("[Stripe Webhook] Processing customer.subscription.created")
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.updated":
        logger.debug("[Stripe Webhook] Processing customer.subscription.updated")
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.deleted":
        logger.debug("[Stripe Webhook] Processing customer.subscription.deleted")
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
        break

      case "invoice.payment_succeeded":
        logger.debug("[Stripe Webhook] Processing invoice.payment_succeeded")
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase)
        break

      case "invoice.payment_failed":
        logger.debug("[Stripe Webhook] Processing invoice.payment_failed")
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase)
        break

      default:
        logger.debug(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    logger.debug(`[Stripe Webhook] Successfully processed event: ${event.type}`)
    return jsonResponse({ received: true })
  } catch (error: any) {
    logger.error("[Stripe Webhook] Handler error:", error)
    logger.error("[Stripe Webhook] Error details:", JSON.stringify(error, null, 2))
    return errorResponse("Webhook handler failed", 500, { details: error.message  })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, supabase: any, stripeClient: Stripe) {
  logger.debug("[Stripe Webhook] handleCheckoutCompleted - Session ID:", session.id)
  logger.debug("[Stripe Webhook] Session metadata:", JSON.stringify(session.metadata, null, 2))
  
  const userId = session.metadata?.user_id
  const planId = session.metadata?.plan_id
  const billingCycle = session.metadata?.billing_cycle

  if (!userId || !planId) {
    logger.error("[Stripe Webhook] Missing userId or planId in session metadata")
    logger.error("Metadata received:", session.metadata)
    return
  }

  logger.debug(`[Stripe Webhook] Processing for user: ${userId}, plan: ${planId}, cycle: ${billingCycle}`)

  // Get the full subscription details from Stripe
  const subscription = await stripeClient.subscriptions.retrieve(session.subscription as string, {
    expand: ['default_payment_method', 'latest_invoice', 'discount']
  })

  logger.debug("[Stripe Webhook] Retrieved subscription:", subscription.id)

  // Extract comprehensive subscription data
  const subscriptionData = {
    user_id: userId,
    plan_id: planId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    billing_cycle: billingCycle || 'monthly',
    
    // Period dates
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    
    // Pricing details
    price_id: subscription.items.data[0]?.price.id,
    unit_amount: subscription.items.data[0]?.price.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : null,
    currency: subscription.items.data[0]?.price.currency || 'usd',
    
    // Trial information
    trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    
    // Discount/coupon info
    discount_percentage: subscription.discount?.coupon?.percent_off || null,
    discount_amount: subscription.discount?.coupon?.amount_off ? subscription.discount.coupon.amount_off / 100 : null,
    coupon_code: subscription.discount?.coupon?.id || null,
    
    // Payment method
    default_payment_method: typeof subscription.default_payment_method === 'string' 
      ? subscription.default_payment_method 
      : subscription.default_payment_method?.id || null,
    
    // Additional metadata
    created_at: new Date(subscription.created * 1000).toISOString(),
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    
    // Customer email from session
    customer_email: session.customer_details?.email || null,
    
    updated_at: new Date().toISOString()
  }

  logger.debug("[Stripe Webhook] Upserting subscription data:", JSON.stringify(subscriptionData, null, 2))

  // Create or update subscription in database
  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(subscriptionData, {
      onConflict: 'stripe_subscription_id'
    })
    .select()

  if (error) {
    logger.error("[Stripe Webhook] Error upserting subscription:", error)
    throw error
  } else {
    logger.debug("[Stripe Webhook] Successfully upserted subscription:", data)
  }

  // Also store the initial invoice if available
  if (subscription.latest_invoice) {
    const invoice = typeof subscription.latest_invoice === 'string' 
      ? await stripeClient.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice as Stripe.Invoice
      
    await storeInvoice(invoice, supabase, userId)
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription, supabase: any) {
  logger.debug("[Stripe Webhook] handleSubscriptionCreated - ID:", subscription.id)
  
  // Extract user_id from metadata or customer
  const { data: existingCustomer } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", subscription.customer)
    .single()

  if (!existingCustomer?.user_id) {
    logger.error("[Stripe Webhook] Could not find user_id for customer:", subscription.customer)
    return
  }

  const subscriptionData = {
    user_id: existingCustomer.user_id,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    
    // Period dates
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    
    // Pricing details
    price_id: subscription.items.data[0]?.price.id,
    unit_amount: subscription.items.data[0]?.price.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : null,
    currency: subscription.items.data[0]?.price.currency || 'usd',
    
    // Trial information
    trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    
    // Additional metadata
    created_at: new Date(subscription.created * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(subscriptionData, {
      onConflict: 'stripe_subscription_id'
    })

  if (error) {
    logger.error("[Stripe Webhook] Error creating subscription:", error)
    throw error
  } else {
    logger.debug("[Stripe Webhook] Successfully created subscription")
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, supabase: any) {
  logger.debug("[Stripe Webhook] handleSubscriptionUpdated - ID:", subscription.id)
  
  const updateData = {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    
    // Update pricing if changed
    price_id: subscription.items.data[0]?.price.id,
    unit_amount: subscription.items.data[0]?.price.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : null,
    
    // Update trial info
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    
    // Update cancellation info
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(updateData)
    .eq("stripe_subscription_id", subscription.id)

  if (error) {
    logger.error("[Stripe Webhook] Error updating subscription:", error)
    throw error
  } else {
    logger.debug("[Stripe Webhook] Successfully updated subscription")
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, supabase: any) {
  logger.debug("[Stripe Webhook] handleSubscriptionDeleted - ID:", subscription.id)
  
  const { error } = await supabase
    .from("subscriptions")
    .update({ 
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("stripe_subscription_id", subscription.id)

  if (error) {
    logger.error("[Stripe Webhook] Error deleting subscription:", error)
    throw error
  } else {
    logger.debug("[Stripe Webhook] Successfully marked subscription as canceled")
  }
}

async function storeInvoice(invoice: Stripe.Invoice, supabase: any, userId?: string) {
  logger.debug("[Stripe Webhook] Storing invoice:", invoice.id)
  
  // If userId not provided, try to get it from subscription
  if (!userId && invoice.subscription) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", invoice.subscription)
      .single()
    
    userId = subscription?.user_id
  }

  const invoiceData = {
    stripe_invoice_id: invoice.id,
    user_id: userId || null,
    subscription_id: invoice.subscription as string || null,
    stripe_customer_id: invoice.customer as string,
    
    // Amounts
    amount_paid: invoice.amount_paid ? invoice.amount_paid / 100 : 0,
    amount_due: invoice.amount_due ? invoice.amount_due / 100 : 0,
    amount_remaining: invoice.amount_remaining ? invoice.amount_remaining / 100 : 0,
    subtotal: invoice.subtotal ? invoice.subtotal / 100 : 0,
    total: invoice.total ? invoice.total / 100 : 0,
    tax_amount: invoice.tax ? invoice.tax / 100 : null,
    
    // Status and metadata
    status: invoice.status || 'pending',
    billing_reason: invoice.billing_reason,
    currency: invoice.currency || 'usd',
    
    // Dates
    period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
    period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: invoice.status_transitions?.paid_at 
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() 
      : null,
    
    // Invoice URLs
    invoice_pdf: invoice.invoice_pdf || null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    
    // Payment info
    payment_method_types: invoice.payment_settings?.payment_method_types || [],
    
    created_at: invoice.created ? new Date(invoice.created * 1000).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  logger.debug("[Stripe Webhook] Invoice data:", JSON.stringify(invoiceData, null, 2))

  const { error } = await supabase
    .from("invoices")
    .upsert(invoiceData, {
      onConflict: 'stripe_invoice_id'
    })

  if (error) {
    logger.error("[Stripe Webhook] Error storing invoice:", error)
    throw error
  } else {
    logger.debug("[Stripe Webhook] Successfully stored invoice")
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
  logger.debug("[Stripe Webhook] handlePaymentSucceeded - Invoice:", invoice.id)
  await storeInvoice(invoice, supabase)
}

async function handlePaymentFailed(invoice: Stripe.Invoice, supabase: any) {
  logger.debug("[Stripe Webhook] handlePaymentFailed - Invoice:", invoice.id)
  await storeInvoice(invoice, supabase)
  
  // You might want to send notification emails here
  // Or update the subscription status to 'past_due'
  if (invoice.subscription) {
    await supabase
      .from("subscriptions")
      .update({ 
        status: 'past_due',
        updated_at: new Date().toISOString()
      })
      .eq("stripe_subscription_id", invoice.subscription)
  }
}