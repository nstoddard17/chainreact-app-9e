import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    logger.debug('\n========================================')
    logger.debug('🔍 ONEDRIVE WORKFLOW DEBUG TEST')
    logger.debug('========================================\n')

    // Step 1: Check webhook queue
    const { data: queueItems } = await supabase
      .from('microsoft_webhook_queue')
      .select('id, subscription_id, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)

    logger.debug('📥 Webhook Queue Status:')
    logger.debug(`  - Pending items: ${queueItems?.length || 0}`)
    if (queueItems && queueItems.length > 0) {
      logger.debug(`  - Latest: ${queueItems[0].created_at}`)
      logger.debug(`  - Subscription: ${queueItems[0].subscription_id?.substring(0, 8)}...`)
    }

    // Step 2: Check subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('id, user_id, status, expiration_date_time')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    const subscription = subscriptions?.[0]
    if (!subscription) {
      logger.debug('❌ No active Microsoft Graph subscriptions found')
      return NextResponse.json({ error: 'No active subscriptions' })
    }

    logger.debug('\n📝 Active Subscription:')
    logger.debug(`  - ID: ${subscription.id.substring(0, 8)}...`)
    logger.debug(`  - User: ${subscription.user_id?.substring(0, 8)}...`)
    logger.debug(`  - Expires: ${subscription.expiration_date_time}`)

    // Step 3: Check workflows for this user
    const userId = subscription.user_id
    const { data: workflows } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, user_id')
      .eq('user_id', userId)
      .eq('status', 'active')

    logger.debug('\n🔄 User Workflows:')
    logger.debug(`  - Total active workflows: ${workflows?.length || 0}`)

    // Check for OneDrive triggers
    let oneDriveWorkflow = null
    for (const workflow of workflows || []) {
      try {
        const nodes = typeof workflow.nodes === 'string'
          ? JSON.parse(workflow.nodes)
          : workflow.nodes || []

        const hasTrigger = nodes.some((n: any) =>
          n?.data?.isTrigger &&
          (n?.data?.providerId === 'onedrive' ||
           n?.data?.type?.includes('onedrive'))
        )

        if (hasTrigger) {
          oneDriveWorkflow = workflow
          logger.debug(`  ✅ Found OneDrive workflow: "${workflow.name}"`)

          // Find the trigger details
          const triggerNode = nodes.find((n: any) =>
            n?.data?.isTrigger &&
            (n?.data?.providerId === 'onedrive' ||
             n?.data?.type?.includes('onedrive'))
          )

          logger.debug(`     - Trigger type: ${triggerNode?.data?.type || 'unknown'}`)
          logger.debug(`     - Config:`, triggerNode?.data?.config || {})
          break
        }
      } catch (e) {
        logger.debug(`  ⚠️ Error parsing workflow ${workflow.id}`)
      }
    }

    if (!oneDriveWorkflow) {
      logger.debug('  ❌ No OneDrive workflows found for user')
    }

    // Step 4: Test the workflow trigger
    if (oneDriveWorkflow && subscription) {
      logger.debug('\n🚀 Testing Workflow Trigger:')

      // Create a test event
      const testEvent = {
        type: 'onedrive_item',
        action: 'created',
        name: 'test-file.txt',
        id: `test-${ Date.now()}`,
        parentReference: {
          path: '/drive/root:/Documents'
        },
        file: {},
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString()
      }

      logger.debug('  - Would trigger with event:', testEvent.type)
      logger.debug('  - For workflow:', oneDriveWorkflow.name)
      logger.debug('  - User:', userId?.substring(0, 8))
    }

    // Step 5: Check integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, status, metadata')
      .eq('user_id', userId)
      .eq('provider', 'onedrive')
      .eq('status', 'connected')
      .single()

    logger.debug('\n🔗 OneDrive Integration:')
    if (integration) {
      logger.debug('  ✅ Connected')
      const metadata = typeof integration.metadata === 'string'
        ? JSON.parse(integration.metadata)
        : integration.metadata || {}
      logger.debug(`  - Has subscription ID in metadata: ${!!metadata.subscriptionId}`)
    } else {
      logger.debug('  ❌ Not connected or not found')
    }

    logger.debug('\n========================================')
    logger.debug('📊 SUMMARY:')
    logger.debug(`  - Subscription: ${subscription ? '✅' : '❌'}`)
    logger.debug(`  - OneDrive Workflow: ${oneDriveWorkflow ? '✅' : '❌'}`)
    logger.debug(`  - Integration: ${integration ? '✅' : '❌'}`)
    logger.debug(`  - Queue Items: ${queueItems?.length || 0}`)
    logger.debug('========================================\n')

    return NextResponse.json({
      success: true,
      subscription: subscription?.id,
      userId,
      workflow: oneDriveWorkflow?.name,
      queueItems: queueItems?.length || 0,
      canTrigger: !!(subscription && oneDriveWorkflow && integration)
    })

  } catch (error) {
    logger.error('Debug test error:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}