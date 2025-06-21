import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const jobId = `unified-refresh-${Date.now()}`
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

    console.log(`🚀 [${jobId}] Unified integration management job started`)

    const supabase = createAdminClient()
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

    // Step 2: Get all integrations that need attention
    console.log(`📊 [${jobId}] Step 2: Getting integrations that need attention...`)

    const now = new Date()
    const soon = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes from now

    // Get integrations that are already in a state requiring attention
    const { data: problemIntegrations, error: problemFetchError } = await supabase
      .from("integrations")
      .select("*")
      .in("status", ["disconnected", "expired", "needs_reauthorization"])

    if (problemFetchError) {
      console.error(`❌ [${jobId}] Error fetching problem integrations:`, problemFetchError)
      throw new Error(`Error fetching problem integrations: ${problemFetchError.message}`)
    }
    console.log(`✅ [${jobId}] Found ${problemIntegrations?.length || 0} integrations with problem statuses.`)

    // Get integrations that are connected but will expire soon
    const { data: expiringIntegrations, error: expiringFetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .lt("expires_at", soon.toISOString())

    if (expiringFetchError) {
      console.error(`❌ [${jobId}] Error fetching expiring integrations:`, expiringFetchError)
      throw new Error(`Error fetching expiring integrations: ${expiringFetchError.message}`)
    }
    console.log(`✅ [${jobId}] Found ${expiringIntegrations?.length || 0} integrations expiring soon.`)

    // Combine and deduplicate integrations
    const allIntegrationsMap = new Map()
    if (problemIntegrations) {
      problemIntegrations.forEach(int => allIntegrationsMap.set(int.id, int))
    }
    if (expiringIntegrations) {
      expiringIntegrations.forEach(int => allIntegrationsMap.set(int.id, int))
    }
    const allIntegrations = Array.from(allIntegrationsMap.values())

    console.log(`✅ [${jobId}] Found a total of ${allIntegrations.length} unique integrations to process.`)

    // Step 3: Fix incorrect integration statuses
    console.log(`🔧 [${jobId}] Step 3: Correcting any incorrect integration statuses...`)
    let statusFixedCount = 0

    for (const integration of allIntegrations || []) {
      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        const now = new Date()

        // CASE 1: Fix 'connected' status for tokens that are actually expired
        if (expiresAt.getTime() <= now.getTime() && integration.status === "connected") {
          console.log(`🔧 [${jobId}] Fixing status for ${integration.provider}: connected -> expired`)

          const { error: updateError } = await supabase
            .from("integrations")
            .update({
              status: "expired",
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)

          if (updateError) {
            console.error(`❌ [${jobId}] Failed to correct status for ${integration.provider}:`, updateError)
          } else {
            statusFixedCount++
            integration.status = "expired" // Update in-memory object for the next step
            console.log(`✅ [${jobId}] Corrected status for ${integration.provider}`)
          }
        }
        // CASE 2: Fix 'expired' status for tokens that are actually still valid
        else if (expiresAt.getTime() > now.getTime() && integration.status === "expired") {
          console.log(`🔧 [${jobId}] Fixing status for ${integration.provider}: expired -> connected`)

          const { error: updateError } = await supabase
            .from("integrations")
            .update({
              status: "connected",
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)

          if (updateError) {
            console.error(`❌ [${jobId}] Failed to correct status for ${integration.provider}:`, updateError)
          } else {
            statusFixedCount++
            integration.status = "connected" // Update in-memory object for the next step
            console.log(`✅ [${jobId}] Corrected status for ${integration.provider}`)
          }
        }
      }
    }

    if (statusFixedCount > 0) {
      console.log(`🔧 [${jobId}] Corrected status for ${statusFixedCount} integrations`)
    }

    if (!allIntegrations || allIntegrations.length === 0) {
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
        message: "Unified integration management job completed - no integrations to process",
        jobId,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      })
    }

    // Step 4: Process all integrations
    console.log(`🔄 [${jobId}] Step 4: Processing ${allIntegrations.length} integrations...`)
    
    let successful = 0
    let failed = 0
    let skipped = 0
    let recovered = 0
    const errors: Array<{ provider: string; userId: string; error: string }> = []

    // Group integrations by status for better logging
    const connectedCount = allIntegrations.filter(i => i.status === "connected").length
    const disconnectedCount = allIntegrations.filter(i => i.status === "disconnected").length
    const expiredCount = allIntegrations.filter(i => i.status === "expired").length
    const needsReauthCount = allIntegrations.filter(i => i.status === "needs_reauthorization").length

    console.log(`📊 [${jobId}] Integration breakdown:`)
    console.log(`   - Connected: ${connectedCount}`)
    console.log(`   - Disconnected: ${disconnectedCount}`)
    console.log(`   - Expired: ${expiredCount}`)
    console.log(`   - Needs Reauth: ${needsReauthCount}`)

    for (const integration of allIntegrations) {
      try {
        console.log(`🔍 [${jobId}] Processing ${integration.provider} for user ${integration.user_id} (status: ${integration.status})`)
        
        // Check if integration has no refresh token and is expired
        if (!integration.refresh_token && integration.expires_at) {
          const expiresAt = new Date(integration.expires_at)
          const currentTime = new Date()
          
          if (expiresAt < currentTime) {
            console.log(`🔧 [${jobId}] Integration ${integration.provider} has no refresh token and is expired - marking as needs_reauthorization`)
            
            const { error: updateError } = await supabase
              .from("integrations")
              .update({
                status: "needs_reauthorization",
                updated_at: new Date().toISOString(),
              })
              .eq("id", integration.id)

            if (updateError) {
              console.error(`❌ [${jobId}] Failed to update status for ${integration.provider}:`, updateError)
              failed++
              errors.push({ 
                provider: integration.provider, 
                userId: integration.user_id, 
                error: `Failed to mark as needs_reauthorization: ${updateError.message}` 
              })
            } else {
              console.log(`✅ [${jobId}] Marked ${integration.provider} as needs_reauthorization`)
              // Count this as a status fix
              statusFixedCount++
            }
            continue // Skip the refresh attempt since there's no refresh token
          }
        }
        
        // Check if the token is about to expire
        if (integration.expires_at) {
          const expiresAt = new Date(integration.expires_at);
          const now = new Date();
          const timeUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
          
          if (timeUntilExpiry <= 0) {
            console.log(`Token for ${integration.provider} already expired (${timeUntilExpiry.toFixed(0)}s). Refreshing...`);
          } else if (timeUntilExpiry <= 1800) { // 30 minutes
            console.log(`Token for ${integration.provider} expires within 30 minutes (${timeUntilExpiry.toFixed(0)}s). Refreshing...`);
          }
        }
        
        // If the integration is marked as expired, log that we're trying to recover it
        if (integration.status === "expired") {
          console.log(`Integration ${integration.provider} is marked as expired. Attempting recovery...`);
        }
        
        const result = await refreshTokenIfNeeded(integration)
        
        if (result.refreshed) {
          successful++
          
          // If this was a disconnected/expired integration that got refreshed, mark it as recovered
          if (["disconnected", "expired", "needs_reauthorization"].includes(integration.status)) {
            console.log(`🔄 [${jobId}] Attempting to recover ${integration.provider}...`)
            
            // Try to mark as connected again
            const { error: updateError } = await supabase
              .from("integrations")
              .update({
                status: "connected",
                disconnected_at: null,
                disconnect_reason: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", integration.id)

            if (updateError) {
              console.error(`❌ [${jobId}] Failed to update status for recovered ${integration.provider}:`, updateError)
            } else {
              recovered++
              console.log(`✅ [${jobId}] Successfully recovered ${integration.provider}`)
            }
          } else {
            console.log(`✅ [${jobId}] Refreshed ${integration.provider}`)
          }
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
          
          // Check if the token has actually expired based on its expires_at timestamp
          if (integration.expires_at) {
            const now = new Date();
            const expiresAt = new Date(integration.expires_at);
            const timeUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
            
            if (expiresAt <= now) {
              // Token is actually expired, update status to "expired"
              console.log(`[${jobId}] Setting ${integration.provider} status to 'expired' since processing failed and token has expired (${integration.expires_at})`);
              
              await supabase
                .from("integrations")
                .update({
                  status: "expired",
                  consecutive_failures: (integration.consecutive_failures || 0) + 1,
                  last_failure_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", integration.id);
            } else {
              // Token is still valid, keep status as "connected"
              console.log(`[${jobId}] Keeping ${integration.provider} status as 'connected' since token is still valid for ${timeUntilExpiry.toFixed(0)} seconds despite error`);
              
              // Only set status if it's not already connected
              if (integration.status !== "connected") {
                await supabase
                  .from("integrations")
                  .update({
                    status: "connected",
                    consecutive_failures: (integration.consecutive_failures || 0) + 1,
                    last_failure_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", integration.id);
              } else {
                // Just update the failure count
                await supabase
                  .from("integrations")
                  .update({
                    consecutive_failures: (integration.consecutive_failures || 0) + 1,
                    last_failure_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", integration.id);
              }
            }
          }
        }
      } catch (error: any) {
        failed++
        errors.push({ 
          provider: integration.provider, 
          userId: integration.user_id, 
          error: error.message 
        })
        console.error(`💥 [${jobId}] Error processing ${integration.provider}:`, error)
        
        // Check if the token has actually expired based on its expires_at timestamp
        if (integration.expires_at) {
          const now = new Date();
          const expiresAt = new Date(integration.expires_at);
          const timeUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
          
          if (expiresAt <= now) {
            // Token is actually expired, update status to "expired"
            console.log(`[${jobId}] Setting ${integration.provider} status to 'expired' since processing failed and token has expired (${integration.expires_at})`);
            
            await supabase
              .from("integrations")
              .update({
                status: "expired",
                consecutive_failures: (integration.consecutive_failures || 0) + 1,
                last_failure_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", integration.id);
          } else {
            // Token is still valid, keep status as "connected"
            console.log(`[${jobId}] Keeping ${integration.provider} status as 'connected' since token is still valid for ${timeUntilExpiry.toFixed(0)} seconds despite error`);
            
            // Only set status if it's not already connected
            if (integration.status !== "connected") {
              await supabase
                .from("integrations")
                .update({
                  status: "connected",
                  consecutive_failures: (integration.consecutive_failures || 0) + 1,
                  last_failure_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", integration.id);
            } else {
              // Just update the failure count
              await supabase
                .from("integrations")
                .update({
                  consecutive_failures: (integration.consecutive_failures || 0) + 1,
                  last_failure_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", integration.id);
            }
          }
        }
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime

    console.log(`🏁 [${jobId}] Unified job completed in ${durationMs}ms`)
    console.log(`   - Successful refreshes: ${successful}`)
    console.log(`   - Recovered integrations: ${recovered}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Skipped: ${skipped}`)
    console.log(`   - Status fixes: ${statusFixedCount}`)

    // Update the job log
    await supabase.from("token_refresh_logs").update({
      status: "completed",
      duration_ms: durationMs,
      total_processed: allIntegrations.length,
      successful_refreshes: successful,
      failed_refreshes: failed,
      skipped_refreshes: skipped,
      error_count: errors.length,
      errors: errors,
      completed_at: new Date().toISOString(),
    }).eq("job_id", jobId)

    return NextResponse.json({
      success: true,
      message: "Unified integration management job completed",
      jobId,
      duration: `${durationMs}ms`,
      stats: {
        total: allIntegrations.length,
        successful,
        recovered,
        failed,
        skipped,
        status_fixes: statusFixedCount,
        errors: errors.length,
        breakdown: {
          connected: connectedCount,
          disconnected: disconnectedCount,
          expired: expiredCount,
          needs_reauth: needsReauthCount
        }
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical error in unified job:`, error)
    
    const endTime = Date.now()
    const durationMs = endTime - startTime

    // Try to update the job log with error
    try {
      const supabase = createAdminClient()
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
        error: "Failed to complete unified integration management job",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
} 