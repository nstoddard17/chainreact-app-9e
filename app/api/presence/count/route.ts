import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
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
    
    const count = countError ? 0 : (activeUsers?.length || 0)
    
    return NextResponse.json({ 
      count,
      source: 'realtime'
    })
  } catch (error) {
    console.error('Error fetching presence count:', error)
    return NextResponse.json({ 
      count: 0,
      error: 'Failed to fetch count'
    })
  }
}