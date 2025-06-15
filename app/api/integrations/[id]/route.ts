import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const integrationId = params.id
    console.log("🗑️ DELETE request for integration:", integrationId)

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    console.log("🔐 Auth header present:", !!authHeader)

    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.error("❌ Auth error:", authError)
      return NextResponse.json({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    console.log("👤 Authenticated user:", user.id)

    // First, get the integration to verify ownership
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (fetchError) {
      console.error("❌ Fetch error:", fetchError)
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
      }
      return NextResponse.json({ success: false, error: "Database error" }, { status: 500 })
    }

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found or access denied" }, { status: 404 })
    }

    console.log("🔍 Found integration:", integration.provider)

    // Delete the integration
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("❌ Delete error:", deleteError)
      return NextResponse.json({ success: false, error: "Failed to delete integration from database" }, { status: 500 })
    }

    console.log("✅ Integration deleted successfully")

    return NextResponse.json({
      success: true,
      message: `${integration.provider} integration disconnected successfully`,
    })
  } catch (error) {
    console.error("❌ Error in DELETE /api/integrations/[id]:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const integrationId = params.id

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    // Get the integration
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: integration,
    })
  } catch (error) {
    console.error("Error in GET /api/integrations/[id]:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
