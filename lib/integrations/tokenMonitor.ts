import { createAdminSupabaseClient } from "@/lib/oauth/utils"

interface TokenHealth {
  provider: string
  userId: string
  status: "healthy" | "expiring" | "expired" | "failed"
  expiresAt?: string
  expiresIn?: number
  consecutiveFailures: number
  lastRefresh?: string
  lastFailure?: string
}

/**
 * Monitor token health across all integrations
 */
export async function getTokenHealthReport(): Promise<{
  healthy: TokenHealth[]
  expiring: TokenHealth[]
  expired: TokenHealth[]
  failed: TokenHealth[]
  summary: {
    total: number
    healthy: number
    expiring: number
    expired: number
    failed: number
  }
}> {
  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    throw new Error("Failed to create Supabase client")
  }

  const { data: integrations, error } = await supabase.from("integrations").select("*").eq("status", "connected")

  if (error) {
    throw new Error(`Failed to fetch integrations: ${error.message}`)
  }

  const now = Math.floor(Date.now() / 1000)
  const report = {
    healthy: [] as TokenHealth[],
    expiring: [] as TokenHealth[],
    expired: [] as TokenHealth[],
    failed: [] as TokenHealth[],
    summary: {
      total: 0,
      healthy: 0,
      expiring: 0,
      expired: 0,
      failed: 0,
    },
  }

  for (const integration of integrations || []) {
    const health: TokenHealth = {
      provider: integration.provider,
      userId: integration.user_id,
      status: "healthy",
      consecutiveFailures: integration.consecutive_failures || 0,
      lastRefresh: integration.last_token_refresh,
      lastFailure: integration.last_failure_at,
    }

    // Check if integration has consecutive failures
    if (integration.consecutive_failures >= 3) {
      health.status = "failed"
      report.failed.push(health)
    } else if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at).getTime() / 1000
      const expiresIn = expiresAt - now

      health.expiresAt = integration.expires_at
      health.expiresIn = expiresIn

      if (expiresIn <= 0) {
        health.status = "expired"
        report.expired.push(health)
      } else if (expiresIn < 3600) {
        // Expires within 1 hour
        health.status = "expiring"
        report.expiring.push(health)
      } else {
        report.healthy.push(health)
      }
    } else {
      // No expiry info - assume healthy if no failures
      report.healthy.push(health)
    }
  }

  report.summary = {
    total: integrations?.length || 0,
    healthy: report.healthy.length,
    expiring: report.expiring.length,
    expired: report.expired.length,
    failed: report.failed.length,
  }

  return report
}

/**
 * Get integrations that need immediate attention
 */
export async function getIntegrationsNeedingAttention(): Promise<{
  criticallyExpired: TokenHealth[]
  multipleFailures: TokenHealth[]
  recommendations: string[]
}> {
  const report = await getTokenHealthReport()
  const now = Math.floor(Date.now() / 1000)

  const criticallyExpired = report.expired.concat(
    report.expiring.filter((h) => h.expiresIn && h.expiresIn < 300), // Less than 5 minutes
  )

  const multipleFailures = report.failed.filter((h) => h.consecutiveFailures >= 2)

  const recommendations = []

  if (criticallyExpired.length > 0) {
    recommendations.push(`${criticallyExpired.length} integrations are critically expired and need immediate refresh`)
  }

  if (multipleFailures.length > 0) {
    recommendations.push(`${multipleFailures.length} integrations have multiple failures and may need reconnection`)
  }

  if (report.expiring.length > 5) {
    recommendations.push(`${report.expiring.length} integrations are expiring soon - consider running refresh job`)
  }

  return {
    criticallyExpired,
    multipleFailures,
    recommendations,
  }
}
