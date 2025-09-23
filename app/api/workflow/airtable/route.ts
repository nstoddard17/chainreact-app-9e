import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory tracking for deduplication and delayed processing
const processedRecords = new Map<string, number>() // Track when records were processed
const pendingRecords = new Map<string, {
  workflowId: string;
  userId: string;
  triggerData: any;
  scheduledAt: number;
  verificationDelay: number;
}>() // Track records pending verification
const activeTimers = new Map<string, NodeJS.Timeout>() // Track active timers to prevent duplicates

const DUPLICATE_BLOCK_MS = 60000 // Block duplicate executions for 60 seconds

// Helper to check if a record was recently processed
function wasRecentlyProcessed(workflowId: string, recordId: string): boolean {
  const key = `${workflowId}-${recordId}`
  const processedAt = processedRecords.get(key)

  if (!processedAt) return false

  const now = Date.now()
  const timeSinceProcessed = now - processedAt

  // If processed within the block window, it's a duplicate
  if (timeSinceProcessed < DUPLICATE_BLOCK_MS) {
    return true
  }

  // Clean up old entry
  processedRecords.delete(key)
  return false
}

// Mark a record as processed
function markRecordProcessed(workflowId: string, recordId: string): void {
  const key = `${workflowId}-${recordId}`
  processedRecords.set(key, Date.now())

  // Clean up old entries periodically
  if (processedRecords.size > 1000) {
    const now = Date.now()
    // Remove entries older than the block window
    for (const [k, timestamp] of processedRecords.entries()) {
      if (now - timestamp > DUPLICATE_BLOCK_MS) {
        processedRecords.delete(k)
      }
    }
  }
}

// Schedule a record for delayed processing
function schedulePendingRecord(
  workflowId: string,
  recordId: string,
  userId: string,
  triggerData: any,
  verificationDelay: number
): void {
  const key = `${workflowId}-${recordId}`

  // Check if already has an active timer
  if (activeTimers.has(key)) {
    console.log(`      ⏸️ Record ${recordId} already has active timer, updating data only`)
    // Update with latest data (in case fields were added)
    const existing = pendingRecords.get(key)
    if (existing && triggerData.fields) {
      // Merge fields from new data
      existing.triggerData.fields = { ...existing.triggerData.fields, ...triggerData.fields }
    }
    return
  }

  const pendingRecord = {
    workflowId,
    userId,
    triggerData,
    scheduledAt: Date.now() + (verificationDelay * 1000), // Convert seconds to ms
    verificationDelay
  }

  pendingRecords.set(key, pendingRecord)

  // Schedule the execution with setTimeout
  const timer = setTimeout(async () => {
    console.log(`⏰ Timer expired for record ${recordId}, processing...`)
    activeTimers.delete(key) // Remove from active timers
    await processSinglePendingRecord(key, pendingRecord)
  }, verificationDelay * 1000)

  // Store the timer reference
  activeTimers.set(key, timer)
}

// Process a single pending record when its timer expires
async function processSinglePendingRecord(key: string, pending: any): Promise<void> {
  console.log(`  ✅ Processing pending record: ${key}`)

  // Remove from pending map
  pendingRecords.delete(key)

  // Extract recordId from key (format: workflowId-recordId where workflowId is a UUID)
  // The workflowId is a UUID with format: 8-4-4-4-12 characters
  // So we need to skip the first 5 parts (UUID parts) to get the recordId
  const parts = key.split('-')
  const recordId = parts.slice(5).join('-') // Skip UUID parts: 8-4-4-4-12 = 5 parts

  // Mark as processed to prevent duplicates
  markRecordProcessed(pending.workflowId, recordId)

  // If verification delay is 0, process immediately without verification
  if (pending.verificationDelay === 0) {
    console.log(`🚀 Processing record ${recordId} immediately (no delay configured)`)
    await createWorkflowExecution(pending.workflowId, pending.userId, pending.triggerData)
  } else {
    // Verify record still exists before processing
    console.log(`🔍 Verifying record ${recordId} still exists after ${pending.verificationDelay}s delay`)

    // Import and use the verification function
    const { verifyAirtableRecord } = await import('@/lib/integrations/airtable/verification')
    const recordExists = await verifyAirtableRecord(
      pending.userId,
      pending.triggerData.baseId,
      pending.triggerData.tableId,
      recordId
    )

    if (recordExists) {
      console.log(`✅ Record ${recordId} verified - executing workflow`)
      await createWorkflowExecution(pending.workflowId, pending.userId, pending.triggerData)
    } else {
      console.log(`⏭️ Skipping workflow for deleted record ${recordId}`)
    }
  }
}

// Process records that have reached their scheduled time (for manual checking)
async function processPendingRecords(): Promise<void> {
  const now = Date.now()
  console.log(`🔄 Checking ${pendingRecords.size} pending records...`)

  for (const [key, pending] of pendingRecords.entries()) {
    const timeRemaining = Math.ceil((pending.scheduledAt - now) / 1000)
    console.log(`  - Record ${key}: ${timeRemaining > 0 ? `${timeRemaining}s remaining` : 'ready to process'}`)

    // Since we're now using setTimeout, we don't process here
    // This function is just for logging status
  }
}

