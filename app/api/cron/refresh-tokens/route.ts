import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"
import { SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Remove the maxDuration limit to prevent timeout issues
// export const maxDuration = 60 // 60 seconds (maximum allowed)

interface RefreshStats {
  totalProcessed: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{
    provider: string
    userId: string
    error: string
  }>
}

// Helper function to add timeout to database queries
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000, operation: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
  })
  
  return Promise.race([promise, timeoutPromise])
}

export async function GET(request: NextRequest) {
  const jobId = `refresh-job-${Date.now()}`
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

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

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

    backgroundRefreshTokens(jobId, startTime).catch((error) => {
      console.error(`[${jobId}] Unhandled error in background token refresh:`, error)
    })

    return NextResponse.json({
      success: true,
      message: "Token refresh job started",
      jobId,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error(`Error starting token refresh job:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to start token refresh job",
        details: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

async function backgroundRefreshTokens(jobId: string, startTime: number): Promise<void> {
  console.log(`🔥 [${jobId}] Entered backgroundRefreshTokens`)
  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    console.error(`❌ [${jobId}] Failed to create Supabase client for background job`)
    return
  }
  console.log(`🛠️ [${jobId}] Supabase admin client created`)

  const stats: RefreshStats = { totalProcessed: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

  try {
    console.log(`🔄 [${jobId}] Starting background token refresh job...`)
    console.log(`⏳ [${jobId}] Updating job status to 'processing'`)
    let updateResult, updateError
    try {
      ;({ data: updateResult, error: updateError } = await supabase
        .from("token_refresh_logs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .select())

      console.log(`   🧾 Update result:`, updateResult)
      if (updateError) {
        console.error(`❌ [${jobId}] Failed to update job status:`, updateError)
      } else {
        console.log(`✅ [${jobId}] Job status updated to processing`)
      }
    } catch (err) {
      console.error(`💥 [${jobId}] Unexpected error on status update:`, err)
    }

    console.log(`📦 [${jobId}] Fetching integrations that need token refresh...`)

    // Calculate 7 days ago for recovery attempts
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    console.log(`🔍 [${jobId}] Step 1: Fetching connected integrations...`)
    // First, get all connected integrations
    const { data: connectedIntegrations, error: connectedError } = await withTimeout(
      supabase.from("integrations").select("*").eq("status", "connected"),
      10000,
      "Fetching connected integrations"
    )

    if (connectedError) {
      console.error(`❌ [${jobId}] Error fetching connected integrations:`, connectedError)
      throw new Error(`Error fetching connected integrations: ${connectedError.message}`)
    }
    console.log(`✅ [${jobId}] Found ${connectedIntegrations?.length || 0} connected integrations`)

    console.log(`🔍 [${jobId}] Step 2: Fetching disconnected integrations...`)
    // Then get recently disconnected integrations with refresh tokens
    const { data: disconnectedIntegrations, error: disconnectedError } = await withTimeout(
      supabase
        .from("integrations")
        .select("*")
        .eq("status", "disconnected")
        .not("refresh_token", "is", null)
        .gte("disconnected_at", sevenDaysAgo),
      10000,
      "Fetching disconnected integrations"
    )

    if (disconnectedError) {
      console.error(`❌ [${jobId}] Error fetching disconnected integrations:`, disconnectedError)
    }
    console.log(`✅ [${jobId}] Found ${disconnectedIntegrations?.length || 0} disconnected integrations`)

    console.log(`🔍 [${jobId}] Step 3: Fetching reauthorization integrations...`)
    // Get integrations needing reauthorization with refresh tokens
    const { data: reAuthIntegrations, error: reAuthError } = await withTimeout(
      supabase
        .from("integrations")
        .select("*")
        .eq("status", "needs_reauthorization")
        .not("refresh_token", "is", null)
        .gte("updated_at", sevenDaysAgo),
      10000,
      "Fetching reauthorization integrations"
    )

    if (reAuthError) {
      console.error(`❌ [${jobId}] Error fetching reauth integrations:`, reAuthError)
    }
    console.log(`✅ [${jobId}] Found ${reAuthIntegrations?.length || 0} reauthorization integrations`)

    console.log(`🔍 [${jobId}] Step 4: Fetching expired integrations...`)
    // Get expired integrations with refresh tokens
    const { data: expiredIntegrations, error: expiredError } = await withTimeout(
      supabase
        .from("integrations")
        .select("*")
        .eq("status", "expired")
        .gte("updated_at", sevenDaysAgo),
      10000,
      "Fetching expired integrations"
    )

    if (expiredError) {
      console.error(`❌ [${jobId}] Error fetching expired integrations:`, expiredError)
    }
    console.log(`✅ [${jobId}] Found ${expiredIntegrations?.length || 0} expired integrations`)

    console.log(`🔍 [${jobId}] Step 5: Combining and deduplicating integrations...`)
    // Combine all results
    const integrations = [
      ...(connectedIntegrations || []),
      ...(disconnectedIntegrations || []),
      ...(reAuthIntegrations || []),
      ...(expiredIntegrations || []),
    ]

    // Remove duplicates by id (shouldn't happen but just in case)
    const uniqueIntegrations = integrations.filter(
      (integration, index, self) => index === self.findIndex((i) => i.id === integration.id),
    )

    console.log(`📊 [${jobId}] Integration summary:`)
    console.log(`   - Total found: ${integrations.length}`)
    console.log(`   - After deduplication: ${uniqueIntegrations.length}`)
    console.log(`   - Connected: ${connectedIntegrations?.length || 0}`)
    console.log(`   - Disconnected: ${disconnectedIntegrations?.length || 0}`)
    console.log(`   - Needs Reauth: ${reAuthIntegrations?.length || 0}`)
    console.log(`   - Expired: ${expiredIntegrations?.length || 0}`)

    if (!uniqueIntegrations?.length) {
      console.log(`ℹ️ [${jobId}] No integrations found that need token refresh`)
      await completeJob(supabase, jobId, startTime, stats, false)
      return
    }

    console.log(`🔍 [${jobId}] Found ${uniqueIntegrations.length} integrations that need attention`)
    console.log(`   - Connected: ${uniqueIntegrations.filter((i) => i.status === "connected").length}`)
    console.log(`   - Disconnected: ${uniqueIntegrations.filter((i) => i.status === "disconnected").length}`)
    console.log(`   - Needs Reauth: ${uniqueIntegrations.filter((i) => i.status === "needs_reauthorization").length}`)
    console.log(`   - Expired: ${uniqueIntegrations.filter((i) => i.status === "expired").length}`)

    stats.totalProcessed = uniqueIntegrations.length

    const batchSize = 5
    for (let i = 0; i < uniqueIntegrations.length; i += batchSize) {
      if (i > 0 && i % 20 === 0) {
        console.log(`📊 [${jobId}] Progress update: ${i}/${uniqueIntegrations.length} processed`)
        await supabase
          .from("token_refresh_logs")
          .update({
            status: `processing (${i}/${uniqueIntegrations.length})`,
            total_processed: i,
            successful_refreshes: stats.successful,
            failed_refreshes: stats.failed,
            skipped_refreshes: stats.skipped,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId)
      }

      const batch = uniqueIntegrations.slice(i, i + batchSize)
      console.log(`🔄 [${jobId}] Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} integrations`)

      await Promise.allSettled(
        batch.map(async (integration) => {
          try {
            console.log(`🔍 [${jobId}] Processing ${integration.provider} for user ${integration.user_id}`)
            const result = await processIntegrationRefresh(integration, supabase, jobId)

            if (result.refreshed) {
              stats.successful++
              console.log(`✅ [${jobId}] Refreshed ${integration.provider} for user ${integration.user_id}`)
            } else if (result.success) {
              stats.skipped++
              console.log(`⏭️ [${jobId}] Skipped ${integration.provider}: ${result.message}`)
            } else {
              stats.failed++
              stats.errors.push({ provider: integration.provider, userId: integration.user_id, error: result.message })
              console.warn(`⚠️ [${jobId}] Failed refreshing ${integration.provider}: ${result.message}`)
            }
          } catch (error: any) {
            stats.failed++
            stats.errors.push({ provider: integration.provider, userId: integration.user_id, error: error.message })
            console.error(
              `💥 [${jobId}] Error processing ${integration.provider} for user ${integration.user_id}:`,
              error,
            )
          }
        }),
      )

      if (i + batchSize < uniqueIntegrations.length) {
        console.log(`⏸️ [${jobId}] Waiting 1s before next batch…`)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    console.log(`🧹 [${jobId}] Cleaning up old logs…`)
    await cleanupOldLogs(supabase)
    await completeJob(supabase, jobId, startTime, stats, false)
    console.log(
      `✅ [${jobId}] Token refresh job complete — ${stats.successful} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`,
    )
  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical error in background job:`, error)
    await completeJob(supabase, jobId, startTime, stats, true, error.message)
  }
}

