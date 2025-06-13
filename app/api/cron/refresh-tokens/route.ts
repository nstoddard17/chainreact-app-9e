import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // 60 seconds (maximum allowed)

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

export async function GET(request: NextRequest) {
  const jobId = `refresh-job-${Date.now()}`
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminSupabaseClient()
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
  const supabase = createAdminSupabaseClient()
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

    // Fetch integrations that need attention:
    // 1. Connected integrations
    // 2. Recently disconnected integrations with refresh tokens (within 7 days)
    // 3. Integrations marked as needs_reauthorization with refresh tokens (within 7 days)
    // 4. Expired integrations that still have refresh tokens
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .or(`
    status.eq.connected,
    and(
      status.eq.disconnected,
      refresh_token.not.is.null,
      disconnected_at.gte.${sevenDaysAgo}
    ),
    and(
      status.eq.needs_reauthorization,
      refresh_token.not.is.null,
      updated_at.gte.${sevenDaysAgo}
    ),
    and(
      status.eq.expired,
      refresh_token.not.is.null,
      updated_at.gte.${sevenDaysAgo}
    )
  `)

    if (error) {
      console.error(`❌ [${jobId}] Supabase fetch error:`, error)
      throw new Error(`Error fetching integrations: ${error.message}`)
    }

    if (!integrations?.length) {
      console.log(`ℹ️ [${jobId}] No integrations found that need token refresh`)
      await completeJob(supabase, jobId, startTime, stats, false)
      return
    }

    console.log(`🔍 [${jobId}] Found ${integrations.length} integrations that need attention`)
    console.log(`   - Connected: ${integrations.filter((i) => i.status === "connected").length}`)
    console.log(`   - Disconnected: ${integrations.filter((i) => i.status === "disconnected").length}`)
    console.log(`   - Needs Reauth: ${integrations.filter((i) => i.status === "needs_reauthorization").length}`)
    console.log(`   - Expired: ${integrations.filter((i) => i.status === "expired").length}`)

    stats.totalProcessed = integrations.length

    const batchSize = 5
    for (let i = 0; i < integrations.length; i += batchSize) {
      if (i > 0 && i % 20 === 0) {
        console.log(`📊 [${jobId}] Progress update: ${i}/${integrations.length} processed`)
        await supabase
          .from("token_refresh_logs")
          .update({
            status: `processing (${i}/${integrations.length})`,
            total_processed: i,
            successful_refreshes: stats.successful,
            failed_refreshes: stats.failed,
            skipped_refreshes: stats.skipped,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId)
      }

      const batch = integrations.slice(i, i + batchSize)
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

      if (i + batchSize < integrations.length) {
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

async function processIntegrationRefresh(integration: any, supabase: any, jobId: string) {
  const THIRTY_MINUTES = 30 * 60
  const now = Math.floor(Date.now() / 1000)
  console.log(`[${jobId}] ➡️ Processing ${integration.provider} (status: ${integration.status})`)
  console.log(`   - expires_at: ${integration.expires_at}`)
  console.log(`   - refresh_token exists: ${!!integration.refresh_token}`)
  console.log(`   - consecutive_failures: ${integration.consecutive_failures || 0}`)

  // If integration is disconnected/expired, try to recover it
  if (["disconnected", "needs_reauthorization", "expired"].includes(integration.status)) {
    console.log(`🔄 [${jobId}] Attempting to recover ${integration.status} integration: ${integration.provider}`)

    if (!integration.refresh_token) {
      console.log(`❌ [${jobId}] Cannot recover ${integration.provider}: no refresh token`)
      return { refreshed: false, success: false, message: "Cannot recover: no refresh token" }
    }

    // Try to refresh the token regardless of expiry for recovery attempts
    console.log(`[${jobId}] Attempting recovery refresh for ${integration.provider}`)
    const result = await refreshTokenWithRetry(integration, supabase, 3, true, jobId)

    // If successful, mark as connected again
    if (result.refreshed && result.success) {
      console.log(`✅ [${jobId}] Successfully recovered ${integration.provider}`)
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

  // Normal processing for connected integrations
  let needsAttention = false
  let isExpired = false

  if (integration.expires_at) {
    const expiresAt =
      typeof integration.expires_at === "string"
        ? Math.floor(new Date(integration.expires_at).getTime() / 1000)
        : integration.expires_at
    const expiresIn = expiresAt - now
    isExpired = expiresIn <= 0
    needsAttention = isExpired || expiresIn < THIRTY_MINUTES

    console.log(`   - expires in: ${expiresIn}s (${Math.floor(expiresIn / 60)}min)`)
    console.log(`   - isExpired: ${isExpired}, needsAttention: ${needsAttention}`)
  } else {
    needsAttention = true
    console.log(`⚠️ No expiry set for ${integration.provider} — needs attention`)
  }

  if (!needsAttention) {
    console.log(`[${jobId}] ⬅️ Skip ${integration.provider}: not due`)
    return { refreshed: false, success: true, message: "Token not due for refresh" }
  }

  if (!integration.refresh_token) {
    console.log(`⚠️ ${integration.provider} missing refresh token — marking reauthorization`)
    await supabase
      .from("integrations")
      .update({ status: "needs_reauthorization", updated_at: new Date().toISOString() })
      .eq("id", integration.id)
    try {
      await supabase.rpc("create_token_expiry_notification", {
        p_user_id: integration.user_id,
        p_provider: integration.provider,
      })
    } catch (notifError) {
      console.error(`❌ Notification for ${integration.provider} failed:`, notifError)
    }
    return { refreshed: false, success: false, message: "Token needs reauthorization (no refresh token)" }
  }

  console.log(`[${jobId}] Preparing to call refreshTokenWithRetry`)
  const result = await refreshTokenWithRetry(integration, supabase, 3, isExpired, jobId)
  console.log(`[${jobId}] ⬅️ Completed refresh for ${integration.provider}`)
  return result
}

async function refreshTokenWithRetry(
  integration: any,
  supabase: any,
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
        result = await refreshTokenIfNeeded(integration)
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

async function cleanupOldLogs(supabase: any) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  console.log(`🧹 Cleaning up logs older than ${thirtyDaysAgo}`)
  const { error } = await supabase.from("token_refresh_logs").delete().lt("executed_at", thirtyDaysAgo)

  if (error) {
    console.error("❌ Error cleaning up old logs:", error)
  } else {
    console.log("✅ Old logs cleanup complete")
  }
}

async function completeJob(
  supabase: any,
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
