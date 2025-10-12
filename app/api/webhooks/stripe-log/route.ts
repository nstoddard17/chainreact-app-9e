import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

// This endpoint logs all incoming Stripe webhook events for debugging
// No signature verification - just logs everything
export async function POST(request: Request) {
  logger.debug("[Stripe Log] ========================================")
  logger.debug("[Stripe Log] Received webhook at:", new Date().toISOString())
  
  try {
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())
    
    logger.debug("[Stripe Log] Headers:", JSON.stringify(headers, null, 2))
    logger.debug("[Stripe Log] Body length:", body.length)
    
    // Try to parse the body
    let parsedBody
    try {
      parsedBody = JSON.parse(body)
      logger.debug("[Stripe Log] Event type:", parsedBody.type)
      logger.debug("[Stripe Log] Event ID:", parsedBody.id)
      
      if (parsedBody.type === "checkout.session.completed") {
        logger.debug("[Stripe Log] Checkout session data:", {
          session_id: parsedBody.data?.object?.id,
          customer: parsedBody.data?.object?.customer,
          subscription: parsedBody.data?.object?.subscription,
          metadata: parsedBody.data?.object?.metadata,
          customer_email: parsedBody.data?.object?.customer_details?.email,
          amount_total: parsedBody.data?.object?.amount_total,
          payment_status: parsedBody.data?.object?.payment_status
        })
      }
    } catch (parseError) {
      logger.error("[Stripe Log] Failed to parse body:", parseError)
      parsedBody = { raw: body.substring(0, 500) }
    }
    
    // Try to log to Supabase
    try {
      cookies()
      const supabase = await createSupabaseRouteHandlerClient()
      
      // Try to create a simple log entry
      const logEntry = {
        event_type: parsedBody?.type || 'unknown',
        event_id: parsedBody?.id || 'unknown',
        payload: parsedBody,
        headers: headers,
        timestamp: new Date().toISOString()
      }
      
      logger.debug("[Stripe Log] Attempting to store log entry...")
      
      // First try webhook_logs table
      const { error: logError } = await supabase
        .from('webhook_logs')
        .insert(logEntry)
      
      if (logError) {
        logger.debug("[Stripe Log] webhook_logs table not available:", logError.message)
        
        // Try to store in subscriptions table as a test
        if (parsedBody?.type === "checkout.session.completed") {
          const sessionData = parsedBody.data?.object
          const testRecord = {
            user_id: sessionData?.metadata?.user_id || '00000000-0000-0000-0000-000000000000',
            plan_id: sessionData?.metadata?.plan_id || 'webhook_test',
            stripe_customer_id: sessionData?.customer || 'cus_webhook_test',
            stripe_subscription_id: sessionData?.subscription || `sub_webhook_test_${ Date.now()}`,
            status: 'webhook_test',
            billing_cycle: sessionData?.metadata?.billing_cycle || 'test',
            customer_email: sessionData?.customer_details?.email || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          
          logger.debug("[Stripe Log] Attempting to create test subscription record:", testRecord)
          const { error: subError } = await supabase
            .from('subscriptions')
            .insert(testRecord)
          
          if (subError) {
            logger.error("[Stripe Log] Failed to create test record:", subError)
          } else {
            logger.debug("[Stripe Log] Successfully created test subscription record")
          }
        }
      } else {
        logger.debug("[Stripe Log] Successfully logged to webhook_logs table")
      }
    } catch (dbError) {
      logger.error("[Stripe Log] Database error:", dbError)
    }
    
    logger.debug("[Stripe Log] ========================================")
    
    return NextResponse.json({ 
      received: true, 
      logged: true,
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    logger.error("[Stripe Log] Error processing webhook:", error)
    return NextResponse.json({ 
      error: "Failed to log webhook",
      details: error.message 
    }, { status: 500 })
  }
}

// GET endpoint to check if logging is working
export async function GET() {
  return NextResponse.json({
    status: "Stripe webhook logger is active",
    timestamp: new Date().toISOString(),
    purpose: "This endpoint logs all incoming Stripe webhooks for debugging"
  })
}