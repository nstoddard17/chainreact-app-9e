import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import Stripe from "stripe"
import { getStripeClient } from "@/lib/stripe/client"

import { logger } from '@/lib/utils/logger'
import {
  isEventProcessed,
  markEventProcessed,
  isStaleEvent,
  syncFromStripe,
  setGracePeriod,
  ensureEntitlement,
  type StripeEventMeta,
  type StripeSubscriptionData,
} from '@/lib/entitlements/entitlement-service'
import { resolveTierByStripePrice } from '@/lib/entitlements/tier-cache'

// Helper function to safely convert timestamps to ISO strings
function safeTimestampToISO(timestamp: number | null | undefined): string | null {
  if (!timestamp || timestamp <= 0) return null;
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch (e) {
    logger.error("[Stripe Webhook] Invalid timestamp:", timestamp, e);
    return null;
  }
}

export async function POST(request: Request) {
  logger.info("[Stripe Billing Webhook] ========================================")
  logger.info("[Stripe Billing Webhook] Received billing webhook request at:", new Date().toISOString())
  logger.info("[Stripe Billing Webhook] Headers:", Object.fromEntries(request.headers.entries()))
  
  const stripe = getStripeClient()
  // This webhook handles billing events for ChainReact subscriptions
  // Use /api/webhooks/stripe-integration for workflow triggers
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  logger.info("[Stripe Billing Webhook] Has signature:", !!signature)
  logger.info("[Stripe Billing Webhook] Body length:", body.length)
  logger.info("[Stripe Billing Webhook] Webhook secret configured:", !!webhookSecret)

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    logger.info(`[Stripe Webhook] Event type: ${event.type}, ID: ${event.id}`)
  } catch (error: any) {
    logger.error("[Stripe Webhook] Signature verification failed:", error.message)
    return errorResponse("Invalid signature" , 400)
  }

  // Use service role key to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  try {
    logger.info(`[Stripe Webhook] Processing event: ${event.type}`)

    switch (event.type) {
      case "checkout.session.completed":
        logger.info("[Stripe Webhook] Processing checkout.session.completed")
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase, stripe)
        break

      case "customer.subscription.created":
        logger.info("[Stripe Webhook] Processing customer.subscription.created")
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.updated":
        logger.info("[Stripe Webhook] Processing customer.subscription.updated")
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.deleted":
        logger.info("[Stripe Webhook] Processing customer.subscription.deleted")
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
        break

      case "invoice.payment_succeeded":
        logger.info("[Stripe Webhook] Processing invoice.payment_succeeded")
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase)
        break

      case "invoice.payment_failed":
        logger.info("[Stripe Webhook] Processing invoice.payment_failed")
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase)
        break

      default:
        logger.info(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    // Phase 1 parallel write: sync to user_entitlements
    if (process.env.ENTITLEMENTS_V2 === 'true') {
      await syncEntitlementFromEvent(event, supabase, stripe)
    }

    logger.info(`[Stripe Webhook] Successfully processed event: ${event.type}`)
    return jsonResponse({ received: true })
  } catch (error: any) {
    logger.error("[Stripe Webhook] Handler error:", error)
    logger.error("[Stripe Webhook] Error details:", JSON.stringify(error, null, 2))
    return errorResponse("Webhook handler failed", 500, { details: error.message  })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, supabase: any, stripeClient: Stripe) {
  logger.info("[Stripe Webhook] handleCheckoutCompleted - Session ID:", session.id)
  logger.debug("[Stripe Webhook] Has metadata:", !!session.metadata)
  logger.debug("[Stripe Webhook] Has customer email:", !!session.customer_details?.email)

  // Try multiple sources for user info
  let userId = session.metadata?.user_id
  const planId = session.metadata?.plan_id || 'pro' // Default to pro if not specified
  const billingCycle = session.metadata?.billing_cycle || 'monthly'

  // If no userId in metadata, try to find from customer email
  if (!userId && session.customer_details?.email) {
    logger.info("[Stripe Webhook] No userId in metadata, attempting to find by email")
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.customer_details.email)
      .single()
    
    if (userData && !userError) {
      userId = userData.id
      logger.info("[Stripe Webhook] Found userId from email:", userId)
    } else {
      logger.error("[Stripe Webhook] Could not find user by email:", userError)
    }
  }

  if (!userId) {
    logger.error("[Stripe Webhook] CRITICAL: Could not determine userId from metadata or email")
    logger.error("Session data:", {
      metadata: session.metadata,
      customer: session.customer,
      customer_email: session.customer_details?.email
    })
    // Don't return - try to store as much as possible
  }

  logger.info(`[Stripe Webhook] Processing for user: ${userId || 'UNKNOWN'}, plan: ${planId}, cycle: ${billingCycle}`)

  // Get the full subscription details from Stripe
  let subscription
  try {
    subscription = await stripeClient.subscriptions.retrieve(session.subscription as string, {
      expand: ['default_payment_method', 'latest_invoice', 'discount']
    })
  } catch (retrieveError) {
    logger.error("[Stripe Webhook] Failed to retrieve subscription:", retrieveError)
    // Try to create minimal record with session data
    const minimalData = {
      user_id: userId || null,
      plan_id: planId,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      status: 'active',
      billing_cycle: billingCycle,
      customer_email: session.customer_details?.email || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    logger.info("[Stripe Webhook] Attempting minimal record creation:", minimalData)
    const { error: minimalError } = await supabase
      .from("subscriptions")
      .upsert(minimalData, {
        onConflict: 'stripe_subscription_id'
      })
    
    if (minimalError) {
      logger.error("[Stripe Webhook] Failed to create minimal record:", minimalError)
    } else {
      logger.info("[Stripe Webhook] Created minimal subscription record")
    }
    return
  }

  logger.info("[Stripe Webhook] Retrieved subscription:", subscription.id)

  // Extract ONLY the fields that exist in the database
  const subscriptionData = {
    user_id: userId,
    plan_id: planId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    billing_cycle: billingCycle || 'monthly',
    current_period_start: safeTimestampToISO(subscription.current_period_start) || new Date().toISOString(),
    current_period_end: safeTimestampToISO(subscription.current_period_end) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: safeTimestampToISO(subscription.created) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  logger.debug("[Stripe Webhook] Upserting subscription data for user")

  // First, try to check if subscription already exists
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .single()

  let result
  if (existing) {
    // Update existing subscription
    logger.info("[Stripe Webhook] Updating existing subscription")
    const { data, error } = await supabase
      .from("subscriptions")
      .update(subscriptionData)
      .eq("stripe_subscription_id", subscription.id)
      .select()
    result = { data, error }
  } else {
    // Insert new subscription
    logger.info("[Stripe Webhook] Creating new subscription")
    const { data, error } = await supabase
      .from("subscriptions")
      .insert(subscriptionData)
      .select()
    result = { data, error }
  }

  if (result.error) {
    logger.error("[Stripe Webhook] Error saving subscription:", result.error)
    throw result.error
  } else {
    logger.info("[Stripe Webhook] Successfully saved subscription:", result.data)
  }

  // Update user's role to 'pro' after successful subscription (skip beta testers)
  if (userId && subscription.status === 'active') {
    // Check if user is a beta tester first
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single()

    if (profileData?.role !== 'beta-pro') {
      logger.info("[Stripe Webhook] Updating user role to 'pro' for user:", userId)
      const { error: roleUpdateError } = await supabase
        .from("profiles")
        .update({ role: 'pro', updated_at: new Date().toISOString() })
        .eq("id", userId)

      if (roleUpdateError) {
        logger.error("[Stripe Webhook] Failed to update user role:", roleUpdateError)
        // Don't throw - subscription is saved, role update is secondary
      } else {
        logger.info("[Stripe Webhook] Successfully updated user role to 'pro'")
      }
    } else {
      logger.info("[Stripe Webhook] User is a beta tester, skipping role update")
    }
  }

  // Store invoice if available
  if (subscription.latest_invoice) {
    const invoice = typeof subscription.latest_invoice === 'string' 
      ? await stripeClient.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice as Stripe.Invoice
      
    await storeInvoice(invoice, supabase, userId)
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription, supabase: any) {
  logger.info("[Stripe Webhook] handleSubscriptionCreated - ID:", subscription.id)
  
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
    current_period_start: safeTimestampToISO(subscription.current_period_start) || new Date().toISOString(),
    current_period_end: safeTimestampToISO(subscription.current_period_end) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    
    // Pricing details
    price_id: subscription.items.data[0]?.price.id,
    unit_amount: subscription.items.data[0]?.price.unit_amount ? subscription.items.data[0].price.unit_amount / 100 : null,
    currency: subscription.items.data[0]?.price.currency || 'usd',
    
    // Trial information
    trial_start: safeTimestampToISO(subscription.trial_start),
    trial_end: safeTimestampToISO(subscription.trial_end),
    
    // Additional metadata
    created_at: safeTimestampToISO(subscription.created) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Check if subscription exists first
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .single()

  const { error } = existing
    ? await supabase
        .from("subscriptions")
        .update(subscriptionData)
        .eq("stripe_subscription_id", subscription.id)
    : await supabase
        .from("subscriptions")
        .insert(subscriptionData)

  if (error) {
    logger.error("[Stripe Webhook] Error creating subscription:", error)
    throw error
  } else {
    logger.info("[Stripe Webhook] Successfully created subscription")
  }

  // Update user's role to 'pro' for active subscriptions
  if (existingCustomer.user_id && subscription.status === 'active') {
    logger.info("[Stripe Webhook] Updating user role to 'pro' for user:", existingCustomer.user_id)
    const { error: roleUpdateError } = await supabase
      .from("profiles")
      .update({ role: 'pro', updated_at: new Date().toISOString() })
      .eq("id", existingCustomer.user_id)

    if (roleUpdateError) {
      logger.error("[Stripe Webhook] Failed to update user role:", roleUpdateError)
      // Don't throw - subscription is saved, role update is secondary
    } else {
      logger.info("[Stripe Webhook] Successfully updated user role to 'pro'")
    }
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, supabase: any) {
  logger.info("[Stripe Webhook] handleSubscriptionUpdated - ID:", subscription.id)
  logger.info("[Stripe Webhook] Subscription status:", subscription.status)

  // First get the user_id from the subscription
  const { data: existingSubscription } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single()

  const userId = existingSubscription?.user_id

  const updateData = {
    status: subscription.status,
    current_period_start: safeTimestampToISO(subscription.current_period_start) || new Date().toISOString(),
    current_period_end: safeTimestampToISO(subscription.current_period_end) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
    logger.info("[Stripe Webhook] Successfully updated subscription")
  }

  // Update user's role based on subscription status
  if (userId) {
    // Determine the appropriate role based on subscription status
    let newRole = 'free'
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      newRole = 'pro'
    }
    // For past_due, you might want to keep pro access for a grace period
    // Uncomment the next line if you want to maintain access during payment issues
    // else if (subscription.status === 'past_due') { newRole = 'pro' }

    logger.info(`[Stripe Webhook] Updating user role to '${newRole}' for user:`, userId)
    const { error: roleUpdateError } = await supabase
      .from("profiles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", userId)

    if (roleUpdateError) {
      logger.error("[Stripe Webhook] Failed to update user role:", roleUpdateError)
      // Don't throw - subscription update is primary, role update is secondary
    } else {
      logger.info(`[Stripe Webhook] Successfully updated user role to '${newRole}'`)
    }
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, supabase: any) {
  logger.info("[Stripe Webhook] handleSubscriptionDeleted - ID:", subscription.id)

  // First get the user_id from the subscription
  const { data: existingSubscription } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .single()

  const userId = existingSubscription?.user_id

  // Update the subscription status
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      // Removed canceled_at - column doesn't exist
      updated_at: new Date().toISOString()
    })
    .eq("stripe_subscription_id", subscription.id)

  if (error) {
    logger.error("[Stripe Webhook] Error deleting subscription:", error)
    throw error
  } else {
    logger.info("[Stripe Webhook] Successfully marked subscription as canceled")
  }

  // Downgrade user's role back to 'free'
  if (userId) {
    logger.info("[Stripe Webhook] Downgrading user role to 'free' for user:", userId)
    const { error: roleUpdateError } = await supabase
      .from("profiles")
      .update({ role: 'free', updated_at: new Date().toISOString() })
      .eq("id", userId)

    if (roleUpdateError) {
      logger.error("[Stripe Webhook] Failed to downgrade user role:", roleUpdateError)
      // Don't throw - subscription update is primary, role update is secondary
    } else {
      logger.info("[Stripe Webhook] Successfully downgraded user role to 'free'")
    }

    // ========================================================================
    // NEW: Trigger grace period for user's teams
    // ========================================================================
    await handleUserDowngrade(userId, supabase)
  }
}

/**
 * Handle user downgrade: Set grace period for all teams owned by this user
 */
async function handleUserDowngrade(userId: string, supabase: any) {
  logger.info(`[Stripe Webhook] Handling downgrade for user ${userId}`)

  try {
    // Find all teams where this user is the creator/owner
    const { data: ownedTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, created_by")
      .eq("created_by", userId)
      .is("suspended_at", null) // Only active teams

    if (teamsError) {
      logger.error("[Stripe Webhook] Error fetching user's teams:", teamsError)
      return
    }

    if (!ownedTeams || ownedTeams.length === 0) {
      logger.info("[Stripe Webhook] User has no teams to suspend")
      return
    }

    logger.info(`[Stripe Webhook] Found ${ownedTeams.length} teams owned by user ${userId}`)

    // Calculate grace period end date (5 days from now)
    const gracePeriodEndsAt = new Date()
    gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 5)

    // Set grace period for each team
    for (const team of ownedTeams) {
      const { error: updateError } = await supabase
        .from("teams")
        .update({
          grace_period_ends_at: gracePeriodEndsAt.toISOString(),
          suspension_reason: "owner_downgraded",
          updated_at: new Date().toISOString()
        })
        .eq("id", team.id)

      if (updateError) {
        logger.error(`[Stripe Webhook] Failed to set grace period for team ${team.id}:`, updateError)
      } else {
        logger.info(`[Stripe Webhook] Set 5-day grace period for team "${team.name}" (${team.id})`)
        // Note: The database trigger will automatically create the notification
      }
    }

    logger.info(`[Stripe Webhook] Grace period set for ${ownedTeams.length} teams. Suspension will occur on ${gracePeriodEndsAt.toISOString()}`)
  } catch (error: any) {
    logger.error("[Stripe Webhook] Error handling user downgrade:", error)
    // Don't throw - this is supplementary to the main subscription cancellation
  }
}

async function storeInvoice(invoice: Stripe.Invoice, supabase: any, userId?: string) {
  logger.info("[Stripe Webhook] Storing invoice:", invoice.id)
  
  // If userId not provided, try to get it from subscription
  if (!userId && invoice.subscription) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", invoice.subscription)
      .single()
    
    userId = subscription?.user_id
  }

  // Only use fields that exist in the invoices table
  const invoiceData = {
    stripe_invoice_id: invoice.id,
    user_id: userId || null,
    amount: invoice.total ? invoice.total / 100 : 0, // Use total as amount
    status: invoice.status || 'pending',
    created_at: safeTimestampToISO(invoice.created) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  logger.debug("[Stripe Webhook] Processing invoice data")

  // Check if invoice exists first to avoid conflicts
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .single()

  let result
  if (existing) {
    // Update existing invoice
    logger.info("[Stripe Webhook] Updating existing invoice")
    const { data, error } = await supabase
      .from("invoices")
      .update(invoiceData)
      .eq("stripe_invoice_id", invoice.id)
      .select()
    result = { data, error }
  } else {
    // Insert new invoice
    logger.info("[Stripe Webhook] Creating new invoice")
    const { data, error } = await supabase
      .from("invoices")
      .insert(invoiceData)
      .select()
    result = { data, error }
  }

  if (result.error) {
    logger.error("[Stripe Webhook] Error storing invoice:", result.error)
    throw result.error
  } else {
    logger.info("[Stripe Webhook] Successfully stored invoice:", result.data)
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
  logger.info("[Stripe Webhook] handlePaymentSucceeded - Invoice:", invoice.id)
  await storeInvoice(invoice, supabase)
}

async function handlePaymentFailed(invoice: Stripe.Invoice, supabase: any) {
  logger.info("[Stripe Webhook] handlePaymentFailed - Invoice:", invoice.id)
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

// =====================================================================
// Phase 1: Entitlement sync (parallel write to user_entitlements)
// =====================================================================
// Hardened Stripe sync following the approved plan:
// 1. Idempotency via stripe_processed_events
// 2. Freshness check via last_stripe_event_at
// 3. Tier resolution via stripe_tier_mapping (immutable code, not name)
// 4. State transition validation

async function syncEntitlementFromEvent(
  event: Stripe.Event,
  supabase: any,
  stripeClient: Stripe
): Promise<void> {
  try {
    // 1. Idempotency check
    const alreadyProcessed = await isEventProcessed(supabase, event.id)
    if (alreadyProcessed) {
      logger.debug('[Entitlement Sync] Event already processed, skipping', { eventId: event.id })
      return
    }

    const meta: StripeEventMeta = {
      eventId: event.id,
      eventType: event.type,
      eventCreated: new Date(event.created * 1000),
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id
        if (!userId || !session.subscription) break

        const subResponse = await stripeClient.subscriptions.retrieve(session.subscription as string)
        const sub = subResponse as any
        const priceId = sub.items.data[0]?.price.id
        if (!priceId) break

        const tier = await resolveTierByStripePrice(priceId)
        if (!tier) {
          logger.warn('[Entitlement Sync] No tier mapping for price', { priceId })
          break
        }

        meta.customerId = sub.customer as string
        meta.subscriptionId = sub.id
        await ensureEntitlement(userId)

        // Freshness check
        const { data: ent } = await (supabase as any)
          .from('user_entitlements')
          .select('last_stripe_event_at')
          .eq('user_id', userId)
          .single()

        if (ent && isStaleEvent(ent, meta.eventCreated)) {
          logger.warn('[Entitlement Sync] Stale event, skipping', { eventId: event.id })
          break
        }

        await syncFromStripe(supabase, userId, {
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          priceId,
          tierId: tier.tierId,
          tierCode: tier.tierCode,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }, meta)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any
        const priceId = sub.items.data[0]?.price.id
        if (!priceId) break

        // Find userId from subscriptions table
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single()

        const userId = existingSub?.user_id
        if (!userId) break

        const tier = await resolveTierByStripePrice(priceId)
        if (!tier) {
          logger.warn('[Entitlement Sync] No tier mapping for price', { priceId })
          break
        }

        meta.customerId = sub.customer as string
        meta.subscriptionId = sub.id
        await ensureEntitlement(userId)

        const { data: ent2 } = await (supabase as any)
          .from('user_entitlements')
          .select('last_stripe_event_at')
          .eq('user_id', userId)
          .single()

        if (ent2 && isStaleEvent(ent2, meta.eventCreated)) {
          logger.warn('[Entitlement Sync] Stale event, skipping', { eventId: event.id })
          break
        }

        await syncFromStripe(supabase, userId, {
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          priceId,
          tierId: tier.tierId,
          tierCode: tier.tierCode,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }, meta)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single()

        const userId = existingSub?.user_id
        if (!userId) break

        meta.customerId = sub.customer as string
        meta.subscriptionId = sub.id

        const { data: ent3 } = await (supabase as any)
          .from('user_entitlements')
          .select('last_stripe_event_at')
          .eq('user_id', userId)
          .single()

        if (ent3 && isStaleEvent(ent3, meta.eventCreated)) {
          logger.warn('[Entitlement Sync] Stale event, skipping', { eventId: event.id })
          break
        }

        await setGracePeriod(supabase, userId, meta)
        break
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as any
        if (!inv.subscription) break

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', inv.subscription)
          .single()

        const userId = existingSub?.user_id
        if (!userId) break

        // Get the subscription from Stripe for period dates and price
        const subResponse2 = await stripeClient.subscriptions.retrieve(inv.subscription as string)
        const sub = subResponse2 as any
        const priceId = sub.items.data[0]?.price.id
        if (!priceId) break

        const tier = await resolveTierByStripePrice(priceId)
        if (!tier) break

        meta.customerId = sub.customer as string
        meta.subscriptionId = sub.id

        const { data: ent4 } = await (supabase as any)
          .from('user_entitlements')
          .select('last_stripe_event_at')
          .eq('user_id', userId)
          .single()

        if (ent4 && isStaleEvent(ent4, meta.eventCreated)) {
          logger.warn('[Entitlement Sync] Stale event, skipping', { eventId: event.id })
          break
        }

        // Reset tasks on successful payment (new billing period)
        await syncFromStripe(supabase, userId, {
          subscriptionId: sub.id,
          customerId: sub.customer as string,
          priceId,
          tierId: tier.tierId,
          tierCode: tier.tierCode,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }, meta, true) // resetTasks = true
        break
      }

      default:
        // No entitlement sync needed for other events
        return
    }

    // Mark event as processed (after successful handling)
    await markEventProcessed(supabase, meta)

  } catch (error: any) {
    // Non-blocking during Phase 1 -- log but don't fail the webhook
    logger.error('[Entitlement Sync] Failed (non-blocking)', {
      eventId: event.id,
      eventType: event.type,
      error: error.message,
    })
  }
}