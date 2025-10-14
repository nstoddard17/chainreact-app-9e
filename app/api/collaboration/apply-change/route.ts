import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { RealTimeCollaboration } from "@/lib/collaboration/realTimeCollaboration"

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const { sessionToken, changeType, changeData } = await request.json()

    if (!sessionToken || !changeType || !changeData) {
      return errorResponse("Missing required fields" , 400)
    }

    const collaboration = new RealTimeCollaboration()
    const result = await collaboration.applyWorkflowChange(sessionToken, changeType, changeData)

    return jsonResponse(result)
  } catch (error: any) {
    logger.error("Apply change error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
}
