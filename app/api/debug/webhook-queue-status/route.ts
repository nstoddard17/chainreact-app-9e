import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    console.log('\n🔍 WEBHOOK QUEUE STATUS CHECK')
    console.log('============================\n')

    // Check webhook queue
    const { data: queueItems, error: queueError } = await supabase
      .from('microsoft_webhook_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (queueError) {
      console.error('❌ Error fetching queue:', queueError)
      return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 })
    }

    console.log('📥 Webhook Queue Status:')
    console.log(`  - Total items: ${queueItems?.length || 0}`)
    
    const statusCounts = queueItems?.reduce((acc: any, item: any) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {}) || {}
    
    console.log('  - Status breakdown:', statusCounts)

    if (queueItems && queueItems.length > 0) {
      console.log('\n📋 Recent Queue Items:')
      queueItems.slice(0, 5).forEach((item: any, index: number) => {
        console.log(`  ${index + 1}. ID: ${item.id}`)
        console.log(`     Resource: ${item.resource}`)
        console.log(`     Change Type: ${item.change_type}`)
        console.log(`     Status: ${item.status}`)
        console.log(`     Created: ${item.created_at}`)
        console.log(`     User ID: ${item.user_id?.substring(0, 8)}...`)
        console.log(`     Subscription ID: ${item.subscription_id?.substring(0, 8)}...`)
        console.log('')
      })
    }

    // Check subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, status, resource, expiration_date_time')
      .order('created_at', { ascending: false })
      .limit(10)

    console.log('📝 Active Subscriptions:')
    console.log(`  - Total: ${subscriptions?.length || 0}`)
    
    if (subscriptions && subscriptions.length > 0) {
      subscriptions.forEach((sub: any, index: number) => {
        console.log(`  ${index + 1}. ID: ${sub.id.substring(0, 8)}...`)
        console.log(`     Resource: ${sub.resource}`)
        console.log(`     Status: ${sub.status}`)
        console.log(`     Expires: ${sub.expiration_date_time}`)
        console.log(`     User: ${sub.user_id?.substring(0, 8)}...`)
        console.log('')
      })
    }

    // Check recent webhook logs
    const { data: webhookLogs } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('provider', 'microsoft-graph')
      .order('timestamp', { ascending: false })
      .limit(5)

    console.log('📊 Recent Webhook Logs:')
    console.log(`  - Total logs: ${webhookLogs?.length || 0}`)
    
    if (webhookLogs && webhookLogs.length > 0) {
      webhookLogs.forEach((log: any, index: number) => {
        console.log(`  ${index + 1}. Status: ${log.status}`)
        console.log(`     Timestamp: ${log.timestamp}`)
        console.log(`     Execution Time: ${log.execution_time}ms`)
        console.log('')
      })
    }

    return NextResponse.json({
      success: true,
      queueItems: queueItems?.length || 0,
      statusCounts,
      subscriptions: subscriptions?.length || 0,
      webhookLogs: webhookLogs?.length || 0,
      recentQueueItems: queueItems?.slice(0, 5) || [],
      recentSubscriptions: subscriptions?.slice(0, 3) || [],
      recentLogs: webhookLogs?.slice(0, 3) || []
    })

  } catch (error: any) {
    console.error('❌ Webhook queue status check error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
