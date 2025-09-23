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

  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())

  console.log('📦 Webhook headers:', Object.keys(headers).filter(k => k.toLowerCase().includes('airtable')))
  console.log('📄 Raw body length:', raw.length)
  console.log('📄 Raw body preview:', raw.substring(0, 500))

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
    const valid = validateAirtableSignature(raw, headers, wh.mac_secret_base64)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Fetch actual payloads from Airtable
    const payloads = await fetchAirtableWebhookPayloads(baseId, webhookId)

    if (payloads?.payloads && payloads.payloads.length > 0) {
      // Process each payload
      for (const payload of payloads.payloads) {
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

  // Get all workflows with Airtable triggers for this base
  const { data: workflows, error: workflowError } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  console.log(`Found ${workflows?.length || 0} active workflows for user`)

  // Filter workflows that have Airtable triggers for this base
  const airtableWorkflows = workflows?.filter(w => {
    const triggerConfig = w.trigger_config
    return triggerConfig?.providerId === 'airtable' && triggerConfig?.baseId === baseId
  }) || []

  console.log(`Found ${airtableWorkflows.length} workflows with Airtable triggers for base ${baseId}`)

  // Log what tables each workflow is monitoring
  airtableWorkflows.forEach(w => {
    const tableName = w.trigger_config?.tableName
    console.log(`  - Workflow ${w.id} monitors: ${tableName || 'all tables'}`)
  })

  if (airtableWorkflows.length === 0) {
    console.log('❌ No workflows found with Airtable triggers for this base')
    return
  }

  // Process changes for each table
  const { changed_tables_by_id, created_tables_by_id, destroyed_table_ids } = payload

  for (const workflow of airtableWorkflows) {
    const triggerConfig = workflow.trigger_config
    const triggerType = workflow.trigger_type
    const tableName = triggerConfig?.tableName

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


