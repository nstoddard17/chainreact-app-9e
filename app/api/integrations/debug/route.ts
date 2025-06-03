import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  try {
    console.log("Debug endpoint called")

    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "No session" }, { status: 401 })
    }

    const { data: integrations, error } = await supabase.from("integrations").select("*").eq("user_id", session.user.id)

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      integrations: integrations || [],
      count: integrations?.length || 0,
      userId: session.user.id,
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
