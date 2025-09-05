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
if (typeof global !== 'undefined' && !global.presenceCleanupInterval) {
  global.presenceCleanupInterval = setInterval(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const cutoffTime = new Date(twoHoursAgo).toISOString()
    
    if (onlineCountCache.lastUpdated < cutoffTime) {
      onlineCountCache.users.clear()
      onlineCountCache.count = 0
    }
  }, 2 * 60 * 60 * 1000)
}

export async function POST(request: Request) {
  try {
    // Try to parse the body first
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error('Failed to parse request body:', e)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    
    const { userId, count, timestamp } = body
    
    // If userId is provided, we can process without full auth check
    // This allows the presence system to work even during auth transitions
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    
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
      try {
        const cookieStore = await cookies()
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
        
        // Try to update the database, but don't fail if auth issues
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
      } catch (dbError) {
        // Silent fail for database updates - cache is still valid
        console.debug('Failed to update presence stats in database:', dbError)
      }
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