import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export async function POST(request: NextRequest) {
  try {
    const { provider, integrationId } = await request.json()

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error: "Provider is required",
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

    // Get integration by ID or provider
    let query = supabase.from("integrations").select("*")

    if (integrationId) {
      query = query.eq("id", integrationId)
    } else {
      query = query.eq("provider", provider).eq("status", "connected")
    }

    const { data: integration, error: fetchError } = await query.single()

    if (fetchError || !integration) {
      return NextResponse.json(
        {
          success: false,
          error: `No ${provider} integration found`,
        },
        { status: 404 },
      )
    }

    // Attempt to refresh the token
    const refreshResult = await refreshTokenIfNeeded(integration)

    if (refreshResult.success) {
      return NextResponse.json({
        success: true,
        message: refreshResult.message,
        refreshed: refreshResult.refreshed,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: refreshResult.message,
          requiresReconnect: refreshResult.requiresReconnect,
        },
        { status: refreshResult.requiresReconnect ? 401 : 500 },
      )
    }
  } catch (error: any) {
    console.error("Error in token refresh API:", error)
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
