import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenForProvider } from "@/lib/integrations/tokenRefreshService"

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
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    // Allow either Vercel cron header OR secret authentication
    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    const isVercelCron = cronHeader === "1"

    if (!isVercelCron && (!providedSecret || providedSecret !== expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`🚀 [${jobId}] New token refresh job started`)
    
    // Log development environment warning
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚠️ [${jobId}] Running in DEVELOPMENT environment`)
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
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Calculate the threshold for token expiration (30 minutes from now)
    const now = new Date()
    const expiryThreshold = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes

    // Build the query to get integrations with refresh tokens that need refreshing
    let query = supabase
      .from("integrations")
      .select("*")
      .not("refresh_token", "is", null)
      .or(`expires_at.lt.${now.toISOString()},expires_at.lt.${expiryThreshold.toISOString()}`)

    // Filter by provider if specified
    if (provider) {
      query = query.eq("provider", provider)
    }

    // Add pagination
    query = query.range(offset, offset + limit - 1)

    // Order by expiration time to prioritize tokens that expire soonest
    query = query.order("expires_at", { ascending: true, nullsFirst: false })

    // Execute the query
    let integrations: any[] = []
    try {
      if (verbose) console.log(`🔍 [${jobId}] Executing database query to find integrations needing refresh...`)
      
      const { data, error: fetchError } = await query
      
      if (fetchError) {
        console.error(`❌ [${jobId}] Error fetching integrations:`, fetchError)
        throw new Error(`Error fetching integrations: ${fetchError.message}`)
      }
      
      integrations = data || []
      console.log(`✅ [${jobId}] Found ${integrations.length} integrations that need token refresh`)
    } catch (queryError: any) {
      console.error(`💥 [${jobId}] Database query error:`, queryError)
      throw new Error(`Database query error: ${queryError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      const endTime = Date.now()
      const durationMs = endTime - startTime

      return NextResponse.json({
        success: true,
        message: "Token refresh job completed - no integrations to process",
        jobId,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      })
    }

    // Process integrations
    console.log(`🔄 [${jobId}] Processing ${integrations.length} integrations...`)

    let successful = 0
    let failed = 0
    const results = []
    const failureReasons: Record<string, number> = {}

    // Process integrations in batches to avoid overwhelming the system
    const batches = []
    for (let i = 0; i < integrations.length; i += batchSize) {
      batches.push(integrations.slice(i, i + batchSize))
    }

    console.log(`📦 [${jobId}] Processing in ${batches.length} batches of up to ${batchSize} integrations each`)

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`🔄 [${jobId}] Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} integrations)`)
      
      // Process each integration in the batch
      for (const integration of batch) {
        try {
          if (verbose) {
            console.log(
              `🔍 [${jobId}] Processing ${integration.provider} for user ${integration.user_id}`
            )
          }

          // Always update the last_refresh_attempt timestamp
          await supabase
            .from("integrations")
            .update({ last_refresh_attempt: now.toISOString() })
            .eq("id", integration.id)

          // Skip if no refresh token
          if (!integration.refresh_token) {
            if (verbose) console.log(`⏭️ [${jobId}] Skipping ${integration.provider} - no refresh token`)
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
              console.error(`❌ [${jobId}] Error updating integration after successful refresh:`, updateError)
            } else if (verbose) {
              console.log(`✅ [${jobId}] Successfully refreshed ${integration.provider}`)
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
              })
              .eq("id", integration.id)

            if (updateError) {
              console.error(`❌ [${jobId}] Error updating integration after failed refresh:`, updateError)
            } else if (verbose) {
              console.log(`⚠️ [${jobId}] Failed to refresh ${integration.provider}: ${refreshResult.error}`)
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
          console.error(`💥 [${jobId}] Error processing ${integration.provider}:`, error)

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
            })
            .eq("id", integration.id)

          if (updateError) {
            console.error(`❌ [${jobId}] Error updating integration after exception:`, updateError)
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
        if (verbose) console.log(`⏱️ [${jobId}] Pausing briefly between batches...`)
        await new Promise(resolve => setTimeout(resolve, 1000)) // 1 second delay between batches
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime
    const duration = durationMs / 1000

    // Log summary of results
    console.log(`🏁 [${jobId}] Token refresh job completed in ${duration.toFixed(2)}s`)
    console.log(`   - Successful refreshes: ${successful}`)
    console.log(`   - Failed: ${failed}`)
    
    // Log failure reasons if any
    if (failed > 0) {
      console.log(`   - Failure reasons:`)
      Object.entries(failureReasons).forEach(([reason, count]) => {
        console.log(`     - ${reason}: ${count}`)
      })
    }

    return NextResponse.json({
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
    console.error(`💥 [${jobId}] Critical error in token refresh job:`, error)

    const endTime = Date.now()
    const durationMs = endTime - startTime

    return NextResponse.json(
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