import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Track which records we've already triggered workflows for
// This prevents multiple triggers when Airtable sends multiple webhooks as user types
const processedRecords = new Set<string>()

export async function POST(req: NextRequest) {
  console.log('🔔 Airtable webhook received at', new Date().toISOString())

  const headers = Object.fromEntries(req.headers.entries())
  const raw = await req.text()

  try {
    const notification = JSON.parse(raw)
    // Don't log full notification - it's too verbose

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

    console.log('✅ Found webhook in database')

    // Verify signature
    const valid = validateAirtableSignature(raw, headers, wh.mac_secret_base64)

    if (!valid) {
      console.error('❌ Signature validation failed!')
      console.error('   This usually means the MAC secret in DB doesn\'t match the webhook')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Fetch actual payloads from Airtable
    const payloads = await fetchAirtableWebhookPayloads(baseId, webhookId)
    const payloadCount = payloads?.payloads?.length || 0
  if (payloadCount > 0) {
    console.log(`📦 Processing ${payloadCount} Airtable payload(s)`)
  }

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
  // Don't log full payload - too verbose

  // Get all workflows with Airtable triggers for this base
  const { data: workflows, error: workflowError } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  // Filter workflows that have Airtable triggers for this base
  const airtableWorkflows = workflows?.filter(w => {
    const nodes = w.nodes || []
    const triggerNode = nodes.find((node: any) => node.data?.isTrigger)
    if (!triggerNode) return false

    const providerId = triggerNode.data?.providerId
    const triggerConfig = triggerNode.data?.config || {}

    return providerId === 'airtable' && triggerConfig.baseId === baseId
  }) || []

  if (airtableWorkflows.length === 0) {
    // Silent return - no workflows to process
    return
  }

  // Only log once per payload processing
  if (!payload._loggedWorkflowCount) {
    console.log(`Found ${airtableWorkflows.length} workflow(s) with Airtable triggers`)
    payload._loggedWorkflowCount = true
  }

  // Process changes for each table
  // Airtable uses camelCase in their payload, not snake_case
  const changed_tables_by_id = payload.changedTablesById
  const created_tables_by_id = payload.createdTablesById
  const destroyed_table_ids = payload.destroyedTableIds

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

    if (!triggerNode) {
      console.log(`❌ No trigger node found in workflow ${workflow.id}`)
      continue // Skip if no trigger node found
    }

    const triggerConfig = triggerNode.data?.config || {}
    const triggerType = triggerNode.data?.type
    const tableName = triggerConfig.tableName

    // Only log trigger check details for new records that will be processed
    let logTriggerCheck = false

    // Check if this workflow cares about changes to this table
    let shouldTrigger = false
    let triggerData = {}

    // Handle created records
    // Note: Airtable sends created records in BOTH createdTablesById AND changedTablesById
    // We need to check both places for created records
    if (triggerType === 'airtable_trigger_new_record') {
      // Check for created tables (new tables with records)
      if (created_tables_by_id) {
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

      // ALSO check for created records in changed tables (most common case)
      if (changed_tables_by_id) {
        for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
          if (!tableName || tableData.name === tableName) {
            // Check for createdRecordsById within changed tables
            if (tableData.createdRecordsById) {
              for (const [recordId, record] of Object.entries(tableData.createdRecordsById)) {
                // Create a unique key for this record to track if we've processed it
                const recordKey = `${workflow.id}-${recordId}`

                // Check if we've already processed this record in this session
                if (processedRecords.has(recordKey)) {
                  console.log(`⏭️ Skipping already processed record ${recordId} (in-memory check)`)
                  continue
                }

                // Only process if the record has at least one field with data
                // This helps avoid triggering on empty record creation
                const hasData = record.cellValuesByFieldId &&
                  Object.keys(record.cellValuesByFieldId).length > 0 &&
                  Object.values(record.cellValuesByFieldId).some(v => v !== null && v !== '')

                if (!hasData) {
                  console.log(`⏭️ Skipping empty record ${recordId} - waiting for data`)
                  // DON'T mark as processed yet - wait for data
                  continue
                }

                // Mark this record as processed
                processedRecords.add(recordKey)

                // Clean up old records from memory if set gets too large (keep last 1000)
                if (processedRecords.size > 1000) {
                  const recordsArray = Array.from(processedRecords)
                  processedRecords.clear()
                  recordsArray.slice(-500).forEach(r => processedRecords.add(r))
                }

                console.log(`🆕 Processing new record ${recordId} with data`)
                shouldTrigger = true
                triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields: record.cellValuesByFieldId || {},
                  createdAt: record.createdTime || payload.timestamp
                }
                // Create execution for this record
                await createWorkflowExecution(workflow.id, userId, triggerData)
              }
            }
          }
        }
      }
    }

    // For new record triggers, ALSO check changed records
    // This handles the case where a record was created empty, then immediately edited
    if (triggerType === 'airtable_trigger_new_record' && changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (!tableName || tableData.name === tableName) {
          // Check for changedRecordsById that might be newly created records with data
          if (tableData.changedRecordsById && !tableData.createdRecordsById) {
            // Check changed records for new record trigger (when initial creation was empty)

            for (const [recordId, changes] of Object.entries(tableData.changedRecordsById)) {
              // Create a unique key for this record
              const recordKey = `${workflow.id}-${recordId}`

              // Check if we've already processed this record
              if (processedRecords.has(recordKey)) {
                console.log(`⏭️ Skipping already processed record ${recordId}`)
                continue
              }

              // Check if this has data (might be a new record that just got its first data)
              const hasData = changes.current?.cellValuesByFieldId &&
                Object.keys(changes.current.cellValuesByFieldId).length > 0 &&
                Object.values(changes.current.cellValuesByFieldId).some(v => v !== null && v !== '')

              // Check if this is likely a new record (no previous values)
              const isLikelyNew = !changes.previous || !changes.previous.cellValuesByFieldId ||
                Object.keys(changes.previous.cellValuesByFieldId || {}).length === 0

              if (hasData && isLikelyNew) {
                // Mark as processed
                processedRecords.add(recordKey)

                console.log(`🆕 Processing likely new record ${recordId} from changed records`)
                triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields: changes.current.cellValuesByFieldId || {},
                  createdAt: payload.timestamp
                }
                // Create execution for this record
                await createWorkflowExecution(workflow.id, userId, triggerData)
              }
            }
          }
        }
      }
    }

    // Handle updated records (only for update trigger type)
    if (triggerType === 'airtable_trigger_record_updated' && changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (!tableName || tableData.name === tableName) {
          // Check for changedRecordsById (camelCase)
          if (tableData.changedRecordsById) {
            console.log(`📝 Found ${Object.keys(tableData.changedRecordsById).length} changed records in table ${tableId}`)
            for (const [recordId, changes] of Object.entries(tableData.changedRecordsById)) {
              // Skip if this is a newly created record (not an update)
              if (!tableData.createdRecordsById || !tableData.createdRecordsById[recordId]) {
                console.log(`✏️ Processing updated record ${recordId}`)
                shouldTrigger = true
                triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  changedFields: changes.current?.cellValuesByFieldId || {},
                  previousValues: changes.previous?.cellValuesByFieldId || {},
                  updatedAt: payload.timestamp
                }
                // Create execution for this record
                await createWorkflowExecution(workflow.id, userId, triggerData)
              }
            }
          }
        }
      }
    }

    // Handle deleted records/tables
    // Note: We don't currently have a trigger for deleted records, but handle the data anyway
    if (changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        // Check for destroyedRecordIds in changed tables
        if (tableData.destroyedRecordIds && tableData.destroyedRecordIds.length > 0) {
          console.log(`🗑️ Found ${tableData.destroyedRecordIds.length} destroyed records in table ${tableId}`)
          // We could handle deleted records here if we add a trigger type for it
        }
      }
    }
  }
}

