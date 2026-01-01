import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    logger.debug("Debug endpoint called")

    const supabase = createClient()
    if (!supabase) {
      return errorResponse("Database connection failed" , 500)
    }
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { data: integrations, error } = await supabase.from("integrations").select("*").eq("user_id", user.id)

    if (error) {
      logger.error("Database error:", error)
      return errorResponse(error.message , 500)
    }

    // Count integrations by provider and status instead of returning all details
    const byProvider = {};
    const byStatus = {};
    
    integrations?.forEach(integration => {
      // Count by provider
      byProvider[integration.provider] = (byProvider[integration.provider] || 0) + 1;
      
      // Count by status
      byStatus[integration.status || 'unknown'] = (byStatus[integration.status || 'unknown'] || 0) + 1; 
    });

    return jsonResponse({
      success: true,
      count: integrations?.length || 0,
      byProvider,
      byStatus
    })
  } catch (error: any) {
    logger.error("Debug endpoint error:", error)
    return errorResponse(error.message , 500)
  }
}
