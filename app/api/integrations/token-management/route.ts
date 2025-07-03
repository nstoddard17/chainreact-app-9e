import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { encrypt, decrypt } from "@/lib/security/encryption"
import { createAdminClient } from "@/lib/supabase/admin"
import { TokenAuditLogger } from "@/lib/integrations/TokenAuditLogger"

const getSupabase = async () => {
  cookies()
  return await createSupabaseServerClient()
}
const getAdminSupabase = () => createAdminClient()

const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY

if (!ENCRYPTION_SECRET) {
  throw new Error("ENCRYPTION_KEY is not set in environment variables.")
}

// POST - Save an API Key
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider, apiKey } = await request.json()

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key are required" }, { status: 400 })
    }

    if (!ENCRYPTION_SECRET) {
      throw new Error("ENCRYPTION_KEY is not set.")
    }

    const encryptedKey = encrypt(apiKey, ENCRYPTION_SECRET)

    const adminSupabase = getAdminSupabase()
    const upsertData = {
      user_id: user.id,
      provider,
      access_token: encryptedKey,
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error } = await adminSupabase.from("integrations").upsert(
      upsertData,
      { onConflict: "user_id, provider" },
    )

    if (error) {
      console.error("Failed to save API key:", error)
      return NextResponse.json({ error: error.message || JSON.stringify(error) || "Failed to save API key" }, { status: 500 })
    }

    // Log the successful API key connection
    try {
      await TokenAuditLogger.logEvent(
        "api_key_connection",
        user.id,
        provider,
        "connect",
        { method: "api_key" }
      )
    } catch (auditError) {
      console.warn("Failed to log API key connection:", auditError)
    }

    return NextResponse.json({ success: true, message: `${provider} API key saved.` })
  } catch (error: any) {
    console.error("API Key Management Error (POST):", error)
    return NextResponse.json({ error: error.message || JSON.stringify(error) || "Internal Server Error" }, { status: 500 })
  }
}

// DELETE - Remove an API Key
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    const adminSupabase = getAdminSupabase()
    const { error } = await adminSupabase
      .from("integrations")
      .delete()
      .match({ user_id: user.id, provider: provider })

    if (error) {
      console.error("Failed to delete API key:", error)
      return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `${provider} API key removed.` })
  } catch (error: any) {
    console.error("API Key Management Error (DELETE):", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// PUT - Reconnect an integration
export async function PUT(request: NextRequest) {
  try {
    const supabase = await getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { integrationId, action } = await request.json()

    if (!integrationId || !action) {
      return NextResponse.json({ error: "Integration ID and action are required" }, { status: 400 })
    }

    if (action !== "reconnect") {
      return NextResponse.json({ error: "Invalid action. Only 'reconnect' is supported" }, { status: 400 })
    }

    const adminSupabase = getAdminSupabase()
    
    // Get the current integration
    const { data: integration, error: fetchError } = await adminSupabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !integration) {
      console.error("Failed to fetch integration:", fetchError)
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    // Update the integration status to trigger reconnection
    const { error: updateError } = await adminSupabase
      .from("integrations")
      .update({
        status: "needs_reauthorization",
        updated_at: new Date().toISOString(),
        disconnect_reason: "Manual reconnection requested"
      })
      .eq("id", integrationId)
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Failed to update integration for reconnection:", updateError)
      return NextResponse.json({ error: "Failed to reconnect integration" }, { status: 500 })
    }

    // Log the reconnection request
    try {
      await TokenAuditLogger.logEvent(
        integrationId,
        user.id,
        integration.provider,
        "reconnect",
        { reason: "Manual reconnection requested" }
      )
    } catch (auditError) {
      console.warn("Failed to log reconnection request:", auditError)
    }

    return NextResponse.json({ 
      success: true, 
      message: `${integration.provider} integration marked for reconnection.` 
    })
  } catch (error: any) {
    console.error("Integration Reconnection Error (PUT):", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
