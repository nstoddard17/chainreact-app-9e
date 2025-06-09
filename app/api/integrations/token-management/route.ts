import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export async function POST(request: NextRequest) {
  try {
    const { userId, provider } = await request.json()

    if (!userId || !provider) {
      return NextResponse.json({ error: "Missing required parameters: userId and provider" }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get the integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: `No ${provider} integration found for this user` }, { status: 404 })
    }

    // Check if token needs refresh
    const refreshResult = await refreshTokenIfNeeded(integration)

    return NextResponse.json({
      provider,
      userId,
      status: integration.status,
      tokenRefreshed: refreshResult.refreshed,
      message: refreshResult.message,
      requiresReauth: !refreshResult.success && !integration.refresh_token,
    })
  } catch (error: any) {
    console.error("Error in token management route:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "Missing required parameter: userId" }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    // Get all integrations for the user
    const { data: integrations, error } = await supabase.from("integrations").select("*").eq("user_id", userId)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
    }

    // Map to a cleaner response format
    const result = integrations.map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      connected: integration.status === "connected",
      hasRefreshToken: !!integration.refresh_token,
      expiresAt: integration.expires_at ? new Date(integration.expires_at * 1000).toISOString() : null,
      lastUpdated: integration.updated_at,
    }))

    return NextResponse.json({ integrations: result })
  } catch (error: any) {
    console.error("Error in token management route:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
