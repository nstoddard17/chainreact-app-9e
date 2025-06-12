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

    console.log("🔄 Starting comprehensive token refresh cron job...")

    // Run the enhanced token refresh job
    const stats = await refreshExpiringTokens()

    // Log comprehensive results
    const duration = Date.now() - startTime
    console.log(`✅ Token refresh job completed in ${duration}ms`)
    console.log(`📊 Stats: ${stats.successful} successful, ${stats.failed} failed, ${stats.skipped} skipped`)

    // Log any errors for monitoring
    if (stats.errors.length > 0) {
      console.error("❌ Token refresh errors:", stats.errors)
    }

    // Store job execution stats
    await logJobExecution(stats, duration)

    return NextResponse.json({
      success: true,
      message: "Token refresh job completed successfully",
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      stats,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error("💥 Critical error in token refresh cron job:", error)

    // Log critical failure
    await logJobExecution(
      {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: [{ provider: "system", userId: "system", error: error.message }],
      },
      duration,
      true,
    )

    return NextResponse.json(
      {
        success: false,
        error: "Token refresh job failed",
        details: error.message,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
      },
      { status: 500 },
    )
  }
}

/**
 * Enhanced background job to refresh tokens that are expiring soon
 */
async function refreshExpiringTokens(): Promise<RefreshStats> {
  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    throw new Error("Failed to create Supabase client for token refresh job")
  }

  const stats: RefreshStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  try {
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
      console.log("ℹ️ No integrations with refresh tokens found")
      return stats
    }

    console.log(`🔍 Found ${integrations.length} integrations with refresh tokens`)
    stats.totalProcessed = integrations.length

    // Process integrations in batches to avoid overwhelming APIs
    const batchSize = 5
    for (let i = 0; i < integrations.length; i += batchSize) {
      const batch = integrations.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (integration) => {
          try {
            const result = await processIntegrationRefresh(integration, supabase)

            if (result.refreshed) {
              stats.successful++
              console.log(`✅ Refreshed ${integration.provider} for user ${integration.user_id}`)
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
                `⚠️ Failed to refresh ${integration.provider} for user ${integration.user_id}: ${result.message}`,
              )
            }
          } catch (error: any) {
            stats.failed++
            stats.errors.push({
              provider: integration.provider,
              userId: integration.user_id,
              error: error.message,
            })
            console.error(`💥 Error processing ${integration.provider} for user ${integration.user_id}:`, error)
          }
        }),
      )

      // Small delay between batches to be respectful to APIs
      if (i + batchSize < integrations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Clean up old refresh logs (keep last 30 days)
    await cleanupOldLogs(supabase)

    return stats
  } catch (error: any) {
    console.error("💥 Critical error in refreshExpiringTokens:", error)
    throw error
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
  const maxRetries = isExpired ? 5 : 3
  const result = await refreshTokenWithRetry(integration, supabase, maxRetries, isExpired)

  // If expired token refresh fails, mark as disconnected
  if (isExpired && !result.success) {
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

async function logJobExecution(stats: RefreshStats, duration: number, isCriticalFailure = false) {
  try {
    const supabase = createAdminSupabaseClient()
    if (!supabase) return

    // Check if token_refresh_logs table exists, if not create it
    const { error: insertError } = await supabase.from("token_refresh_logs").insert({
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      total_processed: stats.totalProcessed,
      successful_refreshes: stats.successful,
      failed_refreshes: stats.failed,
      skipped_refreshes: stats.skipped,
      error_count: stats.errors.length,
      errors: stats.errors,
      is_critical_failure: isCriticalFailure,
    })

    if (insertError) {
      console.warn("Failed to log job execution (table may not exist):", insertError.message)
    }
  } catch (error) {
    console.error("Failed to log job execution:", error)
  }
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
