import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

/**
 * Trigger-specific metadata for filtering logic
 * Defines which filters apply to each trigger type for easy expansion
 */
interface TriggerFilterConfig {
  supportsFolder: boolean; // Does this trigger support folder filtering?
  supportsSender: boolean; // Does this trigger filter by sender (from)?
  supportsRecipient: boolean; // Does this trigger filter by recipient (to)?
  supportsSubject: boolean; // Does this trigger filter by subject?
  supportsImportance: boolean; // Does this trigger filter by importance?
  supportsAttachment: boolean; // Does this trigger filter by attachment?
  supportsCalendar?: boolean; // Does this trigger filter by calendarId?
  supportsCompanyName?: boolean; // Does this trigger filter by companyName?
  defaultFolder?: string; // Default folder if not specified (e.g., 'inbox', 'sentitems')
}

const TRIGGER_FILTER_CONFIG: Record<string, TriggerFilterConfig> = {
  // New Email trigger - monitors Inbox (or custom folder), filters by sender
  'microsoft-outlook_trigger_new_email': {
    supportsFolder: true,
    supportsSender: true,
    supportsRecipient: false,
    supportsSubject: true,
    supportsImportance: true,
    supportsAttachment: true,
    defaultFolder: 'inbox'
  },
  // Email Sent trigger - monitors Sent Items only, filters by recipient
  'microsoft-outlook_trigger_email_sent': {
    supportsFolder: false, // Subscription already scoped to Sent Items
    supportsSender: false,
    supportsRecipient: true,
    supportsSubject: true,
    supportsImportance: false,
    supportsAttachment: false,
    defaultFolder: 'sentitems'
  },
  // Email Received trigger (alias for new_email)
  'microsoft-outlook_trigger_email_received': {
    supportsFolder: true,
    supportsSender: true,
    supportsRecipient: false,
    supportsSubject: true,
    supportsImportance: true,
    supportsAttachment: true,
    defaultFolder: 'inbox'
  },
  // Email Flagged trigger - monitors flag changes on emails
  'microsoft-outlook_trigger_email_flagged': {
    supportsFolder: true, // Can filter by folder
    supportsSender: false, // Flag changes don't filter by sender
    supportsRecipient: false,
    supportsSubject: false, // No subject filter for flag trigger
    supportsImportance: false,
    supportsAttachment: false,
    defaultFolder: undefined // All folders by default
  },
  // Calendar triggers - filter by calendarId if configured
  'microsoft-outlook_trigger_new_calendar_event': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCalendar: true
  },
  'microsoft-outlook_trigger_updated_calendar_event': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCalendar: true
  },
  'microsoft-outlook_trigger_deleted_calendar_event': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCalendar: true
  },
  'microsoft-outlook_trigger_calendar_event_start': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCalendar: true
  },
  // Contact triggers - filter by companyName if configured
  'microsoft-outlook_trigger_new_contact': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCompanyName: true
  },
  'microsoft-outlook_trigger_updated_contact': {
    supportsFolder: false,
    supportsSender: false,
    supportsRecipient: false,
    supportsSubject: false,
    supportsImportance: false,
    supportsAttachment: false,
    supportsCompanyName: true
  }
}

type ExcelRowSnapshot = {
  rowHashes: Record<string, string>
  rowCount: number
  updatedAt: string
}

type ExcelTableSnapshot = {
  rows: any[]
  columns: string[]
  rowHashes: Record<string, string>
}

