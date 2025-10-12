import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // Check for secret authentication
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("admin_secret")
    const expectedSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 })
    }

    // Allow secret authentication
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the request body
    let body: any = {}
    try {
      body = await request.json()
    } catch (e) {
      // If no body is provided, use default values
    }

    // Get parameters
    const problemProviders = body.providers || ['kit', 'tiktok', 'paypal']
    const userId = body.userId // Optional: target a specific user
    const integrationId = body.integrationId // Optional: target a specific integration
    const limit = body.limit || 20 // Limit the number of integrations to process
    
    logger.debug(`🔧 Resetting problematic integrations: ${problemProviders.join(', ')}`)

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Build the query to find problematic integrations
    let query = supabase
      .from("integrations")
      .select("id, provider, user_id, status")
      .in("provider", problemProviders)
      .not("refresh_token", "is", null)
      
    // Add filters if provided
    if (userId) {
      query = query.eq("user_id", userId)
    }
    
    if (integrationId) {
      query = query.eq("id", integrationId)
    }
    
    // Limit the number of records
    query = query.limit(limit)

    // Execute the query
    const { data: integrations, error: findError } = await query
    
    if (findError) {
      logger.error(`❌ Error finding problematic integrations:`, findError)
      return NextResponse.json({ error: `Failed to find integrations: ${findError.message}` }, { status: 500 })
    }
    
    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No problematic integrations found to reset" 
      })
    }
    
    logger.debug(`🔄 Found ${integrations.length} problematic integrations to reset`)
    
    // Process in smaller batches to avoid timeouts
    const batchSize = 5
    const results = []
    
    for (let i = 0; i < integrations.length; i += batchSize) {
      const batch = integrations.slice(i, i + batchSize)
      
      // Update these integrations to be active and set to expire soon
      const { error: updateError, count } = await supabase
        .from("integrations")
        .update({
          status: "connected",
          consecutive_failures: 0,
          disconnect_reason: null,
          disconnected_at: null,
          // Set to expire in 15 minutes to ensure they get processed
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .in("id", batch.map(i => i.id))
        
      if (updateError) {
        logger.error(`❌ Error resetting batch of problematic integrations:`, updateError)
        results.push({
          batch: i / batchSize + 1,
          success: false,
          error: updateError.message
        })
      } else {
        logger.debug(`✅ Successfully reset ${count} problematic integrations in batch ${Math.floor(i/batchSize) + 1}`)
        results.push({
          batch: i / batchSize + 1,
          success: true,
          count
        })
      }
      
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return NextResponse.json({
      success: true,
      message: `Reset ${integrations.length} problematic integrations`,
      integrations: integrations.map(i => ({ id: i.id, provider: i.provider, user_id: i.user_id, status: i.status })),
      results
    })
  } catch (error: any) {
    logger.error(`💥 Error in reset-problem-integrations:`, error)
    return NextResponse.json({
      success: false,
      error: `Failed to reset problematic integrations: ${error.message}`,
    }, { status: 500 })
  }
} 