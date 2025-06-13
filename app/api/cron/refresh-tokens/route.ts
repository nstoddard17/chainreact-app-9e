import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // seconds

export async function GET(request: NextRequest) {
  const jobId = `refresh-job-${Date.now()}`
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get("authorization")
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret") || url.searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    const providedSecret = authHeader?.replace("Bearer ", "") || querySecret
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

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

    setTimeout(() => {
      backgroundRefreshTokens(jobId, startTime).catch((error) =>
        console.error("Unhandled error in background token refresh:", error),
      )
    }, 0)

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

async function backgroundRefreshTokens(jobId: string, startTime: number): Promise<void> {
  console.log("🔥 Entered backgroundRefreshTokens")

  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    console.error("❌ Failed to create Supabase client")
    return
  }

  try {
    await supabase
      .from("token_refresh_logs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("job_id", jobId)

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")

    if (error) {
      console.error("❌ Supabase fetch error:", error)
      throw new Error(`Error fetching integrations: ${error.message}`)
    }

    if (!integrations?.length) {
      console.log(`ℹ️ No connected integrations found`)
      return
    }

    console.log(`🔍 Found ${integrations.length} connected integrations`)

    for (const integration of integrations) {
      try {
        const result = await refreshTokenIfNeeded(integration)
        console.log(`🔁 ${integration.provider} for user ${integration.user_id}: ${result.message}`)
      } catch (e: any) {
        console.error(`💥 Error refreshing ${integration.provider} for user ${integration.user_id}:`, e.message)
      }
    }

    console.log(`✅ Token refresh job complete: ${jobId}`)
  } catch (err) {
    console.error("💥 Top-level failure in backgroundRefreshTokens:", err)
  }
}
