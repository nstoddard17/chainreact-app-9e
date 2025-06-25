import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil",
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error: any) {
    console.error("Webhook signature verification failed:", error.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase)
        break

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
        break

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase)
        break

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("Webhook handler error:", error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, supabase: any) {
  const userId = session.metadata?.user_id
  const planId = session.metadata?.plan_id
  const billingCycle = session.metadata?.billing_cycle

  if (!userId || !planId) return

  // Get the subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

  // Create or update subscription in database
  await supabase.from("subscriptions").upsert({
    user_id: userId,
    plan_id: planId,
    stripe_customer_id: session.customer,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    billing_cycle: billingCycle,
  })
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, supabase: any) {
  await supabase
    .from("subscriptions")
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("stripe_subscription_id", subscription.id)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, supabase: any) {
  await supabase.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", subscription.id)
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, supabase: any) {
  // Store invoice record
  await supabase.from("invoices").upsert({
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_paid / 100, // Convert from cents
    status: "paid",
    billing_reason: invoice.billing_reason,
    invoice_pdf: invoice.invoice_pdf,
    hosted_invoice_url: invoice.hosted_invoice_url,
  })
}

async function handlePaymentFailed(invoice: Stripe.Invoice, supabase: any) {
  // Store failed invoice record
  await supabase.from("invoices").upsert({
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_due / 100, // Convert from cents
    status: "payment_failed",
    billing_reason: invoice.billing_reason,
  })

  // You might want to send notification emails here
}
