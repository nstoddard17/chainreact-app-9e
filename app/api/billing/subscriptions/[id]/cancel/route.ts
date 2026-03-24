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

    const stripe = getStripeClient()
    // Cancel at period end in Stripe
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    // Update in database
    await supabase.from("subscriptions").update({ cancel_at_period_end: true }).eq("id", params.id)

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error("Cancel subscription error:", error)
    return errorResponse("Internal server error" , 500)
  }
}
