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
    const { error: updateError } = await supabase
      .from("token_refresh_logs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("job_id", jobId)

    if (updateError) {
      console.error(`❌ [${jobId}] Failed to update job status:`, updateError)
    } else {
      console.log(`✅ [${jobId}] Job status updated to processing`)
    }

    console.log(`📦 [${jobId}] Fetching connected integrations...`)
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")

    if (error) {
      console.error(`❌ [${jobId}] Supabase fetch error:`, error)
      throw new Error(`Error fetching integrations: ${error.message}`)
    }
    if (!integrations?.length) {
      console.log(`ℹ️ [${jobId}] No connected integrations found`)
      await completeJob(supabase, jobId, startTime, stats, false)
      return
    }

    console.log(`🔍 [${jobId}] Found ${integrations.length} connected integrations`)
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
            console.error(`💥 [${jobId}] Error processing ${integration.provider} for user ${integration.user_id}:`, error)
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
    console.log(`✅ [${jobId}] Token refresh job complete — ${stats.successful} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`)
  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical error in background job:`, error)
    await completeJob(supabase, jobId, startTime, stats, true, error.message)
  }
}

async function processIntegrationRefresh(integration: any, supabase: any, jobId: string) {
  const THIRTY_MINUTES = 30 * 60
  const now = Math.floor(Date.now() / 1000)
  console.log(`[${jobId}] ➡️ Enter processIntegrationRefresh (${integration.provider})`)
  console.log(`   - expires_at: ${integration.expires_at}`)
  console.log(`   - refresh_token exists: ${!!integration.refresh_token}`)
  console.log(`   - consecutive_failures: ${integration.consecutive_failures || 0}`)

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
    await supabase.from("integrations").update({ status: "needs_reauthorization", updated_at: new Date().toISOString() }).eq("id", integration.id)
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
      const result = await refreshTokenIfNeeded(integration)
      if (result.success) {
        await supabase.from("integrations").update({
          last_token_refresh: new Date().toISOString(),
          consecutive_failures: 0,
          updated_at: new Date().toISOString(),
        }).eq("id", integration.id)
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
  await supabase.from("integrations").update({
    consecutive_failures: (integration.consecutive_failures || 0) + 1,
    last_failure_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integration.id)

  console.log(`[${jobId}] 💥 All retries failed for ${integration.provider}`)
  throw lastError
}

// cleanupOldLogs and completeJob remain unchanged and follow same pattern
