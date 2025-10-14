import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return errorResponse("Failed to create database client" , 500)
    }

    // Get the OneDrive integration
    const { data: onedriveIntegration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("provider", "onedrive")
      .eq("status", "disconnected")
      .order("disconnected_at", { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !onedriveIntegration) {
      return errorResponse("No disconnected OneDrive integration found", 404, { details: fetchError?.message 
       })
    }

    // Test the refresh token
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return errorResponse("Missing Microsoft OAuth credentials", 500, {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      })
    }

    logger.debug(`🔍 Testing OneDrive refresh token for user ${onedriveIntegration.user_id}`)
    logger.debug(`📋 Client ID: ${clientId.substring(0, 10)}...`)
    logger.debug(`🔑 Has refresh token: ${!!onedriveIntegration.refresh_token}`)

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: onedriveIntegration.refresh_token,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()
    logger.debug(`📊 Response status: ${response.status}`)
    logger.debug(`📊 Response data:`, data)

    return jsonResponse({
      success: true,
      integration: {
        id: onedriveIntegration.id,
        user_id: onedriveIntegration.user_id,
        status: onedriveIntegration.status,
        disconnected_at: onedriveIntegration.disconnected_at,
        disconnect_reason: onedriveIntegration.disconnect_reason,
        has_refresh_token: !!onedriveIntegration.refresh_token,
        refresh_token_preview: `${onedriveIntegration.refresh_token?.substring(0, 20) }...`,
      },
      test_result: {
        status: response.status,
        ok: response.ok,
        error: data.error,
        error_description: data.error_description,
        message: response.ok ? "Refresh token is valid" : `Refresh failed: ${data.error} - ${data.error_description}`,
      },
      credentials: {
        has_client_id: !!clientId,
        has_client_secret: !!clientSecret,
        client_id_preview: `${clientId.substring(0, 10) }...`,
      }
    })

  } catch (error: any) {
    logger.error("OneDrive refresh test error:", error)
    return jsonResponse({
      success: false,
      error: "Failed to test OneDrive refresh",
      details: error.message
    }, { status: 500 })
  }
}
