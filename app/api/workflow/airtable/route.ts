import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory tracking as fallback when database table doesn't exist
const processedRecordsMemory = new Map<string, { fieldHash: string, fieldCount: number, processedAt: number }>()

// Helper to generate a hash of record fields for change detection
function generateFieldHash(fields: any): string {
  const sortedFields = Object.keys(fields || {}).sort().reduce((acc, key) => {
    acc[key] = fields[key]
    return acc
  }, {} as any)
  return crypto.createHash('sha256').update(JSON.stringify(sortedFields)).digest('hex').substring(0, 16)
}

// Check if a record has been processed for a workflow
async function isRecordProcessed(
  workflowId: string,
  baseId: string,
  tableId: string,
  recordId: string,
  fields: any
): Promise<boolean> {
  const memoryKey = `${workflowId}-${baseId}-${tableId}-${recordId}`

  try {
    // Try database first
    const { data: existing, error } = await supabase
      .from('airtable_processed_records')
      .select('field_hash, field_count')
      .eq('workflow_id', workflowId)
      .eq('base_id', baseId)
      .eq('table_id', tableId)
      .eq('record_id', recordId)
      .single()

    if (!error && existing) {
      const currentHash = generateFieldHash(fields)
      const currentFieldCount = Object.keys(fields || {}).length

      if (existing.field_hash === currentHash && existing.field_count === currentFieldCount) {
        return true // Already processed this exact version
      }

      if (currentFieldCount > existing.field_count) {
        // More fields added - allow reprocessing
        await supabase
          .from('airtable_processed_records')
          .delete()
          .eq('workflow_id', workflowId)
          .eq('base_id', baseId)
          .eq('table_id', tableId)
          .eq('record_id', recordId)

        return false
      }

      return true // Minor changes, don't reprocess
    }
  } catch (error) {
    // Database error - fall back to memory
  }

  // Fallback to in-memory tracking
  const memoryRecord = processedRecordsMemory.get(memoryKey)

  if (!memoryRecord) {
    return false // Never processed
  }

  const currentHash = generateFieldHash(fields)
  const currentFieldCount = Object.keys(fields || {}).length

  // Check if it's the same version we already processed
  if (memoryRecord.fieldHash === currentHash && memoryRecord.fieldCount === currentFieldCount) {
    return true
  }

  // Allow reprocessing if more fields were added
  if (currentFieldCount > memoryRecord.fieldCount) {
    processedRecordsMemory.delete(memoryKey)
    return false
  }

  return true // Minor changes, don't reprocess
}

// Mark a record as processed
async function markRecordProcessed(
  workflowId: string,
  baseId: string,
  tableId: string,
  recordId: string,
  fields: any
): Promise<void> {
  const fieldHash = generateFieldHash(fields)
  const fieldCount = Object.keys(fields || {}).length
  const memoryKey = `${workflowId}-${baseId}-${tableId}-${recordId}`

  // Always save to memory
  processedRecordsMemory.set(memoryKey, {
    fieldHash,
    fieldCount,
    processedAt: Date.now()
  })

  // Clean up old memory records if too many (keep last 500)
  if (processedRecordsMemory.size > 500) {
    const entries = Array.from(processedRecordsMemory.entries())
      .sort((a, b) => b[1].processedAt - a[1].processedAt)
      .slice(0, 250)
    processedRecordsMemory.clear()
    entries.forEach(([key, value]) => processedRecordsMemory.set(key, value))
  }

  // Try to save to database too
  try {
    await supabase
      .from('airtable_processed_records')
      .upsert({
        workflow_id: workflowId,
        base_id: baseId,
        table_id: tableId,
        record_id: recordId,
        field_hash: fieldHash,
        field_count: fieldCount,
        processed_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,base_id,table_id,record_id'
      })
  } catch (error) {
    // Database save failed - that's ok, we have it in memory
  }
}

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

  // Only log workflow count once per webhook call (not per payload)
  if (!processedRecordsMemory.has('_workflow_count_logged')) {
    console.log(`Found ${airtableWorkflows.length} workflow(s) with Airtable triggers`)
    processedRecordsMemory.set('_workflow_count_logged', { fieldHash: '', fieldCount: 0, processedAt: Date.now() })

    // Clear this flag after 5 seconds so next webhook shows it again
    setTimeout(() => {
      processedRecordsMemory.delete('_workflow_count_logged')
    }, 5000)
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
                // Only process if the record has meaningful data
                const fields = record.cellValuesByFieldId || {}
                const hasData = Object.keys(fields).length > 0 &&
                  Object.values(fields).some(v => v !== null && v !== '')

                if (!hasData) {
                  // Empty record - skip
                  continue
                }

                // Check if we've already processed this exact record
                const alreadyProcessed = await isRecordProcessed(
                  workflow.id,
                  baseId,
                  tableId,
                  recordId,
                  fields
                )

                if (alreadyProcessed) {
                  continue // Skip silently
                }

                // Require at least 1 field with actual data to consider the record "complete"
                const fieldCount = Object.keys(fields).length
                if (fieldCount < 1) {
                  // This should rarely happen since we check hasData above
                  continue
                }

                console.log(`✅ Processing new record ${recordId} with ${fieldCount} fields`)
                triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields: fields,
                  createdAt: record.createdTime || payload.timestamp
                }

                // Mark as processed BEFORE executing to prevent race conditions
                await markRecordProcessed(workflow.id, baseId, tableId, recordId, fields)

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
              // Check if this has data
              const fields = changes.current?.cellValuesByFieldId || {}
              const hasData = Object.keys(fields).length > 0 &&
                Object.values(fields).some(v => v !== null && v !== '')

              // Check if this is likely a new record (no previous values)
              const isLikelyNew = !changes.previous || !changes.previous.cellValuesByFieldId ||
                Object.keys(changes.previous.cellValuesByFieldId || {}).length === 0

              if (hasData && isLikelyNew) {
                // Check if we've already processed this exact record
                const alreadyProcessed = await isRecordProcessed(
                  workflow.id,
                  baseId,
                  tableId,
                  recordId,
                  fields
                )

                if (alreadyProcessed) {
                  continue // Skip silently
                }

                // Require at least 1 field with actual data
                const fieldCount = Object.keys(fields).length
                if (fieldCount < 1) {
                  continue
                }

                console.log(`✅ Processing new record ${recordId} from changed records with ${fieldCount} fields`)
                triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields: fields,
                  createdAt: payload.timestamp
                }

                // Mark as processed BEFORE executing
                await markRecordProcessed(workflow.id, baseId, tableId, recordId, fields)

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


