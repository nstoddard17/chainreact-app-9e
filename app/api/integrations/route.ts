import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })

    // Use getUser() instead of getSession() for secure authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("User authentication error:", userError)
      return NextResponse.json({ error: "Authentication error", details: userError.message }, { status: 401 })
    }

    if (!user?.id) {
      console.error("No authenticated user found")
      return NextResponse.json({ error: "Unauthorized - no valid user" }, { status: 401 })
    }

    console.log("Fetching integrations for authenticated user:", user.id)

    // Fetch user's integrations with detailed logging
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Database error fetching integrations:", error)
      return NextResponse.json(
        {
          error: "Failed to fetch integrations",
          details: error.message,
          code: error.code,
        },
        { status: 500 },
      )
    }

    console.log(`Found ${integrations?.length || 0} integrations for user ${user.id}:`, integrations)

    // Transform the data to ensure consistent format
    const transformedIntegrations = (integrations || []).map((integration) => ({
      id: integration.id,
      user_id: integration.user_id,
      provider: integration.provider,
      provider_user_id: integration.provider_user_id,
      status: integration.status || "disconnected",
      access_token: integration.access_token ? "[REDACTED]" : null, // Don't send actual tokens to client
      refresh_token: integration.refresh_token ? "[REDACTED]" : null,
      expires_at: integration.expires_at,
      scopes: integration.scopes,
      metadata: integration.metadata,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      last_sync: integration.last_sync,
      error_message: integration.error_message,
    }))

    return NextResponse.json({
      success: true,
      data: transformedIntegrations,
      count: transformedIntegrations.length,
      user_id: user.id,
    })
  } catch (error) {
    console.error("API error in /api/integrations:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
