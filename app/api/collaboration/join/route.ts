import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { RealTimeCollaboration } from "@/lib/collaboration/realTimeCollaboration"

export async function POST(request: Request) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workflowId } = await request.json()

    if (!workflowId) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 })
    }

    // Verify workflow access
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Check if user has access to this workflow
    const hasAccess = workflow.user_id === session.user.id || workflow.is_public

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const collaboration = new RealTimeCollaboration()
    const collaborationSession = await collaboration.joinCollaborationSession(workflowId, session.user.id)

    return NextResponse.json({
      success: true,
      session: collaborationSession,
    })
  } catch (error: any) {
    console.error("Collaboration join error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
