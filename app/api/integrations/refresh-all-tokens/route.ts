import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "User ID is required",
        },
        { status: 400 },
      )
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json(
        {
          success: false,
          error: "Database connection failed",
        },
        { status: 500 },
      )
    }

    // Get all connected integrations for the user
    const { data: integrations, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["connected", "disconnected", "expired"])
      .not("refresh_token", "is", null)

    if (fetchError) {
      console.error("Error fetching integrations:", fetchError)
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch integrations",
        },
        { status: 500 },
      )
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No integrations found that need token refresh",
        stats: {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
          errors: [],
        },
      })
    }

    console.log(`Processing ${integrations.length} integrations for token refresh`)

    const stats = {
      totalProcessed: integrations.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ provider: string; error: string }>,
    }

    // Process integrations in batches to avoid overwhelming APIs
    const batchSize = 3
    for (let i = 0; i < integrations.length; i += batchSize) {
      const batch = integrations.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (integration) => {
          try {
            console.log(`Refreshing token for ${integration.provider}`)
            const result = await refreshTokenIfNeeded(integration)

            if (result.refreshed) {
              stats.successful++
              console.log(`✅ Successfully refreshed ${integration.provider}`)
            } else if (result.success) {
              stats.skipped++
              console.log(`⏭️ Skipped ${integration.provider}: ${result.message}`)
            } else {
              stats.failed++
              stats.errors.push({
                provider: integration.provider,
                error: result.message,
              })
              console.warn(`⚠️ Failed to refresh ${integration.provider}: ${result.message}`)
            }
          } catch (error: any) {
            stats.failed++
            stats.errors.push({
              provider: integration.provider,
              error: error.message,
            })
            console.error(`💥 Error refreshing ${integration.provider}:`, error)
          }
        }),
      )

      // Small delay between batches
      if (i + batchSize < integrations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log(
      `Token refresh completed: ${stats.successful} successful, ${stats.failed} failed, ${stats.skipped} skipped`,
    )

    return NextResponse.json({
      success: true,
      message: `Token refresh completed: ${stats.successful} successful, ${stats.failed} failed, ${stats.skipped} skipped`,
      stats,
    })
  } catch (error: any) {
    console.error("Error in refresh-all-tokens API:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
