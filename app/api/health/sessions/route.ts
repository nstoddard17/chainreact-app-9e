import { jsonResponse } from "@/lib/utils/api-response"
import { createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from "@/lib/utils/logger"

export const dynamic = "force-dynamic"

export async function GET() {
  const startTime = Date.now()

  try {
    const supabase = await createSupabaseServiceClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ count: total }, { count: last24h }, { data: latest, error: latestError }] = await Promise.all([
      supabase
        .from("workflow_execution_sessions")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("workflow_execution_sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase
        .from("workflow_execution_sessions")
        .select("id, status, created_at, started_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ])

    if (latestError) {
      logger.error("[Sessions Health] Failed to fetch latest session", latestError)
    }

    const latestSession = latest?.[0] || null

    return jsonResponse({
      status: "healthy",
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
      sessions: {
        total: total || 0,
        last24h: last24h || 0,
        latest: latestSession,
      },
    })
  } catch (error: any) {
    logger.error("[Sessions Health] Unexpected error", error)
    return jsonResponse(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error?.message || "Sessions health check failed",
      },
      { status: 503 }
    )
  }
}
