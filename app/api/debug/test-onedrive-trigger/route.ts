import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    console.log('\n========================================')
    console.log('🔍 ONEDRIVE WORKFLOW DEBUG TEST')
    console.log('========================================\n')

    // Step 1: Check webhook queue
    const { data: queueItems } = await supabase
      .from('microsoft_webhook_queue')
      .select('id, subscription_id, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('📥 Webhook Queue Status:')
    console.log(`  - Pending items: ${queueItems?.length || 0}`)
    if (queueItems && queueItems.length > 0) {
      console.log(`  - Latest: ${queueItems[0].created_at}`)
      console.log(`  - Subscription: ${queueItems[0].subscription_id?.substring(0, 8)}...`)
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
      console.log('❌ No active Microsoft Graph subscriptions found')
      return NextResponse.json({ error: 'No active subscriptions' })
    }

    console.log('\n📝 Active Subscription:')
    console.log(`  - ID: ${subscription.id.substring(0, 8)}...`)
    console.log(`  - User: ${subscription.user_id?.substring(0, 8)}...`)
    console.log(`  - Expires: ${subscription.expiration_date_time}`)

    // Step 3: Check workflows for this user
    const userId = subscription.user_id
    const { data: workflows } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, user_id')
      .eq('user_id', userId)
      .eq('status', 'active')

    console.log('\n🔄 User Workflows:')
    console.log(`  - Total active workflows: ${workflows?.length || 0}`)

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
          console.log(`  ✅ Found OneDrive workflow: "${workflow.name}"`)

          // Find the trigger details
          const triggerNode = nodes.find((n: any) =>
            n?.data?.isTrigger &&
            (n?.data?.providerId === 'onedrive' ||
             n?.data?.type?.includes('onedrive'))
          )

          console.log(`     - Trigger type: ${triggerNode?.data?.type || 'unknown'}`)
          console.log(`     - Config:`, triggerNode?.data?.config || {})
          break
        }
      } catch (e) {
        console.log(`  ⚠️ Error parsing workflow ${workflow.id}`)
      }
    }

    if (!oneDriveWorkflow) {
      console.log('  ❌ No OneDrive workflows found for user')
    }

    // Step 4: Test the workflow trigger
    if (oneDriveWorkflow && subscription) {
      console.log('\n🚀 Testing Workflow Trigger:')

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

      console.log('  - Would trigger with event:', testEvent.type)
      console.log('  - For workflow:', oneDriveWorkflow.name)
      console.log('  - User:', userId?.substring(0, 8))
    }

    // Step 5: Check integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('id, status, metadata')
      .eq('user_id', userId)
      .eq('provider', 'onedrive')
      .eq('status', 'connected')
      .single()

    console.log('\n🔗 OneDrive Integration:')
    if (integration) {
      console.log('  ✅ Connected')
      const metadata = typeof integration.metadata === 'string'
        ? JSON.parse(integration.metadata)
        : integration.metadata || {}
      console.log(`  - Has subscription ID in metadata: ${!!metadata.subscriptionId}`)
    } else {
      console.log('  ❌ Not connected or not found')
    }

    console.log('\n========================================')
    console.log('📊 SUMMARY:')
    console.log(`  - Subscription: ${subscription ? '✅' : '❌'}`)
    console.log(`  - OneDrive Workflow: ${oneDriveWorkflow ? '✅' : '❌'}`)
    console.log(`  - Integration: ${integration ? '✅' : '❌'}`)
    console.log(`  - Queue Items: ${queueItems?.length || 0}`)
    console.log('========================================\n')

    return NextResponse.json({
      success: true,
      subscription: subscription?.id,
      userId,
      workflow: oneDriveWorkflow?.name,
      queueItems: queueItems?.length || 0,
      canTrigger: !!(subscription && oneDriveWorkflow && integration)
    })

  } catch (error) {
    console.error('Debug test error:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}