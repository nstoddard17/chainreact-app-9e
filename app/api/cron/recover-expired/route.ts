import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const jobId = `recovery-${Date.now()}`
  const startTime = Date.now()

  try {
    // Check for Vercel cron job header OR manual trigger
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

    console.log(`🔄 [${jobId}] Recovery job started`)

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

    // Get expired and disconnected integrations with refresh tokens
    console.log(`🔍 [${jobId}] Step 1: Finding expired/disconnected integrations...`)
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: expiredIntegrations, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .in("status", ["expired", "disconnected", "needs_reauthorization"])
      .not("refresh_token", "is", null)
      .gte("updated_at", sevenDaysAgo)
      .limit(20) // Limit to 20 for safety

    if (fetchError) {
      console.error(`❌ [${jobId}] Error fetching expired integrations:`, fetchError)
      throw new Error(`Error fetching expired integrations: ${fetchError.message}`)
    }

    console.log(`✅ [${jobId}] Found ${expiredIntegrations?.length || 0} expired/disconnected integrations`)

    if (!expiredIntegrations || expiredIntegrations.length === 0) {
      console.log(`ℹ️ [${jobId}] No expired integrations to recover`)
      
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
        message: "Recovery job completed - no expired integrations found",
        jobId,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      })
    }

    // Process expired integrations one by one
    console.log(`🔄 [${jobId}] Step 2: Attempting to recover ${expiredIntegrations.length} integrations...`)
    
    let successful = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ provider: string; userId: string; error: string }> = []

    for (const integration of expiredIntegrations) {
      try {
        console.log(`🔍 [${jobId}] Attempting recovery for ${integration.provider} (status: ${integration.status})`)
        
        // Try to refresh the token
        const result = await refreshTokenIfNeeded(integration)
        
        if (result.refreshed && result.success) {
          // Mark as connected again
          await supabase
            .from("integrations")
            .update({
              status: "connected",
              disconnected_at: null,
              disconnect_reason: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)
          
          successful++
          console.log(`✅ [${jobId}] Successfully recovered ${integration.provider}`)
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
          console.warn(`⚠️ [${jobId}] Failed to recover ${integration.provider}: ${result.message}`)
        }
      } catch (error: any) {
        failed++
        errors.push({ 
          provider: integration.provider, 
          userId: integration.user_id, 
          error: error.message 
        })
        console.error(`💥 [${jobId}] Error recovering ${integration.provider}:`, error)
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime

    console.log(`🏁 [${jobId}] Recovery job completed in ${durationMs}ms`)
    console.log(`   - Successfully recovered: ${successful}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Skipped: ${skipped}`)

    // Update the job log
    await supabase.from("token_refresh_logs").update({
      status: "completed",
      duration_ms: durationMs,
      total_processed: expiredIntegrations.length,
      successful_refreshes: successful,
      failed_refreshes: failed,
      skipped_refreshes: skipped,
      error_count: errors.length,
      errors: errors,
      completed_at: new Date().toISOString(),
    }).eq("job_id", jobId)

    return NextResponse.json({
      success: true,
      message: "Recovery job completed",
      jobId,
      duration: `${durationMs}ms`,
      stats: {
        total: expiredIntegrations.length,
        successful,
        failed,
        skipped,
        errors: errors.length
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error(`💥 [${jobId}] Recovery job failed:`, error)
    
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
        error: "Recovery job failed",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
} 