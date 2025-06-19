import { NextResponse } from "next/server"
import supabaseAdmin from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workflowId = searchParams.get("workflowId")

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 })
  }

  try {
    // Fetch active collaboration sessions for the workflow
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("collaboration_sessions")
      .select("user_id")
      .eq("workflow_id", workflowId)
      .eq("is_active", true)

    if (sessionsError) {
      console.error("Error fetching collaboration sessions:", sessionsError)
      throw sessionsError
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json([])
    }

    const userIds = sessions.map((s: { user_id: string }) => s.user_id)

    // Fetch user details for the active sessions
    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, raw_user_meta_data")
      .in("id", userIds)

    if (usersError) {
      console.error("Error fetching users:", usersError)
      throw usersError
    }

    // Format the response
    const collaborators = users.map((user: any) => ({
      id: user.id,
      user_id: user.id,
      user_name: user.raw_user_meta_data?.name || "Anonymous",
      user_avatar: user.raw_user_meta_data?.avatar_url,
      // You can add more fields here if needed, like cursor position, etc.
    }))

    return NextResponse.json(collaborators)
  } catch (error) {
    console.error("Failed to get collaborators:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
} 