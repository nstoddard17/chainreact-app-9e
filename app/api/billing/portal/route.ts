import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import Stripe from "stripe"

import { logger } from '@/lib/utils/logger'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Helper function to get base URL from request
function getBaseUrlFromRequest(request: NextRequest): string {
  // Priority 1: Always use actual request headers first
  const headers = request.headers
  const host = headers.get('host') || headers.get('x-forwarded-host')
  
  if (host) {
    // Check if it's localhost - if so, ALWAYS use localhost regardless of env vars
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      logger.debug("[Portal API] Detected localhost, using local URL")
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
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Get customer ID from subscription
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single()

    if (error || !subscription?.stripe_customer_id) {
      return errorResponse("No subscription found" , 404)
    }

    // Get the base URL dynamically from the request
    const baseUrl = getBaseUrlFromRequest(request)

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/settings?section=billing`,
    })

    if (!portalSession.url) {
      throw new Error("Failed to create portal session URL")
    }

    return jsonResponse({ url: portalSession.url })
  } catch (error: any) {
    logger.error("Portal session error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
}
