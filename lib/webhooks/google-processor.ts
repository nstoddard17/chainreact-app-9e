import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'

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
      .select('sync_token, metadata')
      .eq('user_id', metadata.userId)
      .eq('integration_id', metadata.integrationId)
      .eq('provider', 'google-calendar')
      .single()

    // Fetch the actual changes
    const changes = await getGoogleCalendarChanges(
      metadata.userId,
      metadata.integrationId,
      metadata.calendarId,
      subscription?.sync_token
    )

    // Process each event change
    for (const event of changes.events || []) {
      if (event.status === 'cancelled') {
        await handleCalendarEventDeleted({
          eventId: event.id,
          event,
          metadata
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
            metadata
          })
        } else {
          await handleCalendarEventUpdated({
            eventId: event.id,
            event,
            metadata
          })
        }
      }
    }

    // Update the sync token for next time
    if (changes.nextSyncToken) {
      await supabase
        .from('google_watch_subscriptions')
        .update({ sync_token: changes.nextSyncToken })
        .eq('user_id', metadata.userId)
        .eq('integration_id', metadata.integrationId)
        .eq('provider', 'google-calendar')
    }

    return { processed: true, eventsCount: changes.events?.length || 0 }
  }

  // Fallback to generic processing
  console.log('Google Calendar webhook received, but missing metadata for processing')
  return { processed: true, eventType: 'calendar.notification' }
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
  console.log('Processing Google Calendar event created:', eventData.event_id)
  return { processed: true, type: 'calendar_event_created', eventId: eventData.event_id }
}

async function handleCalendarEventUpdated(eventData: any): Promise<any> {
  console.log('Processing Google Calendar event updated:', eventData.event_id)
  return { processed: true, type: 'calendar_event_updated', eventId: eventData.event_id }
}

async function handleCalendarEventDeleted(eventData: any): Promise<any> {
  console.log('Processing Google Calendar event deleted:', eventData.event_id)
  return { processed: true, type: 'calendar_event_deleted', eventId: eventData.event_id }
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