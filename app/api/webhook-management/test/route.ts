import { NextRequest, NextResponse } from "next/server"
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
      return NextResponse.json({
        status: "error",
        message: "Webhook tables not created yet",
        error: tableError.message,
        code: tableError.code
      })
    }

    return NextResponse.json({
      status: "success",
      message: "Webhook tables exist",
      tableExists: !!tableExists
    })
  } catch (error: any) {
    logger.error("Test error:", error)
    return NextResponse.json({
      status: "error",
      message: "Test failed",
      error: error.message
    })
  }
} 