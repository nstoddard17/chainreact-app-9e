import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'

const ROLE_POLL_INTERVAL_MS: Record<string, number> = {
  free: 15 * 60 * 1000,
  pro: 2 * 60 * 1000,
  'beta-pro': 2 * 60 * 1000,
  business: 60 * 1000,
  enterprise: 60 * 1000,
  admin: 60 * 1000
}

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

type ExcelRowSnapshot = {
  rowHashes: Record<string, string>
  rowCount: number
  updatedAt: string
}

async function fetchExcelTableSnapshot(
  accessToken: string,
  workbookId: string,
  tableName: string
): Promise<{ rows: any[]; columns: string[]; rowHashes: Record<string, string> }> {
  const baseUrl = 'https://graph.microsoft.com/v1.0'
  const encodedTableName = encodeURIComponent(tableName)
  const rowsUrl = `${baseUrl}/me/drive/items/${workbookId}/workbook/tables/${encodedTableName}/rows?$top=200`
  const columnsUrl = `${baseUrl}/me/drive/items/${workbookId}/workbook/tables/${encodedTableName}/columns?$select=name`

  const [rowsResponse, columnsResponse] = await Promise.all([
    fetch(rowsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }),
    fetch(columnsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
  ])

  if (!rowsResponse.ok) {
    const errorText = await rowsResponse.text()
    throw new Error(`Excel rows fetch failed: ${rowsResponse.status} ${errorText}`)
  }

  if (!columnsResponse.ok) {
    const errorText = await columnsResponse.text()
    throw new Error(`Excel columns fetch failed: ${columnsResponse.status} ${errorText}`)
  }

  const rowsPayload = await rowsResponse.json()
  const columnsPayload = await columnsResponse.json()

  const rows = Array.isArray(rowsPayload?.value) ? rowsPayload.value : []
  const columns = Array.isArray(columnsPayload?.value)
    ? columnsPayload.value.map((col: any) => col?.name).filter(Boolean)
    : []

  const rowHashes: Record<string, string> = {}
  rows.forEach((row: any) => {
    const rowId = row?.id || crypto.createHash('sha256').update(JSON.stringify(row?.values || [])).digest('hex')
    const values = Array.isArray(row?.values?.[0]) ? row.values[0] : row?.values
    if (!Array.isArray(values)) return
    const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')
    rowHashes[rowId] = hash
  })

  return { rows, columns, rowHashes }
}