export async function POST(req: NextRequest) {
  // Simplified deduplication approach - execute immediately but block duplicates
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
      // Process payloads in batch to handle cross-payload data merging
      await processAirtablePayloadsBatch(wh.user_id, baseId, payloads.payloads)

      // Store cursor for next fetch if available
      if (payloads.cursor) {
        await supabase
          .from('airtable_webhooks')
          .update({ last_cursor: payloads.cursor })
          .eq('webhook_id', webhookId)
      }
    }

    // Process any pending records that have reached their scheduled time
    await processPendingRecords()

    return NextResponse.json({ success: true, processed: payloads?.payloads?.length || 0 })
  } catch (e: any) {
    console.error('Airtable webhook error:', e)
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 })
  }
}

async function processAirtablePayloadsBatch(userId: string, baseId: string, payloads: any[]) {
  // Build a map of all changed records across all payloads for data lookup
  const allChangedRecords = new Map<string, any>()

  // First pass: collect all changed records
  for (const payload of payloads) {
    const changed_tables_by_id = payload.changedTablesById
    if (changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (tableData.changedRecordsById) {
          for (const [recordId, changes] of Object.entries(tableData.changedRecordsById)) {
            const key = `${tableId}-${recordId}`
            // Store the latest change data for this record
            allChangedRecords.set(key, {
              tableId,
              tableName: tableData.name,
              changes
            })
          }
        }
      }
    }
  }

  console.log(`📊 Found ${allChangedRecords.size} total changed records across all payloads`)

  // Process each payload with access to all change data
  for (const payload of payloads) {
    await processAirtablePayload(userId, baseId, payload, allChangedRecords)
  }
}

