import { NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export async function DELETE(request: Request) {
  try {
    // Get the member ID from the URL
    const url = new URL(request.url)
    const memberId = url.searchParams.get('id')

    if (!memberId) {
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
        { error: `Only admins can delete waitlist entries.` },
        { status: 403 }
      )
    }

    logger.debug("User confirmed as admin, proceeding with waitlist entry deletion")

    // First, get the waitlist entry details for logging
    const { data: member, error: fetchError } = await supabaseAdmin
      .from("waitlist")
      .select("email, name")
      .eq("id", memberId)
      .single()

    if (fetchError || !member) {
      logger.error("Error fetching waitlist member:", fetchError)
      return errorResponse("Waitlist member not found", 404)
    }

    // Delete the waitlist entry using admin client (bypasses RLS)
    const { error } = await supabaseAdmin
      .from("waitlist")
      .delete()
      .eq("id", memberId)

    if (error) {
      logger.error("Error deleting waitlist member:", error)
      return errorResponse(error.message || "Failed to delete waitlist member", 500)
    }

    logger.debug(`Successfully deleted waitlist member (ID: ${memberId})`)

    return jsonResponse({
      success: true,
      message: `Waitlist member ${member.email} has been deleted`,
      deletedId: memberId
    })

  } catch (error) {
    logger.error("Error in delete waitlist member API:", error)
    return errorResponse("Internal server error", 500)
  }
}
