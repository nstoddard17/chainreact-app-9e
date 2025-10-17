/**
 * Smart AI Response Formatter
 * Automatically formats AI responses based on the data source and content type
 */

import { logger } from "@/lib/utils/logger"

export interface FormattedResponse {
  type: 'calendar' | 'document' | 'email' | 'task' | 'generic' | 'table' | 'list'
  content: string
  metadata?: {
    source?: string
    timestamp?: string
    location?: string
    fileName?: string
    lineNumbers?: string
    integration?: string
  }
  structuredData?: any
}

/**
 * Detects the type of data from the AI response context
 */
function detectDataType(text: string, context?: any): FormattedResponse['type'] {
  const lowerText = text.toLowerCase()

  // Check for calendar/event keywords
  if (lowerText.includes('calendar') ||
      lowerText.includes('appointment') ||
      lowerText.includes('meeting') ||
      lowerText.includes('event') ||
      context?.integration === 'google_calendar') {
    return 'calendar'
  }

  // Check for document keywords
  if (lowerText.includes('document') ||
      lowerText.includes('file') ||
      lowerText.includes('line') ||
      context?.integration === 'google_drive' ||
      context?.integration === 'onedrive') {
    return 'document'
  }

  // Check for email keywords
  if (lowerText.includes('email') ||
      lowerText.includes('inbox') ||
      lowerText.includes('message') ||
      context?.integration === 'gmail' ||
      context?.integration === 'outlook') {
    return 'email'
  }

  // Check for task keywords
  if (lowerText.includes('task') ||
      lowerText.includes('todo') ||
      lowerText.includes('checklist') ||
      context?.integration === 'notion' ||
      context?.integration === 'trello') {
    return 'task'
  }

  // Check for tabular data
  if (lowerText.includes('table') ||
      lowerText.includes('spreadsheet') ||
      context?.integration === 'airtable') {
    return 'table'
  }

  // Check for list data
  if (lowerText.includes('list') || text.split('\n').filter(l => l.trim().startsWith('-')).length > 2) {
    return 'list'
  }

  return 'generic'
}

/**
 * Formats calendar/event data
 */
function formatCalendarResponse(data: any): string {
  if (!data || !data.events) {
    return "No upcoming events found."
  }

  let formatted = "## 📅 Upcoming Appointments\n\n"

  for (const event of data.events) {
    const startDate = new Date(event.start)
    const endDate = new Date(event.end)
    const dateStr = startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
    const timeStr = `${startDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })} - ${endDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })}`

    formatted += `### ${event.title}\n`
    formatted += `📆 **${dateStr}**\n`
    formatted += `🕐 ${timeStr}\n`

    if (event.location) {
      formatted += `📍 ${event.location}\n`
    }

    if (event.description) {
      formatted += `\n${event.description}\n`
    }

    if (event.attendees && event.attendees.length > 0) {
      formatted += `\n👥 **Attendees:** ${event.attendees.join(', ')}\n`
    }

    formatted += '\n---\n\n'
  }

  return formatted
}

/**
 * Formats document data with metadata
 */
function formatDocumentResponse(data: any): string {
  if (!data || !data.content) {
    return "No document content found."
  }

  let formatted = "## 📄 Document Information\n\n"

  if (data.fileName) {
    formatted += `**File:** ${data.fileName}\n`
  }

  if (data.source) {
    formatted += `**Source:** ${data.source}\n`
  }

  if (data.lastModified) {
    formatted += `**Last Modified:** ${new Date(data.lastModified).toLocaleString()}\n`
  }

  if (data.lineNumbers) {
    formatted += `**Lines:** ${data.lineNumbers}\n`
  }

  formatted += '\n---\n\n'

  if (Array.isArray(data.content)) {
    formatted += "### Content:\n\n"
    for (const line of data.content) {
      if (line.lineNumber) {
        formatted += `**Line ${line.lineNumber}:** ${line.text}\n`
      } else {
        formatted += `${line}\n`
      }
    }
  } else {
    formatted += data.content
  }

  return formatted
}

/**
 * Formats email data
 */
function formatEmailResponse(data: any): string {
  if (!data || !data.emails) {
    return "No emails found."
  }

  let formatted = "## 📧 Email Messages\n\n"

  for (const email of data.emails) {
    formatted += `### ${email.subject}\n\n`
    formatted += `**From:** ${email.from}\n`
    formatted += `**To:** ${email.to}\n`
    formatted += `**Date:** ${new Date(email.date).toLocaleString()}\n`

    if (email.hasAttachments) {
      formatted += `📎 **Has attachments**\n`
    }

    formatted += `\n${email.snippet || email.body}\n`
    formatted += '\n---\n\n'
  }

  return formatted
}

/**
 * Formats task/todo data
 */
