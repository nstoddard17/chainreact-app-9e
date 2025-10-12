import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Remove users who haven't been seen in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    
    const { data, error } = await supabase
      .from('user_presence')
      .delete()
      .lt('last_seen', fiveMinutesAgo.toISOString())
      .select('id, full_name')

    if (error) {
      logger.error('Error cleaning up stale presence:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.debug(`Cleaned up ${data?.length || 0} stale presence records`)
    
    return NextResponse.json({ 
      success: true, 
      cleaned: data?.length || 0,
      message: `Cleaned up ${data?.length || 0} stale presence records`
    })
  } catch (error: any) {
    logger.error('Cleanup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Allow GET for testing purposes
export async function GET() {
  return POST()
} 