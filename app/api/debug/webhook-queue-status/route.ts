import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    logger.debug('\n🔍 WEBHOOK QUEUE STATUS CHECK')
    logger.debug('============================\n')

    // Check webhook queue
    const { data: queueItems, error: queueError } = await supabase
      .from('microsoft_webhook_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (queueError) {
      logger.error('❌ Error fetching queue:', queueError)
      return errorResponse('Failed to fetch queue' , 500)
    }

    logger.debug('📥 Webhook Queue Status:')
    logger.debug(`  - Total items: ${queueItems?.length || 0}`)
    
    const statusCounts = queueItems?.reduce((acc: any, item: any) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {}) || {}
    
    logger.debug('  - Status breakdown:', statusCounts)

    if (queueItems && queueItems.length > 0) {
      logger.debug('\n📋 Recent Queue Items:')
      queueItems.slice(0, 5).forEach((item: any, index: number) => {
        logger.debug(`  ${index + 1}. ID: ${item.id}`)
        logger.debug(`     Resource: ${item.resource}`)
        logger.debug(`     Change Type: ${item.change_type}`)
        logger.debug(`     Status: ${item.status}`)
        logger.debug(`     Created: ${item.created_at}`)
        logger.debug(`     User ID: ${item.user_id?.substring(0, 8)}...`)
        logger.debug(`     Subscription ID: ${item.subscription_id?.substring(0, 8)}...`)
        logger.debug('')
      })
    }

    // Check subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, status, resource, expiration_date_time')
      .order('created_at', { ascending: false })
      .limit(10)

    logger.debug('📝 Active Subscriptions:')
    logger.debug(`  - Total: ${subscriptions?.length || 0}`)
    
    if (subscriptions && subscriptions.length > 0) {
      subscriptions.forEach((sub: any, index: number) => {
        logger.debug(`  ${index + 1}. ID: ${sub.id.substring(0, 8)}...`)
        logger.debug(`     Resource: ${sub.resource}`)
        logger.debug(`     Status: ${sub.status}`)
        logger.debug(`     Expires: ${sub.expiration_date_time}`)
        logger.debug(`     User: ${sub.user_id?.substring(0, 8)}...`)
        logger.debug('')
      })
    }

    // Check recent webhook logs
    const { data: webhookLogs } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('provider', 'microsoft-graph')
      .order('timestamp', { ascending: false })
      .limit(5)

    logger.debug('📊 Recent Webhook Logs:')
    logger.debug(`  - Total logs: ${webhookLogs?.length || 0}`)
    
    if (webhookLogs && webhookLogs.length > 0) {
      webhookLogs.forEach((log: any, index: number) => {
        logger.debug(`  ${index + 1}. Status: ${log.status}`)
        logger.debug(`     Timestamp: ${log.timestamp}`)
        logger.debug(`     Execution Time: ${log.execution_time}ms`)
        logger.debug('')
      })
    }

    return jsonResponse({
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
    logger.error('❌ Webhook queue status check error:', error)
    return errorResponse(error.message , 500)
  }
}
