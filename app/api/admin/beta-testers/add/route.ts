import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

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

    // Create admin client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if user is admin using the regular client to verify auth
    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
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