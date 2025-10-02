import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get all subscriptions
    const { data: subscriptions, error } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get user emails for each subscription
    const subscriptionsWithUsers = await Promise.all(
      (subscriptions || []).map(async (sub) => {
        const { data: user } = await supabase.auth.admin.getUserById(sub.user_id)
        return {
          ...sub,
          user_email: user?.user?.email || 'unknown',
          is_expired: new Date(sub.expiration_date_time) < new Date()
        }
      })
    )

    // Group by resource type
    const byType = subscriptionsWithUsers.reduce((acc, sub) => {
      const type = sub.resource.includes('messages') ? 'mail' :
                   sub.resource.includes('drive') ? 'onedrive' :
                   sub.resource.includes('events') ? 'calendar' : 'other'

      if (!acc[type]) acc[type] = []
      acc[type].push(sub)
      return acc
    }, {} as Record<string, any[]>)

    return NextResponse.json({
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
    console.error('Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
