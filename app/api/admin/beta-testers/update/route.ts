import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function PATCH(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { id, status, notes, max_workflows, max_executions_per_month, expires_at } = body

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: "Tester ID is required" },
        { status: 400 }
      )
    }

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
    logger.debug("Checking admin status for user:", user.id)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    logger.debug("Profile fetch result:", { profile, profileError })

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

    logger.debug("User role:", profile.role)

    if (profile.role !== 'admin') {
      logger.debug("User is not admin. Role:", profile.role)
      return NextResponse.json(
        { error: `Only admins can update beta testers. Your role: ${profile.role || 'user'}` },
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
      return NextResponse.json(
        { error: error.message || "Failed to update beta tester" },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: "Beta tester not found" },
        { status: 404 }
      )
    }

    logger.debug(`Successfully updated beta tester (ID: ${id})`)

    return NextResponse.json({
      success: true,
      message: "Beta tester updated successfully",
      data
    })

  } catch (error) {
    logger.error("Error in update beta tester API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}