function buildExcelRowData(values: any[] | undefined, columns: string[]) {
  if (!Array.isArray(values) || columns.length === 0) return null
  const rowData: Record<string, any> = {}
  columns.forEach((name, index) => {
    rowData[name] = values[index]
  })
  return rowData
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }

    const supabase = getSupabase()
    const graphAuth = new MicrosoftGraphAuth()
    const roleCache = new Map<string, string>()

    const { data: triggers, error } = await supabase
      .from('trigger_resources')
      .select('id, user_id, workflow_id, trigger_type, config, status')
      .like('trigger_type', 'microsoft_excel_%')
      .eq('status', 'active')

    if (error) {
      logger.error('[Excel Poll] Failed to fetch triggers:', error)
      return errorResponse('Failed to fetch triggers', 500)
    }

    const now = Date.now()
    let processed = 0
    let triggered = 0

    for (const trigger of triggers || []) {
      const config = trigger.config || {}
      const lastPollAt = config.excelPollAt ? new Date(config.excelPollAt).getTime() : 0

      let userRole = roleCache.get(trigger.user_id)
      if (!userRole) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', trigger.user_id)
          .maybeSingle()
        userRole = profile?.role || 'free'
        roleCache.set(trigger.user_id, userRole)
      }

      const pollInterval = ROLE_POLL_INTERVAL_MS[userRole] ?? DEFAULT_POLL_INTERVAL_MS
      if (now - lastPollAt < pollInterval) {
        continue
      }

      if (!config.workbookId || !config.tableName) {
        continue
      }

      processed += 1

      try {
        const accessToken = await graphAuth.getValidAccessToken(trigger.user_id, 'microsoft-excel')
        const snapshot = await fetchExcelTableSnapshot(accessToken, config.workbookId, config.tableName)

        const previousSnapshot = config.excelRowSnapshot as ExcelRowSnapshot | undefined
        const currentSnapshot: ExcelRowSnapshot = {
          rowHashes: snapshot.rowHashes,
          rowCount: snapshot.rows.length,
          updatedAt: new Date().toISOString()
        }

        const newRowId = Object.keys(snapshot.rowHashes)
          .find((rowId) => !previousSnapshot?.rowHashes?.[rowId])
        const hasRowIdDiff = !!newRowId
        const hasCountDiff = previousSnapshot ? currentSnapshot.rowCount > previousSnapshot.rowCount : false
        const changedRowId = Object.keys(snapshot.rowHashes)
          .find((rowId) => previousSnapshot?.rowHashes?.[rowId]
            && previousSnapshot.rowHashes[rowId] !== snapshot.rowHashes[rowId])

        await supabase
          .from('trigger_resources')
          .update({
            config: {
              ...config,
              excelRowSnapshot: currentSnapshot,
              excelPollAt: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', trigger.id)

        if (trigger.trigger_type === 'microsoft_excel_trigger_new_table_row' && (hasRowIdDiff || hasCountDiff)) {
          const newRow = hasRowIdDiff
            ? snapshot.rows.find((row: any) => row?.id === newRowId)
            : snapshot.rows[snapshot.rows.length - 1]
          const values = Array.isArray(newRow?.values?.[0]) ? newRow.values[0] : newRow?.values
          const rowData = buildExcelRowData(values, snapshot.columns)

          const executionPayload = {
            workflowId: trigger.workflow_id,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true,
            inputData: {
              source: 'microsoft-excel-poll',
              triggerType: trigger.trigger_type,
              workbookId: config.workbookId,
              tableName: config.tableName,
              rowId: hasRowIdDiff ? newRowId : newRow?.id || null,
              values,
              rowData,
              columns: snapshot.columns
            }
          }

          const base = getWebhookBaseUrl()
          await fetch(`${base}/api/workflows/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': trigger.user_id
            },
            body: JSON.stringify(executionPayload)
          })
          triggered += 1
        }

        if (trigger.trigger_type === 'microsoft_excel_trigger_updated_row' && changedRowId) {
          const changedRow = snapshot.rows.find((row: any) => row?.id === changedRowId)
          const values = Array.isArray(changedRow?.values?.[0]) ? changedRow.values[0] : changedRow?.values
          const rowData = buildExcelRowData(values, snapshot.columns)

          const executionPayload = {
            workflowId: trigger.workflow_id,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true,
            inputData: {
              source: 'microsoft-excel-poll',
              triggerType: trigger.trigger_type,
              workbookId: config.workbookId,
              tableName: config.tableName,
              rowId: changedRowId,
              values,
              rowData,
              columns: snapshot.columns
            }
          }

          const base = getWebhookBaseUrl()
          await fetch(`${base}/api/workflows/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': trigger.user_id
            },
            body: JSON.stringify(executionPayload)
          })
          triggered += 1
        }
      } catch (pollError) {
        logger.warn('[Excel Poll] Failed to poll trigger', {
          triggerId: trigger.id,
          error: pollError
        })
      }
    }

    return jsonResponse({
      success: true,
      processed,
      triggered,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('[Excel Poll] Error:', error)
    return errorResponse(error.message || 'Excel poll failed', 500)
  }
}

export async function GET() {
  return jsonResponse({
    status: 'healthy',
    service: 'excel-trigger-poll',
    intervalsMs: ROLE_POLL_INTERVAL_MS,
    timestamp: new Date().toISOString()
  })
}
