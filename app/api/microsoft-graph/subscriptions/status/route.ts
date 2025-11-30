import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function GET() {
  const supabase = getSupabase()

  try {
    // Get all subscriptions from trigger_resources
    const { data: subscriptions, error } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching subscriptions:', error)
      return errorResponse(error.message , 500)
    }

    // Get user emails for each subscription
    const subscriptionsWithUsers = await Promise.all(
      (subscriptions || []).map(async (sub) => {
        const { data: user } = await supabase.auth.admin.getUserById(sub.user_id)
        return {
          ...sub,
          user_email: user?.user?.email || 'unknown',
          is_expired: sub.expires_at ? new Date(sub.expires_at) < new Date() : false
        }
      })
    )

    // Group by resource type (from config)
    const byType = subscriptionsWithUsers.reduce((acc, sub) => {
      const resource = sub.config?.resource || ''
      const type = resource.includes('messages') ? 'mail' :
                   resource.includes('drive') ? 'onedrive' :
                   resource.includes('events') ? 'calendar' : 'other'

      if (!acc[type]) acc[type] = []
      acc[type].push(sub)
      return acc
    }, {} as Record<string, any[]>)

    return jsonResponse({
      total: subscriptions?.length || 0,
      by_type: {
        mail: byType.mail?.length || 0,
        onedrive: byType.onedrive?.length || 0,
        calendar: byType.calendar?.length || 0,
        other: byType.other?.length || 0
      },
      subscriptions: subscriptionsWithUsers,
      active: subscriptionsWithUsers.filter(s => !s.is_expired).length,
      expired: subscriptionsWithUsers.filter(s => s.is_expired).length
    })

  } catch (error: any) {
    logger.error('Error:', error)
    return errorResponse(error.message , 500)
  }
}
