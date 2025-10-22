import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const { sessionToken } = await request.json()

    if (!sessionToken) {
      return jsonResponse(
        { success: false, error: "Session token is required" },
        { status: 400 }
      )
    }

    // Update the collaboration session to mark it as inactive
    const { error } = await supabase
      .from("collaboration_sessions")
      .update({ is_active: false })
      .eq("session_token", sessionToken)
      .eq("user_id", user.id)

    if (error) {
      logger.error("Error leaving collaboration:", error)
      return jsonResponse(
        { success: false, error: "Failed to leave collaboration" },
        { status: 500 }
      )
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Error in leave collaboration:", error)
    return jsonResponse(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
