import { NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export async function GET(request: Request) {
  try {
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
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("admin")
      .eq("id", user.id)
      .single()

    if (profileError) {
      logger.error("Error fetching profile:", profileError)
      return errorResponse("Failed to verify admin status", 500)
    }

    if (!profile) {
      logger.error("No profile found for user:", user.id)
      return errorResponse("User profile not found", 404)
    }

    if (profile.admin !== true) {
      logger.debug("User is not admin. Admin status:", profile.admin)
      return jsonResponse(
        { error: `Only admins can view waitlist entries.` },
        { status: 403 }
      )
    }

    // Fetch waitlist entries using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      logger.error("Error fetching waitlist entries:", error)
      return errorResponse(error.message || "Failed to fetch waitlist entries", 500)
    }

    logger.debug(`Returning ${data?.length || 0} waitlist entries`)

    return jsonResponse({
      success: true,
      data: data || []
    })

  } catch (error) {
    logger.error("Error in list waitlist API:", error)
    return errorResponse("Internal server error", 500)
  }
}
