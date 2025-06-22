import { NextResponse } from "next/server"
import { TokenRefreshService } from "@/lib/integrations/tokenRefreshService"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * @route GET /api/cron/refresh-tokens-simple
 * @description Cron job to refresh OAuth tokens based on prioritized expiration
 * @query cleanup - If "true", will run in cleanup mode to fix invalid tokens
 * @query provider - Optional provider ID to only refresh tokens for that provider
 * @query limit - Maximum number of tokens to refresh (default: 200)
 * @query dry_run - If "true", won't update the database
 * @query include_inactive - If "true", will include inactive integrations
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const cleanupMode = searchParams.get("cleanup") === "true"
  const dryRun = searchParams.get("dry_run") === "true"
  const provider = searchParams.get("provider") || undefined
  const limitParam = searchParams.get("limit")
  const limit = limitParam ? parseInt(limitParam, 10) : undefined
  const includeInactive = searchParams.get("include_inactive") === "true"
  
  console.log(`Starting refresh-tokens-simple cron job with options:`, {
    cleanupMode,
    dryRun,
    provider,
    limit,
    includeInactive
  })
  
  try {
    // Run token refresh using our service
    const stats = await TokenRefreshService.refreshTokens({
      prioritizeExpiring: true,
      dryRun,
      limit,
      batchSize: 50,
      onlyProvider: provider,
      includeInactive,
      // In cleanup mode, set high thresholds to refresh all tokens
      accessTokenExpiryThreshold: cleanupMode ? 43200 : 30, // 30 days in cleanup mode
      refreshTokenExpiryThreshold: cleanupMode ? 43200 : 60, // 30 days in cleanup mode
    })
    
    // Calculate success rate
    const successRate = stats.processed > 0 
      ? Math.round((stats.successful / stats.processed) * 100) 
      : 0
      
    // Format the response
    const response = {
      timestamp: new Date().toISOString(),
      durationMs: stats.durationMs,
      stats: {
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        skipped: stats.skipped,
        successRate: `${successRate}%`,
      },
      errors: stats.errors,
      providerStats: stats.providerStats,
      options: {
        cleanupMode,
        dryRun,
        provider,
        limit,
        includeInactive,
      },
    }
    
    console.log(`Token refresh completed with ${successRate}% success rate`)
    
    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Error during token refresh:", error)
    
    return NextResponse.json(
      { 
        error: error.message || "Unknown error occurred during token refresh", 
        timestamp: new Date().toISOString() 
      }, 
      { status: 500 }
    )
  }
}
