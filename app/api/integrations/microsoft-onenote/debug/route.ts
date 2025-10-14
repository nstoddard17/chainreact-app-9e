import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
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
      return errorResponse("Not authenticated" , 401)
    }

    // Get OneNote integration for this user
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "microsoft-onenote")
      .single()

    if (integrationError && integrationError.code !== "PGRST116") { // PGRST116 is "no rows returned" error
      return errorResponse(integrationError.message , 500)
    }

    // Return integration status
    return jsonResponse({
      success: true,
      exists: !!integration,
      integration: integration ? {
        id: integration.id,
        status: integration.status,
        provider: integration.provider,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
        expires_at: integration.expires_at,
        user_id: integration.user_id,
        // Don't return sensitive data like tokens
      } : null,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return jsonResponse(
      {
        success: false,
        error: error.message || "Failed to fetch OneNote integration",
      },
      { status: 500 }
    )
  }
} 