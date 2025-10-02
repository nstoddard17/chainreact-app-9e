import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  console.log('🧹 Starting Microsoft Graph cleanup...')

  try {
    // Clean up old webhook queue items (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: deletedQueue, error: queueError } = await supabase
      .from('microsoft_webhook_queue')
      .delete()
      .lt('created_at', sevenDaysAgo)
      .select('id')

    if (queueError) {
      console.error('❌ Error cleaning queue:', queueError)
    } else {
      console.log(`✅ Deleted ${deletedQueue?.length || 0} old queue items`)
    }

    // Clean up old dedup entries (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: deletedDedup, error: dedupError } = await supabase
      .from('microsoft_webhook_dedup')
      .delete()
      .lt('created_at', oneDayAgo)
      .select('dedup_key')

    if (dedupError) {
      console.error('❌ Error cleaning dedup:', dedupError)
    } else {
      console.log(`✅ Deleted ${deletedDedup?.length || 0} old dedup entries`)
    }

    // Clean up old events (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: deletedEvents, error: eventsError } = await supabase
      .from('microsoft_graph_events')
      .delete()
      .lt('created_at', thirtyDaysAgo)
      .select('id')

    if (eventsError) {
      console.error('❌ Error cleaning events:', eventsError)
    } else {
      console.log(`✅ Deleted ${deletedEvents?.length || 0} old events`)
    }

    // Get current stats
    const { count: queueCount } = await supabase
      .from('microsoft_webhook_queue')
      .select('id', { count: 'exact', head: true })

    const { count: dedupCount } = await supabase
      .from('microsoft_webhook_dedup')
      .select('dedup_key', { count: 'exact', head: true })

    const { count: eventsCount } = await supabase
      .from('microsoft_graph_events')
      .select('id', { count: 'exact', head: true })

    return NextResponse.json({
      success: true,
      cleanup: {
        queue_deleted: deletedQueue?.length || 0,
        dedup_deleted: deletedDedup?.length || 0,
        events_deleted: deletedEvents?.length || 0
      },
      current_counts: {
        queue: queueCount || 0,
        dedup: dedupCount || 0,
        events: eventsCount || 0
      }
    })

  } catch (error: any) {
    console.error('❌ Cleanup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  // Get current stats
  const { count: queueCount } = await supabase
    .from('microsoft_webhook_queue')
    .select('id', { count: 'exact', head: true })

  const { count: dedupCount } = await supabase
    .from('microsoft_webhook_dedup')
    .select('dedup_key', { count: 'exact', head: true })

  const { count: eventsCount } = await supabase
    .from('microsoft_graph_events')
    .select('id', { count: 'exact', head: true })

  const { data: queueSample } = await supabase
    .from('microsoft_webhook_queue')
    .select('status, created_at, resource')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    counts: {
      queue: queueCount || 0,
      dedup: dedupCount || 0,
      events: eventsCount || 0
    },
    recent_queue_items: queueSample || []
  })
}
