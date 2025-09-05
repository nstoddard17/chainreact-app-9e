import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Simple in-memory cache for online count (resets on server restart)
let onlineCountCache = {
  count: 0,
  lastUpdated: new Date().toISOString(),
  users: new Set<string>()
}

// Clean up old users every 2 hours (since heartbeat is now 1 hour)
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
  const cutoffTime = new Date(twoHoursAgo).toISOString()
  
  if (onlineCountCache.lastUpdated < cutoffTime) {
    onlineCountCache.users.clear()
    onlineCountCache.count = 0
  }
}, 2 * 60 * 60 * 1000)

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Verify user is authenticated
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { userId, count, timestamp } = body
    
    // Update in-memory cache
    if (userId) {
      onlineCountCache.users.add(userId)
      onlineCountCache.count = count || onlineCountCache.users.size
      onlineCountCache.lastUpdated = timestamp || new Date().toISOString()
    }
    
    // Optional: Update database periodically (not on every request)
    // This reduces database writes significantly
    const shouldUpdateDb = Math.random() < 0.1 // 10% chance
    if (shouldUpdateDb) {
      await supabase
        .from('presence_stats')
        .upsert({
          id: 'global',
          online_count: onlineCountCache.count,
          updated_at: onlineCountCache.lastUpdated
        }, {
          onConflict: 'id'
        })
        .select()
    }
    
    return NextResponse.json({ 
      success: true,
      count: onlineCountCache.count 
    })
  } catch (error) {
    console.error('Error updating presence count:', error)
    return NextResponse.json(
      { error: 'Failed to update presence count' },
      { status: 500 }
    )
  }
}