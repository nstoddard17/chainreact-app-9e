import { NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

// Simple in-memory fallback cache
let fallbackCount = 0

export async function GET() {
  try {
    // Try database access
    try {
      const supabase = await createSupabaseRouteHandlerClient()
      
      // Try to get count from database first (cached value)
      const { data: stats, error } = await supabase
        .from('presence_stats')
        .select('online_count, updated_at')
        .eq('id', 'global')
        .single()
      
      if (!error && stats) {
        // Check if data is fresh (within last 2 hours since heartbeat is 1 hour)
        const lastUpdated = new Date(stats.updated_at)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        
        if (lastUpdated > twoHoursAgo) {
          fallbackCount = stats.online_count || 0 // Update fallback
          return NextResponse.json({ 
            count: stats.online_count || 0,
            source: 'database'
          })
        }
      }
      
      // Fallback: count active users from user_presence table (within last 2 hours)
      const { data: activeUsers, error: countError } = await supabase
        .from('user_presence')
        .select('id', { count: 'exact', head: true })
        .gte('last_seen', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      
      const count = countError ? fallbackCount : (activeUsers?.length || 0)
      if (!countError) fallbackCount = count // Update fallback
      
      return NextResponse.json({ 
        count,
        source: 'realtime'
      })
    } catch (dbError) {
      // If database access fails completely, return cached count
      console.debug('Database access failed, using fallback:', dbError)
      return NextResponse.json({ 
        count: fallbackCount,
        source: 'cache'
      })
    }
  } catch (error) {
    logger.error('Error fetching presence count:', error)
    return NextResponse.json({ 
      count: 0,
      error: 'Failed to fetch count'
    })
  }
}