import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in the environment variables.")
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
})

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { planId, billingCycle } = await request.json()

    // Get plan details
    const { data: plan, error: planError } = await supabase.from("plans").select("*").eq("id", planId).single()

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    // Get the price ID based on billing cycle
    const priceId = billingCycle === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly

    // Check if we have a valid Stripe price ID
    if (!priceId || priceId.includes("_sample")) {
      return NextResponse.json(
        {
          error: "Stripe integration not configured. Please contact support to set up billing.",
          code: "STRIPE_NOT_CONFIGURED",
        },
        { status: 400 },
      )
    }

    // Get or create Stripe customer
    let customerId: string

    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", session.user.id)
      .single()

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: {
          user_id: session.user.id,
        },
      })
      customerId = customer.id
    }

    // Get the base URL from the request headers or environment
    const protocol = request.headers.get("x-forwarded-proto") || "https"
    const host = request.headers.get("host") || request.headers.get("x-forwarded-host")
    const origin = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}` || "https://localhost:3000"

    // Ensure we have a valid URL with explicit scheme
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${baseUrl}/settings/billing?success=true`,
      cancel_url: `${baseUrl}/settings/billing?canceled=true`,
      metadata: {
        user_id: session.user.id,
        plan_id: planId,
        billing_cycle: billingCycle,
      },
    })

    if (!checkoutSession.url) {
      throw new Error("Failed to create checkout session URL")
    }

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error("Checkout session error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
