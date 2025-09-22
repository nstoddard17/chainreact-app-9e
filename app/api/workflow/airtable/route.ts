import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAirtableSignature, fetchAirtableWebhookPayloads } from '@/lib/integrations/airtable/webhooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())

  try {
    const notification = JSON.parse(raw)

    // Airtable sends a notification with base and webhook IDs
    const baseId = notification?.base?.id
    const webhookId = notification?.webhook?.id

    if (!baseId || !webhookId) {
      return NextResponse.json({ error: 'Missing base or webhook id' }, { status: 400 })
    }

    // Find webhook secret for validation
    const { data: wh } = await supabase
      .from('airtable_webhooks')
      .select('id, user_id, mac_secret_base64, status, webhook_id')
      .eq('base_id', baseId)
      .eq('webhook_id', webhookId)
      .eq('status', 'active')
      .single()

    if (!wh) {
      return NextResponse.json({ error: 'Webhook not registered' }, { status: 404 })
    }

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
  // Get all workflows with Airtable triggers for this base
  const { data: workflows } = await supabase
    .from('workflows')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .contains('trigger_config', { providerId: 'airtable', baseId })

  if (!workflows || workflows.length === 0) return

  // Process changes for each table
  const { changed_tables_by_id, created_tables_by_id, destroyed_table_ids } = payload

  for (const workflow of workflows) {
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
    await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: workflowId,
        user_id: userId,
        status: 'pending',
        trigger_data: triggerData,
        started_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to create workflow execution:', error)
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook endpoint',
    provider: 'airtable',
    verification: 'Requires X-Airtable-Signature-256 HMAC-SHA256 of raw body using macSecretBase64'
  })
}


