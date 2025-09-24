import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

const processedCalendarEvents = new Map<string, number>()
const CALENDAR_DEDUPE_WINDOW_MS = 5 * 60 * 1000

function buildCalendarDedupeKey(workflowId: string, eventId: string, changeType: string) {
  return `${workflowId}-${eventId}-${changeType}`
}

function wasRecentlyProcessedCalendarEvent(workflowId: string, eventId: string, changeType: string): boolean {
  const key = buildCalendarDedupeKey(workflowId, eventId, changeType)
  const processedAt = processedCalendarEvents.get(key)
  if (!processedAt) return false

  if (Date.now() - processedAt < CALENDAR_DEDUPE_WINDOW_MS) {
    return true
  }

  processedCalendarEvents.delete(key)
  return false
}

function markCalendarEventProcessed(workflowId: string, eventId: string, changeType: string) {
  const key = buildCalendarDedupeKey(workflowId, eventId, changeType)
  processedCalendarEvents.set(key, Date.now())

  if (processedCalendarEvents.size > 1000) {
    const now = Date.now()
    for (const [k, timestamp] of processedCalendarEvents.entries()) {
      if (now - timestamp > CALENDAR_DEDUPE_WINDOW_MS) {
        processedCalendarEvents.delete(k)
      }
    }
  }
}

export interface GoogleWebhookEvent {
  service: string
  eventData: any
  requestId: string
}

export async function processGoogleEvent(event: GoogleWebhookEvent): Promise<any> {
  try {
    const supabase = await createSupabaseServiceClient()

    // Store the webhook event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('webhook_events')
      .insert({
        provider: 'google',
        service: event.service,
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: new Date().toISOString()
      })
      .select()
      .single()

    if (storeError) {
      console.error('Failed to store Google webhook event:', storeError)
    }

    // Extract token metadata if present (contains userId, integrationId, etc.)
    let metadata: any = {}
    if (event.eventData.token) {
      try {
        metadata = JSON.parse(event.eventData.token)
      } catch (e) {
        console.log('Could not parse token metadata')
      }
    }

    // Process based on service
    switch (event.service) {
      case 'drive':
        return await processGoogleDriveEvent(event, metadata)
      case 'calendar':
        return await processGoogleCalendarEvent(event, metadata)
      case 'docs':
        return await processGoogleDocsEvent(event, metadata)
      case 'sheets':
        return await processGoogleSheetsEvent(event, metadata)
      default:
        return await processGenericGoogleEvent(event)
    }
  } catch (error) {
    console.error('Error processing Google webhook event:', error)
    throw error
  }
}

async function processGoogleDriveEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {
  const { eventData } = event

  // Google Drive sends a notification that changes occurred
  // We need to fetch the actual changes using the Drive API
  if (metadata.userId && metadata.integrationId) {
    const { getGoogleDriveChanges } = await import('./google-drive-watch-setup')

    // Get the page token from the subscription
    const supabase = await createSupabaseServiceClient()
    const { data: subscription } = await supabase
      .from('google_watch_subscriptions')
      .select('page_token, metadata')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-drive')
      .single()

    if (subscription && subscription.page_token) {
      // Fetch the actual changes
      const changes = await getGoogleDriveChanges(
        metadata.userId,
        metadata.integrationId,
        subscription.page_token
      )

      // Process each change
      for (const change of changes.changes || []) {
        if (change.file) {
          if (change.removed) {
            await handleDriveFileDeleted({
              fileId: change.fileId,
              file: change.file,
              metadata
            })
          } else if (change.file.mimeType?.includes('folder')) {
            await handleDriveFolderCreated({
              folderId: change.fileId,
              folder: change.file,
              metadata
            })
          } else {
            // Check if file is new or updated based on creation time
            const createdTime = new Date(change.file.createdTime)
            const modifiedTime = new Date(change.file.modifiedTime)
            const timeDiff = modifiedTime.getTime() - createdTime.getTime()

            if (timeDiff < 60000) { // Less than 1 minute difference = new file
              await handleDriveFileCreated({
                fileId: change.fileId,
                file: change.file,
                metadata
              })
            } else {
              await handleDriveFileUpdated({
                fileId: change.fileId,
                file: change.file,
                metadata
              })
            }
          }
        }
      }

      // Update the page token for next time
      if (changes.nextPageToken) {
        await supabase
          .from('google_watch_subscriptions')
          .update({ page_token: changes.nextPageToken })
          .eq('user_id', metadata.userId)
          .eq('integration_id', metadata.integrationId)
          .eq('provider', 'google-drive')
      }

      return { processed: true, changesCount: changes.changes?.length || 0 }
    }
  }

  // Fallback to generic processing
  console.log('Google Drive webhook received, but missing metadata for processing')
  return { processed: true, eventType: 'drive.notification' }
}

