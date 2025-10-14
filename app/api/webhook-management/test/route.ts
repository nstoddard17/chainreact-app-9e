import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Test if webhook_configs table exists
    const { data: tableExists, error: tableError } = await supabase
      .from("webhook_configs")
      .select("id")
      .limit(1)

    if (tableError) {
      return jsonResponse({
        status: "error",
        message: "Webhook tables not created yet",
        error: tableError.message,
        code: tableError.code
      })
    }

    return jsonResponse({
      status: "success",
      message: "Webhook tables exist",
      tableExists: !!tableExists
    })
  } catch (error: any) {
    logger.error("Test error:", error)
    return jsonResponse({
      status: "error",
      message: "Test failed",
      error: error.message
    })
  }
} 