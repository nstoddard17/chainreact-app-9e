import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import Stripe from "stripe"

import { logger } from '@/lib/utils/logger'

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY environment variable is not set.")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-05-28.basil",
  typescript: true,
})

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const body = await request.json()
    const { newPlanId, billingCycle } = body

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Get current subscription with plan details
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        *,
        plan:plans (*)
      `)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single()

    if (subError || !subscription) {
      return errorResponse("Subscription not found" , 404)
    }

    // Get the new plan details
    const { data: newPlan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", newPlanId)
      .single()

    if (planError || !newPlan) {
      return errorResponse("Plan not found" , 404)
    }

    // Determine the new price ID based on billing cycle
    const newPriceId = billingCycle === "yearly" 
      ? newPlan.stripe_price_id_yearly 
      : newPlan.stripe_price_id_monthly

    // Get the current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    )

    // Special handling for switching from monthly to annual
    if (subscription.billing_cycle === "monthly" && billingCycle === "yearly") {
      // Schedule the change for the end of the current period
      // This will add 12 months from the current period end
      const subscriptionSchedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscription.stripe_subscription_id,
      })

      // Update the schedule to change the plan at the end of current period
      await stripe.subscriptionSchedules.update(subscriptionSchedule.id, {
        phases: [
          {
            items: [
              {
                price: stripeSubscription.items.data[0].price.id,
                quantity: 1,
              },
            ],
            start_date: subscriptionSchedule.phases[0].start_date,
            end_date: subscriptionSchedule.phases[0].end_date,
          },
          {
            items: [
              {
                price: newPriceId,
                quantity: 1,
              },
            ],
            iterations: 1, // One year
          },
        ],
      })

      // Update database to reflect the scheduled change
      await supabase
        .from("subscriptions")
        .update({
          scheduled_plan_id: newPlanId,
          scheduled_billing_cycle: billingCycle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id)

      return jsonResponse({
        success: true,
        message: "Your plan will change to annual at the end of your current billing period, adding 12 months to your subscription.",
        scheduledChange: true,
      })
    } 
      // For other plan changes, update immediately with proration
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: newPriceId,
            },
          ],
          proration_behavior: "create_prorations",
        }
      )

      // Update database
      await supabase
        .from("subscriptions")
        .update({
          plan_id: newPlanId,
          billing_cycle: billingCycle,
          current_period_start: new Date(updatedSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(updatedSubscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id)

      return jsonResponse({
        success: true,
        message: "Your plan has been updated successfully.",
        scheduledChange: false,
      })
    
  } catch (error: any) {
    logger.error("Change plan error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
}