function formatTaskResponse(data: any): string {
  if (!data || !data.tasks) {
    return "No tasks found."
  }

  let formatted = "## ✅ Tasks\n\n"

  const groupedByStatus = data.tasks.reduce((acc: any, task: any) => {
    const status = task.status || 'todo'
    if (!acc[status]) acc[status] = []
    acc[status].push(task)
    return acc
  }, {})

  for (const [status, tasks] of Object.entries(groupedByStatus)) {
    const icon = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⏳'
    formatted += `### ${icon} ${status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}\n\n`

    for (const task of tasks as any[]) {
      formatted += `- **${task.title}**`

      if (task.dueDate) {
        const dueDate = new Date(task.dueDate)
        const isOverdue = dueDate < new Date()
        formatted += ` (Due: ${dueDate.toLocaleDateString()}${isOverdue ? ' ⚠️ OVERDUE' : ''})`
      }

      if (task.assignee) {
        formatted += ` - Assigned to: ${task.assignee}`
      }

      formatted += '\n'

      if (task.description) {
        formatted += `  ${task.description}\n`
      }
    }

    formatted += '\n'
  }

  return formatted
}

/**
 * Formats table/spreadsheet data
 */
function formatTableResponse(data: any): string {
  if (!data || !data.rows) {
    return "No data found."
  }

  let formatted = "## 📊 Data Table\n\n"

  if (data.tableName) {
    formatted += `**Table:** ${data.tableName}\n\n`
  }

  const headers = data.headers || Object.keys(data.rows[0] || {})

  // Create markdown table
  formatted += '| ' + headers.join(' | ') + ' |\n'
  formatted += '| ' + headers.map(() => '---').join(' | ') + ' |\n'

  for (const row of data.rows) {
    const values = headers.map((header: string) => row[header] || '')
    formatted += '| ' + values.join(' | ') + ' |\n'
  }

  if (data.totalRows && data.totalRows > data.rows.length) {
    formatted += `\n*Showing ${data.rows.length} of ${data.totalRows} rows*\n`
  }

  return formatted
}

/**
 * Main formatting function that intelligently formats based on data type
 */
export function formatAIResponse(
  aiResponse: string,
  context?: {
    integration?: string
    dataType?: string
    rawData?: any
  }
): FormattedResponse {
  try {
    // Try to parse structured data if available
    let structuredData = context?.rawData

    // Detect data type
    const type = context?.dataType as FormattedResponse['type'] || detectDataType(aiResponse, context)

    logger.debug('Smart formatter detected type:', type)

    // Format based on type
    let formattedContent = aiResponse

    if (structuredData) {
      switch (type) {
        case 'calendar':
          formattedContent = formatCalendarResponse(structuredData)
          break
        case 'document':
          formattedContent = formatDocumentResponse(structuredData)
          break
        case 'email':
          formattedContent = formatEmailResponse(structuredData)
          break
        case 'task':
          formattedContent = formatTaskResponse(structuredData)
          break
        case 'table':
          formattedContent = formatTableResponse(structuredData)
          break
      }
    }

    // Extract metadata
    const metadata: FormattedResponse['metadata'] = {
      integration: context?.integration,
      timestamp: new Date().toISOString()
    }

    return {
      type,
      content: formattedContent,
      metadata,
      structuredData
    }
  } catch (error) {
    logger.error('Error in smart formatter:', error)
    return {
      type: 'generic',
      content: aiResponse
    }
  }
}

/**
 * Extracts structured data from integration responses
 */
export function extractStructuredData(integration: string, data: any): any {
  switch (integration) {
    case 'google_calendar':
      return {
        events: data.items?.map((item: any) => ({
          title: item.summary,
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          location: item.location,
          description: item.description,
          attendees: item.attendees?.map((a: any) => a.email)
        })) || []
      }

    case 'google_drive':
    case 'onedrive':
      return {
        fileName: data.name,
        source: integration === 'google_drive' ? 'Google Drive' : 'OneDrive',
        lastModified: data.modifiedTime || data.lastModifiedDateTime,
        content: data.content,
        mimeType: data.mimeType
      }

    case 'gmail':
    case 'outlook':
      return {
        emails: data.messages?.map((msg: any) => ({
          subject: msg.subject,
          from: msg.from,
          to: msg.to,
          date: msg.date || msg.receivedDateTime,
          snippet: msg.snippet || msg.bodyPreview,
          body: msg.body,
          hasAttachments: (msg.attachments?.length || 0) > 0
        })) || []
      }

    case 'notion':
    case 'trello':
      return {
        tasks: data.results?.map((item: any) => ({
          title: item.title || item.name,
          status: item.status,
          dueDate: item.dueDate || item.due,
          assignee: item.assignee,
          description: item.description
        })) || []
      }

    case 'airtable':
      return {
        tableName: data.tableName,
        headers: data.fields,
        rows: data.records?.map((r: any) => r.fields) || [],
        totalRows: data.records?.length || 0
      }

    default:
      return data
  }
}
