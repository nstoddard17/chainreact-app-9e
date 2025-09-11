import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil",
})

// This webhook handles your business billing (subscriptions for ChainReact)
const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET!

// Helper function to safely convert timestamps to ISO strings
function safeTimestampToISO(timestamp: number | null | undefined): string | null {
  if (!timestamp || timestamp <= 0) return null;
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch (e) {
    console.error("[Stripe Webhook] Invalid timestamp:", timestamp, e);
    return null;
  }
}

export async function POST(request: Request) {
  console.log("[Stripe Billing Webhook] ========================================")
  console.log("[Stripe Billing Webhook] Received billing webhook request at:", new Date().toISOString())
  console.log("[Stripe Billing Webhook] Headers:", Object.fromEntries(request.headers.entries()))
  
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!
  
  console.log("[Stripe Billing Webhook] Has signature:", !!signature)
  console.log("[Stripe Billing Webhook] Body length:", body.length)
  console.log("[Stripe Billing Webhook] Webhook secret configured:", !!webhookSecret)

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    console.log(`[Stripe Webhook] Event type: ${event.type}, ID: ${event.id}`)
  } catch (error: any) {
    console.error("[Stripe Webhook] Signature verification failed:", error.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Use service role key to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    console.log(`[Stripe Webhook] Processing event: ${event.type}`)
    
    switch (event.type) {
      case "checkout.session.completed":
        console.log("[Stripe Webhook] Processing checkout.session.completed")
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase, stripe)
        break

      case "customer.subscription.created":
        console.log("[Stripe Webhook] Processing customer.subscription.created")
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.updated":
        console.log("[Stripe Webhook] Processing customer.subscription.updated")
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.deleted":
        console.log("[Stripe Webhook] Processing customer.subscription.deleted")
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
        break

      case "invoice.payment_succeeded":
        console.log("[Stripe Webhook] Processing invoice.payment_succeeded")
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase)
        break

      case "invoice.payment_failed":
        console.log("[Stripe Webhook] Processing invoice.payment_failed")
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase)
        break

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    console.log(`[Stripe Webhook] Successfully processed event: ${event.type}`)
    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("[Stripe Webhook] Handler error:", error)
    console.error("[Stripe Webhook] Error details:", JSON.stringify(error, null, 2))
    return NextResponse.json({ error: "Webhook handler failed", details: error.message }, { status: 500 })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, supabase: any, stripeClient: Stripe) {
  console.log("[Stripe Webhook] ========================================")
  console.log("[Stripe Webhook] handleCheckoutCompleted - Session ID:", session.id)
  console.log("[Stripe Webhook] Session metadata:", JSON.stringify(session.metadata, null, 2))
  console.log("[Stripe Webhook] Customer:", session.customer)
  console.log("[Stripe Webhook] Customer email:", session.customer_details?.email)
  console.log("[Stripe Webhook] Subscription ID:", session.subscription)
  
  // Try multiple sources for user info
  let userId = session.metadata?.user_id
  let planId = session.metadata?.plan_id || 'pro' // Default to pro if not specified
  let billingCycle = session.metadata?.billing_cycle || 'monthly'
  
  // If no userId in metadata, try to find from customer email
  if (!userId && session.customer_details?.email) {
    console.log("[Stripe Webhook] No userId in metadata, attempting to find by email:", session.customer_details.email)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.customer_details.email)
      .single()
    
    if (userData && !userError) {
      userId = userData.id
      console.log("[Stripe Webhook] Found userId from email:", userId)
    } else {
      console.error("[Stripe Webhook] Could not find user by email:", userError)
    }
  }

  if (!userId) {
    console.error("[Stripe Webhook] CRITICAL: Could not determine userId from metadata or email")
    console.error("Session data:", {
      metadata: session.metadata,
      customer: session.customer,
      customer_email: session.customer_details?.email
    })
    // Don't return - try to store as much as possible
  }

  console.log(`[Stripe Webhook] Processing for user: ${userId || 'UNKNOWN'}, plan: ${planId}, cycle: ${billingCycle}`)

  // Get the full subscription details from Stripe
  let subscription
  try {
    subscription = await stripeClient.subscriptions.retrieve(session.subscription as string, {
      expand: ['default_payment_method', 'latest_invoice', 'discount']
    })
  } catch (retrieveError) {
    console.error("[Stripe Webhook] Failed to retrieve subscription:", retrieveError)
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
    
    console.log("[Stripe Webhook] Attempting minimal record creation:", minimalData)
    const { error: minimalError } = await supabase
      .from("subscriptions")
      .upsert(minimalData, {
        onConflict: 'stripe_subscription_id'
      })
    
    if (minimalError) {
      console.error("[Stripe Webhook] Failed to create minimal record:", minimalError)
    } else {
      console.log("[Stripe Webhook] Created minimal subscription record")
    }
    return
  }

  console.log("[Stripe Webhook] Retrieved subscription:", subscription.id)

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

  console.log("[Stripe Webhook] Upserting subscription data:", JSON.stringify(subscriptionData, null, 2))

  // First, try to check if subscription already exists
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .single()

  let result
  if (existing) {
    // Update existing subscription
    console.log("[Stripe Webhook] Updating existing subscription")
    const { data, error } = await supabase
      .from("subscriptions")
      .update(subscriptionData)
      .eq("stripe_subscription_id", subscription.id)
      .select()
    result = { data, error }
  } else {
    // Insert new subscription
    console.log("[Stripe Webhook] Creating new subscription")
    const { data, error } = await supabase
      .from("subscriptions")
      .insert(subscriptionData)
      .select()
    result = { data, error }
  }

  if (result.error) {
    console.error("[Stripe Webhook] Error saving subscription:", result.error)
    throw result.error
  } else {
    console.log("[Stripe Webhook] Successfully saved subscription:", result.data)
  }

  // TODO: Store invoice once we know what columns exist in the invoices table
  // if (subscription.latest_invoice) {
  //   const invoice = typeof subscription.latest_invoice === 'string' 
  //     ? await stripeClient.invoices.retrieve(subscription.latest_invoice)
  //     : subscription.latest_invoice as Stripe.Invoice
  //     
  //   await storeInvoice(invoice, supabase, userId)
  // }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription, supabase: any) {
  console.log("[Stripe Webhook] handleSubscriptionCreated - ID:", subscription.id)
  
  // Extract user_id from metadata or customer
  const { data: existingCustomer } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", subscription.customer)
    .single()

  if (!existingCustomer?.user_id) {
    console.error("[Stripe Webhook] Could not find user_id for customer:", subscription.customer)
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
    console.error("[Stripe Webhook] Error creating subscription:", error)
    throw error
  } else {
    console.log("[Stripe Webhook] Successfully created subscription")
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, supabase: any) {
  console.log("[Stripe Webhook] handleSubscriptionUpdated - ID:", subscription.id)
  
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
    console.error("[Stripe Webhook] Error updating subscription:", error)
    throw error
  } else {
    console.log("[Stripe Webhook] Successfully updated subscription")
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, supabase: any) {
  console.log("[Stripe Webhook] handleSubscriptionDeleted - ID:", subscription.id)
  
  const { error } = await supabase
    .from("subscriptions")
    .update({ 
      status: "canceled",
      // Removed canceled_at - column doesn't exist
      updated_at: new Date().toISOString()
    })
    .eq("stripe_subscription_id", subscription.id)

  if (error) {
    console.error("[Stripe Webhook] Error deleting subscription:", error)
    throw error
  } else {
    console.log("[Stripe Webhook] Successfully marked subscription as canceled")
  }
}

