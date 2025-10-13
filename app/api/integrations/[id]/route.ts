import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function DELETE(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: integrationId } = await params

    if (!integrationId) {
      return jsonResponse({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    // First, get the integration to verify ownership
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !integration) {
      return jsonResponse({ success: false, error: "Integration not found or access denied" }, { status: 404 })
    }

    // Delete the integration
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId)
      .eq("user_id", user.id)

    if (deleteError) {
      logger.error("Error deleting integration:", deleteError)
      return jsonResponse({ success: false, error: "Failed to delete integration" }, { status: 500 })
    }

    return jsonResponse({
      success: true,
      message: `${integration.provider} integration disconnected successfully`,
    })
  } catch (error) {
    logger.error("Error in DELETE /api/integrations/[id]:", error)
    return jsonResponse({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: integrationId } = await params

    if (!integrationId) {
      return jsonResponse({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    // Get the integration
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !integration) {
      return jsonResponse({ success: false, error: "Integration not found" }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      data: integration,
    })
  } catch (error) {
    logger.error("Error in GET /api/integrations/[id]:", error)
    return jsonResponse({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
