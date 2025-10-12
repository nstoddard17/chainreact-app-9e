import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'
import { matchesAirtableTable } from '@/lib/integrations/airtable/payloadUtils'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-memory tracking for deduplication and delayed processing
const processedRecords = new Map<string, number>() // Track when records were processed
const pendingRecords = new Map<string, {
  workflowId: string;
  recordId: string;
  userId: string;
  triggerData: any;
  scheduledAt: number;
  verificationDelay: number;
  dedupeId: string;
}>() // Track records pending verification
const activeTimers = new Map<string, NodeJS.Timeout>() // Track active timers to prevent duplicates

const DUPLICATE_BLOCK_MS = 60000 // Block duplicate executions for 60 seconds

type AirtableBatchRecord = {
  recordId: string
  fields?: Record<string, any>
  changedFields?: Record<string, any>
  previousValues?: Record<string, any>
  createdAt?: string | null
  updatedAt?: string | null
  eventType: string
}

type AirtableBatchGroup = {
  tableId: string | null
  tableName: string
  timestamp: string
  records: AirtableBatchRecord[]
  recordIds: Set<string>
}

function buildBatchKey(baseId: string, tableId: string | null | undefined, timestamp: string, type: string) {
  return `${type}:${baseId}:${tableId || 'all'}:${timestamp}`
}

function getCreatedTables(payload: any) {
  return payload?.createdTablesById || payload?.created_tables_by_id || null
}

function getChangedTables(payload: any) {
  return payload?.changedTablesById || payload?.changed_tables_by_id || null
}

function getDestroyedTableIds(payload: any) {
  return payload?.destroyedTableIds || payload?.destroyed_table_ids || null
}

function getCreatedRecords(tableData: any) {
  return tableData?.createdRecordsById || tableData?.created_records_by_id || null
}

function getChangedRecords(tableData: any) {
  return tableData?.changedRecordsById || tableData?.changed_records_by_id || null
}

function getDestroyedRecordIds(tableData: any) {
  return tableData?.destroyedRecordIds || tableData?.destroyed_record_ids || []
}

function normalizeAirtableRecord(record: any) {
  if (!record || typeof record !== 'object') return record

  if (record.cell_values_by_field_id && !record.cellValuesByFieldId) {
    record.cellValuesByFieldId = record.cell_values_by_field_id
  }
  if (record.cellValuesByFieldId && !record.cell_values_by_field_id) {
    record.cell_values_by_field_id = record.cellValuesByFieldId
  }

  if (!record.fields && record.record?.fields && typeof record.record.fields === 'object') {
    record.fields = record.record.fields
  }

  if (record.created_time && !record.createdTime) {
    record.createdTime = record.created_time
  }
  if (record.createdTime && !record.created_time) {
    record.created_time = record.createdTime
  }

  return record
}

function normalizeAirtablePayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload

  if (!payload.createdTablesById && payload.created_tables_by_id) {
    payload.createdTablesById = payload.created_tables_by_id
  }
  if (!payload.created_tables_by_id && payload.createdTablesById) {
    payload.created_tables_by_id = payload.createdTablesById
  }

  if (!payload.changedTablesById && payload.changed_tables_by_id) {
    payload.changedTablesById = payload.changed_tables_by_id
  }
  if (!payload.changed_tables_by_id && payload.changedTablesById) {
    payload.changed_tables_by_id = payload.changedTablesById
  }

  if (!payload.destroyedTableIds && payload.destroyed_table_ids) {
    payload.destroyedTableIds = payload.destroyed_table_ids
  }
  if (!payload.destroyed_table_ids && payload.destroyedTableIds) {
    payload.destroyed_table_ids = payload.destroyedTableIds
  }

  const tableCollections = [payload.createdTablesById, payload.changedTablesById]
    .filter(Boolean) as Array<Record<string, any>>

  for (const tables of tableCollections) {
    for (const tableData of Object.values(tables)) {
      if (!tableData || typeof tableData !== 'object') continue

      if (!tableData.createdRecordsById && tableData.created_records_by_id) {
        tableData.createdRecordsById = tableData.created_records_by_id
      }
      if (!tableData.created_records_by_id && tableData.createdRecordsById) {
        tableData.created_records_by_id = tableData.createdRecordsById
      }

      if (!tableData.changedRecordsById && tableData.changed_records_by_id) {
        tableData.changedRecordsById = tableData.changed_records_by_id
      }
      if (!tableData.changed_records_by_id && tableData.changedRecordsById) {
        tableData.changed_records_by_id = tableData.changedRecordsById
      }

      if (!tableData.destroyedRecordIds && tableData.destroyed_record_ids) {
        tableData.destroyedRecordIds = tableData.destroyed_record_ids
      }
      if (!tableData.destroyed_record_ids && tableData.destroyedRecordIds) {
        tableData.destroyed_record_ids = tableData.destroyedRecordIds
      }

      const createdRecords = getCreatedRecords(tableData)
      if (createdRecords) {
        for (const record of Object.values(createdRecords)) {
          normalizeAirtableRecord(record)
        }
      }

      const changedRecords = getChangedRecords(tableData)
      if (changedRecords) {
        for (const change of Object.values(changedRecords)) {
          if (change && typeof change === 'object') {
            if (change.current) normalizeAirtableRecord(change.current)
            if (change.previous) normalizeAirtableRecord(change.previous)
          }
        }
      }
    }
  }

  return payload
}

