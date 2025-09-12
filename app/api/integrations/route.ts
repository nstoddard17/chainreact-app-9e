import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import type { Integration } from "@/types/integration"

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  console.log('📍 [API /api/integrations] GET request received', {
    timestamp: new Date().toISOString(),
    headers: {
      referer: 'check-console', // Will be logged from request
    }
  });
  
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('❌ [API /api/integrations] Auth error', { userError });
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
    const expiredIntegrationIds: string[] = []
    const expiredProviders: string[] = []

    // First, identify all expired integrations
    for (const integration of integrations || []) {
      if (
        integration.status === "connected" &&
        integration.expires_at &&
        new Date(integration.expires_at) <= now
      ) {
        expiredIntegrationIds.push(integration.id)
        expiredProviders.push(integration.provider)
      }
    }

    // Batch update all expired integrations at once
    if (expiredIntegrationIds.length > 0) {
      await supabase
        .from("integrations")
        .update({
          status: "expired",
          updated_at: now.toISOString(),
        })
        .in("id", expiredIntegrationIds)
    }

    // Update the integrations array with the corrected statuses
    const updatedIntegrations = integrations?.map((integration) => {
      if (expiredIntegrationIds.includes(integration.id)) {
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
