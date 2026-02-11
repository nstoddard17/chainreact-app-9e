import { NextRequest } from "next/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"

export const dynamic = "force-dynamic"

// DELETE - Revoke an API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Verify the key belongs to this user and revoke it
    const { data: key, error: fetchError } = await serviceClient
      .from("api_keys")
      .select("id, user_id")
      .eq("id", id)
      .single()

    if (fetchError || !key) {
      return errorResponse("API key not found", 404)
    }

    if (key.user_id !== user.id) {
      return errorResponse("Unauthorized", 403)
    }

    // Revoke the key (soft delete)
    const { error: updateError } = await serviceClient
      .from("api_keys")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      logger.error("Error revoking API key:", updateError)
      return errorResponse("Failed to revoke API key", 500)
    }

    return jsonResponse({ message: "API key revoked successfully" })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
