import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getStripeClient } from "@/lib/stripe/client"

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Get subscription
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single()

    if (error || !subscription) {
      return errorResponse("Subscription not found" , 404)
    }

    // Check if subscription is scheduled for cancellation
    if (!subscription.cancel_at_period_end) {
      return errorResponse("Subscription is not scheduled for cancellation" , 400)
    }

    const stripe = getStripeClient()
    // Reactivate subscription in Stripe
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    })

    // Update in database
    await supabase.from("subscriptions").update({ cancel_at_period_end: false }).eq("id", params.id)

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error("Reactivate subscription error:", error)
    return errorResponse("Internal server error" , 500)
  }
}