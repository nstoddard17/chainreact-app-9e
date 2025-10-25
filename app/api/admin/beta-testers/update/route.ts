import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function PATCH(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { id, status, notes, max_workflows, max_executions_per_month, expires_at } = body

    // Validate required fields
    if (!id) {
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
    logger.debug("Checking admin status for user:", user.id)

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
        { error: `Only admins can update beta testers.` },
        { status: 403 }
      )
    }

    logger.debug("User confirmed as admin, proceeding with beta tester update")

    // Update the beta tester using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("beta_testers")
      .update({
        status,
        notes,
        max_workflows,
        max_executions_per_month,
        expires_at,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      logger.error("Error updating beta tester:", error)
      return errorResponse(error.message || "Failed to update beta tester" , 500)
    }

    if (!data) {
      return errorResponse("Beta tester not found" , 404)
    }

    logger.debug(`Successfully updated beta tester (ID: ${id})`)

    return jsonResponse({
      success: true,
      message: "Beta tester updated successfully",
      data
    })

  } catch (error) {
    logger.error("Error in update beta tester API:", error)
    return errorResponse("Internal server error" , 500)
  }
}