async function storeInvoice(invoice: Stripe.Invoice, supabase: any, userId?: string) {
  console.log("[Stripe Webhook] Storing invoice:", invoice.id)
  
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
    period_start: safeTimestampToISO(invoice.period_start),
    period_end: safeTimestampToISO(invoice.period_end),
    due_date: safeTimestampToISO(invoice.due_date),
    paid_at: safeTimestampToISO(invoice.status_transitions?.paid_at),
    
    // Invoice URLs
    invoice_pdf: invoice.invoice_pdf || null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    
    // Payment info
    payment_method_types: invoice.payment_settings?.payment_method_types || [],
    
    created_at: safeTimestampToISO(invoice.created) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  console.log("[Stripe Webhook] Invoice data:", JSON.stringify(invoiceData, null, 2))

  const { error } = await supabase
    .from("invoices")
    .upsert(invoiceData, {
      onConflict: 'stripe_invoice_id'
    })

  if (error) {
    console.error("[Stripe Webhook] Error storing invoice:", error)
    throw error
  } else {
    console.log("[Stripe Webhook] Successfully stored invoice")
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
  console.log("[Stripe Webhook] handlePaymentSucceeded - Invoice:", invoice.id)
  // TODO: Store invoice once we know what columns exist in the invoices table
  // await storeInvoice(invoice, supabase)
}

async function handlePaymentFailed(invoice: Stripe.Invoice, supabase: any) {
  console.log("[Stripe Webhook] handlePaymentFailed - Invoice:", invoice.id)
  // TODO: Store invoice once we know what columns exist in the invoices table
  // await storeInvoice(invoice, supabase)
  
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