import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET() {
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

    // Analyze the integrations
    const analysis = {
      totalIntegrations: integrations?.length || 0,
      byStatus: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      integrations: integrations?.map((i: any) => ({
        id: i.id,
        provider: i.provider,
        status: i.status,
        expires_at: i.expires_at,
        created_at: i.created_at,
        updated_at: i.updated_at
      })) || []
    }

    // Count by status
    integrations?.forEach((integration: any) => {
      analysis.byStatus[integration.status] = (analysis.byStatus[integration.status] || 0) + 1
      analysis.byProvider[integration.provider] = (analysis.byProvider[integration.provider] || 0) + 1
    })

    return NextResponse.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to debug integrations",
      },
      { status: 500 }
    )
  }
} 