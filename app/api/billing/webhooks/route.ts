import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { headers } from "next/headers"

import { logger } from '@/lib/utils/logger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
})

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = headers().get("stripe-signature")!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret)
  } catch (err: any) {
    logger.error(`Webhook Error: ${err.message}`)
    return jsonResponse(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      
      // Get the subscription details
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      )
      
      const userId = session.metadata?.user_id
      const planId = session.metadata?.plan_id
      const billingCycle = session.metadata?.billing_cycle
      
      if (!userId || !planId) {
        logger.error("Missing metadata in checkout session")
        return errorResponse("Missing metadata" , 400)
      }

      // Check if user already has a subscription
      const { data: existingSubscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .single()

      if (existingSubscription) {
        // Update existing subscription
        const { error } = await supabase
          .from("subscriptions")
          .update({
            plan_id: planId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: session.customer as string,
            status: subscription.status,
            billing_cycle: billingCycle,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)

        if (error) {
          logger.error("Error updating subscription:", error)
          return errorResponse("Failed to update subscription" , 500)
        }
      } else {
        // Create new subscription
        const { error } = await supabase
          .from("subscriptions")
          .insert({
            user_id: userId,
            plan_id: planId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: session.customer as string,
            status: subscription.status,
            billing_cycle: billingCycle,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })

        if (error) {
          logger.error("Error creating subscription:", error)
          return errorResponse("Failed to create subscription" , 500)
        }
      }

      break
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata.user_id

      if (!userId) {
        logger.error("Missing user_id in subscription metadata")
        return errorResponse("Missing user_id" , 400)
      }

      // Update subscription status
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      if (error) {
        logger.error("Error updating subscription:", error)
        return errorResponse("Failed to update subscription" , 500)
      }

      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      
      // Update subscription to canceled/free tier
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          plan_id: "free-tier",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id)

      if (error) {
        logger.error("Error canceling subscription:", error)
        return errorResponse("Failed to cancel subscription" , 500)
      }

      break
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string
      
      // Update subscription period
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      
      const { error } = await supabase
        .from("subscriptions")
        .update({
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          status: subscription.status,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId)

      if (error) {
        logger.error("Error updating subscription period:", error)
      }

      break
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string
      
      // Update subscription status to past_due
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId)

      if (error) {
        logger.error("Error updating subscription status:", error)
      }

      break
    }

    default:
      logger.debug(`Unhandled event type ${event.type}`)
  }

  return jsonResponse({ received: true })
}