async function processIntegrationRefresh(
  integration: any,
  supabase: SupabaseClient<any, "public", any>,
  jobId: string,
) {
  const { provider, user_id, id } = integration
  const logPrefix = `[${jobId}] [${provider}:${id}]`
  const THIRTY_MINUTES = 30 * 60
  
  const now = Math.floor(Date.now() / 1000)
  console.log(`${logPrefix} Processing ${provider} (status: ${integration.status})`)
  console.log(`   - expires_at: ${integration.expires_at}`)
  console.log(`   - refresh_token exists: ${!!integration.refresh_token}`)
  console.log(`   - consecutive_failures: ${integration.consecutive_failures || 0}`)
  console.log(`   - using threshold: ${THIRTY_MINUTES / 60} minutes`)

  // If integration is disconnected/expired, try to recover it
  if (["disconnected", "needs_reauthorization", "expired"].includes(integration.status)) {
    console.log(`${logPrefix} Attempting to recover ${provider} integration`)

    if (!integration.refresh_token) {
      console.log(`${logPrefix} Cannot recover ${provider}: no refresh token - marking as needs_reauthorization`)
      await supabase
        .from("integrations")
        .update({ 
          status: "needs_reauthorization", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", integration.id)
      return { refreshed: false, success: false, message: "Cannot recover: no refresh token - marked for reauthorization" }
    }

    // Try to refresh the token regardless of expiry for recovery attempts
    console.log(`${logPrefix} Attempting recovery refresh for ${provider}`)
    const result = await refreshTokenWithRetry(integration, supabase, 3, true, jobId)

    // If successful, mark as connected again
    if (result.refreshed && result.success) {
      console.log(`${logPrefix} Successfully recovered ${provider}`)
      await supabase
        .from("integrations")
        .update({
          status: "connected",
          disconnected_at: null,
          disconnect_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)
    }

    return result
  }

  // Check if token needs refresh
  if (integration.expires_at && integration.refresh_token) {
    const expiresAt = typeof integration.expires_at === 'string' 
      ? Math.floor(new Date(integration.expires_at).getTime() / 1000)
      : integration.expires_at
    
    const timeUntilExpiry = expiresAt - now
    
    console.log(`${logPrefix} Token expires in ${Math.floor(timeUntilExpiry / 60)} minutes`)
    
    if (timeUntilExpiry <= THIRTY_MINUTES) {
      console.log(`${logPrefix} Token expires within ${THIRTY_MINUTES / 60} minutes, refreshing...`)
      console.log(`${logPrefix} Preparing to call refreshTokenWithRetry`)
      const result = await refreshTokenWithRetry(integration, supabase, 3, false, jobId)
      console.log(`${logPrefix} ⬅️ Completed refresh for ${provider}`)
      return result
    } else {
      console.log(`${logPrefix} Token is still valid for ${Math.floor(timeUntilExpiry / 60)} minutes, skipping refresh`)
    }
  } else {
    console.log(`${logPrefix} No expiry or refresh token, skipping`)
  }

  return { refreshed: false, success: true, message: "Token not due for refresh" }
}

async function refreshTokenWithRetry(
  integration: any,
  supabase: SupabaseClient<any, "public", any>,
  maxRetries: number,
  isExpired: boolean,
  jobId: string,
) {
  let lastError: any
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[${jobId}] 🔄 Attempt ${attempt}/${maxRetries} for ${integration.provider}`)
    try {
      let result
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Token refresh timeout')), 30000) // 30 second timeout
        })
        
        const refreshPromise = refreshTokenIfNeeded(integration)
        result = await Promise.race([refreshPromise, timeoutPromise])
        
        console.log(`[${jobId}] 🔁 Received result from refreshTokenIfNeeded:`, result)
      } catch (err) {
        console.error(`[${jobId}] ❌ refreshTokenIfNeeded threw:`, err)
        throw err
      }

      if (result?.success) {
        await supabase
          .from("integrations")
          .update({
            last_token_refresh: new Date().toISOString(),
            consecutive_failures: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id)
        console.log(`✅ [${jobId}] ${integration.provider} refresh success`)
        return result
      } else {
        lastError = new Error(result.message)
        console.log(`[${jobId}] ⚠️ Refresh attempt failed: ${result.message}`)
      }
    } catch (error) {
      lastError = error
      console.warn(`[${jobId}] ❌ Attempt ${attempt} error:`, error)
    }

    if (attempt < maxRetries) {
      const wait = Math.pow(2, attempt) * 1000
      console.log(`[${jobId}] ⏸️ Waiting ${wait}ms before retry`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  await supabase
    .from("integrations")
    .update({
      consecutive_failures: (integration.consecutive_failures || 0) + 1,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id)

  console.log(`[${jobId}] 💥 All retries failed for ${integration.provider}`)
  throw lastError
}

async function cleanupOldLogs(supabase: SupabaseClient<any, "public", any>) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    console.log(`🧹 Cleaning up logs older than ${twentyFourHoursAgo}`)
    const { error } = await supabase.from("token_refresh_logs").delete().lt("executed_at", twentyFourHoursAgo)

    if (error) {
      console.error("❌ Error cleaning up old logs:", error)
    } else {
      console.log("✅ Old logs cleanup complete")
    }
  } catch (error: any) {
    console.error("❌ Error cleaning up old logs:", error)
  }
}

async function completeJob(
  supabase: SupabaseClient<any, "public", any>,
  jobId: string,
  startTime: number,
  stats: RefreshStats,
  isCriticalFailure: boolean,
  failureMessage?: string,
) {
  const endTime = Date.now()
  const durationMs = endTime - startTime

  console.log(`[${jobId}] 🏁 Completing job with status ${isCriticalFailure ? "failed" : "completed"}`)

  const updateData: any = {
    status: isCriticalFailure ? "failed" : "completed",
    duration_ms: durationMs,
    total_processed: stats.totalProcessed,
    successful_refreshes: stats.successful,
    failed_refreshes: stats.failed,
    skipped_refreshes: stats.skipped,
    error_count: stats.errors.length,
    errors: stats.errors,
    is_critical_failure: isCriticalFailure,
    completed_at: new Date().toISOString(),
  }

  if (failureMessage) {
    updateData.failure_message = failureMessage
  }

  const { error } = await supabase.from("token_refresh_logs").update(updateData).eq("job_id", jobId)

  if (error) {
    console.error(`❌ [${jobId}] Failed to update job status to completed:`, error)
  } else {
    console.log(`✅ [${jobId}] Job status updated to completed`)
  }
}
