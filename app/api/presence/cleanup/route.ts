import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

// Handle cleanup via sendBeacon API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    
    if (!body?.user_id) {
      return errorResponse("Missing user_id" , 400)
    }

    const supabase = await createSupabaseServerClient()
    
    // Remove user from presence table
    const { error } = await supabase
      .from('user_presence')
      .delete()
      .eq('id', body.user_id)

    if (error) {
      logger.error('Presence cleanup error:', error)
      return errorResponse(error.message , 500)
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('Presence cleanup failed:', error)
    return errorResponse(error.message , 500)
  }
}