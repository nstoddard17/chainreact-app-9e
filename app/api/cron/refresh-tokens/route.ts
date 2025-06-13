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
    // Check for authentication - accept both header and query parameter
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")

    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    // Check authorization from header or query parameter
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create a Supabase client for database operations
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Log job start in the database
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

    // Start the background work without awaiting it
    // This allows us to return a response immediately
    backgroundRefreshTokens(jobId, startTime).catch((error) => {
      console.error("Unhandled error in background token refresh:", error)
    })

    // Return an immediate response
    return NextResponse.json({
      success: true,
      message: "Token refresh job started",
      jobId,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error starting token refresh job:", error)
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

/**
 * Background function to refresh tokens
 * This runs after the HTTP response has been sent
 */
async function backgroundRefreshTokens(jobId: string, startTime: number): Promise<void> {
  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    console.error("Failed to create Supabase client for background job")
    return
  }

  const stats: RefreshStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  try {
    console.log(`🔄 [${jobId}] Starting background token refresh job...`)

    // Update job status to "processing"
    await supabase
      .from("token_refresh_logs")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)

    // Get ALL connected integrations (not just ones with refresh tokens)
    const { data: integrations, error } = await supabase.from("integrations").select("*").eq("status", "connected")
    // Removed the filter for refresh tokens

    if (error) {
      throw new Error(`Error fetching integrations: ${error.message}`)
    }

    if (!integrations || integrations.length === 0) {
      console.log(`ℹ️ [${jobId}] No connected integrations found`)
      await completeJob(supabase, jobId, startTime, stats, false)
      return
    }

    console.log(`🔍 [${jobId}] Found ${integrations.length} connected integrations`)
    stats.totalProcessed = integrations.length

    // Process integrations in batches to avoid overwhelming APIs
    const batchSize = 5
    for (let i = 0; i < integrations.length; i += batchSize) {
      // Periodically update the job status to show progress
      if (i > 0 && i % 20 === 0) {
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

      await Promise.allSettled(
        batch.map(async (integration) => {
          try {
            const result = await processIntegrationRefresh(integration, supabase)

            if (result.refreshed) {
              stats.successful++
              console.log(`✅ [${jobId}] Refreshed ${integration.provider} for user ${integration.user_id}`)
            } else if (result.success) {
              stats.skipped++
            } else {
              stats.failed++
              stats.errors.push({
                provider: integration.provider,
                userId: integration.user_id,
                error: result.message,
              })
              console.warn(
                `⚠️ [${jobId}] Failed to refresh ${integration.provider} for user ${integration.user_id}: ${result.message}`,
              )
            }
          } catch (error: any) {
            stats.failed++
            stats.errors.push({
              provider: integration.provider,
              userId: integration.user_id,
              error: error.message,
            })
            console.error(
              `💥 [${jobId}] Error processing ${integration.provider} for user ${integration.user_id}:`,
              error,
            )
          }
        }),
      )

      // Small delay between batches to avoid overwhelming APIs
      if (i + batchSize < integrations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Clean up old refresh logs (keep last 30 days)
    await cleanupOldLogs(supabase)

    // Complete the job
    await completeJob(supabase, jobId, startTime, stats, false)

    console.log(`✅ [${jobId}] Token refresh job completed successfully`)
  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical error in background token refresh:`, error)

    // Mark job as failed
    await completeJob(supabase, jobId, startTime, stats, true, error.message)
  }
}

async function processIntegrationRefresh(integration: any, supabase: any) {
  // Use a consistent 30-minute threshold for all providers
  const THIRTY_MINUTES = 30 * 60 // 30 minutes in seconds

  // Determine if token is expired or about to expire
  let needsAttention = false
  let isExpired = false
  const now = Math.floor(Date.now() / 1000)

  if (integration.expires_at) {
    // Fix: Ensure proper conversion from ISO string to timestamp
    const expiresAt =
      typeof integration.expires_at === "string"
        ? Math.floor(new Date(integration.expires_at).getTime() / 1000)
        : integration.expires_at

    const expiresIn = expiresAt - now
    isExpired = expiresIn <= 0

    // Token needs attention if it's expired or expires within 30 minutes
    needsAttention = isExpired || expiresIn < THIRTY_MINUTES

    if (isExpired) {
      console.log(`⚠️ Token EXPIRED for ${integration.provider} (expired ${Math.abs(expiresIn)} seconds ago)`)
    } else if (expiresIn < THIRTY_MINUTES) {
      console.log(`🔄 Token expires soon for ${integration.provider} (${Math.floor(expiresIn / 60)} minutes)`)
    }
  } else {
    // No expiry set - consider it needs attention
    needsAttention = true
    console.log(`⚠️ No expiry set for ${integration.provider} - needs attention`)
  }

  if (!needsAttention) {
    return {
      refreshed: false,
      success: true,
      message: "Token not due for refresh",
    }
  }

  // Check if it has a refresh token
  if (!integration.refresh_token) {
    // No refresh token - create notification for user
    console.log(`⚠️ Token for ${integration.provider} needs attention but has no refresh token`)

    try {
      await supabase
        .from("integrations")
        .update({
          status: "needs_reauthorization",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      // Create a notification for the user
      try {
        await supabase.rpc("create_token_expiry_notification", {
          p_user_id: integration.user_id,
          p_provider: integration.provider,
        })
      } catch (notifError) {
        console.error(`Failed to create notification for ${integration.provider}:`, notifError)
      }

      return {
        refreshed: false,
        success: false,
        message: "Token needs reauthorization (no refresh token available)",
      }
    } catch (error) {
      console.error(`Failed to update integration status for ${integration.provider}:`, error)
      return {
        refreshed: false,
        success: false,
        message: `Failed to update integration status: ${error.message}`,
      }
    }
  }

  // Has refresh token - try to refresh it
  const maxRetries = isExpired ? 3 : 2
  const result = await refreshTokenWithRetry(integration, supabase, maxRetries, isExpired)

  // If the token requires reconnection, mark it as disconnected
  if (result.requiresReconnect) {
    await supabase
      .from("integrations")
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        disconnect_reason: "Token expired and requires re-authentication",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)

    console.error(
      `❌ ${integration.provider} token for user ${integration.user_id} requires reconnection - marked as disconnected`,
    )

    // Create a notification for the user
    try {
      await supabase.rpc("create_token_expiry_notification", {
        p_user_id: integration.user_id,
        p_provider: integration.provider,
      })
    } catch (notifError) {
      console.error(`Failed to create notification for ${integration.provider}:`, notifError)
    }
  }
  // If expired token refresh fails, mark as disconnected
  else if (isExpired && !result.success) {
    await supabase
      .from("integrations")
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        disconnect_reason: "Token expired and refresh failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)

    console.error(`❌ Failed to recover expired token for ${integration.provider} - marked as disconnected`)
  }

  return result
}

async function refreshTokenWithRetry(integration: any, supabase: any, maxRetries: number, isExpired = false) {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await refreshTokenIfNeeded(integration)

      if (result.success) {
        // Update last refresh timestamp and reset failure count
        await supabase
          .from("integrations")
          .update({
            last_token_refresh: new Date().toISOString(),
            consecutive_failures: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id)

        return result
      } else {
        lastError = new Error(result.message)
      }
    } catch (error) {
      lastError = error
      console.warn(`🔄 Retry ${attempt}/${maxRetries} failed for ${integration.provider}:`, error)
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }

  // All retries failed - update failure count
  const newFailureCount = (integration.consecutive_failures || 0) + 1
  await supabase
    .from("integrations")
    .update({
      consecutive_failures: newFailureCount,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id)

  // Check if we've exceeded the threshold for consecutive failures
  const FAILURE_THRESHOLD = 5 // Mark as disconnected after 5 consecutive failures
  if (newFailureCount >= FAILURE_THRESHOLD) {
    console.error(
      `❌ ${integration.provider} token for user ${integration.user_id} has failed ${newFailureCount} times - marking as disconnected`,
    )

    try {
      // Mark the integration as disconnected
      await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          disconnect_reason: `Token refresh failed ${newFailureCount} consecutive times`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      // Create a notification for the user
      try {
        await supabase.rpc("create_token_expiry_notification", {
          p_user_id: integration.user_id,
          p_provider: integration.provider,
        })
      } catch (notifError) {
        console.error(`Failed to create notification for ${integration.provider}:`, notifError)
      }
    } catch (updateError) {
      console.error(`Failed to update integration status for ${integration.provider}:`, updateError)
    }
  }

  throw lastError
}

async function cleanupOldLogs(supabase: any) {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { error } = await supabase.from("token_refresh_logs").delete().lt("executed_at", thirtyDaysAgo.toISOString())

    if (error) {
      console.warn("Failed to cleanup old logs:", error.message)
    }
  } catch (error) {
    console.warn("Failed to cleanup old logs:", error)
  }
}

async function completeJob(
  supabase: any,
  jobId: string,
  startTime: number,
  stats: RefreshStats,
  isCriticalFailure: boolean,
  errorMessage: string | null = null,
) {
  const endTime = Date.now()
  const durationMs = endTime - startTime

  try {
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
      updated_at: new Date().toISOString(),
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    const { error } = await supabase.from("token_refresh_logs").update(updateData).eq("job_id", jobId)

    if (error) {
      console.error(`Failed to update job status for ${jobId}:`, error)
    } else {
      console.log(
        `[${jobId}] Job completed in ${durationMs}ms with status: ${isCriticalFailure ? "failed" : "completed"}`,
      )
    }
  } catch (error) {
    console.error(`Failed to update job status for ${jobId}:`, error)
  }
}
