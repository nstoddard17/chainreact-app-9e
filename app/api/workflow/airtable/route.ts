import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  console.log('🔔🔔🔔 AIRTABLE WEBHOOK RECEIVED! 🔔🔔🔔')
  console.log('Timestamp:', new Date().toISOString())

  // Log ALL headers for debugging
  const headers = Object.fromEntries(req.headers.entries())
  console.log('📦 All headers received:')
  Object.entries(headers).forEach(([key, value]) => {
    if (!key.toLowerCase().includes('cookie') && !key.toLowerCase().includes('auth')) {
      console.log(`  ${key}: ${value}`)
    }
  })

  const raw = await req.text()
  console.log('📄 Raw body length:', raw.length)
  console.log('📄 Raw body:', raw)

  try {
    const notification = JSON.parse(raw)
    console.log('📨 Parsed notification:', JSON.stringify(notification, null, 2))

    // Airtable sends a notification with base and webhook IDs
    const baseId = notification?.base?.id
    const webhookId = notification?.webhook?.id

    console.log(`🔍 Looking for webhook - Base: ${baseId}, Webhook: ${webhookId}`)

    if (!baseId || !webhookId) {
      console.error('❌ Missing base or webhook id in notification')
      return NextResponse.json({ error: 'Missing base or webhook id' }, { status: 400 })
    }

    // Find webhook secret for validation
    const { data: wh, error: whError } = await supabase
      .from('airtable_webhooks')
      .select('id, user_id, mac_secret_base64, status, webhook_id')
      .eq('base_id', baseId)
      .eq('webhook_id', webhookId)
      .eq('status', 'active')
      .single()

    if (whError) {
      console.error('❌ Database error finding webhook:', whError)
    }

    if (!wh) {
      console.error(`❌ Webhook not found in database for base: ${baseId}, webhook: ${webhookId}`)

      // Let's check what webhooks we do have for debugging
      const { data: allWebhooks } = await supabase
        .from('airtable_webhooks')
        .select('base_id, webhook_id, status')
        .eq('status', 'active')

      console.log('📋 Active webhooks in database:', allWebhooks)

      return NextResponse.json({ error: 'Webhook not registered' }, { status: 404 })
    }

    console.log('✅ Found webhook in database', {
      webhookId: wh.webhook_id,
      metadata: wh.metadata,
      scopeType: wh.metadata?.scopeType || 'base',
      tableName: wh.metadata?.tableName || 'all tables'
    })

    // Verify signature
    console.log('🔐 Verifying signature...')
    console.log('   Has MAC Secret:', !!wh.mac_secret_base64)
    console.log('   MAC Secret length:', wh.mac_secret_base64?.length)
    console.log('   Header signature:', headers['x-airtable-content-mac'])

    const valid = validateAirtableSignature(raw, headers, wh.mac_secret_base64)
    console.log('   Signature valid:', valid)

    if (!valid) {
      console.error('❌ Signature validation failed!')
      console.error('   This usually means the MAC secret in DB doesn\'t match the webhook')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    console.log('✅ Signature validated successfully')

    // Fetch actual payloads from Airtable
    console.log('📥 Fetching webhook payloads from Airtable...')
    const payloads = await fetchAirtableWebhookPayloads(baseId, webhookId)
    console.log(`📦 Received ${payloads?.payloads?.length || 0} payloads to process`)

    if (payloads?.payloads && payloads.payloads.length > 0) {
      console.log('🔄 Processing payloads...')
      // Process each payload
      for (const payload of payloads.payloads) {
        console.log('📝 Payload structure:', JSON.stringify(Object.keys(payload), null, 2))
        await processAirtablePayload(wh.user_id, baseId, payload)
      }

      // Store cursor for next fetch if available
      if (payloads.cursor) {
        await supabase
          .from('airtable_webhooks')
          .update({ last_cursor: payloads.cursor })
          .eq('webhook_id', webhookId)
      }
    }

    return NextResponse.json({ success: true, processed: payloads?.payloads?.length || 0 })
  } catch (e: any) {
    console.error('Airtable webhook error:', e)
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 })
  }
}

