import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import type { Integration } from "@/types/integration"

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

    // Check for expired integrations and update their status
    const now = new Date()
    const expiredIntegrations: string[] = []

    for (const integration of integrations || []) {
      if (
        integration.status === "connected" &&
        integration.expires_at &&
        new Date(integration.expires_at) <= now
      ) {
        expiredIntegrations.push(integration.provider)
        
        // Update the integration status to expired
        await supabase
          .from("integrations")
          .update({
            status: "expired",
            updated_at: now.toISOString(),
          })
          .eq("id", integration.id)

        // Update the integration object for the response
        integration.status = "expired"
      }
    }

    // Update the integrations array with the corrected statuses
    const updatedIntegrations = integrations?.map((integration) => {
      if (expiredIntegrations.includes(integration.provider)) {
        return { ...integration, status: "expired" }
      }
      return integration
    })

    return NextResponse.json({
      success: true,
      data: updatedIntegrations || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch integrations",
      },
      { status: 500 }
    )
  }
}
