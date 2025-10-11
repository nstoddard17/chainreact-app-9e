import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
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
      return NextResponse.json({ 
        error: "No disconnected OneDrive integration found",
        details: fetchError?.message 
      }, { status: 404 })
    }

    // Test the refresh token
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: "Missing Microsoft OAuth credentials",
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      }, { status: 500 })
    }

    console.log(`🔍 Testing OneDrive refresh token for user ${onedriveIntegration.user_id}`)
    console.log(`📋 Client ID: ${clientId.substring(0, 10)}...`)
    console.log(`🔑 Has refresh token: ${!!onedriveIntegration.refresh_token}`)

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
    console.log(`📊 Response status: ${response.status}`)
    console.log(`📊 Response data:`, data)

    return NextResponse.json({
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
    console.error("OneDrive refresh test error:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to test OneDrive refresh",
      details: error.message
    }, { status: 500 })
  }
}
