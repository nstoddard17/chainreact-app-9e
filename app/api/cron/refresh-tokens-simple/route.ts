import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenForProvider } from "@/lib/integrations/tokenRefreshService"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const jobId = `token-refresh-${Date.now()}`
  const startTime = Date.now()

  try {
    // Check for Vercel cron job header or secret authentication
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

    console.log(`🚀 [${jobId}] Token refresh job started`)

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const cleanupMode = searchParams.get("cleanupMode") === "true"
    const provider = searchParams.get("provider") || undefined
    const includeInactive = searchParams.get("includeInactive") === "true"

    // Determine thresholds based on cleanup mode
    const accessTokenExpiryThreshold = cleanupMode ? 2880 : 30 // 48 hours for cleanup, 30 mins otherwise
    const refreshTokenExpiryThreshold = cleanupMode ? 43200 : 30 // 30 days for cleanup, 30 mins otherwise

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    console.log(`📊 [${jobId}] Getting integrations that need token refresh...`)

    const now = new Date()
    const accessExpiryThreshold = new Date(now.getTime() + accessTokenExpiryThreshold * 60 * 1000)
    const refreshExpiryThreshold = new Date(now.getTime() + refreshTokenExpiryThreshold * 60 * 1000)

    // Build the query to get integrations with refresh tokens
    let query = supabase.from("integrations").select("*").not("refresh_token", "is", null)

    // Filter by status
    if (!includeInactive) {
      query = query.eq("is_active", true)
    }

    // Filter by provider if specified
    if (provider) {
      query = query.eq("provider", provider)
    }

    // Get tokens where:
    // 1. Access token expires soon or has no expiry
    // 2. Refresh token expires within 30 minutes (if refresh_token_expires_at is set)
    const refreshExpiryThresholdNew = new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes for refresh tokens

    query = query.or(
      `expires_at.lt.${accessExpiryThreshold.toISOString()},expires_at.is.null,refresh_token_expires_at.lt.${refreshExpiryThresholdNew.toISOString()}`,
    )

    // Order by expiration time
    query = query.order("expires_at", { ascending: true, nullsFirst: false })

    // Execute the query
    const { data: integrations, error: fetchError } = await query

    if (fetchError) {
      console.error(`❌ [${jobId}] Error fetching integrations:`, fetchError)
      throw new Error(`Error fetching integrations: ${fetchError.message}`)
    }

    console.log(`✅ [${jobId}] Found ${integrations?.length || 0} integrations that need token refresh`)

    if (!integrations || integrations.length === 0) {
      console.log(`ℹ️ [${jobId}] No integrations to process`)

      const endTime = Date.now()
      const durationMs = endTime - startTime

      return NextResponse.json({
        success: true,
        message: "Token refresh job completed - no integrations to process",
        jobId,
        duration: `${durationMs}ms`,
        stats: {
          processed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
        timestamp: new Date().toISOString(),
      })
    }

    // Process integrations
    console.log(`🔄 [${jobId}] Processing ${integrations.length} integrations...`)

    let successful = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ provider: string; userId: string; error: string }> = []
    const providerStats: Record<string, { processed: number; successful: number; failed: number }> = {}

    for (const integration of integrations) {
      try {
        // Initialize provider stats if not yet initialized
        if (!providerStats[integration.provider]) {
          providerStats[integration.provider] = {
            processed: 0,
            successful: 0,
            failed: 0,
          }
        }

        providerStats[integration.provider].processed++

        console.log(
          `🔍 [${jobId}] Processing ${integration.provider} for user ${integration.user_id} (status: ${integration.status})`,
        )

        // Check if integration has no refresh token
        if (!integration.refresh_token) {
          console.log(`⏭️ [${jobId}] Skipping ${integration.provider} - no refresh token`)
          skipped++
          continue
        }

        // Check if refresh is actually needed
        const needsRefresh = shouldRefreshToken(integration, {
          accessTokenExpiryThreshold,
          refreshTokenExpiryThreshold,
        })

        if (!needsRefresh.shouldRefresh) {
          console.log(`⏭️ [${jobId}] Skipping ${integration.provider}: ${needsRefresh.reason}`)
          skipped++
          continue
        }

        console.log(`🔄 [${jobId}] Refreshing token for ${integration.provider}: ${needsRefresh.reason}`)

        // Refresh the token
        const refreshResult = await refreshTokenForProvider(
          integration.provider,
          integration.refresh_token,
          integration,
        )

        if (refreshResult.success) {
          successful++
          providerStats[integration.provider].successful++

          // Update the token in the database
          await updateIntegrationWithRefreshResult(supabase, integration.id, refreshResult)
          console.log(`✅ [${jobId}] Successfully refreshed ${integration.provider}`)
        } else {
          failed++
          providerStats[integration.provider].failed++
          errors.push({
            provider: integration.provider,
            userId: integration.user_id,
            error: refreshResult.error || "Unknown error",
          })

          // Determine the appropriate status based on the error
          let status: "expired" | "needs_reauthorization" = "expired"
          let shouldDisconnect = false

          // Check for specific error patterns that indicate the refresh token is permanently invalid
          const errorMessage = refreshResult.error?.toLowerCase() || ""
          const isInvalidGrant =
            errorMessage.includes("invalid_grant") ||
            errorMessage.includes("invalid token") ||
            errorMessage.includes("authorization grant is invalid") ||
            errorMessage.includes("expired") ||
            errorMessage.includes("revoked")

          if (refreshResult.invalidRefreshToken || refreshResult.needsReauthorization || isInvalidGrant) {
            status = "needs_reauthorization"
            shouldDisconnect = true
          }

          // Update integration with error details
          await updateIntegrationWithError(
            supabase,
            integration.id,
            refreshResult.error || "Unknown error during token refresh",
            { status, shouldDisconnect },
          )

          if (shouldDisconnect) {
            console.warn(`🔒 [${jobId}] ${integration.provider} requires re-authorization - refresh token is invalid`)
          } else {
            console.warn(`⚠️ [${jobId}] Failed to refresh ${integration.provider}: ${refreshResult.error}`)
          }
        }
      } catch (error: any) {
        failed++
        if (providerStats[integration.provider]) {
          providerStats[integration.provider].failed++
        }
        errors.push({
          provider: integration.provider,
          userId: integration.user_id,
          error: error.message,
        })
        console.error(`💥 [${jobId}] Error processing ${integration.provider}:`, error)

        // Update integration with error details
        await updateIntegrationWithError(supabase, integration.id, `Unexpected error: ${error.message}`, {})
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime
    const duration = durationMs / 1000

    console.log(`🏁 [${jobId}] Token refresh job completed in ${duration.toFixed(2)}s`)
    console.log(`   - Successful refreshes: ${successful}`)
    console.log(`   - Failed: ${failed}`)
    console.log(`   - Skipped: ${skipped}`)

    const responseMessage = `Token refresh finished in ${duration.toFixed(2)}s. ${successful} succeeded, ${failed} failed.`

    return NextResponse.json({
      success: true,
      message: responseMessage,
      jobId,
      duration_seconds: duration,
      stats: {
        processed: integrations.length,
        successful,
        failed,
        skipped,
      },
      errors: errors.slice(0, 10), // Limit errors in response
      provider_stats: providerStats,
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
      { status: 500 },
    )
  }
}

function shouldRefreshToken(
  integration: any,
  options: { accessTokenExpiryThreshold?: number; refreshTokenExpiryThreshold?: number },
): { shouldRefresh: boolean; reason: string } {
  const now = new Date()
  const accessThreshold = options.accessTokenExpiryThreshold || 30 // Default 30 minutes
  const refreshThreshold = 30 // Always 30 minutes for refresh tokens

  // Check refresh token expiration first (highest priority)
  if (integration.refresh_token_expires_at) {
    const refreshExpiresAt = new Date(integration.refresh_token_expires_at)
    const minutesUntilRefreshExpiration = (refreshExpiresAt.getTime() - now.getTime()) / (1000 * 60)

    if (minutesUntilRefreshExpiration <= refreshThreshold) {
      return {
        shouldRefresh: true,
        reason: `Refresh token expires in ${Math.max(0, Math.round(minutesUntilRefreshExpiration))} minutes`,
      }
    }
  }

  // Check access token expiration
  if (integration.expires_at) {
    const expiresAt = new Date(integration.expires_at)
    const minutesUntilExpiration = (expiresAt.getTime() - now.getTime()) / (1000 * 60)

    if (minutesUntilExpiration <= accessThreshold) {
      return {
        shouldRefresh: true,
        reason: `Access token expires in ${Math.max(0, Math.round(minutesUntilExpiration))} minutes`,
      }
    }
  } else {
    // No expiration is set, we should refresh to be safe
    return { shouldRefresh: true, reason: "No access token expiration set" }
  }

  // No refresh needed
  return { shouldRefresh: false, reason: "Tokens are still valid" }
}

async function updateIntegrationWithRefreshResult(
  supabase: any,
  integrationId: string,
  refreshResult: any,
): Promise<void> {
  const { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, scope } = refreshResult

  if (!accessToken) {
    throw new Error("Cannot update integration: No access token in refresh result")
  }

  try {
    // Calculate the new expiration dates
    const now = new Date()
    let expiresAt: Date | null = null
    let refreshTokenExpiresAt: Date | null = null

    if (accessTokenExpiresIn) {
      expiresAt = new Date(now.getTime() + accessTokenExpiresIn * 1000)
    }

    if (refreshTokenExpiresIn) {
      refreshTokenExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000)
    }

    // Prepare the update data - including all tracking columns
    const updateData: Record<string, any> = {
      access_token: accessToken,
      updated_at: now.toISOString(),
      last_refresh_attempt: now.toISOString(),
      last_refresh_success: now.toISOString(),
      last_token_refresh: now.toISOString(),
      consecutive_failures: 0,
      status: "connected",
    }

    if (expiresAt) {
      updateData.expires_at = expiresAt.toISOString()
    }

    if (refreshToken) {
      updateData.refresh_token = refreshToken
    }

    if (refreshTokenExpiresAt) {
      updateData.refresh_token_expires_at = refreshTokenExpiresAt.toISOString()
    }

    if (scope) {
      // Convert scope string to array format for scopes column
      updateData.scopes = scope.split(" ")
    }

    // Update the integration in the database
    const { error } = await supabase.from("integrations").update(updateData).eq("id", integrationId)

    if (error) {
      throw error
    }

    console.log(`✅ Updated tokens for integration ID: ${integrationId}`)
  } catch (error: any) {
    console.error(`❌ Failed to update tokens for integration ID: ${integrationId}:`, error)
    throw error
  }
}

async function updateIntegrationWithError(
  supabase: any,
  integrationId: string,
  errorMessage: string,
  additionalData: Record<string, any> = {},
): Promise<void> {
  try {
    // Get the current integration data to increment failure counter
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("consecutive_failures")
      .eq("id", integrationId)
      .single()

    if (fetchError) {
      console.error(`Error fetching integration ${integrationId}:`, fetchError.message)
    }

    // Increment the failure counter
    const consecutiveFailures = (integration?.consecutive_failures || 0) + 1
    const now = new Date()

    // Prepare the update data with all tracking columns
    const updateData: Record<string, any> = {
      consecutive_failures: consecutiveFailures,
      disconnect_reason: errorMessage,
      updated_at: now.toISOString(),
      last_refresh_attempt: now.toISOString(),
      last_failure_at: now.toISOString(),
      ...additionalData,
    }

    // Handle disconnection logic
    if (additionalData.shouldDisconnect || consecutiveFailures >= 5) {
      updateData.status = "needs_reauthorization"
      updateData.disconnected_at = now.toISOString()
      updateData.is_active = false // Deactivate the integration
    } else if (consecutiveFailures >= 3 && !additionalData.status) {
      updateData.status = "needs_reauthorization"
    }

    // Remove shouldDisconnect from the data before database update
    delete updateData.shouldDisconnect

    // Add metadata with error information
    try {
      const { data: currentIntegration } = await supabase
        .from("integrations")
        .select("metadata")
        .eq("id", integrationId)
        .single()

      if (currentIntegration) {
        const currentMetadata = currentIntegration.metadata || {}
        updateData.metadata = {
          ...currentMetadata,
          last_error: errorMessage,
          last_error_at: now.toISOString(),
          requires_reauth: additionalData.shouldDisconnect || false,
        }
      }
    } catch (metadataError) {
      console.log(`Note: metadata column not available for integration ${integrationId}`)
    }

    // Update the database
    const { error: updateError } = await supabase.from("integrations").update(updateData).eq("id", integrationId)

    if (updateError) {
      console.error(`Error updating integration ${integrationId} with error:`, updateError.message)
    } else {
      const statusMsg = additionalData.shouldDisconnect
        ? `deactivated (requires re-auth)`
        : `error status (${consecutiveFailures} consecutive failures)`
      console.log(`✅ Updated integration ${integrationId} with ${statusMsg}`)
    }
  } catch (error) {
    console.error(`Unexpected error updating integration ${integrationId} with error:`, error)
  }
}
