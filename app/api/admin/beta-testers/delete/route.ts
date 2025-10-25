import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function DELETE(request: Request) {
  try {
    // Get the tester ID from the URL
    const url = new URL(request.url)
    const testerId = url.searchParams.get('id')

    if (!testerId) {
      return errorResponse("Tester ID is required" , 400)
    }

    // Create route handler client for auth verification
    const supabase = await createSupabaseRouteHandlerClient()

    // Get the current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error("Auth error:", authError)
      return errorResponse("Unauthorized - please log in" , 401)
    }

    // Create service client to bypass RLS
    const supabaseAdmin = await createSupabaseServiceClient()

    // Check if user is admin using the service client
    logger.debug("Checking admin status for user:", user.id, user.email)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("admin")
      .eq("id", user.id)
      .single()

    logger.debug("Profile fetch result:", { profile, profileError })

    if (profileError) {
      logger.error("Error fetching profile:", profileError)
      return errorResponse("Failed to verify admin status" , 500)
    }

    if (!profile) {
      logger.error("No profile found for user:", user.id)
      return errorResponse("User profile not found" , 404)
    }

    logger.debug("User admin status:", profile.admin)

    if (profile.admin !== true) {
      logger.debug("User is not admin. Admin status:", profile.admin)
      return jsonResponse(
        { error: `Only admins can delete beta testers.` },
        { status: 403 }
      )
    }

    logger.debug("User confirmed as admin, proceeding with beta tester deletion")

    // First, get the beta tester details for logging
    const { data: tester, error: fetchError } = await supabaseAdmin
      .from("beta_testers")
      .select("email")
      .eq("id", testerId)
      .single()

    if (fetchError || !tester) {
      logger.error("Error fetching beta tester:", fetchError)
      return errorResponse("Beta tester not found" , 404)
    }

    // Delete the beta tester using admin client (bypasses RLS)
    const { error } = await supabaseAdmin
      .from("beta_testers")
      .delete()
      .eq("id", testerId)

    if (error) {
      logger.error("Error deleting beta tester:", error)
      return errorResponse(error.message || "Failed to delete beta tester" , 500)
    }

    logger.debug(`Successfully deleted beta tester (ID: ${testerId})`)

    return jsonResponse({
      success: true,
      message: `Beta tester ${tester.email} has been deleted`,
      deletedId: testerId
    })

  } catch (error) {
    logger.error("Error in delete beta tester API:", error)
    return errorResponse("Internal server error" , 500)
  }
}