async function processGoogleCalendarEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {
  const { eventData } = event

  // Google Calendar sends a notification that changes occurred
  // We need to fetch the actual changes using the Calendar API
  if (metadata.userId && metadata.integrationId && metadata.calendarId) {
    const { getGoogleCalendarChanges } = await import('./google-calendar-watch-setup')

    // Get the sync token from the subscription
    const supabase = await createSupabaseServiceClient()
    const { data: subscription } = await supabase
      .from('google_watch_subscriptions')
      .select('sync_token, metadata, updated_at')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-calendar')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch the actual changes
    let subscriptionMetadata: any = null
    if (subscription?.metadata) {
      if (typeof subscription.metadata === 'object') {
        subscriptionMetadata = subscription.metadata
      } else if (typeof subscription.metadata === 'string') {
        try {
          subscriptionMetadata = JSON.parse(subscription.metadata)
        } catch {
          subscriptionMetadata = null
        }
      }
    }

    const storedStartTime: string | null = subscriptionMetadata?.startTime || null
    const storedLastFetchTime: string | null = subscriptionMetadata?.lastFetchTime || null
    const isFirstSync = !subscription?.sync_token
    const effectiveWatchStartTime: string | null = isFirstSync
      ? (metadata.watchStartTime || storedStartTime || storedLastFetchTime || new Date().toISOString())
      : (metadata.watchStartTime || storedStartTime || storedLastFetchTime || null)

    console.log('[Google Calendar] Metadata resolved for processing:', {
      userId: metadata.userId,
      integrationId: metadata.integrationId,
      calendarId: metadata.calendarId,
      hasSyncToken: Boolean(subscription?.sync_token),
      isFirstSync,
      watchStartTime: effectiveWatchStartTime
    })

    const enrichedMetadata = {
      ...metadata,
      watchStartTime: effectiveWatchStartTime
    }

    console.log('[Google Calendar] Fetching changes with', {
      mode: subscription?.sync_token ? 'syncToken' : 'updatedMin',
      syncTokenPreview: subscription?.sync_token ? String(subscription.sync_token).slice(0, 12) + '...' : null,
      updatedMin: subscription?.sync_token ? null : (effectiveWatchStartTime || 'now')
    })

    const changes = await getGoogleCalendarChanges(
      metadata.userId,
      metadata.integrationId,
      metadata.calendarId,
      subscription?.sync_token,
      {
        // Only consider events after watch start on first fetch when no sync token exists
        timeMin: subscription?.sync_token ? null : (enrichedMetadata.watchStartTime || undefined)
      }
    )

    console.log('[Google Calendar] Changes fetched:', {
      eventsCount: changes.events?.length || 0,
      hasNextSyncToken: Boolean(changes.nextSyncToken)
    })

    // Process each event change
    for (const event of changes.events || []) {
      try {
        console.log('[Google Calendar] Inspecting event:', { id: event.id, status: event.status, created: event.created, updated: event.updated })
      } catch {}
      if (event.status === 'cancelled') {
        await handleCalendarEventDeleted({
          eventId: event.id,
          event,
          metadata: enrichedMetadata
        })
      } else if (event.created && event.updated) {
        // Check if event is new or updated
        const createdTime = new Date(event.created)
        const updatedTime = new Date(event.updated)
        const timeDiff = updatedTime.getTime() - createdTime.getTime()

        if (timeDiff < 60000) { // Less than 1 minute difference = new event
          await handleCalendarEventCreated({
            eventId: event.id,
            event,
            metadata: enrichedMetadata
          })
        } else {
          await handleCalendarEventUpdated({
            eventId: event.id,
            event,
            metadata: enrichedMetadata
          })
        }
      }
    }

    // Update the sync token for next time (after pagination completes)
    if (changes.nextSyncToken) {
      await supabase
        .from('google_watch_subscriptions')
        .update({ sync_token: changes.nextSyncToken, updated_at: new Date().toISOString() })
        .eq('user_id', metadata.userId)
        .eq('integration_id', metadata.integrationId)
        .eq('provider', 'google-calendar')
      console.log('[Google Calendar] Persisted nextSyncToken and updated_at for subscription')
    } else {
      // Persist lastFetchTime fallback so subsequent runs can use updatedMin reliably
      const newMetadata = {
        ...(subscriptionMetadata || {}),
        lastFetchTime: new Date().toISOString()
      }
      await supabase
        .from('google_watch_subscriptions')
        .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
        .eq('user_id', metadata.userId)
        .eq('integration_id', metadata.integrationId)
        .eq('provider', 'google-calendar')
      console.log('[Google Calendar] Persisted lastFetchTime metadata and updated_at for subscription')
    }

    return { processed: true, eventsCount: changes.events?.length || 0 }
  }

  // Fallback to generic processing
  console.debug('Google Calendar webhook received, but missing metadata for processing', {
    hasUserId: Boolean(metadata?.userId),
    hasIntegrationId: Boolean(metadata?.integrationId),
    hasCalendarId: Boolean(metadata?.calendarId)
  })
  return { processed: true, eventType: 'calendar.notification' }
}

