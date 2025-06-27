import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get customer ID from subscription
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (error || !subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 })
    }

    // Get the base URL from the request headers or environment
    const protocol = request.headers.get("x-forwarded-proto") || "https"
    const host = request.headers.get("host") || request.headers.get("x-forwarded-host")
    const origin = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}` || "https://localhost:3000"

    // Ensure we have a valid URL with explicit scheme
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/settings/billing`,
    })

    if (!portalSession.url) {
      throw new Error("Failed to create portal session URL")
    }

    return NextResponse.json({ url: portalSession.url })
  } catch (error: any) {
    console.error("Portal session error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
