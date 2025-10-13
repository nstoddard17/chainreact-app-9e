import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { email, notes, expires_at, max_workflows, max_executions_per_month, max_integrations, added_by } = body

    // Validate required fields
    if (!email) {
      return errorResponse("Email is required" , 400)
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse("Invalid email format" , 400)
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

    // The column is named 'role' in the user_profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
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

    logger.debug("User role:", profile.role)

    if (profile.role !== 'admin') {
      logger.debug("User is not admin. Role:", profile.role)
      return jsonResponse(
        { error: `Only admins can add beta testers. Your role: ${profile.role || 'user'}` },
        { status: 403 }
      )
    }

    logger.debug("User confirmed as admin, proceeding with beta tester creation")

    // Insert the beta tester using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("beta_testers")
      .insert({
        email: email.toLowerCase().trim(),
        notes: notes?.trim() || null,
        expires_at: expires_at || null,
        max_workflows: max_workflows || 50,
        max_executions_per_month: max_executions_per_month || 5000,
        max_integrations: max_integrations || 30,
        added_by: added_by || user.id,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      logger.error("Error adding beta tester:", error)

      // Handle duplicate email error
      if (error.code === '23505') {
        return errorResponse("This email is already registered as a beta tester" , 409)
      }

      return errorResponse(error.message || "Failed to add beta tester" , 500)
    }

    return jsonResponse({
      success: true,
      message: `Beta tester ${email} added successfully`,
      data
    })

  } catch (error) {
    logger.error("Error in add beta tester API:", error)
    return errorResponse("Internal server error" , 500)
  }
}