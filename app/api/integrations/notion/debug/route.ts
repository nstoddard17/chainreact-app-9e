import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get all integrations for this user
    const { data: integrations, error: integrationsError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)

    if (integrationsError) {
      return NextResponse.json({ error: integrationsError.message }, { status: 500 })
    }

    // Get specifically Notion integrations
    const notionIntegrations = integrations?.filter((i) => i.provider === "notion") || []

    return NextResponse.json({
      userId: user.id,
      totalIntegrations: integrations?.length || 0,
      notionIntegrations: notionIntegrations.length,
      notionDetails: notionIntegrations.map((i) => ({
        id: i.id,
        status: i.status,
        provider_user_id: i.provider_user_id,
        created_at: i.created_at,
        updated_at: i.updated_at,
        scopes: i.scopes,
        granted_scopes: i.granted_scopes,
        is_active: i.is_active,
        metadata: i.metadata,
      })),
      allIntegrations: integrations?.map((i) => ({
        provider: i.provider,
        status: i.status,
        created_at: i.created_at,
      })),
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