type CalendarChangeType = 'created' | 'updated' | 'deleted'

async function triggerMatchingCalendarWorkflows(changeType: CalendarChangeType, calendarEvent: any, metadata: any, options?: { watchStartTime?: string | null }) {
  if (!calendarEvent) {
    console.debug('[Google Calendar] Event payload missing event details, skipping')
    return
  }

  const userId = metadata?.userId
  if (!userId) {
    console.debug('[Google Calendar] Missing userId in metadata, skipping workflow trigger')
    return
  }

  let watchStartTime: Date | null = null
  const metadataStart = metadata?.watchStartTime || options?.watchStartTime
  if (typeof metadataStart === 'string' && metadataStart.trim().length > 0) {
    const parsed = new Date(metadataStart)
    if (!Number.isNaN(parsed.getTime())) {
      watchStartTime = parsed
    }
  }

  const triggerTypeMap: Record<CalendarChangeType, string> = {
    created: 'google_calendar_trigger_new_event',
    updated: 'google_calendar_trigger_event_updated',
    deleted: 'google_calendar_trigger_event_canceled'
  }

  const triggerType = triggerTypeMap[changeType]
  const eventId: string | undefined = calendarEvent.id || calendarEvent.eventId || calendarEvent.event_id
  const calendarId = metadata?.calendarId || 'primary'

  try {
    const supabase = await createSupabaseServiceClient()

    let query = supabase
      .from('webhook_configs')
      .select('id, workflow_id, config, status, provider_id, trigger_type')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')
      .eq('provider_id', 'google-calendar')

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: webhookConfigs, error: webhookError } = await query

    if (webhookError) {
      console.error('[Google Calendar] Failed to fetch webhook configs:', webhookError)
      return
    }

    if (!webhookConfigs || webhookConfigs.length === 0) {
      return
    }

    const workflowIds = webhookConfigs
      .map((config) => config.workflow_id)
      .filter((id): id is string => Boolean(id))

    if (workflowIds.length === 0) {
      console.debug('[Google Calendar] No workflow IDs associated with webhook configs, skipping')
      return
    }

    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, user_id, nodes, name, status')
      .in('id', workflowIds)
      .eq('status', 'active')

    if (workflowsError) {
      console.error('[Google Calendar] Failed to fetch workflows:', workflowsError)
      return
    }

    if (!workflows || workflows.length === 0) {
      return
    }

    for (const webhookConfig of webhookConfigs) {
      if (!webhookConfig.workflow_id) continue

      const workflow = workflows.find((w) => w.id === webhookConfig.workflow_id)
      if (!workflow) {
        console.debug('[Google Calendar] Workflow not found for config, skipping')
        continue
      }

      const configData = (webhookConfig.config || {}) as any
      const watchConfig = configData.watch || {}

      const configuredCalendarId =
        watchConfig.calendarId ||
        configData.calendarId ||
        (Array.isArray(configData.calendars) ? configData.calendars[0] : undefined) ||
        'primary'

      const watchStartTime = watchConfig.startTime ? new Date(watchConfig.startTime) : null

      if (configuredCalendarId && calendarId && configuredCalendarId !== calendarId) {
        continue
      }

      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []

      const matchingTriggers = nodes.filter((node: any) => {
        const nodeType = node?.data?.type || node?.type || node?.data?.nodeType
        if (nodeType !== triggerType) return false
        if (!node?.data?.isTrigger) return false

        const nodeCalendarId = node?.data?.config?.calendarId || node?.data?.config?.calendar?.id || 'primary'
        if (configuredCalendarId && nodeCalendarId && nodeCalendarId !== configuredCalendarId) {
          return false
        }

        return true
      })

      console.log('[Google Calendar] Workflow trigger scan:', {
        workflowId: workflow.id,
        triggerType,
        configuredCalendarId,
        nodeCount: nodes.length,
        matchingTriggerCount: matchingTriggers.length
      })

      if (matchingTriggers.length === 0) {
        continue
      }

      if (watchStartTime) {
        const eventTimestamp = resolveCalendarEventTimestamp(calendarEvent)
        if (eventTimestamp && eventTimestamp.getTime() < watchStartTime.getTime()) {
          continue
        }
      }

      if (eventId && wasRecentlyProcessedCalendarEvent(workflow.id, eventId, changeType)) {
        // Skip duplicate within dedupe window without logging noisily
        continue
      }

      const triggerPayload = {
        provider: 'google-calendar',
        changeType,
        calendarId,
        eventId,
        event: calendarEvent,
        metadata
      }

      try {
        // Mark as processed BEFORE starting execution to avoid concurrent duplicates
        if (eventId) {
          markCalendarEventProcessed(workflow.id, eventId, changeType)
        }

        const executionEngine = new AdvancedExecutionEngine()
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: triggerPayload,
            webhookEvent: {
              provider: 'google-calendar',
              changeType,
              metadata,
              event: calendarEvent
            }
          }
        )

        executionEngine.executeWorkflowAdvanced(executionSession.id, triggerPayload)

      } catch (workflowError) {
        console.error(`[Google Calendar] Failed to execute workflow ${workflow.id}:`, workflowError)
        if (eventId) {
          processedCalendarEvents.delete(buildCalendarDedupeKey(workflow.id, eventId, changeType))
        }
      }
    }
  } catch (error) {
    console.error('[Google Calendar] Error triggering workflows for calendar event:', error)
  }
}

