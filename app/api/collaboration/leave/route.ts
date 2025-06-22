import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseServerClient()
    
    // Get the current user
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { sessionToken } = await request.json()

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: "Session token is required" },
        { status: 400 }
      )
    }

    // Update the collaboration session to mark it as inactive
    const { error } = await supabase
      .from("collaboration_sessions")
      .update({ is_active: false })
      .eq("session_token", sessionToken)
      .eq("user_id", session.user.id)

    if (error) {
      console.error("Error leaving collaboration:", error)
      return NextResponse.json(
        { success: false, error: "Failed to leave collaboration" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in leave collaboration:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
