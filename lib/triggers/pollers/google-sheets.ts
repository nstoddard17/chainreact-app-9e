import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { safeDecrypt } from '@/lib/security/encryption'
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

type GoogleSheetsRowSnapshot = {
  rowHashes: Record<string, string>
  rowCount: number
  updatedAt: string
}

type GoogleSheetsWorksheetSnapshot = {
  sheets: Array<{ sheetId: number; title: string }>
  sheetCount: number
  updatedAt: string
}

/**
 * Get OAuth2 client with valid tokens for Google Sheets API
 */
async function getGoogleSheetsAuth(userId: string): Promise<any> {
  const { data: integration } = await getSupabase()
    .from('integrations')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .or('provider.eq.google-sheets,provider.eq.google')
    .single()

  if (!integration) {
    throw new Error('Google Sheets integration not found')
  }

  const accessToken = typeof integration.access_token === 'string'
    ? safeDecrypt(integration.access_token)
    : null
  const refreshToken = typeof integration.refresh_token === 'string'
    ? safeDecrypt(integration.refresh_token)
    : null

  if (!accessToken) {
    throw new Error('Failed to decrypt Google access token')
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  })

  return oauth2Client
}

/**
 * Fetch all worksheets from a spreadsheet
 */
async function fetchWorksheetList(
  auth: any,
  spreadsheetId: string
): Promise<GoogleSheetsWorksheetSnapshot> {
  const sheets = google.sheets({ version: 'v4', auth })
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false
  })

  const sheetsList = response.data.sheets || []
  const worksheets = sheetsList.map(sheet => ({
    sheetId: sheet.properties?.sheetId || 0,
    title: sheet.properties?.title || ''
  }))

  return {
    sheets: worksheets,
    sheetCount: worksheets.length,
    updatedAt: new Date().toISOString()
  }
}

/**
 * Fetch rows from a specific sheet and compute hashes
 */
async function fetchSheetSnapshot(
  auth: any,
  spreadsheetId: string,
  sheetName: string
): Promise<{ rows: any[][]; rowHashes: Record<string, string> }> {
  const sheets = google.sheets({ version: 'v4', auth })

  // Escape single quotes in sheet name for range notation
  const escapedName = sheetName.replace(/'/g, "''")

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escapedName}'`,
    majorDimension: 'ROWS'
  })

  const rows = response.data.values || []
  const rowHashes: Record<string, string> = {}

  rows.forEach((row: any[], index: number) => {
    if (!Array.isArray(row)) return
    const rowId = `row-${index + 1}`
    const hash = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')
    rowHashes[rowId] = hash
  })

  return { rows, rowHashes }
}

/**
 * Build row data object using header row as keys
 */
function buildRowDataFromHeaders(values: any[] | undefined, headers: any[] | undefined) {
  if (!Array.isArray(values) || !Array.isArray(headers) || headers.length === 0) return null
  const rowData: Record<string, any> = {}
  headers.forEach((name, index) => {
    if (name === undefined || name === null || name === '') return
    rowData[String(name)] = values[index]
  })
  return rowData
}

