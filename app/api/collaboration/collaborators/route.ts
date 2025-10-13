import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workflowId = searchParams.get("workflowId")

  if (!workflowId) {
    return errorResponse("workflowId is required" , 400)
  }

  try {
    const supabaseAdmin = createAdminClient()
    // Fetch active collaboration sessions for the workflow
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("collaboration_sessions")
      .select("user_id")
      .eq("workflow_id", workflowId)
      .eq("is_active", true)

    if (sessionsError) {
      logger.error("Error fetching collaboration sessions:", sessionsError)
      throw sessionsError
    }

    if (!sessions || sessions.length === 0) {
      return jsonResponse([])
    }

    const userIds = sessions.map((s: { user_id: string }) => s.user_id)

    // For now, return simplified collaborator data without user details
    // In a real implementation, you'd want to store user profiles in a separate table
    const collaborators = userIds.map((userId: string) => ({
      id: userId,
      user_id: userId,
      user_name: "Collaborator",
      user_avatar: null,
      // You can add more fields here if needed, like cursor position, etc.
    }))

    return jsonResponse(collaborators)
  } catch (error) {
    logger.error("Failed to get collaborators:", error)
    return errorResponse("Internal Server Error" , 500)
  }
}