function extractRecordFields(record: any): Record<string, any> {
  if (!record || typeof record !== 'object') return {}

  if (record.fields && typeof record.fields === 'object') {
    return { ...record.fields }
  }

  if (record.cellValuesByFieldId && typeof record.cellValuesByFieldId === 'object') {
    return { ...record.cellValuesByFieldId }
  }

  if (record.cell_values_by_field_id && typeof record.cell_values_by_field_id === 'object') {
    return { ...record.cell_values_by_field_id }
  }

  if (record.current) {
    return extractRecordFields(record.current)
  }

  return {}
}

function extractSnapshotFields(snapshot: any): Record<string, any> {
  if (!snapshot || typeof snapshot !== 'object') return {}

  if (snapshot.cellValuesByFieldId && typeof snapshot.cellValuesByFieldId === 'object') {
    return { ...snapshot.cellValuesByFieldId }
  }

  if (snapshot.cell_values_by_field_id && typeof snapshot.cell_values_by_field_id === 'object') {
    return { ...snapshot.cell_values_by_field_id }
  }

  if (snapshot.fields && typeof snapshot.fields === 'object') {
    return { ...snapshot.fields }
  }

  return {}
}

function hasNonEmptyFieldValues(fields: Record<string, any>): boolean {
  for (const value of Object.values(fields)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value.trim() === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && Object.keys(value).length === 0) continue
    return true
  }
  return false
}

function getRecordCreatedAt(record: any, fallback?: string) {
  return record?.createdTime || record?.created_time || fallback || null
}

function parseVerificationDelay(value: any, defaultValue: number): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }
  return defaultValue
}

// Helper to build consistent dedupe keys
function buildDedupeKey(workflowId: string, dedupeId: string): string {
  return `${workflowId}-${dedupeId}`
}

