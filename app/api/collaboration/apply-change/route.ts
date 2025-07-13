import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { RealTimeCollaboration } from "@/lib/collaboration/realTimeCollaboration"

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { sessionToken, changeType, changeData } = await request.json()

    if (!sessionToken || !changeType || !changeData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const collaboration = new RealTimeCollaboration()
    const result = await collaboration.applyWorkflowChange(sessionToken, changeType, changeData)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Apply change error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
