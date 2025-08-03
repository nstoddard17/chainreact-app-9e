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

    // Process based on service
    switch (event.service) {
      case 'drive':
        return await processGoogleDriveEvent(event)
      case 'calendar':
        return await processGoogleCalendarEvent(event)
      case 'docs':
        return await processGoogleDocsEvent(event)
      case 'sheets':
        return await processGoogleSheetsEvent(event)
      default:
        return await processGenericGoogleEvent(event)
    }
  } catch (error) {
    console.error('Error processing Google webhook event:', error)
    throw error
  }
}

async function processGoogleDriveEvent(event: GoogleWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Google Drive event types
  switch (eventData.type) {
    case 'file.created':
      return await handleDriveFileCreated(eventData)
    case 'file.updated':
      return await handleDriveFileUpdated(eventData)
    case 'file.deleted':
      return await handleDriveFileDeleted(eventData)
    case 'folder.created':
      return await handleDriveFolderCreated(eventData)
    default:
      console.log('Unhandled Google Drive event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

async function processGoogleCalendarEvent(event: GoogleWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Google Calendar event types
  switch (eventData.type) {
    case 'event.created':
      return await handleCalendarEventCreated(eventData)
    case 'event.updated':
      return await handleCalendarEventUpdated(eventData)
    case 'event.deleted':
      return await handleCalendarEventDeleted(eventData)
    case 'calendar.created':
      return await handleCalendarCreated(eventData)
    default:
      console.log('Unhandled Google Calendar event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
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

async function processGoogleSheetsEvent(event: GoogleWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Google Sheets event types
  switch (eventData.type) {
    case 'spreadsheet.created':
      return await handleSheetsSpreadsheetCreated(eventData)
    case 'spreadsheet.updated':
      return await handleSheetsSpreadsheetUpdated(eventData)
    case 'cell.updated':
      return await handleSheetsCellUpdated(eventData)
    case 'sheet.created':
      return await handleSheetsSheetCreated(eventData)
    default:
      console.log('Unhandled Google Sheets event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
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
  console.log('Processing Google Sheets sheet created:', eventData.sheet_id)
  return { processed: true, type: 'sheets_sheet_created', sheetId: eventData.sheet_id }
} 