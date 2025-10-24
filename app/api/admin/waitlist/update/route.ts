import { NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export async function PATCH(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const {
      id,
      name,
      email,
      status,
      selected_integrations,
      custom_integrations,
      wants_ai_assistant,
      wants_ai_actions,
      ai_actions_importance
    } = body

    // Validate required fields
    if (!id) {
      return errorResponse("Member ID is required", 400)
    }

    // Create route handler client for auth verification
    const supabase = await createSupabaseRouteHandlerClient()

    // Get the current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error("Auth error:", authError)
      return errorResponse("Unauthorized - please log in", 401)
    }

    // Create service client to bypass RLS
    const supabaseAdmin = await createSupabaseServiceClient()

    // Check if user is admin using the service client
    logger.debug("Checking admin status for user:", user.id)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("admin")
      .eq("id", user.id)
      .single()

    logger.debug("Profile fetch result:", { profile, profileError })

    if (profileError) {
      logger.error("Error fetching profile:", profileError)
      return errorResponse("Failed to verify admin status", 500)
    }

    if (!profile) {
      logger.error("No profile found for user:", user.id)
      return errorResponse("User profile not found", 404)
    }

    logger.debug("User admin status:", profile.admin)

    if (profile.admin !== true) {
      logger.debug("User is not admin. Admin status:", profile.admin)
      return jsonResponse(
        { error: `Only admins can update waitlist entries.` },
        { status: 403 }
      )
    }

    logger.debug("User confirmed as admin, proceeding with waitlist entry update")

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (status !== undefined) updateData.status = status
    if (selected_integrations !== undefined) updateData.selected_integrations = selected_integrations
    if (custom_integrations !== undefined) updateData.custom_integrations = custom_integrations
    if (wants_ai_assistant !== undefined) updateData.wants_ai_assistant = wants_ai_assistant
    if (wants_ai_actions !== undefined) updateData.wants_ai_actions = wants_ai_actions
    if (ai_actions_importance !== undefined) updateData.ai_actions_importance = ai_actions_importance

    // Update the waitlist entry using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("waitlist")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      logger.error("Error updating waitlist member:", error)
      return errorResponse(error.message || "Failed to update waitlist member", 500)
    }

    if (!data) {
      return errorResponse("Waitlist member not found", 404)
    }

    logger.debug(`Successfully updated waitlist member (ID: ${id})`)

    return jsonResponse({
      success: true,
      message: "Waitlist member updated successfully",
      data
    })

  } catch (error) {
    logger.error("Error in update waitlist member API:", error)
    return errorResponse("Internal server error", 500)
  }
}
