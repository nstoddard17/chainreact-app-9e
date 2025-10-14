import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { eventType, eventData, integrationId } = await request.json()

    if (!eventType) {
      return errorResponse("Event type is required" , 400)
    }

    // Log the integration event
    const { error } = await supabase.from("integration_audit_log").insert({
      user_id: user.id,
      event_type: eventType,
      event_data: eventData || {},
      integration_id: integrationId,
      timestamp: new Date().toISOString(),
    })

    if (error) {
      logger.error("Error logging integration event:", error)
      return errorResponse("Failed to log event" , 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Audit log error:", error)
    return errorResponse("Internal server error" , 500)
  }
}
