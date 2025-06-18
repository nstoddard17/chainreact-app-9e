import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const jobId = `simple-refresh-${Date.now()}`
  const startTime = Date.now()

  try {
    // Check for Vercel cron job header
    const cronHeader = request.headers.get("x-vercel-cron")
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    // Allow either Vercel cron header OR secret authentication
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    const isVercelCron = cronHeader === "1"
    
    if (!isVercelCron && (!providedSecret || providedSecret !== expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`🚀 [${jobId}] Simple cron job started`)

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Log the job start
    await supabase.from("token_refresh_logs").insert({
      job_id: jobId,
      executed_at: new Date().toISOString(),
      status: "started",
      duration_ms: 0,
      total_processed: 0,
      successful_refreshes: 0,
      failed_refreshes: 0,
      skipped_refreshes: 0,
      error_count: 0,
      errors: [],
      is_critical_failure: false,
    })

    console.log(`📊 [${jobId}] Step 1: Getting total integration count...`)
    
    // Simple query to get total count
    const { count: totalCount, error: countError } = await supabase
      .from("integrations")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error(`❌ [${jobId}] Error getting count:`, countError)
      throw new Error(`Error getting count: ${countError.message}`)
    }

    console.log(`✅ [${jobId}] Total integrations: ${totalCount}`)

    // Get only connected integrations that might need refresh
    console.log(`📊 [${jobId}] Step 2: Getting connected integrations...`)
    
    const { data: integrations, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .not("refresh_token", "is", null)
      .limit(10) // Limit to 10 for testing

    if (fetchError) {
      console.error(`❌ [${jobId}] Error fetching integrations:`, fetchError)
      throw new Error(`Error fetching integrations: ${fetchError.message}`)
    }

    console.log(`✅ [${jobId}] Found ${integrations?.length || 0} connected integrations with refresh tokens`)

    // Step 2.5: Fix expired status for any connected integrations that are actually expired
    console.log(`🔧 [${jobId}] Step 2.5: Checking for expired integrations that need status update...`)
    const now = new Date()
    let statusFixedCount = 0
    
    for (const integration of integrations || []) {
      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        
        // If token is expired but status is still "connected"
        if (expiresAt < now) {
          console.log(`🔧 [${jobId}] Fixing status for ${integration.provider} - expired at ${expiresAt.toISOString()}`)
          
          const { error: updateError } = await supabase
            .from("integrations")
            .update({
              status: "expired",
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)

          if (updateError) {
            console.error(`❌ [${jobId}] Failed to update status for ${integration.provider}:`, updateError)
          } else {
            statusFixedCount++
            console.log(`✅ [${jobId}] Fixed status for ${integration.provider}: connected → expired`)
          }
        }
      }
    }

    if (statusFixedCount > 0) {
      console.log(`🔧 [${jobId}] Fixed status for ${statusFixedCount} expired integrations`)
    }

    if (!integrations || integrations.length === 0) {
      console.log(`ℹ️ [${jobId}] No integrations to process`)
      
      const endTime = Date.now()
      const durationMs = endTime - startTime
      
      await supabase.from("token_refresh_logs").update({
        status: "completed",
        duration_ms: durationMs,
        total_processed: 0,
        successful_refreshes: 0,
        failed_refreshes: 0,
        skipped_refreshes: 0,
        error_count: 0,
        completed_at: new Date().toISOString(),
      }).eq("job_id", jobId)

      return NextResponse.json({
        success: true,
        message: "Simple token refresh job completed - no integrations to process",
        jobId,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      })
    }

    // Process integrations one by one (no batching for simplicity)
    console.log(`🔄 [${jobId}] Step 3: Processing ${integrations.length} integrations...`)
    
    let successful = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ provider: string; userId: string; error: string }> = []

    for (const integration of integrations) {
      try {
        console.log(`🔍 [${jobId}] Processing ${integration.provider} for user ${integration.user_id}`)
        
        const result = await refreshTokenIfNeeded(integration)
        
        if (result.refreshed) {
          successful++
          console.log(`✅ [${jobId}] Refreshed ${integration.provider}`)
        } else if (result.success) {
          skipped++
          console.log(`⏭️ [${jobId}] Skipped ${integration.provider}: ${result.message}`)
        } else {
          failed++
          errors.push({ 
            provider: integration.provider, 
            userId: integration.user_id, 
            error: result.message 
          })
          console.warn(`⚠️ [${jobId}] Failed ${integration.provider}: ${result.message}`)
        }
      } catch (error: any) {
        failed++
        errors.push({ 
          provider: integration.provider, 
          userId: integration.user_id, 
          error: error.message 
        })
        console.error(`💥 [${jobId}] Error processing ${integration.provider}:`, error)
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime

    console.log(`🏁 [${jobId}] Simple job completed in ${durationMs}ms`)
    console.log(`   - Successful: ${successful}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Skipped: ${skipped}`)

    // Update the job log
    await supabase.from("token_refresh_logs").update({
      status: "completed",
      duration_ms: durationMs,
      total_processed: integrations.length,
      successful_refreshes: successful,
      failed_refreshes: failed,
      skipped_refreshes: skipped,
      error_count: errors.length,
      errors: errors,
      completed_at: new Date().toISOString(),
    }).eq("job_id", jobId)

    return NextResponse.json({
      success: true,
      message: "Simple token refresh job completed",
      jobId,
      duration: `${durationMs}ms`,
      stats: {
        total: integrations.length,
        successful,
        failed,
        skipped,
        errors: errors.length
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical error in simple job:`, error)
    
    const endTime = Date.now()
    const durationMs = endTime - startTime

    // Try to update the job log with error
    try {
      const supabase = getAdminSupabaseClient()
      if (supabase) {
        await supabase.from("token_refresh_logs").update({
          status: "failed",
          duration_ms: durationMs,
          is_critical_failure: true,
          failure_message: error.message,
          completed_at: new Date().toISOString(),
        }).eq("job_id", jobId)
      }
    } catch (logError) {
      console.error(`❌ [${jobId}] Failed to log error:`, logError)
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to complete simple token refresh job",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
} 