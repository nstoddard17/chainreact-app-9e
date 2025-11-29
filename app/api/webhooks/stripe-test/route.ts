import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

// Test endpoint to verify webhook and Supabase connection
export async function GET() {
  logger.debug("[Webhook Test] Testing webhook configuration...")
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      hasBillingWebhookSecret: !!process.env.STRIPE_BILLING_WEBHOOK_SECRET,
      hasLegacyWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SECRET_KEY,
    },
    supabaseTest: null as any,
    error: null as any
  }
  
  try {
    // Test Supabase connection
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Try to read from subscriptions table
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id")
      .limit(1)
    
    if (error) {
      results.supabaseTest = { success: false, error: error.message }
    } else {
      results.supabaseTest = { success: true, message: "Supabase connection working" }
    }
    
    // Also test if we can read the plans table
    const { data: plans, error: plansError } = await supabase
      .from("plans")
      .select("id, name")
      .limit(3)
    
    results.supabaseTest.plans = plansError ? `Error: ${plansError.message}` : `Found ${plans?.length || 0} plans`
    
  } catch (error: any) {
    results.error = error.message
  }
  
  logger.debug("[Webhook Test] Results:", JSON.stringify(results, null, 2))
  
  return jsonResponse(results)
}

// Test POST to simulate webhook
export async function POST(request: Request) {
  logger.debug("[Webhook Test] Received test POST request")
  
  try {
    const body = await request.json()
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Log the test
    const testLog = {
      type: "webhook_test",
      timestamp: new Date().toISOString(),
      body: body,
      headers: Object.fromEntries(request.headers.entries())
    }
    
    logger.debug("[Webhook Test] Test log:", JSON.stringify(testLog, null, 2))
    
    // Try to insert a test record
    const { data, error } = await supabase
      .from("webhook_logs")
      .insert({
        event_type: "test",
        payload: testLog,
        created_at: new Date().toISOString()
      })
      .select()
    
    if (error) {
      // If webhook_logs table doesn't exist, try another table
      logger.debug("[Webhook Test] webhook_logs table error:", error.message)
      
      // Try to at least verify Supabase connection
      const { data: testQuery, error: queryError } = await supabase
        .from("subscriptions")
        .select("count")
        .single()
      
      return jsonResponse({
        success: false,
        message: "Could not write to webhook_logs",
        error: error.message,
        supabaseConnected: !queryError,
        timestamp: new Date().toISOString()
      })
    }
    
    return jsonResponse({
      success: true,
      message: "Test webhook processed",
      data: data,
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    logger.error("[Webhook Test] Error:", error)
    return jsonResponse({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}