// Helper to check if a record was recently processed
function wasRecentlyProcessed(workflowId: string, dedupeId: string): boolean {
  const key = buildDedupeKey(workflowId, dedupeId)
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
function markRecordProcessed(workflowId: string, dedupeId: string): void {
  const key = buildDedupeKey(workflowId, dedupeId)
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
  verificationDelay: number,
  dedupeId?: string
): void {
  const dedupeKey = buildDedupeKey(workflowId, dedupeId || recordId)

  // Check if already has an active timer
  if (activeTimers.has(dedupeKey)) {
    logger.debug(`      ⏸️ Record ${recordId} already has active timer, updating data only`)
    // Update with latest data (in case fields were added)
    const existing = pendingRecords.get(dedupeKey)
    if (existing && triggerData.fields) {
      // Merge fields from new data
      existing.triggerData.fields = { ...existing.triggerData.fields, ...triggerData.fields }
    }
    return
  }

  const pendingRecord = {
    workflowId,
    recordId,
    userId,
    triggerData,
    scheduledAt: Date.now() + (verificationDelay * 1000), // Convert seconds to ms
    verificationDelay,
    dedupeId: dedupeId || recordId
  }

  pendingRecords.set(dedupeKey, pendingRecord)

  // Schedule the execution with setTimeout
  const timer = setTimeout(async () => {
    logger.debug(`⏰ Timer expired for record ${recordId}, processing...`)
    activeTimers.delete(dedupeKey) // Remove from active timers
    await processSinglePendingRecord(dedupeKey, pendingRecord)
  }, verificationDelay * 1000)

  // Store the timer reference
  activeTimers.set(dedupeKey, timer)
}

// Process a single pending record when its timer expires
async function processSinglePendingRecord(key: string, pending: any): Promise<void> {
  logger.debug(`  ✅ Processing pending record: ${key}`)

  // Remove from pending map
  pendingRecords.delete(key)

  const recordId = pending.recordId

  // Mark as processed to prevent duplicates
  markRecordProcessed(pending.workflowId, pending.dedupeId || recordId)

  // If verification delay is 0, process immediately without verification
  if (pending.verificationDelay === 0) {
    logger.debug(`🚀 Processing record ${recordId} immediately (no delay configured)`)
    await createWorkflowExecution(pending.workflowId, pending.userId, pending.triggerData)
  } else {
    // Verify record still exists before processing
    logger.debug(`🔍 Verifying record ${recordId} still exists after ${pending.verificationDelay}s delay`)

    // Import and use the verification function
    const { verifyAirtableRecord } = await import('@/lib/integrations/airtable/verification')
    const recordExists = await verifyAirtableRecord(
      pending.userId,
      pending.triggerData.baseId,
      pending.triggerData.tableId,
      recordId,
      pending.triggerData.tableName
    )

    if (recordExists) {
      logger.debug(`✅ Record ${recordId} verified - executing workflow`)
      await createWorkflowExecution(pending.workflowId, pending.userId, pending.triggerData)
    } else {
      logger.debug(`⏭️ Skipping workflow for deleted record ${recordId}`)
    }
  }
}

// Process records that have reached their scheduled time (for manual checking)
async function processPendingRecords(): Promise<void> {
  const now = Date.now()
  logger.debug(`🔄 Checking ${pendingRecords.size} pending records...`)

  for (const [key, pending] of pendingRecords.entries()) {
    const timeRemaining = Math.ceil((pending.scheduledAt - now) / 1000)
    logger.debug(`  - Record ${pending.recordId} (${key}): ${timeRemaining > 0 ? `${timeRemaining}s remaining` : 'ready to process'}`)

    // Since we're now using setTimeout, we don't process here
    // This function is just for logging status
  }
}

async function setWebhookSkipBefore(
  webhookId: string,
  currentMetadata: Record<string, any> | null | undefined,
  skipBefore: string | null
): Promise<void> {
  const newMetadata = { ...(currentMetadata || {}) }

  if (skipBefore) {
    newMetadata.skip_before_timestamp = skipBefore
  } else {
    delete newMetadata.skip_before_timestamp
  }

  await supabase
    .from('airtable_webhooks')
    .update({ metadata: newMetadata })
    .eq('id', webhookId)
}

export async function POST(req: NextRequest) {
  let currentWebhook: any = null
  // Simplified deduplication approach - execute immediately but block duplicates
  logger.debug('🔔 Airtable webhook received at', new Date().toISOString())

  const headers = Object.fromEntries(req.headers.entries())
  const raw = await req.text()

  try {
    const notification = JSON.parse(raw)
    // Don't log full notification - it's too verbose

    // Airtable sends a notification with base and webhook IDs
    const baseId = notification?.base?.id
    const webhookId = notification?.webhook?.id

    logger.debug(`🔍 Looking for webhook - Base: ${baseId}, Webhook: ${webhookId}`)

    if (!baseId || !webhookId) {
      logger.error('❌ Missing base or webhook id in notification')
      return NextResponse.json({ error: 'Missing base or webhook id' }, { status: 400 })
    }

    // Find webhook secret for validation
    const { data: wh, error: whError } = await supabase
      .from('airtable_webhooks')
      .select('id, user_id, mac_secret_base64, status, webhook_id, last_cursor, metadata')
      .eq('base_id', baseId)
      .eq('webhook_id', webhookId)
      .eq('status', 'active')
      .single()

    currentWebhook = wh

    if (whError) {
      logger.error('❌ Database error finding webhook:', whError)
    }

    if (!wh) {
      logger.error(`❌ Webhook not found in database for base: ${baseId}, webhook: ${webhookId}`)

      // Let's check what webhooks we do have for debugging
      const { data: allWebhooks } = await supabase
        .from('airtable_webhooks')
        .select('base_id, webhook_id, status')
        .eq('status', 'active')

      logger.debug('📋 Active webhooks in database:', allWebhooks)

      return NextResponse.json({ error: 'Webhook not registered' }, { status: 404 })
    }

    logger.debug('✅ Found webhook in database')

    // Verify signature
    const headerNames = ['x-airtable-signature-256', 'x-airtable-content-mac', 'x-airtable-signature']
    let signatureHeader: string | null = null

    for (const [key, value] of req.headers.entries()) {
      if (headerNames.includes(key.toLowerCase())) {
        signatureHeader = value
        break
      }
    }

    if (!signatureHeader) {
      for (const name of headerNames) {
        const value = headers[name]
        if (value) {
          signatureHeader = value
          break
        }
      }
    }

    logger.debug('🔐 Airtable signature header (raw):', signatureHeader ? signatureHeader.slice(0, 128) : 'none')
    logger.debug('🔐 Airtable headers snapshot:', headerNames.reduce((acc: Record<string, string | undefined>, name) => {
      acc[name] = headers[name]
      return acc
    }, {}))

    const valid = validateAirtableSignature(raw, signatureHeader, wh.mac_secret_base64)

    if (!valid) {
      logger.error('❌ Signature validation failed!')
      logger.error('   This usually means the MAC secret in DB doesn\'t match the webhook')
      if (!signatureHeader) {
        logger.warn('   Headers received:', Object.keys(headers))
      }
      await setWebhookSkipBefore(wh.id, wh.metadata, new Date().toISOString())
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Fetch actual payloads from Airtable
    const payloads = await fetchAirtableWebhookPayloads(baseId, webhookId, wh.last_cursor ?? undefined)
    const payloadCount = payloads?.payloads?.length || 0
  if (payloadCount > 0) {
    logger.debug(`📦 Processing ${payloadCount} Airtable payload(s)`)
  }

    if (payloads?.payloads && payloads.payloads.length > 0) {
      // Process payloads in batch to handle cross-payload data merging
      const skipBefore = wh.metadata?.skip_before_timestamp as string | undefined
      await processAirtablePayloadsBatch(wh.user_id, baseId, payloads.payloads, skipBefore, wh.metadata)

      // Store cursor for next fetch if available
      if (payloads.cursor) {
        await supabase
          .from('airtable_webhooks')
          .update({ last_cursor: payloads.cursor })
          .eq('webhook_id', webhookId)
      }

      if (skipBefore) {
        await setWebhookSkipBefore(wh.id, wh.metadata, null)
      }
    }

    // Process any pending records that have reached their scheduled time
    await processPendingRecords()

    return NextResponse.json({ success: true, processed: payloads?.payloads?.length || 0 })
  } catch (e: any) {
    logger.error('Airtable webhook error:', e)
    if (e?.message === 'Invalid signature') {
      // already handled
    } else if (req.headers.get('x-airtable-signature-256') || req.headers.get('x-airtable-content-mac')) {
      if (currentWebhook?.id) {
        await setWebhookSkipBefore(currentWebhook.id, currentWebhook.metadata, new Date().toISOString())
      }
    }
    return NextResponse.json({ error: e.message || 'Invalid payload' }, { status: 400 })
  }
}

async function processAirtablePayloadsBatch(
  userId: string,
  baseId: string,
  payloads: any[],
  skipBeforeTimestamp?: string,
  webhookMetadata?: Record<string, any>
) {
  // Build a map of all changed records across all payloads for data lookup
  const allChangedRecords = new Map<string, any>()

  // First pass: collect all changed records
  for (const payload of payloads) {
    const normalizedPayload = normalizeAirtablePayload(payload)
    const changed_tables_by_id = normalizedPayload?.changedTablesById
    if (changed_tables_by_id) {
      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        const changedRecords = getChangedRecords(tableData)
        if (changedRecords) {
          for (const [recordId, changes] of Object.entries(changedRecords)) {
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

  logger.debug(`📊 Found ${allChangedRecords.size} total changed records across all payloads`)

  // Process each payload with access to all change data
  for (const payload of payloads) {
    const normalizedPayload = normalizeAirtablePayload(payload)
    await processAirtablePayload(
      userId,
      baseId,
      normalizedPayload,
      allChangedRecords,
      skipBeforeTimestamp,
      webhookMetadata
    )
  }
}

async function processAirtablePayload(
  userId: string,
  baseId: string,
  payload: any,
  allChangedRecords: Map<string, any>,
  skipBeforeTimestamp?: string,
  webhookMetadata?: Record<string, any>
) {
  // Don't log full payload - too verbose

  const normalizedPayload = normalizeAirtablePayload(payload)
  const payloadTimestamp = normalizedPayload?.timestamp || new Date().toISOString()

  const payloadTimestampMs = normalizedPayload?.timestamp ? new Date(normalizedPayload.timestamp).getTime() : null
  const skipBeforeMs = skipBeforeTimestamp ? new Date(skipBeforeTimestamp).getTime() : null

  if (skipBeforeMs && payloadTimestampMs && payloadTimestampMs <= skipBeforeMs) {
    logger.debug(`⏭️ Skipping payload from ${normalizedPayload.timestamp} due to previous validation failure window`)
    return
  }

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
  const changed_tables_by_id = getChangedTables(normalizedPayload)
  const created_tables_by_id = getCreatedTables(normalizedPayload)
  const destroyed_table_ids = getDestroyedTableIds(normalizedPayload)

  if (created_tables_by_id) {
    logger.debug('  - Created tables:', Object.keys(created_tables_by_id))
    for (const [tableId, tableData] of Object.entries(created_tables_by_id)) {
      const createdRecords = getCreatedRecords(tableData)
      const createdCount = createdRecords ? Object.keys(createdRecords).length : 0
      logger.debug(`    Table ${tableId}: ${tableData.name || 'unnamed'}, ${createdCount} new records`)
    }
  }

  // Also log changed tables that might have new records
  if (changed_tables_by_id) {
    for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
      const createdRecords = getCreatedRecords(tableData)
      const changedRecords = getChangedRecords(tableData)
      const createdCount = createdRecords ? Object.keys(createdRecords).length : 0
      const changedCount = changedRecords ? Object.keys(changedRecords).length : 0
      if (createdCount > 0 || changedCount > 0) {
        logger.debug(`  - Changed table ${tableId}: ${tableData.name || 'unnamed'}, ${createdCount} new records, ${changedCount} changed records`)
      }
    }
  }

  for (const workflow of airtableWorkflows) {
    const nodes = workflow.nodes || []
    const triggerNode = nodes.find((node: any) => node.data?.isTrigger)

    if (!triggerNode) {
      logger.debug(`❌ No trigger node found in workflow ${workflow.id}`)
      continue
    }

    const triggerConfig = triggerNode.data?.config || {}
    const triggerType = triggerNode.data?.type
    const tableName = triggerConfig.tableName
    const tableIdFilter = triggerConfig.tableId || webhookMetadata?.tableId || webhookMetadata?.table_id || null

    if (tableIdFilter && !triggerConfig.tableId) {
      triggerConfig.tableId = tableIdFilter
    }

    logger.debug(`🔍 Checking workflow "${workflow.name}" (${workflow.id})`)
    logger.debug(`   - Trigger type: ${triggerType}`)
    logger.debug(`   - Table filter: ${tableName || 'all tables'}`)
    logger.debug(`   - Table filter ID: ${tableIdFilter || 'all tables'}`)
    logger.debug(`   - Verification delay in config: ${triggerConfig.verificationDelay}`)
    const changeGrouping = triggerConfig.changeGrouping || 'per_record'
    logger.debug(`   - Linked record handling: ${changeGrouping === 'combine_linked' ? 'Combine linked updates into one run' : 'Run once per record change'}`)
    logger.debug(`   - Full trigger config:`, JSON.stringify(triggerConfig, null, 2))

    if (triggerType === 'airtable_trigger_new_record') {
      const batchedNewRecords = changeGrouping === 'combine_linked' ? new Map<string, AirtableBatchGroup>() : null
      const addNewRecordToBatch = (
        tableId: string | null,
        tableNameValue: string,
        record: AirtableBatchRecord
      ) => {
        if (!batchedNewRecords) return
        const batchKey = buildBatchKey(baseId, tableId, payloadTimestamp, 'new')
        let group = batchedNewRecords.get(batchKey)
        if (!group) {
          group = {
            tableId,
            tableName: tableNameValue,
            timestamp: payloadTimestamp,
            records: [],
            recordIds: new Set<string>()
          }
          batchedNewRecords.set(batchKey, group)
        }
        if (group.recordIds.has(record.recordId)) {
          return
        }
        group.recordIds.add(record.recordId)
        group.records.push(record)
      }

      if (created_tables_by_id) {
        for (const [tableId, tableData] of Object.entries(created_tables_by_id)) {
          if (!matchesAirtableTable(tableId, tableData, triggerConfig, webhookMetadata)) {
            continue
          }

          const createdRecords = getCreatedRecords(tableData)
          if (!createdRecords) {
            continue
          }

          for (const [recordId, record] of Object.entries(createdRecords)) {
            const fields = extractRecordFields(record)
            const hasData = hasNonEmptyFieldValues(fields)

            if (!hasData) {
              continue
            }

            const rawDelayValue = triggerConfig.verificationDelay
            logger.debug(`🔧 Checking verificationDelay - raw value: ${rawDelayValue}, type: ${typeof rawDelayValue}`)
            const verificationDelay = parseVerificationDelay(rawDelayValue, 30)
            logger.debug(`🕐 Verification delay for workflow ${workflow.id}: ${verificationDelay}s (from config: ${rawDelayValue})`)

            const triggerData = {
              baseId,
              tableId,
              tableName: tableData.name || webhookMetadata?.tableName || 'Unknown Table',
              recordId,
              fields,
              createdAt: getRecordCreatedAt(record, normalizedPayload.timestamp)
            }

            if (batchedNewRecords && verificationDelay === 0) {
              addNewRecordToBatch(tableId, triggerData.tableName, {
                recordId,
                fields,
                createdAt: triggerData.createdAt,
                eventType: 'record_created'
              })
              continue
            }

            if (wasRecentlyProcessed(workflow.id, recordId)) {
              logger.debug(`      ⏭️ Skipping duplicate - already processed`)
              continue
            }

            if (verificationDelay === 0) {
              logger.debug(`🚀 Processing new record ${recordId} immediately (no delay)`)
              markRecordProcessed(workflow.id, recordId)
              await createWorkflowExecution(workflow.id, userId, triggerData)
            } else {
              logger.debug(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s`)
              schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
            }
          }
        }
      }

      if (changed_tables_by_id) {
        for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
          if (!matchesAirtableTable(tableId, tableData, triggerConfig, webhookMetadata)) {
            continue
          }

          const nestedCreatedRecords = getCreatedRecords(tableData)
          if (!nestedCreatedRecords) {
            continue
          }

          logger.debug(`  🆕 Found ${Object.keys(nestedCreatedRecords).length} new records in table ${tableData.name || tableId}`)

          for (const [recordId, record] of Object.entries(nestedCreatedRecords)) {
            const fields = extractRecordFields(record)
            const fieldCount = Object.keys(fields).length
            const nonEmptyFields = Object.values(fields).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length
            const hasData = fieldCount > 0 && nonEmptyFields > 0 && hasNonEmptyFieldValues(fields)

            logger.debug(`    - Record ${recordId}: ${fieldCount} fields, ${nonEmptyFields} non-empty, hasData: ${hasData}`)

            if (!hasData) {
              let foundWithData = false
              const changeKey = `${tableId}-${recordId}`

              if (allChangedRecords && allChangedRecords.has(changeKey)) {
                const changeInfo = allChangedRecords.get(changeKey)
                const changedFields = extractSnapshotFields(changeInfo?.changes?.current)
                const changedFieldCount = Object.keys(changedFields).length
                const changedNonEmpty = Object.values(changedFields).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length

                if (changedFieldCount > 0 && changedNonEmpty > 0) {
                  logger.debug(`      📝 Found data in change event from another payload: ${changedFieldCount} fields, ${changedNonEmpty} non-empty`)
                  Object.assign(fields, changedFields)
                  foundWithData = true
                }
              }

              if (!foundWithData) {
                logger.debug(`      ⏭️ Skipping empty record (no data found in any change event across all payloads)`)
                continue
              }
            }

            const rawDelayValue = triggerConfig.verificationDelay
            logger.debug(`🔧 Checking verificationDelay - raw value: ${rawDelayValue}, type: ${typeof rawDelayValue}`)
            const verificationDelay = parseVerificationDelay(rawDelayValue, 30)
            logger.debug(`🕐 Verification delay for workflow ${workflow.id}: ${verificationDelay}s (from config: ${rawDelayValue})`)

            const triggerData = {
              baseId,
              tableId,
              tableName: tableData.name || webhookMetadata?.tableName || 'Unknown Table',
              recordId,
              fields,
              createdAt: getRecordCreatedAt(record, normalizedPayload.timestamp)
            }

            if (batchedNewRecords && verificationDelay === 0) {
              addNewRecordToBatch(tableId, triggerData.tableName, {
                recordId,
                fields,
                createdAt: triggerData.createdAt,
                eventType: 'record_created'
              })
              continue
            }

            if (wasRecentlyProcessed(workflow.id, recordId)) {
              logger.debug(`      ⏭️ Skipping duplicate - already processed`)
              continue
            }

            if (verificationDelay === 0) {
              logger.debug(`🚀 Processing new record ${recordId} immediately (no delay)`)
              markRecordProcessed(workflow.id, recordId)
              await createWorkflowExecution(workflow.id, userId, triggerData)
            } else {
              logger.debug(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s`)
              schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
            }
          }
        }
      }

      if (changed_tables_by_id) {
        for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
          if (!matchesAirtableTable(tableId, tableData, triggerConfig, webhookMetadata)) {
            continue
          }

          const changedRecordsOnly = getChangedRecords(tableData)
          const createdRecordsForTable = getCreatedRecords(tableData)

          if (!changedRecordsOnly || (createdRecordsForTable && Object.keys(createdRecordsForTable).length > 0)) {
            continue
          }

          logger.debug(`  🔄 Checking ${Object.keys(changedRecordsOnly).length} changed records for potential new records`)

          for (const [recordId, changes] of Object.entries(changedRecordsOnly)) {
            const currentFieldsSnapshot = extractSnapshotFields((changes as any)?.current)
            const previousFieldsSnapshot = extractSnapshotFields((changes as any)?.previous)
            const fields = { ...currentFieldsSnapshot }
            const hasData = hasNonEmptyFieldValues(currentFieldsSnapshot)
            const isLikelyNew = Object.keys(previousFieldsSnapshot).length === 0

            if (!hasData || !isLikelyNew) {
              continue
            }

            const pendingKey = buildDedupeKey(workflow.id, recordId)
            if (pendingRecords.has(pendingKey)) {
              logger.debug(`      ⏸️ Record ${recordId} already scheduled, skipping change event`)
              continue
            }

            const rawDelayValue = triggerConfig.verificationDelay
            logger.debug(`🔧 Checking verificationDelay for changed record - raw value: ${rawDelayValue}, type: ${typeof rawDelayValue}`)
            const verificationDelay = parseVerificationDelay(rawDelayValue, 30)

            const triggerData = {
              baseId,
              tableId,
              tableName: tableData.name || webhookMetadata?.tableName || 'Unknown Table',
              recordId,
              fields,
              createdAt: normalizedPayload.timestamp
            }

            if (batchedNewRecords && verificationDelay === 0) {
              addNewRecordToBatch(tableId, triggerData.tableName, {
                recordId,
                fields,
                createdAt: triggerData.createdAt,
                eventType: 'record_created'
              })
              continue
            }

            if (wasRecentlyProcessed(workflow.id, recordId)) {
              logger.debug(`      ⏭️ Skipping duplicate - already processed`)
              continue
            }

            if (verificationDelay === 0) {
              logger.debug(`🚀 Processing new record ${recordId} immediately (was empty, now has data)`)
              markRecordProcessed(workflow.id, recordId)
              await createWorkflowExecution(workflow.id, userId, triggerData)
            } else {
              logger.debug(`⏳ Scheduling record ${recordId} for processing in ${verificationDelay}s (from change event)`)
              schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay)
            }
          }
        }
      }

      if (batchedNewRecords && batchedNewRecords.size > 0) {
        for (const [batchKey, group] of batchedNewRecords.entries()) {
          const dedupeKey = `batch:${batchKey}`
          if (wasRecentlyProcessed(workflow.id, dedupeKey)) {
            logger.debug(`      ⏭️ Skipping duplicate batch ${dedupeKey}`)
            continue
          }

          const primary = group.records[0]
          markRecordProcessed(workflow.id, dedupeKey)

          const triggerData = {
            baseId,
            tableId: group.tableId,
            tableName: group.tableName,
            recordId: primary?.recordId,
            fields: primary?.fields,
            createdAt: primary?.createdAt || group.timestamp,
            eventType: group.records.length > 1 ? 'record_batch_created' : 'record_created',
            recordBatch: group.records
          }

          logger.debug(`🚀 Processing batched new records (${group.records.length}) for table ${group.tableName}`)
          await createWorkflowExecution(workflow.id, userId, triggerData)
        }
      }
    }

    if (triggerType === 'airtable_trigger_record_updated' && changed_tables_by_id) {
      const batchedUpdatedRecords = changeGrouping === 'combine_linked' ? new Map<string, AirtableBatchGroup>() : null
      const addUpdatedRecordToBatch = (
        tableId: string | null,
        tableNameValue: string,
        record: AirtableBatchRecord
      ) => {
        if (!batchedUpdatedRecords) return
        const batchKey = buildBatchKey(baseId, tableId, payloadTimestamp, 'updated')
        let group = batchedUpdatedRecords.get(batchKey)
        if (!group) {
          group = {
            tableId,
            tableName: tableNameValue,
            timestamp: payloadTimestamp,
            records: [],
            recordIds: new Set<string>()
          }
          batchedUpdatedRecords.set(batchKey, group)
        }
        if (group.recordIds.has(record.recordId)) {
          return
        }
        group.recordIds.add(record.recordId)
        group.records.push(record)
      }

      for (const [tableId, tableData] of Object.entries(changed_tables_by_id)) {
        if (!matchesAirtableTable(tableId, tableData, triggerConfig, webhookMetadata)) {
          continue
        }

        const changedRecords = getChangedRecords(tableData)
        const createdRecords = getCreatedRecords(tableData)
        if (!changedRecords) {
          continue
        }

        for (const [recordId, changes] of Object.entries(changedRecords)) {
          if (createdRecords && (createdRecords as any)[recordId]) {
            continue
          }

          const currentFields = extractSnapshotFields((changes as any)?.current)
          const previousFields = extractSnapshotFields((changes as any)?.previous)
          const hasChanges = JSON.stringify(currentFields) !== JSON.stringify(previousFields)

          if (!hasChanges) {
            continue
          }

          // Field-level filtering: if watchedFieldIds specified, only proceed if any watched field changed
          const watchedFieldIds: string[] | undefined = Array.isArray(triggerConfig.watchedFieldIds)
            ? triggerConfig.watchedFieldIds
            : undefined
          if (watchedFieldIds && watchedFieldIds.length > 0) {
            const changedFieldIds = new Set<string>(Object.keys(currentFields))
            const hasWatched = watchedFieldIds.some(fid => changedFieldIds.has(fid))
            if (!hasWatched) {
              continue
            }
          }

          const rawDelayValue = triggerConfig.verificationDelay
          const verificationDelay = parseVerificationDelay(rawDelayValue, 0)

          // If combining linked updates, add to batch and skip individual execution
          if (batchedUpdatedRecords && verificationDelay === 0) {
            addUpdatedRecordToBatch(tableId, tableData.name || webhookMetadata?.tableName || 'Unknown Table', {
              recordId,
              changedFields: currentFields,
              previousValues: previousFields,
              updatedAt: normalizedPayload.timestamp || payloadTimestamp,
              eventType: 'record_updated'
            })
            continue
          }

          logger.debug(`✏️ Processing updated record ${recordId}`)

          const triggerData = {
            baseId,
            tableId,
            tableName: tableData.name || webhookMetadata?.tableName || 'Unknown Table',
            recordId,
            changedFields: currentFields,
            previousValues: previousFields,
            updatedAt: normalizedPayload.timestamp,
            eventType: 'record_updated'
          }

          const dedupeSuffix = `${recordId}-${normalizedPayload.timestamp || Date.now()}`

          if (wasRecentlyProcessed(workflow.id, dedupeSuffix)) {
            logger.debug(`      ⏭️ Skipping duplicate update for record ${recordId}`)
            continue
          }

          if (verificationDelay === 0) {
            markRecordProcessed(workflow.id, dedupeSuffix)
            await createWorkflowExecution(workflow.id, userId, triggerData)
          } else {
            logger.debug(`⏳ Scheduling updated record ${recordId} for processing in ${verificationDelay}s`)
            schedulePendingRecord(workflow.id, recordId, userId, triggerData, verificationDelay, dedupeSuffix)
          }
        }
      }

      if (batchedUpdatedRecords && batchedUpdatedRecords.size > 0) {
        for (const [batchKey, group] of batchedUpdatedRecords.entries()) {
          const dedupeKey = `batch:${batchKey}`
          if (wasRecentlyProcessed(workflow.id, dedupeKey)) {
            logger.debug(`      ⏭️ Skipping duplicate batch ${dedupeKey}`)
            continue
          }

          const primary = group.records[0]
          markRecordProcessed(workflow.id, dedupeKey)

          const triggerData = {
            baseId,
            tableId: group.tableId,
            tableName: group.tableName,
            recordId: primary?.recordId,
            changedFields: primary?.changedFields,
            previousValues: primary?.previousValues,
            updatedAt: primary?.updatedAt || group.timestamp,
            eventType: group.records.length > 1 ? 'record_batch_updated' : 'record_updated',
            recordBatch: group.records
          }

          logger.debug(`🚀 Processing batched record updates (${group.records.length}) for table ${group.tableName}`)
          await createWorkflowExecution(workflow.id, userId, triggerData)
        }
      }
    }

    if (triggerType === 'airtable_trigger_table_deleted' && destroyed_table_ids && destroyed_table_ids.length > 0) {
      logger.debug(`🗑️ Processing ${destroyed_table_ids.length} destroyed table(s) for workflow ${workflow.id}`)

      for (const destroyedTableId of destroyed_table_ids) {
        const dedupeSuffix = `table-${destroyedTableId}`

        if (wasRecentlyProcessed(workflow.id, dedupeSuffix)) {
          logger.debug(`      ⏭️ Table ${destroyedTableId} already handled recently, skipping`)
          continue
        }

        const triggerData = {
          baseId,
          tableId: destroyedTableId,
          deletedAt: normalizedPayload.timestamp || new Date().toISOString(),
          eventType: 'table_deleted'
        }

        markRecordProcessed(workflow.id, dedupeSuffix)
        await createWorkflowExecution(workflow.id, userId, triggerData)
      }
    }
  }
}

async function createWorkflowExecution(workflowId: string, userId: string, triggerData: any) {
  try {
    logger.debug(`🚀 Creating workflow execution for workflow ${workflowId}`)
    logger.debug('📝 Trigger data fields:', Object.keys(triggerData))

    // Get the workflow details first
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      logger.error('❌ Failed to get workflow:', workflowError)
      return
    }

    logger.debug(`⚡ Executing workflow "${workflow.name}" (${workflow.id})`)

    // Log the workflow structure to understand what nodes will execute
    const nodes = workflow.nodes || []
    const actionNodes = nodes.filter((n: any) => !n.data?.isTrigger && n.data?.type)
    logger.debug(`📊 Workflow has ${actionNodes.length} action nodes:`)
    actionNodes.forEach((node: any) => {
      logger.debug(`   - ${node.data.type} (${node.id})`)
    })

    // Import and use the workflow execution service
    const { WorkflowExecutionService } = await import('@/lib/services/workflowExecutionService')

    const workflowExecutionService = new WorkflowExecutionService()

    // Execute the workflow with the trigger data as input
    // Skip triggers since this IS the trigger
    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      triggerData, // Pass trigger data as input
      userId,
      false, // testMode = false (this is a real webhook trigger)
      null, // No workflow data override
      true // skipTriggers = true (we're already triggered by webhook)
    )

    logger.debug(`✅ Workflow execution result:`, {
      success: !!executionResult.results,
      executionId: executionResult.executionId,
      resultsCount: executionResult.results?.length || 0,
      historyId: executionResult.executionHistoryId
    })

    // Log what was actually executed
    if (executionResult.results && executionResult.results.length > 0) {
      logger.debug('📋 Execution details:')
      executionResult.results.forEach((result: any) => {
        logger.debug(`   - Node ${result.nodeId}: ${result.success ? '✅' : '❌'}`)
        if (result.error) {
          logger.debug(`     Error: ${result.error}`)
        }
      })
    } else {
      logger.debug('⚠️ No execution results returned')
    }
  } catch (error) {
    logger.error('❌ Failed to create/execute workflow:', error)
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook endpoint',
    provider: 'airtable',
    verification: 'Requires X-Airtable-Signature-256 HMAC-SHA256 of raw body using macSecretBase64'
  })
}
