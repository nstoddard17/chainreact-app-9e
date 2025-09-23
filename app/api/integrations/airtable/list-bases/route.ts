import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"

export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get Airtable integration
    const { data: integration, error: integError } = await supabase
      .from("integrations")
      .select("access_token, metadata")
      .eq("user_id", user.id)
      .eq("provider", "airtable")
      .eq("status", "connected")
      .single()

    if (integError || !integration) {
      return NextResponse.json({
        error: "Airtable integration not found. Please connect Airtable first."
      }, { status: 404 })
    }

    // Decrypt token
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error("ENCRYPTION_KEY not configured")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const token = decrypt(integration.access_token, encryptionKey)

    // First check user info and scopes
    const userInfoRes = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!userInfoRes.ok) {
      const error = await userInfoRes.text()
      console.error("Failed to get Airtable user info:", error)
      return NextResponse.json({
        error: "Invalid Airtable token. Please reconnect your Airtable integration."
      }, { status: 401 })
    }

    const userInfo = await userInfoRes.json()
    const hasWebhookScope = userInfo.scopes?.includes("webhook:manage")

    // Get all bases
    const basesRes = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!basesRes.ok) {
      const error = await basesRes.text()
      console.error("Failed to list Airtable bases:", error)
      return NextResponse.json({
        error: "Failed to fetch Airtable bases"
      }, { status: 500 })
    }

    const basesData = await basesRes.json()

    // Format response
    const response = {
      user: {
        email: userInfo.email,
        id: userInfo.id,
        scopes: userInfo.scopes,
        hasWebhookScope
      },
      bases: basesData.bases.map((base: any) => ({
        id: base.id,
        name: base.name,
        permissionLevel: base.permissionLevel
      })),
      message: !hasWebhookScope
        ? "⚠️ Missing webhook:manage scope. Please reconnect Airtable to enable triggers."
        : null
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error("Error listing Airtable bases:", error)
    return NextResponse.json({
      error: error.message || "Failed to list Airtable bases"
    }, { status: 500 })
  }
}