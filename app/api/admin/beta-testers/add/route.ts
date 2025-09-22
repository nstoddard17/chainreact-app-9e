import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export async function POST(request: Request) {
  try {
    // Get the request body
    const body = await request.json()
    const { email, notes, expires_at, max_workflows, max_executions_per_month, max_integrations, added_by } = body

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      )
    }

    // Create route handler client for auth verification
    const supabase = await createSupabaseRouteHandlerClient()

    // Get the current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Auth error:", authError)
      return NextResponse.json(
        { error: "Unauthorized - please log in" },
        { status: 401 }
      )
    }

    // Create service client to bypass RLS
    const supabaseAdmin = await createSupabaseServiceClient()

    // Check if user is admin using the service client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      console.error("Profile error:", profileError)
      return NextResponse.json(
        { error: "Only admins can add beta testers" },
        { status: 403 }
      )
    }

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
      console.error("Error adding beta tester:", error)

      // Handle duplicate email error
      if (error.code === '23505') {
        return NextResponse.json(
          { error: "This email is already registered as a beta tester" },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: error.message || "Failed to add beta tester" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Beta tester ${email} added successfully`,
      data
    })

  } catch (error) {
    console.error("Error in add beta tester API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}