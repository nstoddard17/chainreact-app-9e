import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import type { NextRequest } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenForProvider } from "@/lib/integrations/tokenRefreshService"

import { logger } from '@/lib/utils/logger'

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Token Refresh Cron Job
 * 
 * This function runs every 20 minutes to refresh expired or soon-to-expire access tokens.
 * It queries the integrations table for tokens that need refreshing and updates them accordingly.
 */
export async function GET(request: NextRequest) {
  const jobId = `token-refresh-${Date.now()}`
  const startTime = Date.now()

  try {
    // Verify this is a legitimate cron job request
    const cronHeader = request.headers.get("x-vercel-cron")
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return errorResponse("CRON_SECRET not configured" , 500)
    }

    // Allow either Vercel cron header OR secret authentication
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    const isVercelCron = cronHeader === "1"

    if (!isVercelCron && (!providedSecret || providedSecret !== expectedSecret)) {
      return errorResponse("Unauthorized" , 401)
    }

    logger.debug(`New token refresh job started`)
    
    // Log development environment warning
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`Running in DEVELOPMENT environment`)
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get("provider") || undefined
    const limit = parseInt(searchParams.get("limit") || "100", 10)
    const batchSize = parseInt(searchParams.get("batchSize") || "10", 10) // Process in batches of 10 by default
    const offset = parseInt(searchParams.get("offset") || "0", 10) // Support pagination
    const verbose = searchParams.get("verbose") === "true" // Enable verbose logging

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return errorResponse("Failed to create database client" , 500)
    }

    // Calculate the threshold for token expiration (30 minutes from now)
    const now = new Date()
    const expiryThreshold = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes

    // Build the query to get integrations with refresh tokens that need refreshing
    // Exclude integrations that already need reauthorization to avoid repeated error logs
    logger.debug(`📊 Query parameters:`, {
      provider: provider || 'all',
      limit,
      batchSize,
      offset,
      verbose,
      now: now.toISOString(),
      expiryThreshold: expiryThreshold.toISOString()
    })

    let query = supabase
      .from("integrations")
      .select("*")
      .not("refresh_token", "is", null)
      .neq("status", "needs_reauthorization")
      .or(`expires_at.lt.${now.toISOString()},expires_at.lt.${expiryThreshold.toISOString()}`)

    // Filter by provider if specified
    if (provider) {
      query = query.eq("provider", provider)
      logger.debug(`🔍 Filtering by provider: ${provider}`)
    }

    // Add pagination
    query = query.range(offset, offset + limit - 1)
    logger.debug(`📄 Pagination: offset=${offset}, limit=${limit}`)

    // Order by expiration time to prioritize tokens that expire soonest
    query = query.order("expires_at", { ascending: true, nullsFirst: false })

    // Execute the query
    let integrations: any[] = []
    try {
      if (verbose) logger.debug(`Executing database query to find integrations needing refresh...`)

      const { data, error: fetchError } = await query

      if (fetchError) {
        logger.error(`❌ Error fetching integrations:`, fetchError)
        throw new Error(`Error fetching integrations: ${fetchError.message}`)
      }

      integrations = data || []
      logger.debug(`✅ Found ${integrations.length} integrations that need token refresh`)

      if (verbose && integrations.length > 0) {
        logger.debug(`📋 Integration details:`)
        integrations.forEach((int, idx) => {
          logger.debug(`  ${idx + 1}. ${int.provider} (ID: ${int.id.substring(0, 8)}...)`, {
            expires_at: int.expires_at,
            has_refresh_token: !!int.refresh_token,
            status: int.status,
            consecutive_failures: int.consecutive_failures || 0
          })
        })
      }
    } catch (queryError: any) {
      logger.error(`❌ Database query error:`, queryError)
      throw new Error(`Database query error: ${queryError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      const endTime = Date.now()
      const durationMs = endTime - startTime

      return jsonResponse({
        success: true,
        message: "Token refresh job completed - no integrations to process",
        jobId,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      })
    }

    // Process integrations
    logger.debug(`Processing ${integrations.length} integrations...`)

    let successful = 0
    let failed = 0
    const results = []
    const failureReasons: Record<string, number> = {}

    // Process integrations in batches to avoid overwhelming the system
    const batches = []
    for (let i = 0; i < integrations.length; i += batchSize) {
      batches.push(integrations.slice(i, i + batchSize))
    }

    logger.debug(`Processing in ${batches.length} batches of up to ${batchSize} integrations each`)

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      logger.debug(`Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} integrations)`)
      
      // Process each integration in the batch
      for (const integration of batch) {
        try {
          if (verbose) {
            logger.debug(
              `Processing ${integration.provider} for user ${integration.user_id}`
            )
          }

          // Always update the last_refresh_attempt timestamp
          await supabase
            .from("integrations")
            .update({ last_refresh_attempt: now.toISOString() })
            .eq("id", integration.id)

          // Skip if no refresh token
          if (!integration.refresh_token) {
            if (verbose) logger.debug(`Skipping ${integration.provider} - no refresh token`)
            
            // Check if the token is expired and update status if needed
            if (integration.expires_at && new Date(integration.expires_at) <= now) {
              if (verbose) logger.debug(`${integration.provider} has expired without refresh token - marking as needs_reauthorization`)
              
              await supabase
                .from("integrations")
                .update({ 
                  status: "needs_reauthorization",
                  disconnect_reason: "Access token expired and no refresh token available"
                })
                .eq("id", integration.id)
            }
            
            continue
          }

          // Refresh the token
          const refreshResult = await refreshTokenForProvider(
            integration.provider,
            integration.refresh_token,
            integration,
            { verbose }
          )

          if (refreshResult.success) {
            successful++

            // Update the token in the database
            const updateData: Record<string, any> = {
              access_token: refreshResult.accessToken,
              updated_at: now.toISOString(),
              last_refresh_success: now.toISOString(),
              consecutive_failures: 0,
              disconnect_reason: null,
              status: "connected",
            }

            // Add refresh token if provided
            if (refreshResult.refreshToken) {
              updateData.refresh_token = refreshResult.refreshToken
            }

            // Add expiration if provided
            if (refreshResult.accessTokenExpiresIn) {
              updateData.expires_at = new Date(now.getTime() + refreshResult.accessTokenExpiresIn * 1000).toISOString()
            }

            // Update the integration
            const { error: updateError } = await supabase
              .from("integrations")
              .update(updateData)
              .eq("id", integration.id)

            if (updateError) {
              logger.error(`Error updating integration after successful refresh:`, updateError)
            } else if (verbose) {
              logger.debug(`Successfully refreshed ${integration.provider}`)
            }

            results.push({
              id: integration.id,
              provider: integration.provider,
              success: true,
            })
          } else {
            failed++

            // Track failure reasons
            const reason = refreshResult.error || "Unknown error"
            failureReasons[reason] = (failureReasons[reason] || 0) + 1

            // Get current consecutive failures
            const { data } = await supabase
              .from("integrations")
              .select("consecutive_failures")
              .eq("id", integration.id)
              .single()

            const consecutiveFailures = ((data?.consecutive_failures || 0) + 1)

            // Update the integration with error details
            const { error: updateError } = await supabase
              .from("integrations")
              .update({
                consecutive_failures: consecutiveFailures,
                disconnect_reason: refreshResult.error || "Unknown error during token refresh",
                last_failure_at: now.toISOString(),
                // Only update status to needs_reauthorization if specifically indicated by the refresh result
                // or if we've hit too many consecutive failures
                ...(refreshResult.invalidRefreshToken || refreshResult.needsReauthorization || consecutiveFailures >= 3 
                  ? { status: "needs_reauthorization" } 
                  : {})
              })
              .eq("id", integration.id)

            if (updateError) {
              logger.error(`Error updating integration after failed refresh:`, updateError)
            } else if (verbose) {
              logger.debug(`Failed to refresh ${integration.provider}: ${refreshResult.error}`)
            }

            results.push({
              id: integration.id,
              provider: integration.provider,
              success: false,
              error: refreshResult.error,
            })
          }
        } catch (error: any) {
          failed++
          logger.error(`Error processing ${integration.provider}:`, error)

          // Track failure reasons
          const reason = `Unexpected error: ${error.message}`
          failureReasons[reason] = (failureReasons[reason] || 0) + 1

          // Update integration with error details
          const { error: updateError } = await supabase
            .from("integrations")
            .update({
              consecutive_failures: supabase.rpc("increment", { row_id: integration.id, field: "consecutive_failures" }),
              disconnect_reason: `Unexpected error: ${error.message}`,
              last_failure_at: now.toISOString(),
              // Only update status if we've hit too many consecutive failures
              ...(integration.consecutive_failures >= 2 ? { status: "needs_reauthorization" } : {})
            })
            .eq("id", integration.id)

          if (updateError) {
            logger.error(`❌ Error updating integration after exception:`, updateError)
          }

          results.push({
            id: integration.id,
            provider: integration.provider,
            success: false,
            error: error.message,
          })
        }
      }
      
      // Add a small delay between batches to avoid overwhelming external APIs
      if (batchIndex < batches.length - 1) {
        if (verbose) logger.debug(`Pausing briefly between batches...`)
        await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay between batches
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime
    const duration = durationMs / 1000

    // Create provider statistics
    const providerStats: Record<string, { success: number; failed: number }> = {}
    results.forEach(result => {
      if (!providerStats[result.provider]) {
        providerStats[result.provider] = { success: 0, failed: 0 }
      }
      if (result.success) {
        providerStats[result.provider].success++
      } else {
        providerStats[result.provider].failed++
      }
    })

    // Log comprehensive summary
    logger.debug(`📊 Token refresh job completed in ${duration.toFixed(2)}s`)
    logger.debug(`   ✅ Successful: ${successful}`)
    logger.debug(`   ❌ Failed: ${failed}`)
    logger.debug(`   📝 Total processed: ${integrations.length}`)

    // Log provider breakdown
    if (Object.keys(providerStats).length > 0) {
      logger.debug(`   📈 Provider breakdown:`)
      Object.entries(providerStats)
        .sort(([, a], [, b]) => (b.success + b.failed) - (a.success + a.failed))
        .forEach(([provider, stats]) => {
          const total = stats.success + stats.failed
          const successRate = total > 0 ? ((stats.success / total) * 100).toFixed(0) : '0'
          logger.debug(`      ${provider}: ${stats.success}/${total} (${successRate}% success)`)
        })
    }

    // Log failure reasons if any
    if (failed > 0) {
      logger.debug(`   🔍 Failure reasons:`)
      Object.entries(failureReasons)
        .sort(([, a], [, b]) => b - a)
        .forEach(([reason, count]) => {
          logger.debug(`      ${count}x ${reason}`)
        })
    }
    
    // Fix any integrations that have successful refreshes but incorrect statuses
    try {
      const { data: statusFixResult } = await supabase.rpc('fix_integration_statuses', {
        threshold_minutes: 60 // Consider refreshes in the last hour
      })
      
      const fixedCount = statusFixResult?.count || 0;
      if (fixedCount > 0) {
        logger.debug(`Fixed statuses for ${fixedCount} integrations with recent successful refreshes`)
      }
    } catch (error) {
      logger.error(`Could not run status fix procedure:`, error)
    }

    return jsonResponse({
      success: true,
      message: `Token refresh finished in ${duration.toFixed(2)}s. ${successful} succeeded, ${failed} failed.`,
      jobId,
      duration_seconds: duration,
      stats: {
        processed: integrations.length,
        successful,
        failed,
      },
      results: results.slice(0, 10), // Limit results in response
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error(`Critical error in token refresh job:`, error)

    const endTime = Date.now()
    const durationMs = endTime - startTime

    return jsonResponse(
      {
        success: false,
        error: "Failed to complete token refresh job",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
} 