async function createWorkflowExecution(workflowId: string, userId: string, triggerData: any) {
  try {
    console.log(`🚀 Creating workflow execution for workflow ${workflowId}`)
    console.log('📝 Trigger data fields:', Object.keys(triggerData))

    // Get the workflow details first
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      console.error('❌ Failed to get workflow:', workflowError)
      return
    }

    console.log(`⚡ Executing workflow "${workflow.name}" (${workflow.id})`)

    // Log the workflow structure to understand what nodes will execute
    const nodes = workflow.nodes || []
    const actionNodes = nodes.filter((n: any) => !n.data?.isTrigger && n.data?.type)
    console.log(`📊 Workflow has ${actionNodes.length} action nodes:`)
    actionNodes.forEach((node: any) => {
      console.log(`   - ${node.data.type} (${node.id})`)
    })

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

    console.log(`✅ Workflow execution result:`, {
      success: !!executionResult.results,
      executionId: executionResult.executionId,
      resultsCount: executionResult.results?.length || 0,
      historyId: executionResult.executionHistoryId
    })

    // Log what was actually executed
    if (executionResult.results && executionResult.results.length > 0) {
      console.log('📋 Execution details:')
      executionResult.results.forEach((result: any) => {
        console.log(`   - Node ${result.nodeId}: ${result.success ? '✅' : '❌'}`)
        if (result.error) {
          console.log(`     Error: ${result.error}`)
        }
      })
    } else {
      console.log('⚠️ No execution results returned')
    }
  } catch (error) {
    console.error('❌ Failed to create/execute workflow:', error)
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook endpoint',
    provider: 'airtable',
    verification: 'Requires X-Airtable-Signature-256 HMAC-SHA256 of raw body using macSecretBase64'
  })
}


