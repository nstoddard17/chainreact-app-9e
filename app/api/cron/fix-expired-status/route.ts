import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const jobId = `fix-status-${Date.now()}`
  const startTime = Date.now()

  try {
    // Check for Vercel cron job header OR manual trigger
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

    console.log(`🔧 [${jobId}] Starting expired status fix job`)

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get all integrations
    const { data: allIntegrations, error: fetchError } = await supabase
      .from("integrations")
      .select("*")

    if (fetchError) {
      return NextResponse.json({ error: `Database error: ${fetchError.message}` }, { status: 500 })
    }

    console.log(`📊 [${jobId}] Found ${allIntegrations?.length || 0} total integrations`)

    const now = new Date()
    let updatedCount = 0
    const updates = []

    // Check each integration
    for (const integration of allIntegrations || []) {
      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        
        // If token is expired but status is still "connected"
        if (expiresAt < now && integration.status === "connected") {
          console.log(`🔧 [${jobId}] Fixing ${integration.provider} - expired at ${expiresAt.toISOString()}`)
          
          const { error: updateError } = await supabase
            .from("integrations")
            .update({
              status: "expired",
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)

          if (updateError) {
            console.error(`❌ [${jobId}] Failed to update ${integration.provider}:`, updateError)
          } else {
            updatedCount++
            updates.push({
              id: integration.id,
              provider: integration.provider,
              user_id: integration.user_id,
              old_status: "connected",
              new_status: "expired",
              expires_at: integration.expires_at
            })
          }
        }
      }
    }

    const endTime = Date.now()
    const durationMs = endTime - startTime

    console.log(`✅ [${jobId}] Status fix completed in ${durationMs}ms`)
    console.log(`   - Updated ${updatedCount} integrations`)

    return NextResponse.json({
      success: true,
      message: "Expired status fix completed",
      jobId,
      duration: `${durationMs}ms`,
      stats: {
        total_integrations: allIntegrations?.length || 0,
        updated_count: updatedCount,
        updates: updates
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error(`💥 [${jobId}] Status fix job failed:`, error)
    
    const endTime = Date.now()
    const durationMs = endTime - startTime

    return NextResponse.json(
      {
        success: false,
        error: "Status fix job failed",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
} 