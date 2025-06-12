import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get all connected integrations with refresh tokens
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")
      .not("refresh_token", "is", null)

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({
        message: "No connected integrations with refresh tokens found",
        refreshed: [],
      })
    }

    console.log(`Found ${integrations.length} integrations to refresh tokens for user ${userId}`)

    // Process each integration
    const results = await Promise.allSettled(
      integrations.map(async (integration) => {
        try {
          console.log(`Refreshing token for ${integration.provider}...`)
          const result = await refreshTokenIfNeeded(integration)

          return {
            provider: integration.provider,
            success: result.success,
            refreshed: result.refreshed,
            message: result.message,
          }
        } catch (error: any) {
          console.error(`Error refreshing token for ${integration.provider}:`, error)
          return {
            provider: integration.provider,
            success: false,
            refreshed: false,
            message: error.message,
          }
        }
      }),
    )

    // Process results
    const processedResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value
      } else {
        return {
          provider: integrations[index].provider,
          success: false,
          refreshed: false,
          message: result.reason?.message || "Unknown error",
        }
      }
    })

    const successful = processedResults.filter((r) => r.success && r.refreshed).length
    const failed = processedResults.filter((r) => !r.success).length
    const skipped = processedResults.filter((r) => r.success && !r.refreshed).length

    return NextResponse.json({
      message: `Processed ${integrations.length} integrations: ${successful} refreshed, ${failed} failed, ${skipped} skipped`,
      results: processedResults,
      stats: {
        total: integrations.length,
        successful,
        failed,
        skipped,
      },
    })
  } catch (error: any) {
    console.error("Error in refresh-all-tokens route:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
