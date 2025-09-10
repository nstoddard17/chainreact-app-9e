import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

// Helper function to get base URL from request
function getBaseUrlFromRequest(request: NextRequest): string {
  // Priority 1: Always use actual request headers first
  const headers = request.headers
  const host = headers.get('host') || headers.get('x-forwarded-host')
  
  if (host) {
    // Check if it's localhost - if so, ALWAYS use localhost regardless of env vars
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      console.log("[Checkout API] Detected localhost, using local URL")
      return `http://${host}`
    }
    
    // For non-localhost, check if we should use env var
    if (process.env.NEXT_PUBLIC_APP_URL && !host.includes('vercel.app') && !host.includes('ngrok')) {
      // Use env var for production
      return process.env.NEXT_PUBLIC_APP_URL
    }
    
    // For preview/staging environments, use the actual host
    const protocol = headers.get('x-forwarded-proto') || 'https'
    return `${protocol}://${host}`
  }
  
  // Priority 2: Fallback to environment variable
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
  // Priority 3: Fallback to localhost in development
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${process.env.PORT || '3000'}`
  }
  
  // Priority 4: Default fallback
  return 'https://chainreact.app'
}

export async function POST(request: NextRequest) {
  console.log("[Checkout API] Request received")
  try {
    // Dynamically determine the base URL
    const baseUrl = getBaseUrlFromRequest(request)
    console.log("[Checkout API] Detected base URL:", baseUrl)
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    console.log("[Checkout API] Supabase client created")

    // Get the user from the Authorization header
    const authHeader = request.headers.get("authorization")
    console.log("[Checkout API] Auth header present:", !!authHeader)
    const token = authHeader?.replace("Bearer ", "")
    
    if (!token) {
      console.log("[Checkout API] No token found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[Checkout API] Verifying user...")
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.log("[Checkout API] Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("[Checkout API] User verified:", user.id)

    console.log("[Checkout API] Parsing request body...")
    const { planId, billingCycle } = await request.json()
    console.log("[Checkout API] Plan ID:", planId, "Billing cycle:", billingCycle)

    // Validate input
    if (!planId || !billingCycle) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Don't allow checkout for free plan
    if (planId === 'free-tier') {
      return NextResponse.json(
        { error: "Cannot create checkout session for free plan" },
        { status: 400 }
      )
    }

    // Get the plan from the database
    console.log("[Checkout API] Fetching plan from database...")
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single()
    console.log("[Checkout API] Plan fetched:", plan?.name, "Error:", planError)

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      )
    }

    // Check if Stripe is configured
    console.log("[Checkout API] Checking Stripe configuration...")
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("[Checkout API] Stripe not configured")
      return NextResponse.json(
        { error: "STRIPE_NOT_CONFIGURED" },
        { status: 503 }
      )
    }
    console.log("[Checkout API] Stripe configured, initializing client...")
    
    // Initialize Stripe with error handling
    let stripe: Stripe
    try {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2024-12-18.acacia",
      })
      console.log("[Checkout API] Stripe client initialized")
    } catch (stripeInitError) {
      console.error("[Checkout API] Failed to initialize Stripe:", stripeInitError)
      return NextResponse.json(
        { error: "Failed to initialize payment processor" },
        { status: 500 }
      )
    }

    // Get or create Stripe customer
    let stripeCustomerId: string

    // Check if user already has a Stripe customer ID
    const { data: existingSubscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (existingSubscription?.stripe_customer_id) {
      stripeCustomerId = existingSubscription.stripe_customer_id
      console.log("[Checkout API] Using existing Stripe customer:", stripeCustomerId)
    } else {
      // Create a new Stripe customer
      console.log("[Checkout API] Creating new Stripe customer...")
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            user_id: user.id,
          },
          // Tax settings for the customer
          tax: {
            validate_location: 'deferred', // Validate tax location when needed
          },
        })
        stripeCustomerId = customer.id
        console.log("[Checkout API] Created Stripe customer:", stripeCustomerId)
      } catch (customerError) {
        console.error("[Checkout API] Failed to create Stripe customer:", customerError)
        return NextResponse.json(
          { error: "Failed to create customer account" },
          { status: 500 }
        )
      }
    }

    // Determine the price ID based on billing cycle
    const priceId = billingCycle === "yearly" 
      ? plan.stripe_price_id_yearly 
      : plan.stripe_price_id_monthly

    if (!priceId || priceId.includes("price_XXXXX") || priceId.includes("price_YYYYY")) {
      // Return a helpful message for development
      return NextResponse.json(
        { 
          error: "Stripe price IDs not configured. Please update the plans table with your Stripe price IDs.",
          instructions: {
            step1: "Create products and prices in your Stripe dashboard",
            step2: "Copy the price IDs (they start with 'price_')",
            step3: "Update the plans table with these IDs",
            monthly_price_field: "stripe_price_id_monthly",
            yearly_price_field: "stripe_price_id_yearly"
          }
        },
        { status: 503 }
      )
    }

    // Create Stripe checkout session
    console.log("[Checkout API] Creating Stripe session with price ID:", priceId)
    console.log("[Checkout API] User ID:", user.id)
    console.log("[Checkout API] User Email:", user.email)
    console.log("[Checkout API] Plan ID:", planId)
    console.log("[Checkout API] Billing Cycle:", billingCycle)
    console.log("[Checkout API] Success URL:", `${baseUrl}/settings?tab=billing&success=true`)
    console.log("[Checkout API] Cancel URL:", `${baseUrl}/settings?tab=billing&canceled=true`)
    
    let session
    try {
      session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${baseUrl}/settings?tab=billing&success=true`,
        cancel_url: `${baseUrl}/settings?tab=billing&canceled=true`,
        // Enable automatic tax calculation
        automatic_tax: {
          enabled: true,
        },
        // Collect customer's address for tax calculation
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
        // Required for tax calculation - customer's location
        tax_id_collection: {
          enabled: true, // Allow customers to add tax IDs (optional but recommended)
        },
        // CRITICAL: Set metadata at checkout session level
        metadata: {
          user_id: user.id,
          user_email: user.email, // Add email as backup
          plan_id: planId,
          billing_cycle: billingCycle,
        },
        // Also set on subscription for redundancy
        subscription_data: {
          metadata: {
            user_id: user.id,
            user_email: user.email,
            plan_id: planId,
            billing_cycle: billingCycle,
          },
        },
        allow_promotion_codes: true,
        // Don't set customer_email when customer is already set
      })
    } catch (sessionError: any) {
      console.error("[Checkout API] Failed to create checkout session:", sessionError)
      return NextResponse.json(
        { error: sessionError.message || "Failed to create checkout session" },
        { status: 500 }
      )
    }

    console.log("[Checkout API] Session created, URL:", session.url)
    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error("[Checkout API] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    )
  }
}