async function fetchExcelTableSnapshot(
  accessToken: string,
  workbookId: string,
  tableName: string
): Promise<ExcelTableSnapshot> {
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
    const rowId = row?.id || ''
    const values = Array.isArray(row?.values?.[0]) ? row.values[0] : row?.values
    if (!rowId || !Array.isArray(values)) return
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



function parseGraphDateTime(value: any): Date | null {
  const raw = value?.dateTime
  if (!raw || typeof raw !== 'string') return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function getMinutesBefore(config: any): number {
  const raw = config?.minutesBefore ?? config?.minutes_before
  const parsed = Number.parseInt(String(raw), 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 15
}

function buildCalendarStartPayload(event: any, scheduledFor: string, minutesBefore: number) {
  return {
    trigger: {
      type: 'microsoft-outlook_trigger_calendar_event_start',
      eventId: event?.id,
      subject: event?.subject || '',
      start: event?.start || null,
      end: event?.end || null,
      location: event?.location || null,
      organizer: event?.organizer || null,
      scheduledFor,
      minutesBefore,
    },
    event,
    scheduledFor,
    minutesBefore,
  }
}

async function upsertScheduledTrigger(
  workflowId: string,
  userId: string,
  nodeId: string | null,
  eventId: string,
  scheduledFor: string,
  payload: any
): Promise<void> {
  await getSupabase()
    .from('workflows_schedules')
    .upsert({
      workflow_id: workflowId,
      revision_id: null,
      workspace_id: null,
      cron_expression: 'event',
      timezone: 'UTC',
      enabled: true,
      last_run_at: null,
      next_run_at: scheduledFor,
      created_by: userId,
      trigger_type: 'microsoft-outlook_trigger_calendar_event_start',
      provider_id: 'microsoft-outlook',
      node_id: nodeId,
      event_id: eventId,
      scheduled_for: scheduledFor,
      status: 'pending',
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'workflow_id,node_id,trigger_type,event_id' })
}

async function cancelScheduledTrigger(
  workflowId: string,
  nodeId: string | null,
  eventId: string
): Promise<void> {
  await getSupabase()
    .from('workflows_schedules')
    .update({ status: 'cancelled', enabled: false, updated_at: new Date().toISOString() })
    .eq('workflow_id', workflowId)
    .eq('trigger_type', 'microsoft-outlook_trigger_calendar_event_start')
    .eq('event_id', eventId)
    .eq('node_id', nodeId)
}
// Helper function - hoisted above POST handler to avoid TDZ
// SECURITY: Logs webhook metadata only, not full payload (contains PII)
async function logWebhookExecution(
  provider: string,
  payload: any,
  headers: any,
  status: string,
  executionTime: number
): Promise<void> {
  try {
    // Don't log full payload - contains PII and resource IDs
    const safePayload = {
      hasValue: !!payload?.value,
      notificationCount: Array.isArray(payload?.value) ? payload.value.length : 0,
      payloadKeys: payload ? Object.keys(payload) : []
    }

    await getSupabase()
      .from('webhook_logs')
      .insert({
        provider: provider,
        payload: safePayload, // Sanitized payload
        headers: { 'content-type': headers['content-type'] }, // Only log content type
        status: status,
        execution_time: executionTime,
        timestamp: new Date().toISOString()
      })
  } catch (error) {
    logger.error('Failed to log webhook execution:', error)
  }
}

// Helper function - process notifications async
async function processNotifications(
  notifications: any[],
  headers: any,
  requestId: string | undefined
): Promise<void> {
  for (const change of notifications) {
    try {
      // SECURITY: Don't log full resource data (contains PII/IDs)
      logger.debug('🔍 Processing notification:', {
        subscriptionId: change?.subscriptionId,
        changeType: change?.changeType,
        resourceType: change?.resourceData?.['@odata.type'],
        hasResource: !!change?.resource,
        hasClientState: !!change?.clientState
      })
      const subId: string | undefined = change?.subscriptionId
      const changeType: string | undefined = change?.changeType
      const resource: string | undefined = change?.resource
      const bodyClientState: string | undefined = change?.clientState

      // Resolve user and verify clientState from trigger_resources
      let userId: string | null = null
      let workflowId: string | null = null
      let triggerResourceId: string | null = null
      let triggerNodeId: string | null = null
      let configuredChangeType: string | null = null
      let triggerConfig: any = null
      let triggerType: string | null = null
      if (subId) {
        logger.debug('🔍 Looking up subscription:', subId)

        const { data: triggerResource, error: resourceError } = await getSupabase()
          .from('trigger_resources')
          .select('id, user_id, workflow_id, trigger_type, node_id, config')
          .eq('external_id', subId)
          .eq('resource_type', 'subscription')
          .like('provider_id', 'microsoft%')
          .maybeSingle()

        if (!triggerResource) {
          logger.warn('⚠️ Subscription not found in trigger_resources (likely old/orphaned subscription):', {
            subId,
            message: 'This subscription is not tracked in trigger_resources. Deactivate/reactivate workflow to clean up.'
          })
          continue
        }

        userId = triggerResource.user_id
        workflowId = triggerResource.workflow_id
        triggerResourceId = triggerResource.id
        triggerNodeId = triggerResource.node_id || null
        triggerType = triggerResource.trigger_type
        configuredChangeType = triggerResource.config?.changeType || null
        triggerConfig = triggerResource.config || null

        // Verify clientState if present
        if (bodyClientState && triggerResource.config?.clientState) {
          if (bodyClientState !== triggerResource.config.clientState) {
            logger.warn('⚠️ Invalid clientState for notification, skipping', {
              subId,
              expected: triggerResource.config.clientState,
              received: bodyClientState
            })
            continue
          }
        }

        logger.debug('✅ Resolved from trigger_resources:', {
          subscriptionId: subId,
          userId,
          workflowId,
          triggerResourceId,
          triggerType,
          // Log trigger config fields for debugging filters
          triggerConfigKeys: triggerConfig ? Object.keys(triggerConfig) : [],
          triggerConfigTo: triggerConfig?.to || null,
          triggerConfigFrom: triggerConfig?.from || null,
          triggerConfigSubject: triggerConfig?.subject || null
        })
      }

      // Enhanced dedup per notification - use message/resource ID to prevent duplicate processing across multiple subscriptions
      const messageId = change?.resourceData?.id || change?.resourceData?.['@odata.id'] || resource || 'unknown'

      // For email notifications (messages), ignore changeType in dedup key because Microsoft sends both 'created' and 'updated'
      // For other resources, include changeType to allow separate processing
      const resourceLower = resource?.toLowerCase() || ''
      const isEmailNotification = resourceLower.includes('/messages') || resourceLower.includes('/mailfolders')
      const dedupKey = isEmailNotification
        ? `${userId || 'unknown'}:${messageId}` // Email: ignore changeType (created+updated are duplicates)
        : `${userId || 'unknown'}:${messageId}:${changeType || 'unknown'}` // Other: include changeType

      logger.debug('🔑 Deduplication check:', {
        dedupKey,
        messageId,
        changeType,
        isEmailNotification,
        resource,
        subscriptionId: subId,
        userId
      })

      // Try to insert dedup key - if it fails due to unique constraint, it's a duplicate
      const { error: dedupError } = await getSupabase()
        .from('microsoft_webhook_dedup')
        .insert({ dedup_key: dedupKey })

      if (dedupError) {
        // Duplicate key violation (unique constraint) or other error
        if (dedupError.code === '23505') {
          // PostgreSQL unique violation error code
          logger.debug('⏭️ Skipping duplicate notification (already processed):', {
            dedupKey,
            messageId,
            subscriptionId: subId
          })
          continue
        } else {
          // Other error, log but continue processing
          logger.warn('⚠️ Deduplication insert error (continuing anyway):', dedupError)
        }
      }

      // Check if this changeType should trigger the workflow
      // Get the expected changeTypes from trigger config
      if (configuredChangeType && changeType) {
        const allowedTypes = configuredChangeType.split(',').map((t: string) => t.trim())

        if (!allowedTypes.includes(changeType)) {
          logger.debug('⏭️ Skipping notification - changeType not configured:', {
            received: changeType,
            configured: configuredChangeType,
            subscriptionId: subId
          })
          continue
        }
      }

      // Microsoft Excel triggers: only process changes for the configured workbook
      if (triggerType?.startsWith('microsoft_excel_') && triggerConfig?.workbookId) {
        const changedItemId = change?.resourceData?.id
        if (changedItemId && changedItemId !== triggerConfig.workbookId) {
          logger.debug('[Microsoft Excel] Skipping notification - workbook mismatch', {
            changedItemId,
            expectedWorkbookId: triggerConfig.workbookId,
            subscriptionId: subId
          })
          continue
        }
      }

      if (triggerType?.startsWith('microsoft_excel_') && triggerConfig?.workbookId && triggerConfig?.tableName && userId) {
        try {
          logger.info('[Microsoft Excel] Processing file-change notification', {
            subscriptionId: subId,
            triggerType,
            workbookId: triggerConfig.workbookId,
            tableName: triggerConfig.tableName,
            resourceDataId: change?.resourceData?.id
          })
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-excel')

          const snapshot = await fetchExcelTableSnapshot(
            accessToken,
            triggerConfig.workbookId,
            triggerConfig.tableName
          )

          const previousSnapshot = triggerConfig.excelRowSnapshot as ExcelRowSnapshot | undefined
          const currentSnapshot: ExcelRowSnapshot = {
            rowHashes: snapshot.rowHashes,
            rowCount: snapshot.rows.length,
            updatedAt: new Date().toISOString()
          }

          if (!previousSnapshot) {
            logger.info('[Microsoft Excel] Seeding snapshot (no previous snapshot)', {
              rowCount: currentSnapshot.rowCount
            })
            if (triggerResourceId) {
              await getSupabase()
                .from('trigger_resources')
                .update({
                  config: {
                    ...triggerConfig,
                    excelRowSnapshot: currentSnapshot
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', triggerResourceId)
            }
            continue
          }

          const newRowId = Object.keys(snapshot.rowHashes)
            .find((rowId) => !previousSnapshot?.rowHashes?.[rowId])
          const changedRowId = Object.keys(snapshot.rowHashes)
            .find((rowId) => previousSnapshot?.rowHashes?.[rowId]
              && previousSnapshot.rowHashes[rowId] !== snapshot.rowHashes[rowId])

          logger.info('[Microsoft Excel] Snapshot diff results', {
            newRowId: newRowId || null,
            changedRowId: changedRowId || null,
            previousRowCount: previousSnapshot.rowCount,
            currentRowCount: currentSnapshot.rowCount
          })

          if (triggerResourceId) {
            await getSupabase()
              .from('trigger_resources')
              .update({
                config: {
                  ...triggerConfig,
                  excelRowSnapshot: currentSnapshot
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', triggerResourceId)
          }

          if (triggerType === 'microsoft_excel_trigger_new_table_row' && newRowId) {
            const newRow = snapshot.rows.find((row: any) => row?.id === newRowId)
            const values = Array.isArray(newRow?.values?.[0]) ? newRow.values[0] : newRow?.values
            const rowData = buildExcelRowData(values, snapshot.columns)

            if (workflowId) {
              const base = getWebhookBaseUrl()
              const executionUrl = `${base}/api/workflows/execute`

              const executionPayload = {
                workflowId,
                testMode: false,
                executionMode: 'live',
                skipTriggers: true,
                inputData: {
                  source: 'microsoft-excel-file-change',
                  subscriptionId: subId,
                  triggerType,
                  workbookId: triggerConfig.workbookId,
                  tableName: triggerConfig.tableName,
                  rowId: newRowId,
                  values,
                  rowData,
                  columns: snapshot.columns
                }
              }

              logger.debug('[Microsoft Excel] Triggering workflow execution:', executionUrl)

              const response = await fetch(executionUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': userId
                },
                body: JSON.stringify(executionPayload)
              })

              if (!response.ok) {
                const errorText = await response.text()
                logger.error('[Microsoft Excel] Workflow execution failed:', {
                  status: response.status,
                  error: errorText
                })
              }
            }
            continue
          }

          if (triggerType === 'microsoft_excel_trigger_updated_row' && changedRowId) {
            const changedRow = snapshot.rows.find((row: any) => row?.id === changedRowId)
            const values = Array.isArray(changedRow?.values?.[0]) ? changedRow.values[0] : changedRow?.values
            const rowData = buildExcelRowData(values, snapshot.columns)

            if (workflowId) {
              const base = getWebhookBaseUrl()
              const executionUrl = `${base}/api/workflows/execute`

              const executionPayload = {
                workflowId,
                testMode: false,
                executionMode: 'live',
                skipTriggers: true,
                inputData: {
                  source: 'microsoft-excel-file-change',
                  subscriptionId: subId,
                  triggerType,
                  workbookId: triggerConfig.workbookId,
                  tableName: triggerConfig.tableName,
                  rowId: changedRowId,
                  values,
                  rowData,
                  columns: snapshot.columns
                }
              }

              logger.debug('[Microsoft Excel] Triggering workflow execution:', executionUrl)

              const response = await fetch(executionUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': userId
                },
                body: JSON.stringify(executionPayload)
              })

              if (!response.ok) {
                const errorText = await response.text()
                logger.error('[Microsoft Excel] Workflow execution failed:', {
                  status: response.status,
                  error: errorText
                })
              }
            }
            continue
          }
        } catch (excelError) {
          logger.warn('[Microsoft Excel] Failed to process table change', excelError)
        }
      }

      if (triggerType?.startsWith('microsoft_excel_')) {
        continue
      }

      // OneNote triggers (use OneDrive change notifications as a signal)
      if (triggerType?.startsWith('microsoft-onenote_') && userId) {
        const onenoteData = await fetchLatestOneNotePage(
          userId,
          triggerConfig?.notebookId || null,
          triggerConfig?.sectionId || null,
          triggerType
        )

        if (!onenoteData) {
          logger.debug('Skipping OneNote notification - no matching recent page:', {
            subscriptionId: subId
          })
          continue
        }

        // Trigger workflow execution directly (no queue needed)
        if (workflowId) {
          const base = getWebhookBaseUrl()
          const executionUrl = `${base}/api/workflows/execute`

          const executionPayload = {
            workflowId,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true,
            inputData: {
              source: 'microsoft-graph-onenote',
              subscriptionId: subId,
              triggerType,
              onenote: onenoteData
            }
          }

          logger.debug('Calling execution API for OneNote trigger:', executionUrl)

          const response = await fetch(executionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId
            },
            body: JSON.stringify(executionPayload)
          })

          if (!response.ok) {
            const errorText = await response.text()
            logger.error('OneNote workflow execution failed:', {
              status: response.status,
              error: errorText
            })
          }
        } else {
          logger.warn('Cannot trigger OneNote workflow - missing workflowId')
        }

        continue
      }

      // OneDrive triggers (file created/modified)
      logger.debug('🔍 Checking OneDrive trigger conditions:', {
        triggerType,
        startsWithOneDrive: triggerType?.startsWith('onedrive_'),
        userId: !!userId,
        changeType,
        resource,
        resourceDataId: change?.resourceData?.id
      })

      if (triggerType?.startsWith('onedrive_') && userId) {
        logger.debug('✅ OneDrive trigger detected, fetching item data...')
        const onedriveData = await fetchOneDriveItemData(
          userId,
          change?.resourceData?.id || null,
          triggerConfig,
          triggerType,
          changeType || 'updated'
        )

        if (!onedriveData) {
          logger.debug('Skipping OneDrive notification - no matching item or filtered out:', {
            subscriptionId: subId,
            triggerType,
            changeType
          })
          continue
        }

        // Trigger workflow execution directly
        if (workflowId) {
          const base = getWebhookBaseUrl()
          const executionUrl = `${base}/api/workflows/execute`

          const executionPayload = {
            workflowId,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true,
            inputData: {
              source: 'microsoft-graph-onedrive',
              subscriptionId: subId,
              triggerType,
              changeType,
              onedrive: onedriveData
            }
          }

          logger.debug('Calling execution API for OneDrive trigger:', executionUrl)

          const response = await fetch(executionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId
            },
            body: JSON.stringify(executionPayload)
          })

          if (!response.ok) {
            const errorText = await response.text()
            logger.error('OneDrive workflow execution failed:', {
              status: response.status,
              error: errorText
            })
          }
        } else {
          logger.warn('Cannot trigger OneDrive workflow - missing workflowId')
        }

        continue
      }

      // For Teams channel message triggers, fetch the actual message data
      const isTeamsMessageTrigger = resourceLower.includes('/teams/') && resourceLower.includes('/channels/') && resourceLower.includes('/messages')
      if (isTeamsMessageTrigger && userId && triggerConfig) {
        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()

          // Get access token for this user
          const accessToken = await graphAuth.getValidAccessToken(userId, 'teams')

          // Extract message ID from resource or resourceData
          const messageId = change?.resourceData?.id

          if (messageId && triggerConfig.teamId && triggerConfig.channelId) {
            // Fetch the actual Teams message to get full content
            const messageResponse = await fetch(
              `https://graph.microsoft.com/v1.0/teams/${triggerConfig.teamId}/channels/${triggerConfig.channelId}/messages/${messageId}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            )

            if (messageResponse.ok) {
              const message = await messageResponse.json()

              logger.debug('✅ Fetched full Teams message data')

              // Update the resourceData with the full message
              change.resourceData = {
                ...change.resourceData,
                ...message,
                // Add our standard fields
                messageId: message.id,
                content: message.body?.content || '',
                senderId: message.from?.user?.id || '',
                senderName: message.from?.user?.displayName || '',
                channelId: triggerConfig.channelId,
                teamId: triggerConfig.teamId,
                timestamp: message.createdDateTime,
                attachments: message.attachments || []
              }
            } else {
              logger.warn('⚠️ Failed to fetch Teams message details, using notification data only:', messageResponse.status)
            }
          }
        } catch (teamsError) {
          logger.error('❌ Error fetching Teams message data (allowing execution with notification data):', teamsError)
          // Continue to execute even if full message fetch fails
        }
      }

      // For Outlook email triggers, fetch the actual email and check filters before triggering
      const isOutlookEmailTrigger = resourceLower.includes('/messages') && !isTeamsMessageTrigger
      if (isOutlookEmailTrigger && userId && triggerConfig) {
        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()

          // Get access token for this user
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

          // Extract message ID from resource
          const messageId = change?.resourceData?.id

          if (!messageId) {
            logger.warn('⚠️ No messageId in webhook payload, skipping execution')
            continue
          }

          // Fetch the actual email to check filters
          const emailResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          if (!emailResponse.ok) {
            logger.warn('⚠️ Failed to fetch email for filtering, skipping execution:', emailResponse.status)
            continue
          }

          const email = await emailResponse.json()

          // Get trigger-specific filter configuration
          const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

          // Debug log: Show what filters we're checking
          logger.debug('🔍 Filter check details:', {
                triggerType,
                hasFilterConfig: !!filterConfig,
                filterConfigDetails: filterConfig ? {
                  supportsSender: filterConfig.supportsSender,
                  supportsRecipient: filterConfig.supportsRecipient,
                  supportsSubject: filterConfig.supportsSubject,
                  supportsAttachment: filterConfig.supportsAttachment
                } : null,
                configuredFilters: {
                  from: triggerConfig.from || null,
                  to: triggerConfig.to || null,  // IMPORTANT: Check recipient filter for email_sent
                  subject: triggerConfig.subject || null,
                  subjectExactMatch: triggerConfig.subjectExactMatch,
                  hasAttachment: triggerConfig.hasAttachment || null,
                  importance: triggerConfig.importance || null,
                  folder: triggerConfig.folder || null
                },
                emailDetails: {
                  from: email.from?.emailAddress?.address || 'unknown',
                  toRecipientCount: (email.toRecipients || []).length,
                  toRecipients: (email.toRecipients || []).map((r: any) => r.emailAddress?.address || 'unknown'),
                  subjectLength: (email.subject || '').length,
                  hasAttachments: email.hasAttachments,
                  importance: email.importance,
                  parentFolderId: email.parentFolderId
                },
                subscriptionId: subId
              })

              if (!filterConfig) {
                logger.warn(`⚠️ Unknown trigger type: ${triggerType}, allowing all filters`)
              }

              // Check folder filter (only for triggers that support folder filtering)
              if (filterConfig?.supportsFolder && email.parentFolderId) {
                let configFolderId = triggerConfig.folder

                // If no folder configured, use default from trigger config
                if (!configFolderId && filterConfig.defaultFolder) {
                  try {
                    const foldersResponse = await fetch(
                      'https://graph.microsoft.com/v1.0/me/mailFolders',
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json'
                        }
                      }
                    )

                    if (foldersResponse.ok) {
                      const folders = await foldersResponse.json()
                      const inboxFolder = folders.value.find((f: any) =>
                        f.displayName?.toLowerCase() === 'inbox'
                      )
                      configFolderId = inboxFolder?.id || null
                    }
                  } catch (folderError) {
                    logger.warn('⚠️ Failed to get Inbox folder ID, allowing all folders:', folderError)
                  }
                }

                // Check if current email is in the configured folder
                if (configFolderId && email.parentFolderId !== configFolderId) {
                  try {
                    const folderResponse = await fetch(
                      `https://graph.microsoft.com/v1.0/me/mailFolders/${email.parentFolderId}`,
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json'
                        }
                      }
                    )

                    const folderName = folderResponse.ok
                      ? (await folderResponse.json()).displayName
                      : email.parentFolderId

                    logger.debug('⏭️ Skipping email - not in configured folder:', {
                      expectedFolderId: configFolderId,
                      actualFolderId: email.parentFolderId,
                      actualFolderName: folderName,
                      subscriptionId: subId
                    })
                  } catch (folderError) {
                    logger.debug('⏭️ Skipping email - not in configured folder:', {
                      expectedFolderId: configFolderId,
                      actualFolderId: email.parentFolderId,
                      subscriptionId: subId
                    })
                  }
                  continue
                }
              }

              // Check subject filter (if trigger supports it)
              const configSubjectRaw = typeof triggerConfig.subject === 'string'
                ? triggerConfig.subject.trim()
                : ''
              if (filterConfig?.supportsSubject && configSubjectRaw) {
                const configSubject = configSubjectRaw.toLowerCase()
                const emailSubject = (email.subject || '').toLowerCase().trim()
                const exactMatch = triggerConfig.subjectExactMatch !== false // Default to true

                const isMatch = exactMatch
                  ? emailSubject === configSubject
                  : emailSubject.includes(configSubject)

                if (!isMatch) {
                  // SECURITY: Don't log actual subject content (PII)
                  logger.debug('⏭️ Skipping email - subject does not match filter:', {
                    expectedLength: configSubject.length,
                    receivedLength: emailSubject.length,
                    exactMatch,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check from filter (sender) - if trigger supports it
              if (filterConfig?.supportsSender && triggerConfig.from) {
                const configFrom = triggerConfig.from.toLowerCase().trim()
                const emailFrom = email.from?.emailAddress?.address?.toLowerCase().trim() || ''

                if (emailFrom !== configFrom) {
                  // SECURITY: Don't log actual email addresses (PII)
                  logger.debug('⏭️ Skipping email - from address does not match filter:', {
                    hasExpected: !!configFrom,
                    hasReceived: !!emailFrom,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check to filter (recipient) - if trigger supports it
              if (filterConfig?.supportsRecipient && triggerConfig.to) {
                const configToList = triggerConfig.to
                  .split(/[;,]/)
                  .map((value: string) => value.toLowerCase().trim())
                  .filter(Boolean)
                const emailTo = email.toRecipients?.map((r: any) => r.emailAddress?.address?.toLowerCase().trim()) || []

                logger.debug('dY"? Checking recipient filter:', {
                  configTo: configToList,
                  emailTo,
                  supportsRecipient: filterConfig.supportsRecipient,
                  subscriptionId: subId
                })

                const hasMatch = configToList.some((configTo: string) =>
                  emailTo.some((addr: string) => addr === configTo)
                )

                if (!hasMatch) {
                  logger.debug('??-?,? Skipping email - to address does not match filter:', {
                    configTo: configToList,
                    emailTo,
                    hasMatch,
                    subscriptionId: subId
                  })
                  continue
                }
                logger.debug('?o. Recipient filter passed')
              } else {
                logger.debug('⏭️ Recipient filter not applicable:', {
                  supportsRecipient: filterConfig?.supportsRecipient,
                  hasToConfig: !!triggerConfig.to,
                  triggerType,
                  subscriptionId: subId
                })
              }

              // Check importance filter (if trigger supports it)
              if (filterConfig?.supportsImportance && triggerConfig.importance && triggerConfig.importance !== 'any') {
                const configImportance = triggerConfig.importance.toLowerCase()
                const emailImportance = (email.importance || 'normal').toLowerCase()

                if (emailImportance !== configImportance) {
                  logger.debug('⏭️ Skipping email - importance does not match filter:', {
                    expected: configImportance,
                    received: emailImportance,
                    subscriptionId: subId
                  })
                  continue
                }
              }

              // Check flagged filter for email_flagged trigger
              if (triggerType === 'microsoft-outlook_trigger_email_flagged') {
                const flagStatus = email.flag?.flagStatus || 'notFlagged'
                // Only trigger if the email is now flagged
                if (flagStatus !== 'flagged' && flagStatus !== 'complete') {
                  logger.debug('⏭️ Skipping email - not flagged:', {
                    flagStatus,
                    subscriptionId: subId
                  })
                  continue
                }
              }

                // Check file extension filter if configured
                if (triggerConfig.fileExtension && email.attachments?.length > 0) {
                  const allowedExtensions = triggerConfig.fileExtension
                    .split(',')
                    .map((ext: string) => ext.trim().toLowerCase().replace('.', ''))

                  const hasMatchingAttachment = email.attachments.some((attachment: any) => {
                    const fileName = attachment.name || ''
                    const extension = fileName.split('.').pop()?.toLowerCase() || ''
                    return allowedExtensions.includes(extension)
                  })

                  if (!hasMatchingAttachment) {
                    logger.debug('⏭️ Skipping email - no matching attachment extensions:', {
                      allowedExtensions,
                      attachmentCount: email.attachments.length,
                      subscriptionId: subId
                    })
                    continue
                  }
                }

              // Check hasAttachment filter for general email triggers
              if (filterConfig?.supportsAttachment && triggerConfig.hasAttachment && triggerConfig.hasAttachment !== 'any') {
                const expectsAttachment = triggerConfig.hasAttachment === 'yes'
                const hasAttachment = email.hasAttachments === true

                if (expectsAttachment !== hasAttachment) {
                  logger.debug('⏭️ Skipping email - attachment filter mismatch:', {
                    expected: expectsAttachment ? 'has attachment' : 'no attachment',
                    actual: hasAttachment ? 'has attachment' : 'no attachment',
                    subscriptionId: subId
                  })
                  continue
                }
              }

              logger.debug('✅ Email matches all filters, proceeding with workflow execution')
        } catch (filterError) {
          logger.error('❌ Error checking email filters, skipping execution:', filterError)
          continue
        }
      }

      const isCalendarTrigger = resourceLower.includes('/events') && !resourceLower.includes('/messages')
      // Calendar event start trigger - schedule delayed execution
      if (isCalendarTrigger && triggerType === 'microsoft-outlook_trigger_calendar_event_start' && userId && triggerConfig) {
        const eventId = change?.resourceData?.id

        if (!workflowId) {
          logger.warn('?s??,? Calendar start trigger missing workflowId, skipping')
          continue
        }

        if (!eventId) {
          logger.warn('?s??,? Calendar start trigger missing eventId, skipping')
          continue
        }

        if (changeType === 'deleted') {
          await cancelScheduledTrigger(workflowId, triggerNodeId, eventId)
          logger.debug('?o. Cancelled scheduled calendar start trigger (event deleted)', {
            workflowId,
            eventId,
            subscriptionId: subId
          })
          continue
        }

        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

          const eventResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/events/${eventId}?$select=id,subject,start,end,calendar,organizer,location`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          if (!eventResponse.ok) {
            logger.warn('?s??,? Failed to fetch calendar event details, skipping schedule:', eventResponse.status)
            continue
          }

          const event = await eventResponse.json()

          // Apply calendar filter if configured
          if (triggerConfig.calendarId) {
            const eventCalendarId = event.calendar?.id || resource?.match(/\/calendars\/([^\/]+)\//)?.[1]
            if (eventCalendarId && eventCalendarId !== triggerConfig.calendarId) {
              await cancelScheduledTrigger(workflowId, triggerNodeId, eventId)
              logger.debug('??-?,? Calendar start trigger skipped - not in configured calendar:', {
                expected: triggerConfig.calendarId,
                actual: eventCalendarId,
                subscriptionId: subId
              })
              continue
            }
          }

          const startTime = parseGraphDateTime(event.start)
          if (!startTime) {
            logger.warn('?s??,? Calendar start trigger missing start time, skipping')
            continue
          }

          const minutesBefore = getMinutesBefore(triggerConfig)
          const scheduledFor = new Date(startTime.getTime() - minutesBefore * 60 * 1000).toISOString()
          const payload = buildCalendarStartPayload(event, scheduledFor, minutesBefore)

          await upsertScheduledTrigger(workflowId, userId, triggerNodeId, eventId, scheduledFor, payload)

          logger.debug('?o. Scheduled calendar event start trigger', {
            workflowId,
            eventId,
            scheduledFor,
            minutesBefore
          })
        } catch (calendarScheduleError) {
          logger.error('??O Error scheduling calendar start trigger:', calendarScheduleError)
        }

        continue
      }

      // For Outlook calendar triggers, check calendar filter if configured
      if (isCalendarTrigger && userId && triggerConfig) {
        const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

        // Check calendar filter if configured
        if (filterConfig?.supportsCalendar && triggerConfig.calendarId) {
          const eventId = change?.resourceData?.id

          if (eventId) {
            try {
              const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
              const graphAuth = new MicrosoftGraphAuth()
              const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

              // Fetch the event to get its calendar information
              // The event's calendar can be determined from the resource path in the subscription
              // or by fetching the event and checking which calendar it belongs to
              const eventResponse = await fetch(
                `https://graph.microsoft.com/v1.0/me/events/${eventId}?$select=id,subject,calendar`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              )

              if (eventResponse.ok) {
                const event = await eventResponse.json()
                // The calendar property contains the calendar's ID
                const eventCalendarId = event.calendar?.id ||
                  // Fallback: try to extract from resource path
                  resource?.match(/\/calendars\/([^\/]+)\//)?.[1]

                if (eventCalendarId && eventCalendarId !== triggerConfig.calendarId) {
                  logger.debug('⏭️ Skipping calendar event - not in configured calendar:', {
                    expected: triggerConfig.calendarId,
                    actual: eventCalendarId,
                    subscriptionId: subId
                  })
                  continue
                }

                logger.debug('✅ Calendar event matches filter (or no calendar filter set)')
              } else {
                logger.warn('⚠️ Failed to fetch calendar event details for filtering, allowing execution:', eventResponse.status)
              }
            } catch (calendarFilterError) {
              logger.error('❌ Error checking calendar filters (allowing execution):', calendarFilterError)
              // Continue to execute even if filter check fails
            }
          }
        }
      }

      // For Outlook contact triggers, check company name filter if configured
      const isContactTrigger = resourceLower.includes('/contacts')
      if (isContactTrigger && userId && triggerConfig) {
        const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

        // Check company name filter if configured
        if (filterConfig?.supportsCompanyName && triggerConfig.companyName) {
          const contactId = change?.resourceData?.id

          if (contactId) {
            try {
              const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
              const graphAuth = new MicrosoftGraphAuth()
              const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

              // Fetch contact to get company name
              const contactResponse = await fetch(
                `https://graph.microsoft.com/v1.0/me/contacts/${contactId}`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              )

              if (contactResponse.ok) {
                const contact = await contactResponse.json()
                const configCompany = triggerConfig.companyName.toLowerCase().trim()
                const contactCompany = (contact.companyName || '').toLowerCase().trim()

                // Use "contains" matching for flexibility
                if (!contactCompany.includes(configCompany)) {
                  logger.debug('⏭️ Skipping contact - company name does not match filter:', {
                    hasExpected: !!configCompany,
                    hasActual: !!contactCompany,
                    subscriptionId: subId
                  })
                  continue
                }

                logger.debug('✅ Contact matches company name filter')
              } else {
                logger.warn('⚠️ Failed to fetch contact details for filtering, allowing execution:', contactResponse.status)
              }
            } catch (contactFilterError) {
              logger.error('❌ Error checking contact filters (allowing execution):', contactFilterError)
              // Continue to execute even if filter check fails
            }
          }
        }
      }

      // Trigger workflow execution directly (no queue needed)
      if (workflowId && userId) {
        // Check if there's an active test session for this workflow
        // If so, skip production execution - the test webhook handler will handle it
        const { data: activeTestSession } = await getSupabase()
          .from('workflow_test_sessions')
          .select('id, status')
          .eq('workflow_id', workflowId)
          .eq('status', 'listening')
          .maybeSingle()

        if (activeTestSession) {
          logger.debug('⏭️ Skipping production execution - active test session exists:', {
            workflowId,
            testSessionId: activeTestSession.id,
            subscriptionId: subId
          })
          continue
        }

        logger.debug('🚀 Triggering workflow execution:', {
          workflowId,
          userId,
          subscriptionId: subId,
          resource,
          changeType
        })

        try {
          // Trigger workflow via workflow execution API
          const base = getWebhookBaseUrl()
          const executionUrl = `${base}/api/workflows/execute`

          const executionPayload = {
            workflowId,
            testMode: false,
            executionMode: 'live',
            skipTriggers: true, // Already triggered by webhook
            inputData: {
              source: 'microsoft-graph-webhook',
              subscriptionId: subId,
              resource,
              changeType,
              resourceData: change?.resourceData,
              notificationPayload: change
            }
          }

          logger.debug('📤 Calling execution API:', executionUrl)
          // SECURITY: Don't log full execution payload (contains resource data/PII)
          logger.debug('📦 Execution payload metadata:', {
            workflowId: executionPayload.workflowId,
            testMode: executionPayload.testMode,
            executionMode: executionPayload.executionMode,
            skipTriggers: executionPayload.skipTriggers,
            hasInputData: !!executionPayload.inputData
          })

          const response = await fetch(executionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId // Pass user context
            },
            body: JSON.stringify(executionPayload)
          })

          if (response.ok) {
            const result = await response.json()
            logger.debug('✅ Workflow execution triggered:', {
              workflowId,
              executionId: result?.executionId,
              status: result?.status
            })
          } else {
            const errorText = await response.text()
            logger.error('❌ Workflow execution failed:', {
              status: response.status,
              error: errorText
            })
          }
        } catch (execError) {
          logger.error('❌ Error triggering workflow:', execError)
        }
      } else {
        logger.warn('⚠️ Cannot trigger workflow - missing workflowId or userId')
      }
    } catch (error) {
      logger.error('❌ Error processing individual notification:', error)
    }
  }

  logger.debug('✅ All notifications processed')
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
    const testSessionId = url.searchParams.get('testSessionId')
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    const isTestMode = !!testSessionId
    const modeLabel = isTestMode ? '🧪 TEST' : '📥'

    logger.info(`${modeLabel} Microsoft Graph webhook received:`, {
      headers: Object.keys(headers),
      bodyLength: body.length,
      testSessionId: testSessionId || null,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft (either via validationToken query or text/plain body)
    if (validationToken || headers['content-type']?.includes('text/plain')) {
      const token = validationToken || body
      logger.debug(`🔍 Validation request received${isTestMode ? ' (TEST MODE)' : ''}`)
      return new NextResponse(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Handle empty body (some Microsoft notifications are empty)
    if (!body || body.length === 0) {
      logger.debug('⚠️ Empty webhook payload received, skipping')
      return jsonResponse({ success: true, empty: true })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      logger.error('❌ Failed to parse webhook payload:', error)
      return errorResponse('Invalid JSON payload' , 400)
    }

    // Notifications arrive as an array in payload.value
    const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []
    // SECURITY: Don't log full payload (contains PII/resource IDs)
    logger.info('📋 Webhook payload analysis:', {
      hasValue: !!payload?.value,
      valueIsArray: Array.isArray(payload?.value),
      notificationCount: notifications.length,
      payloadKeys: Object.keys(payload || {}),
      testSessionId: testSessionId || null
    })

    if (notifications.length > 0) {
      logger.info(`${modeLabel} Microsoft Graph notification summary:`, {
        subscriptionIds: notifications.map(n => n?.subscriptionId).filter(Boolean),
        changeTypes: notifications.map(n => n?.changeType).filter(Boolean),
        resources: notifications.map(n => n?.resource).filter(Boolean),
        resourceDataIds: notifications.map(n => n?.resourceData?.id).filter(Boolean)
      })
    }

    if (notifications.length === 0) {
      logger.warn('⚠️ Microsoft webhook payload has no notifications (value array empty)')
      return jsonResponse({ success: true, empty: true })
    }

    // TEST MODE: Route to test session handling
    if (isTestMode) {
      return await handleTestModeWebhook(testSessionId, notifications)
    }

    const requestId = headers['request-id'] || headers['client-request-id'] || undefined

    // Process notifications synchronously (fast enough for serverless)
    const startTime = Date.now()
    try {
      await processNotifications(notifications, headers, requestId)
      await logWebhookExecution('microsoft-graph', payload, headers, 'queued', Date.now() - startTime)

      // Return 202 after processing
      return new NextResponse(null, { status: 202 })
    } catch (error) {
      logger.error('❌ Notification processing error:', error)
      await logWebhookExecution('microsoft-graph', payload, headers, 'error', Date.now() - startTime)
      return errorResponse('Processing failed' , 500)
    }

  } catch (error: any) {
    logger.error('❌ Microsoft Graph webhook error:', error)
    return errorResponse('Internal server error' , 500)
  }
}

/**
 * Handle webhooks in test mode - stores trigger data for SSE polling
 * instead of executing the workflow directly
 */
async function handleTestModeWebhook(testSessionId: string, notifications: any[]): Promise<NextResponse> {
  const supabase = getSupabase()
  const startTime = Date.now()

  logger.debug('🧪 [Test Webhook] Received notification for test session:', {
    testSessionId,
    notificationCount: notifications.length,
    notificationTypes: notifications.map(n => ({
      subscriptionId: n?.subscriptionId,
      changeType: n?.changeType,
      resource: n?.resource
    }))
  })

  try {
    // Validate the test session exists and is listening
    const { data: testSession, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('id', testSessionId)
      .eq('status', 'listening')
      .single()

    if (sessionError || !testSession) {
      logger.warn(`🧪 [Test Webhook] Test session not found or not listening: ${testSessionId}`)
      return jsonResponse({
        success: false,
        message: 'Test session not found or expired',
        testSessionId
      })
    }

    // Process notifications for test mode
    for (const notification of notifications) {
      const subscriptionId = notification?.subscriptionId
      if (!subscriptionId) continue

      // Check that this subscription is for this test session
      const { data: triggerResource } = await supabase
        .from('trigger_resources')
        .select('*')
        .eq('external_id', subscriptionId)
        .eq('test_session_id', testSessionId)
        .single()

      if (!triggerResource) {
        logger.warn(`🧪 [Test Webhook] Subscription ${subscriptionId} not found for test session ${testSessionId}`)
        continue
      }

      // Verify clientState
      const bodyClientState = notification?.clientState
      if (bodyClientState && triggerResource.config?.clientState) {
        if (bodyClientState !== triggerResource.config.clientState) {
          logger.warn('🧪 [Test Webhook] Invalid clientState, skipping')
          continue
        }
      }

      // Get trigger config for filtering
      const triggerType = triggerResource.trigger_type
      const triggerConfig = triggerResource.config || {}
      const userId = triggerResource.user_id
      const resource = notification?.resource || ''
      const resourceLower = resource.toLowerCase()

      // Microsoft Excel triggers: only process changes for the configured workbook
      if (triggerType?.startsWith('microsoft_excel_') && triggerConfig?.workbookId) {
        const changedItemId = notification?.resourceData?.id
        if (changedItemId && changedItemId !== triggerConfig.workbookId) {
          logger.debug('[Microsoft Excel] Skipping test notification - workbook mismatch', {
            changedItemId,
            expectedWorkbookId: triggerConfig.workbookId,
            subscriptionId
          })
          continue
        }
      }

      if (triggerType?.startsWith('microsoft_excel_') && triggerConfig?.workbookId && triggerConfig?.tableName) {
        try {
          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-excel')

          const snapshot = await fetchExcelTableSnapshot(
            accessToken,
            triggerConfig.workbookId,
            triggerConfig.tableName
          )

          const previousSnapshot = triggerConfig.excelRowSnapshot as ExcelRowSnapshot | undefined
          const currentSnapshot: ExcelRowSnapshot = {
            rowHashes: snapshot.rowHashes,
            rowCount: snapshot.rows.length,
            updatedAt: new Date().toISOString()
          }

          if (!previousSnapshot) {
            await supabase
              .from('trigger_resources')
              .update({
                config: {
                  ...triggerConfig,
                  excelRowSnapshot: currentSnapshot
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', triggerResource.id)
            continue
          }

          const newRowId = Object.keys(snapshot.rowHashes)
            .find((rowId) => !previousSnapshot?.rowHashes?.[rowId])

          await supabase
            .from('trigger_resources')
            .update({
              config: {
                ...triggerConfig,
                excelRowSnapshot: currentSnapshot
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', triggerResource.id)

          if (triggerType === 'microsoft_excel_trigger_new_table_row' && newRowId) {
            const newRow = snapshot.rows.find((row: any) => row?.id === newRowId)
            const values = Array.isArray(newRow?.values?.[0]) ? newRow.values[0] : newRow?.values
            const rowData = buildExcelRowData(values, snapshot.columns)
            const triggerData = {
              trigger: {
                type: triggerType,
                workbookId: triggerConfig.workbookId,
                tableName: triggerConfig.tableName,
                rowId: newRowId
              },
              row: newRow,
              values,
              rowData,
              columns: snapshot.columns,
              _testSession: true,
              _source: 'microsoft-excel-file-change'
            }

            await supabase
              .from('workflow_test_sessions')
              .update({
                status: 'trigger_received',
                trigger_data: triggerData
              })
              .eq('id', testSessionId)
            continue
          }

          if (triggerType === 'microsoft_excel_trigger_updated_row' && changedRowId) {
            const changedRow = snapshot.rows.find((row: any) => row?.id === changedRowId)
            const values = Array.isArray(changedRow?.values?.[0]) ? changedRow.values[0] : changedRow?.values
            const rowData = buildExcelRowData(values, snapshot.columns)
            const triggerData = {
              trigger: {
                type: triggerType,
                workbookId: triggerConfig.workbookId,
                tableName: triggerConfig.tableName,
                rowId: changedRowId
              },
              row: changedRow,
              values,
              rowData,
              columns: snapshot.columns,
              _testSession: true,
              _source: 'microsoft-excel-file-change'
            }

            await supabase
              .from('workflow_test_sessions')
              .update({
                status: 'trigger_received',
                trigger_data: triggerData
              })
              .eq('id', testSessionId)
            continue
          }
        } catch (excelError) {
          logger.warn('[Test Webhook] Excel table change processing failed', excelError)
        }
      }

      if (triggerType?.startsWith('microsoft_excel_')) {
        continue
      }

      // Calendar event start trigger (test mode) - trigger immediately with scheduled metadata
      if (resourceLower.includes('/events') && triggerType === 'microsoft-outlook_trigger_calendar_event_start') {
        try {
          const eventId = notification?.resourceData?.id
          if (!eventId) {
            logger.warn('dY? [Test Webhook] Missing calendar eventId, skipping')
            continue
          }

          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

          const eventResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/events/${eventId}?$select=id,subject,start,end,calendar,organizer,location`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          if (!eventResponse.ok) {
            logger.warn('dY? [Test Webhook] Failed to fetch calendar event details, skipping:', eventResponse.status)
            continue
          }

          const event = await eventResponse.json()

          if (triggerConfig.calendarId) {
            const eventCalendarId = event.calendar?.id || resource?.match(/\/calendars\/([^\/]+)\//)?.[1]
            if (eventCalendarId && eventCalendarId !== triggerConfig.calendarId) {
              logger.debug('dY? [Test Webhook] Calendar start trigger skipped - not in configured calendar')
              continue
            }
          }

          const startTime = parseGraphDateTime(event.start)
          if (!startTime) {
            logger.warn('dY? [Test Webhook] Calendar start trigger missing start time, skipping')
            continue
          }

          const minutesBefore = getMinutesBefore(triggerConfig)
          const scheduledFor = new Date(startTime.getTime() - minutesBefore * 60 * 1000).toISOString()
          const triggerData = buildCalendarStartPayload(event, scheduledFor, minutesBefore)

          await supabase
            .from('workflow_test_sessions')
            .update({
              status: 'trigger_received',
              trigger_data: triggerData
            })
            .eq('id', testSessionId)

          logger.debug(`dY? [Test Webhook] Calendar start trigger data stored for session ${testSessionId}`)
          continue
        } catch (calendarError) {
          logger.error('dY? [Test Webhook] Error handling calendar start trigger:', calendarError)
          continue
        }
      }

      // Apply the same filtering logic as production webhooks
      // For Outlook email triggers, fetch the email and apply filters
      const isEmailTrigger = resourceLower.includes('/messages')
      if (isEmailTrigger && userId && triggerConfig) {
        try {
          const messageId = notification?.resourceData?.id
          if (!messageId) {
            logger.warn('🧪 [Test Webhook] No messageId in webhook payload, skipping')
            continue
          }

          const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
          const graphAuth = new MicrosoftGraphAuth()
          const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')

          const emailResponse = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=id,subject,from,toRecipients,hasAttachments,importance,parentFolderId`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          if (!emailResponse.ok) {
            logger.warn('🧪 [Test Webhook] Failed to fetch email for filtering, skipping:', emailResponse.status)
            continue
          }

          const email = await emailResponse.json()
          const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

          logger.debug('🧪 [Test Webhook] Filter check details:', {
                triggerType,
                hasFilterConfig: !!filterConfig,
                configuredFilters: {
                  from: triggerConfig.from || null,
                  to: triggerConfig.to || null,
                  subject: triggerConfig.subject || null,
                  subjectExactMatch: triggerConfig.subjectExactMatch,
                  hasAttachment: triggerConfig.hasAttachment || null
                }
              })

              // Check sender filter (for new_email triggers)
              if (filterConfig?.supportsSender && triggerConfig.from) {
                const senderEmail = email.from?.emailAddress?.address?.toLowerCase().trim() || ''
                const configSender = triggerConfig.from.toLowerCase().trim()
                if (senderEmail !== configSender) {
                  logger.debug(`🧪 [Test Webhook] ⏭️ Skipping - sender doesn't match filter`)
                  continue
                }
              }

              // Check recipient filter (for email_sent triggers)
              if (filterConfig?.supportsRecipient && triggerConfig.to) {
                const configRecipientList = triggerConfig.to
                  .split(/[;,]/)
                  .map((value: string) => value.toLowerCase().trim())
                  .filter(Boolean)
                const recipients = email.toRecipients || []
                const recipientEmails = recipients.map((r: any) =>
                  (r.emailAddress?.address || '').toLowerCase().trim()
                )
                const hasMatchingRecipient = configRecipientList.some((configRecipient: string) =>
                  recipientEmails.some((addr: string) => addr === configRecipient)
                )
                if (!hasMatchingRecipient) {
                  logger.debug(`dY? [Test Webhook] ??-?,? Skipping - recipient doesn't match filter`)
                  continue
                }
              }

              // Check subject filter
              const configSubjectRaw = typeof triggerConfig.subject === 'string'
                ? triggerConfig.subject.trim()
                : ''
              if (filterConfig?.supportsSubject && configSubjectRaw) {
                const emailSubject = (email.subject || '').toLowerCase().trim()
                const configSubject = configSubjectRaw.toLowerCase()
                const isExactMatch = triggerConfig.subjectExactMatch !== false

                if (isExactMatch) {
                  if (emailSubject !== configSubject) {
                    logger.debug(`🧪 [Test Webhook] ⏭️ Skipping - subject doesn't match (exact)`)
                    continue
                  }
                } else {
                  if (!emailSubject.includes(configSubject)) {
                    logger.debug(`🧪 [Test Webhook] ⏭️ Skipping - subject doesn't match (contains)`)
                    continue
                  }
                }
              }

              // Check attachment filter
              if (filterConfig?.supportsAttachment && triggerConfig.hasAttachment !== undefined) {
                const emailHasAttachments = email.hasAttachments === true
                const configRequiresAttachment = triggerConfig.hasAttachment === true || triggerConfig.hasAttachment === 'true'
                if (configRequiresAttachment && !emailHasAttachments) {
                  logger.debug(`🧪 [Test Webhook] ⏭️ Skipping - no attachments`)
                  continue
                }
              }

          logger.debug('🧪 [Test Webhook] ✅ Email passed all filters')
        } catch (filterError) {
          logger.error('🧪 [Test Webhook] Error checking email filters, skipping:', filterError)
          continue
        }
      }

      // OneDrive triggers (file created/modified)
      logger.debug('🧪 [Test Webhook] Checking OneDrive trigger conditions:', {
        triggerType,
        startsWithOneDrive: triggerType?.startsWith('onedrive_'),
        userId: !!userId,
        changeType: notification?.changeType,
        resourceDataId: notification?.resourceData?.id
      })

      if (triggerType?.startsWith('onedrive_') && userId) {
        try {
          logger.debug('🧪 [Test Webhook] OneDrive trigger detected, fetching item data...')
          const onedriveData = await fetchOneDriveItemData(
            userId,
            notification?.resourceData?.id || null,
            triggerConfig,
            triggerType,
            notification?.changeType || 'updated'
          )

          if (!onedriveData) {
            logger.debug('[Test Webhook] OneDrive trigger skipped - no matching item')
            continue
          }

          await supabase
            .from('workflow_test_sessions')
            .update({
              status: 'trigger_received',
              trigger_data: onedriveData
            })
            .eq('id', testSessionId)

          logger.debug(`[Test Webhook] OneDrive trigger data stored for session ${testSessionId}`)
          continue
        } catch (onedriveError) {
          logger.error('[Test Webhook] Error handling OneDrive trigger:', onedriveError)
          continue
        }
      }

      // OneNote triggers (use OneDrive change notifications as a signal)
      if (triggerType?.startsWith('microsoft-onenote_') && userId) {
        try {
          const onenoteData = await fetchLatestOneNotePage(
            userId,
            triggerConfig?.notebookId || null,
            triggerConfig?.sectionId || null,
            triggerType
          )

          if (!onenoteData) {
            logger.debug('[Test Webhook] OneNote trigger skipped - no matching recent page')
            continue
          }

          await supabase
            .from('workflow_test_sessions')
            .update({
              status: 'trigger_received',
              trigger_data: onenoteData
            })
            .eq('id', testSessionId)

          logger.debug(`[Test Webhook] OneNote trigger data stored for session ${testSessionId}`)
          continue
        } catch (onenoteError) {
          logger.error('[Test Webhook] Error handling OneNote trigger:', onenoteError)
          continue
        }
      }

      // Build event data from notification
      const eventData = {
        subscriptionId,
        changeType: notification?.changeType,
        resource: notification?.resource,
        resourceData: notification?.resourceData,
        tenantId: notification?.tenantId,
        _testSession: true
      }

      // Store trigger_data so test-trigger API can poll for it
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'trigger_received',
          trigger_data: eventData
        })
        .eq('id', testSessionId)

      logger.debug(`🧪 [Test Webhook] Trigger data stored for session ${testSessionId}`)
    }

    const processingTime = Date.now() - startTime
    return jsonResponse({
      success: true,
      testSessionId,
      processingTime,
      notificationsProcessed: notifications.length
    })

  } catch (error) {
    logger.error('🧪 [Test Webhook] Error:', error)

    // Update test session to failed
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'failed',
        ended_at: new Date().toISOString()
      })
      .eq('id', testSessionId)

    return errorResponse('Internal server error', 500)
  }
}

/**
 * Fetch OneDrive item data and apply filters
 */
async function fetchOneDriveItemData(
  userId: string,
  itemId: string | null,
  triggerConfig: Record<string, any> | null,
  triggerType: string,
  changeType: string
): Promise<Record<string, any> | null> {
  logger.debug('📂 [OneDrive] fetchOneDriveItemData called:', {
    userId: userId.substring(0, 8) + '...',
    itemId,
    triggerType,
    changeType,
    configKeys: triggerConfig ? Object.keys(triggerConfig) : []
  })

  try {
    const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
    const graphAuth = new MicrosoftGraphAuth()
    const accessToken = await graphAuth.getValidAccessToken(userId, 'onedrive')
    logger.debug('📂 [OneDrive] Got access token')

    // If we don't have a specific item ID, or it's "root", we need to fetch recent changes
    // This happens when subscribing to /me/drive/root
    if (!itemId || itemId === 'root') {
      logger.debug('📂 [OneDrive] No item ID, fetching delta...')
      // Fetch recent items using delta query
      const deltaResponse = await fetch(
        'https://graph.microsoft.com/v1.0/me/drive/root/delta?$top=10&$select=id,name,size,file,folder,parentReference,createdDateTime,lastModifiedDateTime,webUrl,@microsoft.graph.downloadUrl',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!deltaResponse.ok) {
        const errorText = await deltaResponse.text()
        logger.warn('📂 [OneDrive] Failed to fetch delta:', { status: deltaResponse.status, error: errorText })
        return null
      }

      const deltaData = await deltaResponse.json()
      const items = Array.isArray(deltaData?.value) ? deltaData.value : []
      logger.debug('📂 [OneDrive] Delta returned items:', {
        count: items.length,
        names: items.slice(0, 5).map((i: any) => i.name)
      })

      if (items.length === 0) {
        logger.debug('📂 [OneDrive] No items in delta response')
        return null
      }

      // Find the most recently changed item that matches our filters
      for (const item of items) {
        logger.debug('📂 [OneDrive] Checking item:', { name: item.name, id: item.id })
        const matchResult = matchesOneDriveFilters(item, triggerConfig, triggerType, changeType)
        if (matchResult) {
          logger.debug('📂 [OneDrive] ✅ Found matching item:', { name: item.name })
          return formatOneDriveItem(item)
        }
      }

      logger.debug('📂 [OneDrive] No items matched filters after checking all delta items')
      return null
    }

    // Fetch specific item by ID
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}?$select=id,name,size,file,folder,parentReference,createdDateTime,lastModifiedDateTime,webUrl,@microsoft.graph.downloadUrl`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.warn('Failed to fetch OneDrive item:', { status: response.status, error: errorText })
      return null
    }

    const item = await response.json()

    // Apply filters
    if (!matchesOneDriveFilters(item, triggerConfig, triggerType, changeType)) {
      return null
    }

    return formatOneDriveItem(item)
  } catch (error) {
    logger.error('Error fetching OneDrive item details:', error)
    return null
  }
}

/**
 * Check if OneDrive item matches trigger filters
 */
function matchesOneDriveFilters(
  item: any,
  triggerConfig: Record<string, any> | null,
  triggerType: string,
  changeType: string
): boolean {
  const isFile = !!item.file
  const isFolder = !!item.folder

  logger.debug('📂 [OneDrive] matchesOneDriveFilters:', {
    itemName: item.name,
    isFile,
    isFolder,
    triggerType,
    changeType,
    watchType: triggerConfig?.watchType,
    folderId: triggerConfig?.folderId,
    fileType: triggerConfig?.fileType,
    modifiedTime: item.lastModifiedDateTime
  })

  // For file_modified trigger, ensure the item was recently modified (within last 5 minutes)
  if (triggerType === 'onedrive_trigger_file_modified') {
    const modifiedAt = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null
    const now = Date.now()
    const isRecentlyModified = modifiedAt && (now - modifiedAt.getTime()) < 5 * 60 * 1000

    if (!isRecentlyModified) {
      logger.debug('📂 [OneDrive] Item not recently modified, skipping:', {
        itemName: item.name,
        modifiedAt: modifiedAt?.toISOString(),
        minutesAgo: modifiedAt ? Math.round((now - modifiedAt.getTime()) / 60000) : 'N/A'
      })
      return false
    }
  }

  // Check watchType filter
  const watchType = triggerConfig?.watchType || 'any'
  if (watchType === 'files' && !isFile) {
    logger.debug('📂 [OneDrive] watchType=files but item is folder, skipping')
    return false
  }
  if (watchType === 'folders' && !isFolder) {
    logger.debug('📂 [OneDrive] watchType=folders but item is file, skipping')
    return false
  }

  // Check folderId filter (item must be in this folder or subfolder)
  if (triggerConfig?.folderId && triggerConfig.folderId !== 'root') {
    const parentFolderId = item.parentReference?.id
    const includeSubfolders = triggerConfig?.includeSubfolders !== false

    if (!includeSubfolders && parentFolderId !== triggerConfig.folderId) {
      logger.debug('📂 [OneDrive] Item not in configured folder (no subfolders), skipping')
      return false
    }

    // For subfolders, check if the path includes the configured folder
    if (includeSubfolders) {
      const parentPath = item.parentReference?.path || ''
      // This is a simple check - might need enhancement for deeply nested folders
      if (!parentPath.includes(triggerConfig.folderId) && parentFolderId !== triggerConfig.folderId) {
        logger.debug('📂 [OneDrive] Item not in configured folder tree, skipping')
        return false
      }
    }
  }

  // Check fileType filter (only for files)
  if (isFile && triggerConfig?.fileType && triggerConfig.fileType !== 'any') {
    const mimeType = item.file?.mimeType || ''
    const fileName = item.name || ''
    const extension = fileName.split('.').pop()?.toLowerCase() || ''

    const fileTypeMatches = checkFileTypeMatch(triggerConfig.fileType, mimeType, extension)
    if (!fileTypeMatches) {
      logger.debug('📂 [OneDrive] fileType filter not matched, skipping')
      return false
    }
  }

  // Check if this is a "new file" trigger but the change is an update
  if (triggerType === 'onedrive_trigger_new_file') {
    const triggerOnUpdates = triggerConfig?.triggerOnUpdates === true

    if (changeType === 'updated' && !triggerOnUpdates) {
      // Check if this is actually a new file (created within last few minutes)
      const createdAt = item.createdDateTime ? new Date(item.createdDateTime) : null
      const modifiedAt = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null
      const now = Date.now()

      // Consider "new" if created within last 5 minutes
      const isNew = createdAt && (now - createdAt.getTime()) < 5 * 60 * 1000
      // Or if created and modified times are very close (within 30 seconds)
      const isJustCreated = createdAt && modifiedAt &&
        Math.abs(modifiedAt.getTime() - createdAt.getTime()) < 30 * 1000

      if (!isNew && !isJustCreated) {
        logger.debug('📂 [OneDrive] new_file trigger but item is not new, skipping')
        return false
      }
    }
  }

  // Check sharedOnly filter
  if (triggerConfig?.sharedOnly && !item.shared) {
    logger.debug('📂 [OneDrive] sharedOnly filter not matched, skipping')
    return false
  }

  logger.debug('📂 [OneDrive] ✅ Item matches all filters:', { itemName: item.name })
  return true
}

/**
 * Check if file type matches the configured filter
 */
function checkFileTypeMatch(filterType: string, mimeType: string, extension: string): boolean {
  const typeMap: Record<string, { mimes: string[], extensions: string[] }> = {
    'documents': {
      mimes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml', 'text/plain', 'application/rtf'],
      extensions: ['doc', 'docx', 'txt', 'rtf', 'odt']
    },
    'images': {
      mimes: ['image/'],
      extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff']
    },
    'audio': {
      mimes: ['audio/'],
      extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma']
    },
    'video': {
      mimes: ['video/'],
      extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm']
    },
    'spreadsheets': {
      mimes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml'],
      extensions: ['xls', 'xlsx', 'csv', 'ods']
    },
    'presentations': {
      mimes: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml'],
      extensions: ['ppt', 'pptx', 'odp']
    },
    'pdf': {
      mimes: ['application/pdf'],
      extensions: ['pdf']
    },
    'archives': {
      mimes: ['application/zip', 'application/x-rar', 'application/x-7z-compressed', 'application/gzip'],
      extensions: ['zip', 'rar', '7z', 'gz', 'tar']
    }
  }

  const config = typeMap[filterType]
  if (!config) return true // Unknown filter type, allow all

  // Check MIME type
  for (const mime of config.mimes) {
    if (mimeType.startsWith(mime) || mimeType.includes(mime)) {
      return true
    }
  }

  // Check extension
  if (config.extensions.includes(extension)) {
    return true
  }

  return false
}

/**
 * Format OneDrive item data for workflow output
 */
function formatOneDriveItem(item: any): Record<string, any> {
  const isFile = !!item.file
  return {
    id: item.id,
    name: item.name,
    type: isFile ? 'file' : 'folder',
    size: item.size || 0,
    path: item.parentReference?.path
      ? `${item.parentReference.path}/${item.name}`.replace('/drive/root:', '')
      : `/${item.name}`,
    webUrl: item.webUrl,
    mimeType: item.file?.mimeType || '',
    createdTime: item.createdDateTime,
    modifiedTime: item.lastModifiedDateTime,
    downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
    parentFolderId: item.parentReference?.id || null,
    parentFolderPath: item.parentReference?.path?.replace('/drive/root:', '') || '/'
  }
}

async function fetchLatestOneNotePage(
  userId: string,
  notebookId: string | null,
  sectionId: string | null,
  triggerType: string
): Promise<Record<string, any> | null> {
  try {
    const { MicrosoftGraphAuth } = await import('@/lib/microsoft-graph/auth')
    const graphAuth = new MicrosoftGraphAuth()
    const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-onenote')

    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/onenote/pages?$top=10&$orderby=createdDateTime desc&$select=id,title,createdDateTime,lastModifiedDateTime,contentUrl,links,parentNotebook,parentSection,webUrl',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.warn('Failed to fetch OneNote pages:', { status: response.status, error: errorText })
      return null
    }

    const data = await response.json()
    const pages = Array.isArray(data?.value) ? data.value : []
    if (pages.length === 0) return null

    const match = pages.find((page: any) => {
      if (sectionId && page?.parentSection?.id) {
        return page.parentSection.id === sectionId
      }
      if (notebookId && page?.parentNotebook?.id) {
        return page.parentNotebook.id === notebookId
      }
      return true
    })

    if (!match) return null

    const createdAt = match.createdDateTime ? new Date(match.createdDateTime) : null
    const modifiedAt = match.lastModifiedDateTime ? new Date(match.lastModifiedDateTime) : null
    const now = Date.now()
    const isNewish = createdAt ? (now - createdAt.getTime()) < 10 * 60 * 1000 : false
    const isNewPage = createdAt && modifiedAt
      ? Math.abs(modifiedAt.getTime() - createdAt.getTime()) < 30 * 1000
      : false

    if (triggerType === 'microsoft-onenote_trigger_new_note' && !(isNewPage || isNewish)) {
      return null
    }

    return {
      id: match.id,
      title: match.title,
      content: null,
      contentUrl: match.contentUrl,
      webUrl: match.links?.oneNoteWebUrl?.href || match.links?.oneNoteClientUrl?.href || match.webUrl,
      createdDateTime: match.createdDateTime,
      lastModifiedDateTime: match.lastModifiedDateTime,
      notebookId: match.parentNotebook?.id || notebookId,
      notebookName: match.parentNotebook?.displayName || null,
      sectionId: match.parentSection?.id || sectionId,
      sectionName: match.parentSection?.displayName || null
    }
  } catch (error) {
    logger.error('Error fetching OneNote page details:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
  if (validationToken) {
    logger.debug('🔍 Validation request (GET) received')
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return jsonResponse({
    message: "Microsoft Graph webhook endpoint active",
    provider: "microsoft-graph",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Webhook endpoint for Microsoft Graph workflows. Send POST requests to trigger workflows."
  })
}