function resolveCalendarEventTimestamp(calendarEvent: any): Date | null {
  const candidates = [
    calendarEvent?.created,
    calendarEvent?.updated,
    calendarEvent?.start?.dateTime,
    calendarEvent?.start?.date
  ]

  for (const value of candidates) {
    if (typeof value !== 'string' || value.trim().length === 0) continue

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00Z`)
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

async function processGoogleDocsEvent(event: GoogleWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Google Docs event types
  switch (eventData.type) {
    case 'document.created':
      return await handleDocsDocumentCreated(eventData)
    case 'document.updated':
      return await handleDocsDocumentUpdated(eventData)
    case 'document.deleted':
      return await handleDocsDocumentDeleted(eventData)
    case 'comment.added':
      return await handleDocsCommentAdded(eventData)
    default:
      console.log('Unhandled Google Docs event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processGoogleSheetsEvent(event: GoogleWebhookEvent, metadata: any): Promise<any> {
  const { eventData } = event

  // Google Sheets uses Drive API for webhooks
  // We need to check what changed in the spreadsheet
  if (metadata.userId && metadata.integrationId && metadata.spreadsheetId) {
    const { checkGoogleSheetsChanges } = await import('./google-sheets-watch-setup')

    // Get the previous metadata from the subscription
    const supabase = await createSupabaseServiceClient()
    const { data: subscription } = await supabase
      .from('google_watch_subscriptions')
      .select('metadata')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-sheets')
      .single()

    if (subscription?.metadata) {
      // Check for changes
      const result = await checkGoogleSheetsChanges(
        metadata.userId,
        metadata.integrationId,
        metadata.spreadsheetId,
        subscription.metadata
      )

      // Process each change
      for (const change of result.changes || []) {
        switch (change.type) {
          case 'new_row':
            await handleSheetsRowCreated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              rowNumber: change.rowNumber,
              data: change.data,
              metadata
            })
            break
          case 'updated_row':
            await handleSheetsRowUpdated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              message: change.message,
              metadata
            })
            break
          case 'new_worksheet':
            await handleSheetsSheetCreated({
              spreadsheetId: metadata.spreadsheetId,
              sheetName: change.sheetName,
              sheetId: change.sheetId,
              metadata
            })
            break
        }
      }

      // Update the metadata for next comparison
      if (result.updatedMetadata) {
        await supabase
          .from('google_watch_subscriptions')
          .update({ metadata: result.updatedMetadata })
          .eq('user_id', metadata.userId)
          .eq('integration_id', metadata.integrationId)
          .eq('provider', 'google-sheets')
      }

      return { processed: true, changesCount: result.changes?.length || 0 }
    }
  }

  // Fallback to generic processing
  console.log('Google Sheets webhook received, but missing metadata for processing')
  return { processed: true, eventType: 'sheets.notification' }
}

async function processGenericGoogleEvent(event: GoogleWebhookEvent): Promise<any> {
  // Generic Google event processing
  console.log('Processing generic Google webhook event:', event.service)
  
  // Queue for background processing if needed
  await queueWebhookTask({
    provider: 'google',
    service: event.service,
    eventData: event.eventData,
    requestId: event.requestId
  })
  
  return { processed: true, service: event.service }
}

// Google Drive event handlers
async function handleDriveFileCreated(eventData: any): Promise<any> {
  console.log('Processing Google Drive file created:', eventData.file_id)
  return { processed: true, type: 'drive_file_created', fileId: eventData.file_id }
}

async function handleDriveFileUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Drive file updated:', eventData.file_id)
  return { processed: true, type: 'drive_file_updated', fileId: eventData.file_id }
}

async function handleDriveFileDeleted(eventData: any): Promise<any> {
  console.log('Processing Google Drive file deleted:', eventData.file_id)
  return { processed: true, type: 'drive_file_deleted', fileId: eventData.file_id }
}

async function handleDriveFolderCreated(eventData: any): Promise<any> {
  console.log('Processing Google Drive folder created:', eventData.folder_id)
  return { processed: true, type: 'drive_folder_created', folderId: eventData.folder_id }
}

// Google Calendar event handlers
async function handleCalendarEventCreated(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('created', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_created', eventId }
}

async function handleCalendarEventUpdated(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('updated', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_updated', eventId }
}

async function handleCalendarEventDeleted(eventData: any): Promise<any> {
  const eventId: string | undefined = eventData.eventId || eventData.event_id || eventData.event?.id
  await triggerMatchingCalendarWorkflows('deleted', eventData.event, eventData.metadata, {
    watchStartTime: eventData.metadata?.watchStartTime || null
  })
  return { processed: true, type: 'calendar_event_deleted', eventId }
}

async function handleCalendarCreated(eventData: any): Promise<any> {
  console.log('Processing Google Calendar created:', eventData.calendar_id)
  return { processed: true, type: 'calendar_created', calendarId: eventData.calendar_id }
}

// Google Docs event handlers
async function handleDocsDocumentCreated(eventData: any): Promise<any> {
  console.log('Processing Google Docs document created:', eventData.document_id)
  return { processed: true, type: 'docs_document_created', documentId: eventData.document_id }
}

async function handleDocsDocumentUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Docs document updated:', eventData.document_id)
  return { processed: true, type: 'docs_document_updated', documentId: eventData.document_id }
}

async function handleDocsDocumentDeleted(eventData: any): Promise<any> {
  console.log('Processing Google Docs document deleted:', eventData.document_id)
  return { processed: true, type: 'docs_document_deleted', documentId: eventData.document_id }
}

async function handleDocsCommentAdded(eventData: any): Promise<any> {
  console.log('Processing Google Docs comment added:', eventData.comment_id)
  return { processed: true, type: 'docs_comment_added', commentId: eventData.comment_id }
}

// Google Sheets event handlers
async function handleSheetsSpreadsheetCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets spreadsheet created:', eventData.spreadsheet_id)
  return { processed: true, type: 'sheets_spreadsheet_created', spreadsheetId: eventData.spreadsheet_id }
}

async function handleSheetsSpreadsheetUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets spreadsheet updated:', eventData.spreadsheet_id)
  return { processed: true, type: 'sheets_spreadsheet_updated', spreadsheetId: eventData.spreadsheet_id }
}

async function handleSheetsCellUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets cell updated:', eventData.cell_range)
  return { processed: true, type: 'sheets_cell_updated', cellRange: eventData.cell_range }
}

async function handleSheetsSheetCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets sheet created:', eventData.sheetName || eventData.sheet_id)

  // Trigger workflow if there's a workflow configured for new worksheet trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for new worksheet:', eventData.sheetName)
  }

  return { processed: true, type: 'sheets_sheet_created', sheetId: eventData.sheetId || eventData.sheet_id }
}

async function handleSheetsRowCreated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets new row:', eventData.sheetName, eventData.rowNumber)

  // Trigger workflow if there's a workflow configured for new row trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for new row:', eventData.data)
  }

  return { processed: true, type: 'sheets_row_created', rowData: eventData.data }
}

async function handleSheetsRowUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Sheets row updated:', eventData.sheetName)

  // Trigger workflow if there's a workflow configured for updated row trigger
  if (eventData.metadata?.userId) {
    // Here you would trigger the workflow execution
    // This would integrate with your workflow execution system
    console.log('Would trigger workflow for updated row')
  }

  return { processed: true, type: 'sheets_row_updated', message: eventData.message }
} 
