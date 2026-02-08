/**
 * Proactive Health Check Cron Job
 *
 * Validates OAuth token health independent of expiration time.
 * Tokens can become invalid (revoked, password changed, etc.) before they expire.
 *
 * Schedule: Every 15 minutes (staggered from token-refresh)
 *
 * This job:
 * 1. Queries integrations due for health check (next_health_check_at < NOW())
 * 2. Calls provider-specific health check endpoints
 * 3. Updates health_check_status and schedules next check
 * 4. Triggers immediate token refresh if unhealthy
 * 5. Sets requires_user_action if refresh fails with non-recoverable error
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkTokenHealth } from "@/lib/integrations/tokenMonitor"
import { refreshTokenForProvider, calculateNextHealthCheck } from "@/lib/integrations/tokenRefreshService"
import { classifyOAuthError, calculateUserActionDeadline } from "@/lib/integrations/errorClassificationService"
import { acquireRefreshLock, releaseRefreshLock, cleanupStaleLocks } from "@/lib/integrations/refreshLockService"
import { logger } from "@/lib/utils/logger"

// Maximum integrations to process per run (to stay within Vercel timeout)
const MAX_INTEGRATIONS_PER_RUN = 50

// Batch size for parallel processing
const BATCH_SIZE = 10

export const maxDuration = 60 // 60 second timeout for Vercel

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stats = {
    processed: 0,
    healthy: 0,
    unhealthy: 0,
    refreshed: 0,
    refreshFailed: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    logger.info("[ProactiveHealthCheck] Starting proactive health check job")

    const supabase = createAdminClient()
    if (!supabase) {
      throw new Error("Failed to create Supabase client")
    }

    // Clean up any stale locks first
    await cleanupStaleLocks()

    // Get integrations due for health check
    const now = new Date()
    const { data: integrations, error: queryError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .not("access_token", "is", null)
      .or(`next_health_check_at.is.null,next_health_check_at.lte.${now.toISOString()}`)
      .order("next_health_check_at", { ascending: true, nullsFirst: true })
      .limit(MAX_INTEGRATIONS_PER_RUN)

    if (queryError) {
      throw new Error(`Failed to query integrations: ${queryError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      logger.info("[ProactiveHealthCheck] No integrations due for health check")
      return NextResponse.json({
        success: true,
        message: "No integrations due for health check",
        stats,
        durationMs: Date.now() - startTime,
      })
    }

    logger.info(`[ProactiveHealthCheck] Found ${integrations.length} integrations due for health check`)

    // Process integrations in batches
    for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
      const batch = integrations.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (integration) => {
          stats.processed++

          // Try to acquire lock
          const lock = await acquireRefreshLock(integration.id, 30)
          if (!lock.acquired) {
            stats.skipped++
            logger.debug(`[ProactiveHealthCheck] Skipping ${integration.provider} (${integration.id}): Lock held`)
            return
          }

          try {
            // Perform health check
            const healthResult = await checkTokenHealth([integration.id])

            if (!healthResult.results || healthResult.results.length === 0) {
              logger.warn(`[ProactiveHealthCheck] No health result for ${integration.provider}`)
              stats.errors.push(`No health result for ${integration.provider}`)
              return
            }

            const result = healthResult.results[0]

            if (result.status === "healthy") {
              stats.healthy++

              // Update with healthy status and schedule next check
              await supabase
                .from("integrations")
                .update({
                  last_health_check_at: now.toISOString(),
                  next_health_check_at: calculateNextHealthCheck(integration.provider).toISOString(),
                  health_check_status: "healthy",
                  updated_at: now.toISOString(),
                })
                .eq("id", integration.id)

              logger.debug(`[ProactiveHealthCheck] ${integration.provider} is healthy`)
            } else {
              stats.unhealthy++
              logger.warn(`[ProactiveHealthCheck] ${integration.provider} is unhealthy: ${result.status}`)

              // Token is unhealthy - attempt immediate refresh
              if (integration.refresh_token) {
                const refreshResult = await refreshTokenForProvider(
                  integration.provider,
                  integration.refresh_token,
                  integration,
                  { verbose: true }
                )

                if (refreshResult.success) {
                  stats.refreshed++
                  logger.info(`[ProactiveHealthCheck] Successfully refreshed ${integration.provider}`)

                  // Update with successful refresh
                  await supabase
                    .from("integrations")
                    .update({
                      last_health_check_at: now.toISOString(),
                      next_health_check_at: calculateNextHealthCheck(integration.provider).toISOString(),
                      health_check_status: "healthy",
                      requires_user_action: false,
                      user_action_type: null,
                      user_action_deadline: null,
                      last_error_code: null,
                      last_error_details: null,
                      consecutive_failures: 0,
                      updated_at: now.toISOString(),
                    })
                    .eq("id", integration.id)
                } else {
                  stats.refreshFailed++

                  // Classify the error
                  const classifiedError = refreshResult.classifiedError || classifyOAuthError(
                    integration.provider,
                    refreshResult.statusCode || 0,
                    refreshResult.providerResponse || { error: refreshResult.error }
                  )

                  logger.warn(`[ProactiveHealthCheck] Failed to refresh ${integration.provider}: ${classifiedError.code}`)

                  // Update with error status
                  const updateData: Record<string, unknown> = {
                    last_health_check_at: now.toISOString(),
                    next_health_check_at: calculateNextHealthCheck(integration.provider).toISOString(),
                    health_check_status: classifiedError.code === "revoked" ? "revoked" : "expired",
                    last_error_code: classifiedError.code,
                    last_error_details: JSON.stringify(classifiedError.details || {}),
                    consecutive_failures: (integration.consecutive_failures || 0) + 1,
                    updated_at: now.toISOString(),
                  }

                  // Set user action if required
                  if (classifiedError.requiresUserAction) {
                    updateData.requires_user_action = true
                    updateData.user_action_type = classifiedError.userActionType
                    updateData.user_action_deadline = calculateUserActionDeadline(classifiedError).toISOString()
                    updateData.status = "needs_reauthorization"
                  }

                  await supabase.from("integrations").update(updateData).eq("id", integration.id)
                }
              } else {
                // No refresh token - mark as needing reconnection
                await supabase
                  .from("integrations")
                  .update({
                    last_health_check_at: now.toISOString(),
                    next_health_check_at: calculateNextHealthCheck(integration.provider).toISOString(),
                    health_check_status: result.status === "expired" ? "expired" : "degraded",
                    requires_user_action: true,
                    user_action_type: "reconnect",
                    user_action_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: "needs_reauthorization",
                    updated_at: now.toISOString(),
                  })
                  .eq("id", integration.id)

                stats.refreshFailed++
              }
            }
          } catch (error) {
            logger.error(`[ProactiveHealthCheck] Error processing ${integration.provider}:`, error)
            stats.errors.push(`${integration.provider}: ${error instanceof Error ? error.message : "Unknown error"}`)
          } finally {
            // Always release lock
            if (lock.lockId) {
              await releaseRefreshLock(integration.id, lock.lockId)
            }
          }
        })
      )

      // Check if we're running out of time
      if (Date.now() - startTime > 55000) {
        logger.warn("[ProactiveHealthCheck] Approaching timeout, stopping early")
        break
      }
    }

    const durationMs = Date.now() - startTime

    logger.info("[ProactiveHealthCheck] Completed", {
      ...stats,
      durationMs,
    })

    return NextResponse.json({
      success: true,
      stats,
      durationMs,
    })
  } catch (error) {
    logger.error("[ProactiveHealthCheck] Job failed:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stats,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
