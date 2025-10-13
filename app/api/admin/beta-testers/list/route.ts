import { NextResponse } from "next/server"
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
      return errorResponse("Unauthorized - please log in" , 401)
    }

    // Create service client to bypass RLS
    const supabaseAdmin = await createSupabaseServiceClient()

    // Check if user is admin using the service client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError) {
      logger.error("Error fetching profile:", profileError)
      return errorResponse("Failed to verify admin status" , 500)
    }

    if (!profile) {
      logger.error("No profile found for user:", user.id)
      return errorResponse("User profile not found" , 404)
    }

    if (profile.role !== 'admin') {
      logger.debug("User is not admin. Role:", profile.role)
      return jsonResponse(
        { error: `Only admins can view beta testers. Your role: ${profile.role || 'user'}` },
        { status: 403 }
      )
    }

    // Fetch beta testers using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("beta_testers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      logger.error("Error fetching beta testers:", error)
      return errorResponse(error.message || "Failed to fetch beta testers" , 500)
    }

    logger.debug(`Returning ${data?.length || 0} beta testers`)

    return jsonResponse({
      success: true,
      data: data || []
    })

  } catch (error) {
    logger.error("Error in list beta testers API:", error)
    return errorResponse("Internal server error" , 500)
  }
}