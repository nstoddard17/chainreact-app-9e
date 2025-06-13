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

    // Get all connected integrations with refresh tokens
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .not("refresh_token", "is", null)

    if (error) {
      throw new Error(`Error fetching integrations: ${error.message}`)
    }

    if (!integrations || integrations.length === 0) {
      console.log(`ℹ️ [${jobId}] No integrations with refresh tokens found`)
      await completeJob(supabase, jobId, startTime, stats, false)
      return
    }

    console.log(`🔍 [${jobId}] Found ${integrations.length} integrations with refresh tokens`)
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

/**
 * Complete the job and update the database with results
 */
async function completeJob(
  supabase: any,
  jobId: string,
  startTime: number,
  stats: RefreshStats,
  isCriticalFailure: boolean,
  errorMessage?: string,
): Promise<void> {
  const duration = Date.now() - startTime

  try {
    await supabase
      .from("token_refresh_logs")
      .update({
        status: isCriticalFailure ? "failed" : "completed",
        duration_ms: duration,
        total_processed: stats.totalProcessed,
        successful_refreshes: stats.successful,
        failed_refreshes: stats.failed,
        skipped_refreshes: stats.skipped,
        error_count: stats.errors.length,
        errors: stats.errors,
        is_critical_failure: isCriticalFailure,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)

    // Also insert a summary record in a separate table for quick querying
    await supabase
      .from("token_refresh_summary")
      .insert({
        job_id: jobId,
        executed_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        status: isCriticalFailure ? "failed" : "completed",
        total_processed: stats.totalProcessed,
        successful: stats.successful,
        failed: stats.failed,
        skipped: stats.skipped,
      })
      .onConflict("job_id")
      .merge()
  } catch (error) {
    console.error(`Failed to update job completion status for ${jobId}:`, error)
  }
}

async function processIntegrationRefresh(integration: any, supabase: any) {
  const isGoogleOrMicrosoft = [
    "google",
    "youtube",
    "gmail",
    "google-calendar",
    "google-docs",
    "google-drive",
    "google-sheets",
    "teams",
    "onedrive",
  ].includes(integration.provider)

  // Determine if refresh is needed
  let shouldRefresh = false
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

    if (isExpired) {
      // Token is already expired - definitely refresh
      shouldRefresh = true
      console.log(`⚠️ Token EXPIRED for ${integration.provider} (expired ${Math.abs(expiresIn)} seconds ago)`)
    } else if (isGoogleOrMicrosoft && expiresIn < 3600) {
      // For Google/Microsoft, refresh if expires within 1 hour
      shouldRefresh = true
      console.log(
        `🔄 Google/Microsoft token expires soon for ${integration.provider} (${Math.floor(expiresIn / 60)} minutes)`,
      )
    } else if (!isGoogleOrMicrosoft && expiresIn < 7200) {
      // For others, refresh if expires within 2 hours
      shouldRefresh = true
      console.log(`🔄 Token expires soon for ${integration.provider} (${Math.floor(expiresIn / 60)} minutes)`)
    }
  } else if (isGoogleOrMicrosoft) {
    // No expiry set for Google/Microsoft - refresh to be safe
    shouldRefresh = true
    console.log(`⚠️ No expiry set for ${integration.provider} - refreshing to be safe`)
  }

  if (!shouldRefresh) {
    return {
      refreshed: false,
      success: true,
      message: "Token not due for refresh",
    }
  }

  // For expired tokens, use more aggressive retry logic
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
  await supabase
    .from("integrations")
    .update({
      consecutive_failures: (integration.consecutive_failures || 0) + 1,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id)

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