async function processAirtablePayload(userId: string, baseId: string, payload: any) {
  console.log(`📊 Processing Airtable payload for user ${userId}, base ${baseId}`)
  console.log('📝 Full payload data:', JSON.stringify(payload, null, 2))

  // Get all workflows with Airtable triggers for this base
  const { data: workflows, error: workflowError } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  console.log(`Found ${workflows?.length || 0} active workflows for user`)

  // Filter workflows that have Airtable triggers for this base
  // We need to check the nodes array for trigger nodes
  const airtableWorkflows = workflows?.filter(w => {
    // Find the trigger node in the workflow's nodes
    const nodes = w.nodes || []

    // Debug: Log the workflow structure
    console.log(`  Workflow ${w.id} (${w.name}):`)
    console.log(`    - Has ${nodes.length} nodes`)

    const triggerNode = nodes.find((node: any) => node.data?.isTrigger)

    if (!triggerNode) {
      console.log(`    - ❌ No trigger node found`)
      // Also check if any node has type starting with 'airtable_trigger'
      const airtableTriggerNode = nodes.find((node: any) =>
        node.data?.type?.startsWith('airtable_trigger')
      )
      if (airtableTriggerNode) {
        console.log(`    - ⚠️ Found Airtable trigger node but isTrigger not set:`, {
          nodeId: airtableTriggerNode.id,
          type: airtableTriggerNode.data?.type,
          hasIsTrigger: airtableTriggerNode.data?.isTrigger,
          providerId: airtableTriggerNode.data?.providerId,
          config: airtableTriggerNode.data?.config
        })
      }
      return false
    }

    // Check if it's an Airtable trigger for this specific base
    const providerId = triggerNode.data?.providerId
    const triggerConfig = triggerNode.data?.config || {}

    console.log(`    - ✅ Found trigger node:`, {
      nodeId: triggerNode.id,
      type: triggerNode.data?.type,
      providerId,
      baseId: triggerConfig.baseId,
      expectedBaseId: baseId,
      fullConfig: triggerConfig,
      matches: providerId === 'airtable' && triggerConfig.baseId === baseId
    })

    return providerId === 'airtable' && triggerConfig.baseId === baseId
  }) || []

  console.log(`Found ${airtableWorkflows.length} workflows with Airtable triggers for base ${baseId}`)

  // Log what tables each workflow is monitoring
  airtableWorkflows.forEach(w => {
    const nodes = w.nodes || []
    const triggerNode = nodes.find((node: any) => node.data?.isTrigger)
    const triggerConfig = triggerNode?.data?.config || {}
    const tableName = triggerConfig.tableName
    console.log(`  - Workflow ${w.id} monitors: ${tableName || 'all tables'}`)
  })

  if (airtableWorkflows.length === 0) {
    console.log('❌ No workflows found with Airtable triggers for this base')
    return
  }

  // Process changes for each table
  const { changed_tables_by_id, created_tables_by_id, destroyed_table_ids } = payload

  console.log('📋 Payload contents:')
  console.log('  - Has created_tables_by_id?', !!created_tables_by_id)
  console.log('  - Has changed_tables_by_id?', !!changed_tables_by_id)
  console.log('  - Has destroyed_table_ids?', !!destroyed_table_ids)

  if (created_tables_by_id) {
    console.log('  - Created tables:', Object.keys(created_tables_by_id))
    for (const [tableId, tableData] of Object.entries(created_tables_by_id)) {
      console.log(`    Table ${tableId}: ${tableData.name || 'unnamed'}, ${Object.keys(tableData.created_records_by_id || {}).length} new records`)
    }
  }

  for (const workflow of airtableWorkflows) {
    // Extract trigger information from nodes
    const nodes = workflow.nodes || []
    const triggerNode = nodes.find((node: any) => node.data?.isTrigger)

    if (!triggerNode) continue // Skip if no trigger node found

    const triggerConfig = triggerNode.data?.config || {}
    const triggerType = triggerNode.data?.type
    const tableName = triggerConfig.tableName

    // Check if this workflow cares about changes to this table
    let shouldTrigger = false
    let triggerData = {}

    // Handle created records
    if (triggerType === 'airtable_trigger_new_record' && created_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(created_tables_by_id)) {
        if (!tableName || tableData.name === tableName) {
          if (tableData.created_records_by_id) {
            for (const [recordId, record] of Object.entries(tableData.created_records_by_id)) {
              shouldTrigger = true
              triggerData = {
                baseId,
                tableId,
                tableName: tableData.name,
                recordId,
                fields: record.fields || {},
                createdAt: payload.timestamp
              }
              // Create execution for this record
              await createWorkflowExecution(workflow.id, userId, triggerData)
            }
          }
        }
      }
    }

    // Handle updated records
    if (triggerType === 'airtable_trigger_record_updated' && changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (!tableName || tableData.name === tableName) {
          if (tableData.changed_records_by_id) {
            for (const [recordId, changes] of Object.entries(tableData.changed_records_by_id)) {
              shouldTrigger = true
              triggerData = {
                baseId,
                tableId,
                tableName: tableData.name,
                recordId,
                changedFields: changes.current?.fields || {},
                previousValues: changes.previous?.fields || {},
                updatedAt: payload.timestamp
              }
              // Create execution for this record
              await createWorkflowExecution(workflow.id, userId, triggerData)
            }
          }
        }
      }
    }

    // Handle deleted tables
    if (triggerType === 'airtable_trigger_table_deleted' && destroyed_table_ids) {
      // Note: Airtable only provides table IDs that were deleted, not individual records
      // This would need additional tracking to know which records were deleted
      for (const tableId of destroyed_table_ids) {
        // We'd need to track table names separately to match
        shouldTrigger = true
        triggerData = {
          baseId,
          tableId,
          deletedAt: payload.timestamp
        }
        // Create execution
        await createWorkflowExecution(workflow.id, userId, triggerData)
      }
    }
  }
}

async function createWorkflowExecution(workflowId: string, userId: string, triggerData: any) {
  try {
    console.log(`🚀 Creating workflow execution for workflow ${workflowId}`)
    console.log('📝 Trigger data:', JSON.stringify(triggerData, null, 2))

    // Get the workflow details first
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      console.error('Failed to get workflow:', workflowError)
      return
    }

    console.log(`⚡ Executing workflow "${workflow.name}" via webhook trigger`)

    // Import and use the workflow execution service
    const { WorkflowExecutionService } = await import('@/lib/services/workflowExecutionService')

    const workflowExecutionService = new WorkflowExecutionService()

    // Execute the workflow with the trigger data as input
    // Skip triggers since this IS the trigger
    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      triggerData,  // Pass trigger data as input
      userId,
      false,  // testMode = false (this is a real webhook trigger)
      null,   // No workflow data override
      true    // skipTriggers = true (we're already triggered by webhook)
    )

    console.log(`✅ Workflow execution completed:`, {
      success: executionResult.success,
      executionId: executionResult.executionId,
      hasResults: !!executionResult.results
    })
  } catch (error) {
    console.error('Failed to create/execute workflow:', error)
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook endpoint',
    provider: 'airtable',
    verification: 'Requires X-Airtable-Signature-256 HMAC-SHA256 of raw body using macSecretBase64'
  })
}