async function processAirtablePayload(userId: string, baseId: string, payload: any, allChangedRecords: Map<string, any>) {
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

  // Silent - we already know we have workflows

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

  // Also log changed tables that might have new records
  if (changed_tables_by_id) {
    for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
      const createdCount = Object.keys(tableData.createdRecordsById || {}).length
      const changedCount = Object.keys(tableData.changedRecordsById || {}).length
      if (createdCount > 0 || changedCount > 0) {
        console.log(`  - Changed table ${tableId}: ${tableData.name || 'unnamed'}, ${createdCount} new records, ${changedCount} changed records`)
      }
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

    console.log(`🔍 Checking workflow "${workflow.name}" (${workflow.id})`)
    console.log(`   - Trigger type: ${triggerType}`)
    console.log(`   - Table filter: ${tableName || 'all tables'}`)
    console.log(`   - Verification delay in config: ${triggerConfig.verificationDelay}`)
    console.log(`   - Full trigger config:`, JSON.stringify(triggerConfig, null, 2))

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
                // Only process if the record has meaningful data
                const fields = record.fields || {}
                const hasData = Object.keys(fields).length > 0 &&
                  Object.values(fields).some(v => v !== null && v !== '')

                if (!hasData) {
                  continue // Empty record - skip
                }

                // Check if this was recently processed (duplicate check)
                if (wasRecentlyProcessed(workflow.id, recordId)) {
                  console.log(`      ⏭️ Skipping duplicate - already processed`)
                  continue // Skip duplicate
                }

                // Get verification delay from trigger configuration
                console.log(`🔧 Checking verificationDelay - raw value: ${triggerConfig.verificationDelay}, type: ${typeof triggerConfig.verificationDelay}`)
                const verificationDelay = triggerConfig.verificationDelay !== undefined ? triggerConfig.verificationDelay : 30 // Default 30 seconds if not configured
                console.log(`🕐 Verification delay for workflow ${workflow.id}: ${verificationDelay}s (from config: ${triggerConfig.verificationDelay})`)

                const triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name,
                  recordId,
                  fields,
                  createdAt: record.createdTime || payload.timestamp
                }

                if (verificationDelay === 0) {
                  // Process immediately if no delay configured
                  console.log(`🚀 Processing new record ${recordId} immediately (no delay)`)
                  markRecordProcessed(workflow.id, recordId)
                  await createWorkflowExecution(workflow.id, userId, triggerData)
                } else {
                  // Schedule for delayed processing with verification
                  console.log(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s`)
                  schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
                }
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
              console.log(`  🆕 Found ${Object.keys(tableData.createdRecordsById).length} new records in table ${tableData.name || tableId}`)

              for (const [recordId, record] of Object.entries(tableData.createdRecordsById)) {
                // Check if record has data
                const fields = record.cellValuesByFieldId || {}
                const fieldCount = Object.keys(fields).length
                const nonEmptyFields = Object.values(fields).filter(v => v !== null && v !== '').length
                const hasData = fieldCount > 0 && nonEmptyFields > 0

                console.log(`    - Record ${recordId}: ${fieldCount} fields, ${nonEmptyFields} non-empty, hasData: ${hasData}`)

                // For empty records, check if there's a corresponding change event with data across ALL payloads
                if (!hasData) {
                  // Look for this record in ALL changed records across all payloads
                  let foundWithData = false
                  const changeKey = `${tableId}-${recordId}`

                  if (allChangedRecords && allChangedRecords.has(changeKey)) {
                    const changeInfo = allChangedRecords.get(changeKey)
                    const changedFields = changeInfo.changes.current?.cellValuesByFieldId || {}
                    const changedFieldCount = Object.keys(changedFields).length
                    const changedNonEmpty = Object.values(changedFields).filter(v => v !== null && v !== '').length

                    if (changedFieldCount > 0 && changedNonEmpty > 0) {
                      console.log(`      📝 Found data in change event from another payload: ${changedFieldCount} fields, ${changedNonEmpty} non-empty`)
                      // Use the changed data instead
                      Object.assign(fields, changedFields)
                      foundWithData = true
                    }
                  }

                  if (!foundWithData) {
                    console.log(`      ⏭️ Skipping empty record (no data found in any change event across all payloads)`)
                    continue // Empty record with no change data - skip
                  }
                }

                // Check if this was recently processed (duplicate check)
                if (wasRecentlyProcessed(workflow.id, recordId)) {
                  console.log(`      ⏭️ Skipping duplicate - already processed`)
                  continue // Skip duplicate
                }

                // Get verification delay from trigger configuration
                console.log(`🔧 Checking verificationDelay - raw value: ${triggerConfig.verificationDelay}, type: ${typeof triggerConfig.verificationDelay}`)
                const verificationDelay = triggerConfig.verificationDelay !== undefined ? triggerConfig.verificationDelay : 30 // Default 30 seconds if not configured
                console.log(`🕐 Verification delay for workflow ${workflow.id}: ${verificationDelay}s (from config: ${triggerConfig.verificationDelay})`)

                const triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields,
                  createdAt: record.createdTime || payload.timestamp
                }

                if (verificationDelay === 0) {
                  // Process immediately if no delay configured
                  console.log(`🚀 Processing new record ${recordId} immediately (no delay)`)
                  markRecordProcessed(workflow.id, recordId)
                  await createWorkflowExecution(workflow.id, userId, triggerData)
                } else {
                  // Schedule for delayed processing with verification
                  console.log(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s`)
                  schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
                }
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
            console.log(`  🔄 Checking ${Object.keys(tableData.changedRecordsById).length} changed records for potential new records`)
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
                // Check if this was recently processed (duplicate check)
                if (wasRecentlyProcessed(workflow.id, recordId)) {
                  console.log(`      ⏭️ Skipping duplicate - already processed`)
                  continue // Skip duplicate
                }

                // Check if already pending
                const pendingKey = `${workflow.id}-${recordId}`
                if (pendingRecords.has(pendingKey)) {
                  console.log(`      ⏸️ Record ${recordId} already scheduled, skipping change event`)
                  continue
                }

                // Get verification delay from trigger configuration
                console.log(`🔧 Checking verificationDelay for changed record - raw value: ${triggerConfig.verificationDelay}, type: ${typeof triggerConfig.verificationDelay}`)
                const verificationDelay = triggerConfig.verificationDelay !== undefined ? triggerConfig.verificationDelay : 30 // Default 30 seconds if not configured

                const triggerData = {
                  baseId,
                  tableId,
                  tableName: tableData.name || 'Unknown Table',
                  recordId,
                  fields,
                  createdAt: payload.timestamp
                }

                if (verificationDelay === 0) {
                  // Process immediately if no delay configured
                  console.log(`🚀 Processing new record ${recordId} immediately (was empty, now has data)`)
                  markRecordProcessed(workflow.id, recordId)
                  await createWorkflowExecution(workflow.id, userId, triggerData)
                } else {
                  // Schedule for delayed processing with verification
                  console.log(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s (from change event)`)
                  schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
                }
              }
            }
          }
        }
      }
    }

    // Handle updated records (only for update trigger type)
    // Note: Updated records trigger immediately without stability check
    if (triggerType === 'airtable_trigger_record_updated' && changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (!tableName || tableData.name === tableName) {
          // Check for changedRecordsById (camelCase)
          if (tableData.changedRecordsById) {
            for (const [recordId, changes] of Object.entries(tableData.changedRecordsById)) {
              // Skip if this is a newly created record (not an update)
              if (!tableData.createdRecordsById || !tableData.createdRecordsById[recordId]) {
                // Check if record actually has changes
                const currentFields = changes.current?.cellValuesByFieldId || {}
                const previousFields = changes.previous?.cellValuesByFieldId || {}

                // Only process if there are actual field changes
                const hasChanges = JSON.stringify(currentFields) !== JSON.stringify(previousFields)

                if (hasChanges) {
                  console.log(`✏️ Processing updated record ${recordId}`)
                  triggerData = {
                    baseId,
                    tableId,
                    tableName: tableData.name || 'Unknown Table',
                    recordId,
                    changedFields: currentFields,
                    previousValues: previousFields,
                    updatedAt: payload.timestamp
                  }
                  // Create execution for this record (immediate for updates)
                  await createWorkflowExecution(workflow.id, userId, triggerData)
                }
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


