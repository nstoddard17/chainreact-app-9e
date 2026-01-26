import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'
import { PollingContext, PollingHandler } from '@/lib/triggers/polling'

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

type WorksheetSnapshot = {
  names: string[]
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

async function fetchWorksheetSnapshot(
  accessToken: string,
  workbookId: string,
  worksheetName: string
): Promise<{ rows: any[]; rowHashes: Record<string, string> }> {
  const baseUrl = 'https://graph.microsoft.com/v1.0'
  const encodedName = encodeURIComponent(worksheetName.replace(/'/g, "''"))
  const usedRangeUrl = `${baseUrl}/me/drive/items/${workbookId}/workbook/worksheets('${encodedName}')/usedRange?valuesOnly=true`

  const response = await fetch(usedRangeUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Excel usedRange fetch failed: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const rows = Array.isArray(payload?.values) ? payload.values : []
  const rowHashes: Record<string, string> = {}

  rows.forEach((values: any[], index: number) => {
    if (!Array.isArray(values)) return
    const rowId = `row-${index + 1}`
    const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')
    rowHashes[rowId] = hash
  })

  return { rows, rowHashes }
}

async function fetchWorksheetList(
  accessToken: string,
  workbookId: string
): Promise<WorksheetSnapshot> {
  const baseUrl = 'https://graph.microsoft.com/v1.0'
  const url = `${baseUrl}/me/drive/items/${workbookId}/workbook/worksheets?$select=name`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Excel worksheets fetch failed: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const names = Array.isArray(payload?.value)
    ? payload.value.map((sheet: any) => sheet?.name).filter(Boolean)
    : []

  return { names, updatedAt: new Date().toISOString() }
}

function buildExcelRowData(values: any[] | undefined, columns: string[]) {
  if (!Array.isArray(values) || columns.length === 0) return null
  const rowData: Record<string, any> = {}
  columns.forEach((name, index) => {
    rowData[name] = values[index]
  })
  return rowData
}

function buildRowDataFromHeaders(values: any[] | undefined, headers: any[] | undefined) {
  if (!Array.isArray(values) || !Array.isArray(headers) || headers.length === 0) return null
  const rowData: Record<string, any> = {}
  headers.forEach((name, index) => {
    if (name === undefined || name === null || name === '') return
    rowData[String(name)] = values[index]
  })
  return rowData
}

export const microsoftExcelPollingHandler: PollingHandler = {
  id: 'microsoft-excel',
  canHandle: (trigger) => trigger?.trigger_type?.startsWith('microsoft_excel_'),
  getIntervalMs: (userRole: string) => ROLE_POLL_INTERVAL_MS[userRole] ?? DEFAULT_POLL_INTERVAL_MS,
  poll: async ({ trigger }: PollingContext) => {
    const config = trigger.config || {}
    if (!config.workbookId) return

    const graphAuth = new MicrosoftGraphAuth()
    const accessToken = await graphAuth.getValidAccessToken(trigger.user_id, 'microsoft-excel')

    if (trigger.trigger_type === 'microsoft_excel_trigger_new_worksheet') {
      const worksheetSnapshot = await fetchWorksheetList(accessToken, config.workbookId)
      const previousWorksheetSnapshot = config.excelWorksheetSnapshot as WorksheetSnapshot | undefined

      await getSupabase()
        .from('trigger_resources')
        .update({
          config: {
            ...config,
            excelWorksheetSnapshot: worksheetSnapshot,
            polling: {
              ...(config.polling || {}),
              lastPolledAt: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', trigger.id)

      if (!previousWorksheetSnapshot) {
        return
      }

      const newWorksheet = worksheetSnapshot.names.find(name => !previousWorksheetSnapshot.names.includes(name))
      if (!newWorksheet) {
        return
      }

      const executionPayload = {
        workflowId: trigger.workflow_id,
        testMode: false,
        executionMode: 'live',
        skipTriggers: true,
        inputData: {
          source: 'microsoft-excel-poll',
          triggerType: trigger.trigger_type,
          workbookId: config.workbookId,
          worksheetName: newWorksheet
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
      return
    }

    if (trigger.trigger_type === 'microsoft_excel_trigger_new_table_row' && config.tableName) {
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

      await getSupabase()
        .from('trigger_resources')
        .update({
          config: {
            ...config,
            excelRowSnapshot: currentSnapshot,
            polling: {
              ...(config.polling || {}),
              lastPolledAt: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', trigger.id)

      if (previousSnapshot && (hasRowIdDiff || hasCountDiff)) {
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
      }
      return
    }

    if (config.worksheetName) {
      const worksheetSnapshot = await fetchWorksheetSnapshot(accessToken, config.workbookId, config.worksheetName)
      const previousSnapshot = config.excelRowSnapshot as ExcelRowSnapshot | undefined
      const hasHeaders = config.hasHeaders === true || config.hasHeaders === 'yes'
      const headerRow = hasHeaders ? worksheetSnapshot.rows[0] : null
      const headerOffset = hasHeaders ? 1 : 0
      const dataRowCount = Math.max(worksheetSnapshot.rows.length - headerOffset, 0)
      const currentSnapshot: ExcelRowSnapshot = {
        rowHashes: worksheetSnapshot.rowHashes,
        rowCount: dataRowCount,
        updatedAt: new Date().toISOString()
      }

      const newRowId = Object.keys(worksheetSnapshot.rowHashes)
        .find((rowId) => !previousSnapshot?.rowHashes?.[rowId] && (!hasHeaders || rowId !== 'row-1'))
      const hasRowIdDiff = !!newRowId
      const hasCountDiff = previousSnapshot ? currentSnapshot.rowCount > previousSnapshot.rowCount : false
      const changedRowId = Object.keys(worksheetSnapshot.rowHashes)
        .find((rowId) => (!hasHeaders || rowId !== 'row-1') && previousSnapshot?.rowHashes?.[rowId]
          && previousSnapshot.rowHashes[rowId] !== worksheetSnapshot.rowHashes[rowId])

      await getSupabase()
        .from('trigger_resources')
        .update({
          config: {
            ...config,
            excelRowSnapshot: currentSnapshot,
            polling: {
              ...(config.polling || {}),
              lastPolledAt: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', trigger.id)

      if (trigger.trigger_type === 'microsoft_excel_trigger_new_row' && previousSnapshot && (hasRowIdDiff || hasCountDiff)) {
        const rowIndex = hasRowIdDiff
          ? Number(newRowId?.replace('row-', ''))
          : worksheetSnapshot.rows.length
        if (hasHeaders && rowIndex === 1) {
          return
        }
        const newRow = worksheetSnapshot.rows[rowIndex - 1]
        const values = Array.isArray(newRow) ? newRow : []
        const rowData = buildRowDataFromHeaders(values, headerRow)

        const executionPayload = {
          workflowId: trigger.workflow_id,
          testMode: false,
          executionMode: 'live',
          skipTriggers: true,
          inputData: {
            source: 'microsoft-excel-poll',
            triggerType: trigger.trigger_type,
            workbookId: config.workbookId,
            worksheetName: config.worksheetName,
            rowIndex: rowIndex || null,
            values,
            rowData
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
      }

      if (trigger.trigger_type === 'microsoft_excel_trigger_updated_row' && changedRowId) {
        const rowIndex = Number(changedRowId.replace('row-', ''))
        if (hasHeaders && rowIndex === 1) {
          return
        }
        const updatedRow = worksheetSnapshot.rows[rowIndex - 1]
        const values = Array.isArray(updatedRow) ? updatedRow : []
        const rowData = buildRowDataFromHeaders(values, headerRow)

        const executionPayload = {
          workflowId: trigger.workflow_id,
          testMode: false,
          executionMode: 'live',
          skipTriggers: true,
          inputData: {
            source: 'microsoft-excel-poll',
            triggerType: trigger.trigger_type,
            workbookId: config.workbookId,
            worksheetName: config.worksheetName,
            rowIndex: rowIndex || null,
            values,
            rowData
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
      }
      return
    }

    logger.debug('[Excel Poll] Completed polling', {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id
    })
  }
}
