import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

// Handle cleanup via sendBeacon API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    
    if (!body?.user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    
    // Remove user from presence table
    const { error } = await supabase
      .from('user_presence')
      .delete()
      .eq('id', body.user_id)

    if (error) {
      logger.error('Presence cleanup error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('Presence cleanup failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}