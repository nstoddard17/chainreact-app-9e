import { type NextRequest, NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const jobId = `debug-${Date.now()}`
  const startTime = Date.now()

  try {
    // Check for Vercel cron job header
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

    console.log(`🔍 [${jobId}] Debug cron job started`)

    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    console.log(`✅ [${jobId}] Step 1: Database client created successfully`)

    // Test basic database connectivity
    console.log(`🔍 [${jobId}] Step 2: Testing basic database connectivity...`)
    const { count: totalCount, error: countError } = await supabase
      .from("integrations")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error(`❌ [${jobId}] Database connectivity test failed:`, countError)
      throw new Error(`Database connectivity test failed: ${countError.message}`)
    }

    console.log(`✅ [${jobId}] Step 2: Database connectivity test passed. Total integrations: ${totalCount}`)

    // Test the complex queries one by one
    console.log(`🔍 [${jobId}] Step 3: Testing connected integrations query...`)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: connectedIntegrations, error: connectedError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")

    if (connectedError) {
      console.error(`❌ [${jobId}] Connected integrations query failed:`, connectedError)
      throw new Error(`Connected integrations query failed: ${connectedError.message}`)
    }

    console.log(`✅ [${jobId}] Step 3: Connected integrations query passed. Found: ${connectedIntegrations?.length || 0}`)

    console.log(`🔍 [${jobId}] Step 4: Testing disconnected integrations query...`)
    const { data: disconnectedIntegrations, error: disconnectedError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "disconnected")
      .not("refresh_token", "is", null)
      .gte("disconnected_at", sevenDaysAgo)

    if (disconnectedError) {
      console.error(`❌ [${jobId}] Disconnected integrations query failed:`, disconnectedError)
      throw new Error(`Disconnected integrations query failed: ${disconnectedError.message}`)
    }

    console.log(`✅ [${jobId}] Step 4: Disconnected integrations query passed. Found: ${disconnectedIntegrations?.length || 0}`)

    console.log(`🔍 [${jobId}] Step 5: Testing reauthorization integrations query...`)
    const { data: reAuthIntegrations, error: reAuthError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "needs_reauthorization")
      .not("refresh_token", "is", null)
      .gte("updated_at", sevenDaysAgo)

    if (reAuthError) {
      console.error(`❌ [${jobId}] Reauthorization integrations query failed:`, reAuthError)
      throw new Error(`Reauthorization integrations query failed: ${reAuthError.message}`)
    }

    console.log(`✅ [${jobId}] Step 5: Reauthorization integrations query passed. Found: ${reAuthIntegrations?.length || 0}`)

    console.log(`🔍 [${jobId}] Step 6: Testing expired integrations query...`)
    const { data: expiredIntegrations, error: expiredError } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "expired")
      .not("refresh_token", "is", null)
      .gte("updated_at", sevenDaysAgo)

    if (expiredError) {
      console.error(`❌ [${jobId}] Expired integrations query failed:`, expiredError)
      throw new Error(`Expired integrations query failed: ${expiredError.message}`)
    }

    console.log(`✅ [${jobId}] Step 6: Expired integrations query passed. Found: ${expiredIntegrations?.length || 0}`)

    // Test the combination logic
    console.log(`🔍 [${jobId}] Step 7: Testing combination logic...`)
    const integrations = [
      ...(connectedIntegrations || []),
      ...(disconnectedIntegrations || []),
      ...(reAuthIntegrations || []),
      ...(expiredIntegrations || []),
    ]

    const uniqueIntegrations = integrations.filter(
      (integration, index, self) => index === self.findIndex((i) => i.id === integration.id),
    )

    console.log(`✅ [${jobId}] Step 7: Combination logic passed. Total: ${integrations.length}, Unique: ${uniqueIntegrations.length}`)

    // Test the batching logic (without actually processing)
    console.log(`🔍 [${jobId}] Step 8: Testing batching logic...`)
    const batchSize = 5
    const batches = []
    for (let i = 0; i < uniqueIntegrations.length; i += batchSize) {
      batches.push(uniqueIntegrations.slice(i, i + batchSize))
    }

    console.log(`✅ [${jobId}] Step 8: Batching logic passed. Created ${batches.length} batches`)

    const endTime = Date.now()
    const durationMs = endTime - startTime

    console.log(`🏁 [${jobId}] Debug job completed successfully in ${durationMs}ms`)

    return NextResponse.json({
      success: true,
      message: "Debug cron job completed successfully",
      jobId,
      duration: `${durationMs}ms`,
      results: {
        totalIntegrations: totalCount,
        connected: connectedIntegrations?.length || 0,
        disconnected: disconnectedIntegrations?.length || 0,
        reauthorization: reAuthIntegrations?.length || 0,
        expired: expiredIntegrations?.length || 0,
        totalCombined: integrations.length,
        uniqueCombined: uniqueIntegrations.length,
        batches: batches.length
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error(`💥 [${jobId}] Debug job failed:`, error)
    
    const endTime = Date.now()
    const durationMs = endTime - startTime

    return NextResponse.json(
      {
        success: false,
        error: "Debug cron job failed",
        details: error.message,
        duration: `${durationMs}ms`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
} 