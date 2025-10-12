import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    logger.debug('\n🔍 CHECKING MAIL WEBHOOK STATUS')
    logger.debug('================================\n')

    // Check webhook queue for mail events
    const { data: queueItems } = await supabase
      .from('microsoft_webhook_queue')
      .select('*')
      .like('resource', '%messages%')
      .order('created_at', { ascending: false })
      .limit(10)

    logger.debug('📧 Mail webhook queue items:', queueItems?.length || 0)
    if (queueItems && queueItems.length > 0) {
      logger.debug('📧 Latest mail webhook:', {
        id: queueItems[0].id,
        resource: queueItems[0].resource,
        changeType: queueItems[0].change_type,
        status: queueItems[0].status,
        createdAt: queueItems[0].created_at
      })
    }

    // Check for mail events in the events table
    const { data: mailEvents } = await supabase
      .from('microsoft_graph_events')
      .select('*')
      .eq('event_type', 'outlook_mail')
      .order('created_at', { ascending: false })
      .limit(10)

    logger.debug('📧 Mail events found:', mailEvents?.length || 0)
    if (mailEvents && mailEvents.length > 0) {
      logger.debug('📧 Latest mail event:', {
        id: mailEvents[0].id,
        type: mailEvents[0].event_type,
        action: mailEvents[0].event_action,
        subject: mailEvents[0].payload?.subject,
        from: mailEvents[0].payload?.from,
        createdAt: mailEvents[0].created_at
      })
    }

    // Check active subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, status, expiration_date_time')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5)

    logger.debug('📝 Active subscriptions:', subscriptions?.length || 0)
    if (subscriptions && subscriptions.length > 0) {
      logger.debug('📝 Latest subscription:', {
        id: `${subscriptions[0].id.substring(0, 8) }...`,
        userId: `${subscriptions[0].user_id?.substring(0, 8) }...`,
        status: subscriptions[0].status,
        expires: subscriptions[0].expiration_date_time
      })
    }

    return NextResponse.json({
      success: true,
      queueItems: queueItems?.length || 0,
      mailEvents: mailEvents?.length || 0,
      subscriptions: subscriptions?.length || 0,
      latestQueueItem: queueItems?.[0] || null,
      latestMailEvent: mailEvents?.[0] || null,
      latestSubscription: subscriptions?.[0] || null
    })

  } catch (error: any) {
    logger.error('❌ Mail webhook check error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
