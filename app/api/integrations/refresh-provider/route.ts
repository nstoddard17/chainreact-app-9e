import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/refresh"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // 60 seconds (maximum allowed)

export async function POST(request: NextRequest) {
  try {
    // Check for authentication
    const authHeader = request.headers.get("authorization")
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }

    // Check authorization from header
    const providedSecret = authHeader?.replace("Bearer ", "")

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { provider } = body

    if (!provider) {
      return NextResponse.json({ error: "Missing provider parameter" }, { status: 400 })
    }

    // Create a Supabase client for database operations
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get all integrations for this provider
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("provider", provider)
      .eq("status", "connected")
      .not("refresh_token", "is", null)

    if (error) {
      return NextResponse.json({ error: `Failed to fetch integrations: ${error.message}` }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ message: `No ${provider} integrations found with refresh tokens` })
    }

    // Process each integration
    const results = []
    for (const integration of integrations) {
      try {
        const result = await refreshTokenIfNeeded(integration)
        results.push({
          integrationId: integration.id,
          userId: integration.user_id,
          success: result.success,
          refreshed: result.refreshed,
          message: result.message,
        })
      } catch (error: any) {
        results.push({
          integrationId: integration.id,
          userId: integration.user_id,
          success: false,
          refreshed: false,
          message: `Error: ${error.message}`,
        })
      }
    }

    return NextResponse.json({
      success: true,
      provider,
      totalProcessed: integrations.length,
      results,
    })
  } catch (error: any) {
    console.error("Error in refresh-provider endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh provider tokens",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