export const googleSheetsPollingHandler: PollingHandler = {
  id: 'google-sheets',
  canHandle: (trigger) => trigger?.trigger_type?.startsWith('google_sheets_trigger_'),
  getIntervalMs: (userRole: string) => ROLE_POLL_INTERVAL_MS[userRole] ?? DEFAULT_POLL_INTERVAL_MS,
  poll: async ({ trigger }: PollingContext) => {
    const config = trigger.config || {}
    if (!config.spreadsheetId) return

    let auth: any
    try {
      auth = await getGoogleSheetsAuth(trigger.user_id)
    } catch (error) {
      logger.error('[Google Sheets Poll] Failed to get auth', { error, triggerId: trigger.id })
      return
    }

    // Handle new worksheet trigger
    if (trigger.trigger_type === 'google_sheets_trigger_new_worksheet') {
      try {
        const worksheetSnapshot = await fetchWorksheetList(auth, config.spreadsheetId)
        const previousSnapshot = config.googleSheetsWorksheetSnapshot as GoogleSheetsWorksheetSnapshot | undefined

        await getSupabase()
          .from('trigger_resources')
          .update({
            config: {
              ...config,
              googleSheetsWorksheetSnapshot: worksheetSnapshot,
              polling: {
                ...(config.polling || {}),
                lastPolledAt: new Date().toISOString()
              }
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', trigger.id)

        // Skip if no previous snapshot (first poll establishes baseline)
        if (!previousSnapshot) {
          logger.debug('[Google Sheets Poll] First poll - baseline established', { triggerId: trigger.id })
          return
        }

        // Find new worksheets
        const previousTitles = new Set(previousSnapshot.sheets.map(s => s.title))
        const newSheets = worksheetSnapshot.sheets.filter(s => !previousTitles.has(s.title))

        if (newSheets.length === 0) {
          return
        }

        // Trigger workflow for each new sheet
        for (const newSheet of newSheets) {
          const executionPayload = {
            workflowId: trigger.workflow_id,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true,
            inputData: {
              source: 'google-sheets-poll',
              triggerType: trigger.trigger_type,
              spreadsheetId: config.spreadsheetId,
              worksheetId: String(newSheet.sheetId),
              worksheetName: newSheet.title,
              index: worksheetSnapshot.sheets.findIndex(s => s.sheetId === newSheet.sheetId),
              timestamp: new Date().toISOString()
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

          logger.debug('[Google Sheets Poll] Triggered workflow for new worksheet', {
            triggerId: trigger.id,
            worksheetName: newSheet.title
          })
        }
      } catch (error) {
        logger.error('[Google Sheets Poll] Error polling for new worksheets', { error, triggerId: trigger.id })
      }
      return
    }

    // Handle new row and updated row triggers (both require sheetName)
    if (!config.sheetName) {
      logger.debug('[Google Sheets Poll] No sheet name configured, skipping', { triggerId: trigger.id })
      return
    }

    try {
      const { rows, rowHashes } = await fetchSheetSnapshot(auth, config.spreadsheetId, config.sheetName)
      const previousSnapshot = config.googleSheetsRowSnapshot as GoogleSheetsRowSnapshot | undefined

      const hasHeaders = config.hasHeaders !== false // Default to true
      const headerRow = hasHeaders && rows.length > 0 ? rows[0] : null
      const headerOffset = hasHeaders ? 1 : 0
      const dataRowCount = Math.max(rows.length - headerOffset, 0)

      const currentSnapshot: GoogleSheetsRowSnapshot = {
        rowHashes,
        rowCount: dataRowCount,
        updatedAt: new Date().toISOString()
      }

      // Find new rows (row IDs not in previous snapshot)
      const newRowId = Object.keys(rowHashes)
        .find((rowId) => !previousSnapshot?.rowHashes?.[rowId] && (!hasHeaders || rowId !== 'row-1'))
      const hasRowIdDiff = !!newRowId
      const hasCountDiff = previousSnapshot ? currentSnapshot.rowCount > previousSnapshot.rowCount : false

      // Find changed rows (row IDs with different hashes)
      const changedRowId = Object.keys(rowHashes)
        .find((rowId) => (!hasHeaders || rowId !== 'row-1') && previousSnapshot?.rowHashes?.[rowId]
          && previousSnapshot.rowHashes[rowId] !== rowHashes[rowId])

      // Update snapshot in database
      await getSupabase()
        .from('trigger_resources')
        .update({
          config: {
            ...config,
            googleSheetsRowSnapshot: currentSnapshot,
            polling: {
              ...(config.polling || {}),
              lastPolledAt: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', trigger.id)

      // Skip if no previous snapshot (first poll establishes baseline)
      if (!previousSnapshot) {
        logger.debug('[Google Sheets Poll] First poll - baseline established', { triggerId: trigger.id })
        return
      }

      // Handle new row trigger
      if (trigger.trigger_type === 'google_sheets_trigger_new_row' && (hasRowIdDiff || hasCountDiff)) {
        const rowIndex = hasRowIdDiff
          ? Number(newRowId?.replace('row-', ''))
          : rows.length

        // Skip if this is the header row
        if (hasHeaders && rowIndex === 1) {
          return
        }

        const newRow = rows[rowIndex - 1]
        const values = Array.isArray(newRow) ? newRow : []
        const rowData = buildRowDataFromHeaders(values, headerRow)

        const executionPayload = {
          workflowId: trigger.workflow_id,
          testMode: false,
          executionMode: 'live',
          skipTriggers: true,
          inputData: {
            source: 'google-sheets-poll',
            triggerType: trigger.trigger_type,
            spreadsheetId: config.spreadsheetId,
            sheetName: config.sheetName,
            rowNumber: rowIndex,
            values,
            rowData,
            timestamp: new Date().toISOString()
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

        logger.debug('[Google Sheets Poll] Triggered workflow for new row', {
          triggerId: trigger.id,
          rowNumber: rowIndex
        })
      }

      // Handle updated row trigger
      if (trigger.trigger_type === 'google_sheets_trigger_updated_row' && changedRowId) {
        const rowIndex = Number(changedRowId.replace('row-', ''))

        // Skip if this is the header row
        if (hasHeaders && rowIndex === 1) {
          return
        }

        const updatedRow = rows[rowIndex - 1]
        const values = Array.isArray(updatedRow) ? updatedRow : []
        const rowData = buildRowDataFromHeaders(values, headerRow)

        const executionPayload = {
          workflowId: trigger.workflow_id,
          testMode: false,
          executionMode: 'live',
          skipTriggers: true,
          inputData: {
            source: 'google-sheets-poll',
            triggerType: trigger.trigger_type,
            spreadsheetId: config.spreadsheetId,
            sheetName: config.sheetName,
            rowNumber: rowIndex,
            values,
            rowData,
            previousValues: null, // Could store previous values if needed
            timestamp: new Date().toISOString()
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

        logger.debug('[Google Sheets Poll] Triggered workflow for updated row', {
          triggerId: trigger.id,
          rowNumber: rowIndex
        })
      }
    } catch (error) {
      logger.error('[Google Sheets Poll] Error polling for row changes', { error, triggerId: trigger.id })
    }

    logger.debug('[Google Sheets Poll] Completed polling', {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id
    })
  }
}
