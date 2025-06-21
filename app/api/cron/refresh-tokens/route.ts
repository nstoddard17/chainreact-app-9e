import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"
import { SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

interface RefreshStats {
  totalProcessed: number
  successful: number
  failed: number
  skipped: number
  recovered: number
  errors: Array<{
    provider: string
    userId: string
    error: string
  }>
}

export async function GET(request: NextRequest) {
  const jobId = `refresh-job-${Date.now()}`
  const startTime = Date.now()
  const supabase = createAdminClient()

  try {
    // AUTHENTICATION
    const authHeader = request.headers.get("authorization")
    const querySecret = new URL(request.url).searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret || (authHeader?.replace("Bearer ", "") || querySecret) !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // JOB START LOG
    await logJobStart(supabase, jobId)

    // FETCH INTEGRATIONS
    const integrations = await getIntegrationsToRefresh(supabase, jobId)
    if (!integrations || integrations.length === 0) {
      return await completeJob(supabase, jobId, startTime, {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        recovered: 0,
        errors: [],
      })
    }

    // PROCESS INTEGRATIONS
    const stats = await processIntegrations(integrations, supabase, jobId)

    // JOB COMPLETION LOG
    return await completeJob(supabase, jobId, startTime, stats)
  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical job failure:`, error)
    await logCriticalFailure(supabase, jobId, startTime, error.message)
    return NextResponse.json(
      { success: false, error: "Critical job failure", details: error.message },
      { status: 500 },
    )
  }
}

async function logJobStart(supabase: SupabaseClient, jobId: string) {
  await supabase.from("token_refresh_logs").insert({
    job_id: jobId,
    status: "started",
  })
}

async function getIntegrationsToRefresh(supabase: SupabaseClient, jobId: string) {
  console.log(`🔍 [${jobId}] Fetching integrations...`)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .in("status", ["connected", "disconnected", "needs_reauthorization", "expired"])
    .not("refresh_token", "is", null)
    .gte("updated_at", sevenDaysAgo)
    .limit(100) // Process up to 100 integrations per run

  if (error) {
    console.error(`❌ [${jobId}] Error fetching integrations:`, error)
    throw new Error(`Error fetching integrations: ${error.message}`)
  }
  console.log(`✅ [${jobId}] Found ${data?.length || 0} integrations to process.`)
  return data
}

async function processIntegrations(
  integrations: any[],
  supabase: SupabaseClient,
  jobId: string,
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    recovered: 0,
    errors: [],
  }

  for (const integration of integrations) {
    stats.totalProcessed++
    try {
      const result = await refreshTokenIfNeeded(integration)

      if (result.refreshed) {
        stats.successful++
        if (result.recovered) stats.recovered++
        console.log(`✅ [${jobId}] Refreshed token for ${integration.provider}`)
      } else {
        stats.skipped++
      }
    } catch (error: any) {
      stats.failed++
      stats.errors.push({
        provider: integration.provider,
        userId: integration.user_id,
        error: error.message,
      })
      console.error(`❌ [${jobId}] Failed to refresh token for ${integration.provider}:`, error)
    }
  }
  return stats
}

async function completeJob(supabase: SupabaseClient, jobId: string, startTime: number, stats: RefreshStats) {
  const durationMs = Date.now() - startTime
  await supabase
    .from("token_refresh_logs")
    .update({
      status: "completed",
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      ...stats,
    })
    .eq("job_id", jobId)

  console.log(`🏁 [${jobId}] Job completed in ${durationMs}ms.`)
  return NextResponse.json({ success: true, jobId, duration: `${durationMs}ms`, ...stats })
}

async function logCriticalFailure(supabase: SupabaseClient, jobId: string, startTime: number, errorMessage: string) {
  const durationMs = Date.now() - startTime
  await supabase
    .from("token_refresh_logs")
    .update({
      status: "failed",
      is_critical_failure: true,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      errors: [{ error: "Critical job failure", message: errorMessage }],
    })
    .eq("job_id", jobId)
}
