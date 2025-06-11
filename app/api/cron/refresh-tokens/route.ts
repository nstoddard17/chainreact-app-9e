import { type NextRequest, NextResponse } from "next/server"
import { refreshExpiringTokens } from "@/lib/integrations/autoTokenRefresh"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"

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
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
      message: "Token refresh job completed",
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

async function logJobExecution(stats: RefreshStats, duration: number, isCriticalFailure = false) {
  try {
    const supabase = createAdminSupabaseClient()
    if (!supabase) return

    await supabase.from("token_refresh_logs").insert({
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
  } catch (error) {
    console.error("Failed to log job execution:", error)
  }
}
