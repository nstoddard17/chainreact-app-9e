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
      return NextResponse.json(
        { error: "Unauthorized - please log in" },
        { status: 401 }
      )
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
      return NextResponse.json(
        { error: "Failed to verify admin status" },
        { status: 500 }
      )
    }

    if (!profile) {
      logger.error("No profile found for user:", user.id)
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      )
    }

    if (profile.role !== 'admin') {
      logger.debug("User is not admin. Role:", profile.role)
      return NextResponse.json(
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
      return NextResponse.json(
        { error: error.message || "Failed to fetch beta testers" },
        { status: 500 }
      )
    }

    logger.debug(`Returning ${data?.length || 0} beta testers`)

    return NextResponse.json({
      success: true,
      data: data || []
    })

  } catch (error) {
    logger.error("Error in list beta testers API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}