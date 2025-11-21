import { ActionResult } from './core/executeWait'
import { resolveValue } from './core/resolveValue'

import { logger } from '@/lib/utils/logger'

/**
 * Generic action handler for actions that don't have specific implementations yet
 * Provides mock responses for testing and development
 */
export async function executeGenericAction(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    
    // Extract action type from config
    const actionType = resolvedConfig.actionType || "generic"
    
    // Generate mock response based on action type
    const mockResponse = generateMockResponse(actionType, resolvedConfig, input)
    
    return {
      success: true,
      output: mockResponse,
      message: `Mock ${actionType} action executed successfully (development mode)`
    }

  } catch (error: any) {
    logger.error("Generic action error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to execute generic action"
    }
  }
}

/**
 * Generate appropriate mock responses for different action types
 */
function generateMockResponse(actionType: string, config: any, input: any): any {
  const timestamp = new Date().toISOString()
  const baseResponse = {
    actionType,
    timestamp,
    config,
    input,
    mock: true
  }

  switch (actionType) {
    case "send_email":
    case "email_action_send":
      return {
        ...baseResponse,
        messageId: `msg_${Date.now()}`,
        to: config.to || ["test@example.com"],
        subject: config.subject || "Test Email",
        sent: true
      }

    case "webhook_call":
    case "webhook_action_call":
      return {
        ...baseResponse,
        url: config.url || "https://api.example.com/webhook",
        method: config.method || "POST",
        statusCode: 200,
        response: { success: true, message: "Webhook called successfully" }
      }

    case "slack_message":
    case "slack_action_send_message":
      return {
        ...baseResponse,
        channel: config.channel || "#general",
        message: config.message || "Test Slack message",
        messageId: `slack_${Date.now()}`,
        sent: true
      }

    case "calendar_event":
    case "google_calendar_action_create_event":
      return {
        ...baseResponse,
        eventId: `event_${Date.now()}`,
        title: config.title || "Test Event",
        startTime: config.startTime || timestamp,
        endTime: config.endTime || timestamp,
        attendees: config.attendees || [],
        created: true
      }

    case "sheets_append":
    case "google_sheets_action_append":
      return {
        ...baseResponse,
        spreadsheetId: config.spreadsheetId || "test_sheet_id",
        sheetName: config.sheetName || "Sheet1",
        rowAdded: true,
        rowIndex: Math.floor(Math.random() * 1000) + 1
      }

    case "sheets_read":
    case "google_sheets_action_read":
      return {
        ...baseResponse,
        spreadsheetId: config.spreadsheetId || "test_sheet_id",
        sheetName: config.sheetName || "Sheet1",
        data: [
          ["Name", "Email", "Status"],
          ["John Doe", "john@example.com", "Active"],
          ["Jane Smith", "jane@example.com", "Inactive"]
        ],
        rowsRead: 3
      }

    case "sheets_update":
    case "google_sheets_action_update":
      return {
        ...baseResponse,
        spreadsheetId: config.spreadsheetId || "test_sheet_id",
        sheetName: config.sheetName || "Sheet1",
        cellRange: config.cellRange || "A1:B1",
        updated: true
      }

    case "sheets_create_spreadsheet":
    case "google_sheets_action_create_spreadsheet":
      return {
        ...baseResponse,
        spreadsheetId: `spreadsheet_${Date.now()}`,
        title: config.title || "New Spreadsheet",
        url: "https://docs.google.com/spreadsheets/d/test",
        created: true
      }

    case "google_docs_action_create_document":
      return {
        ...baseResponse,
        documentId: `doc_${Date.now()}`,
        title: config.title || "New Document",
        url: "https://docs.google.com/document/d/test",
        created: true
      }

    case "google_docs_action_read_document":
      return {
        ...baseResponse,
        documentId: config.documentId || "test_doc_id",
        title: config.title || "Test Document",
        content: config.content || "This is test document content.",
        read: true
      }

    case "google_docs_action_update_document":
      return {
        ...baseResponse,
        documentId: config.documentId || "test_doc_id",
        updated: true,
        changesApplied: true
      }

    case "google_drive_action_upload_file":
      return {
        ...baseResponse,
        fileId: `file_${Date.now()}`,
        fileName: config.fileName || "test_file.txt",
        fileSize: config.fileSize || 1024,
        uploaded: true
      }

    case "onedrive_action_upload_file_from_url":
      return {
        ...baseResponse,
        fileId: `onedrive_${Date.now()}`,
        fileName: config.fileName || "uploaded_file.txt",
        sourceUrl: config.sourceUrl || "https://example.com/file.txt",
        uploaded: true
      }

    case "dropbox_action_upload_file_from_url":
      return {
        ...baseResponse,
        fileId: `dropbox_${Date.now()}`,
        fileName: config.fileName || "uploaded_file.txt",
        sourceUrl: config.sourceUrl || "https://example.com/file.txt",
        uploaded: true
      }

    case "airtable_action_create_record":
      return {
        ...baseResponse,
        recordId: `rec_${Date.now()}`,
        baseId: config.baseId || "test_base",
        tableName: config.tableName || "Test Table",
        created: true
      }

    case "airtable_action_update_record":
      return {
        ...baseResponse,
        recordId: config.recordId || "test_record",
        updated: true,
        changesApplied: true
      }

    case "airtable_action_list_records":
      return {
        ...baseResponse,
        records: [
          { id: "rec1", fields: { Name: "Test Record 1", Status: "Active" } },
          { id: "rec2", fields: { Name: "Test Record 2", Status: "Inactive" } }
        ],
        totalRecords: 2
      }

    case "trello_action_create_board":
      return {
        ...baseResponse,
        boardId: `board_${Date.now()}`,
        boardName: config.name || "Test Board",
        created: true
      }

    case "trello_action_create_list":
      return {
        ...baseResponse,
        listId: `list_${Date.now()}`,
        listName: config.name || "Test List",
        boardId: config.boardId || "test_board",
        created: true
      }

    case "trello_action_create_card":
      return {
        ...baseResponse,
        cardId: `card_${Date.now()}`,
        cardName: config.name || "Test Card",
        listId: config.listId || "test_list",
        created: true
      }

    case "trello_action_move_card":
      return {
        ...baseResponse,
        cardId: config.cardId || "test_card",
        moved: true,
        newListId: config.listId || "new_list",
        position: config.position || "bottom"
      }

    case "hubspot_action_create_contact":
      return {
        ...baseResponse,
        contactId: `contact_${Date.now()}`,
        email: config.email || "test@example.com",
        firstname: config.firstname || "Test",
        lastname: config.lastname || "Contact",
        created: true
      }

    case "hubspot_action_create_company":
      return {
        ...baseResponse,
        companyId: `company_${Date.now()}`,
        name: config.name || "Test Company",
        domain: config.domain || "example.com",
        created: true
      }

    case "hubspot_action_create_deal":
      return {
        ...baseResponse,
        dealId: `deal_${Date.now()}`,
        dealname: config.dealname || "Test Deal",
        amount: config.amount || 10000,
        created: true
      }

    case "notion_action_create_database":
      return {
        ...baseResponse,
        databaseId: `database_${Date.now()}`,
        title: config.title || "Test Database",
        url: "https://notion.so/test-database",
        created: true
      }

    case "notion_action_create_page":
      return {
        ...baseResponse,
        pageId: `page_${Date.now()}`,
        title: config.title || "Test Page",
        url: "https://notion.so/test-page",
        created: true
      }

    case "notion_action_update_page":
      return {
        ...baseResponse,
        pageId: config.pageId || "test_page",
        updated: true,
        changesApplied: true
      }

    case "github_action_create_issue":
      return {
        ...baseResponse,
        issueId: `issue_${Date.now()}`,
        issueNumber: Math.floor(Math.random() * 1000) + 1,
        title: config.title || "Test Issue",
        repository: config.repository || "owner/repo",
        created: true
      }

    case "github_action_create_repository":
      return {
        ...baseResponse,
        repositoryId: `repo_${Date.now()}`,
        name: config.name || "test-repo",
        fullName: config.fullName || "owner/test-repo",
        url: "https://github.com/owner/test-repo",
        created: true
      }

    case "github_action_create_pull_request":
      return {
        ...baseResponse,
        pullRequestId: `pr_${Date.now()}`,
        pullRequestNumber: Math.floor(Math.random() * 1000) + 1,
        title: config.title || "Test Pull Request",
        repository: config.repository || "owner/repo",
        created: true
      }

    case "discord_action_send_message":
      return {
        ...baseResponse,
        messageId: `discord_${Date.now()}`,
        channelId: config.channelId || "test_channel",
        guildId: config.guildId || "test_guild",
        content: config.message || "Test Discord message",
        sent: true
      }

    case "discord_action_create_channel":
      return {
        ...baseResponse,
        channelId: `channel_${Date.now()}`,
        name: config.name || "test-channel",
        guildId: config.guildId || "test_guild",
        created: true
      }

    case "discord_action_add_role":
      return {
        ...baseResponse,
        guildId: config.guildId || "test_guild",
        userId: config.userId || "test_user",
        roleId: config.roleId || "test_role",
        added: true
      }

    default:
      return {
        ...baseResponse,
        message: `Generic ${actionType} action completed`,
        success: true
      }
  }
}


/**
 * Generic delay action
 */
export async function executeDelayAction(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    
    // Support both timeUnit (new) and durationUnit (legacy) field names
    const { duration = 1, timeUnit = "seconds", durationUnit } = resolvedConfig
    const unit = timeUnit || durationUnit || "seconds"
    
    // Convert duration to milliseconds
    let delayMs = duration
    switch (unit) {
      case "milliseconds":
        delayMs = duration
        break
      case "seconds":
        delayMs = duration * 1000
        break
      case "minutes":
        delayMs = duration * 60 * 1000
        break
      case "hours":
        delayMs = duration * 60 * 60 * 1000
        break
      case "days":
        delayMs = duration * 24 * 60 * 60 * 1000
        break
      case "weeks":
        delayMs = duration * 7 * 24 * 60 * 60 * 1000
        break
      case "months":
        // Approximate months as 30 days
        delayMs = duration * 30 * 24 * 60 * 60 * 1000
        break
      default:
        // Default to seconds if unknown unit
        delayMs = duration * 1000
    }
    
    // Cap maximum delay at 30 days to prevent excessive delays
    const maxDelayMs = 30 * 24 * 60 * 60 * 1000
    if (delayMs > maxDelayMs) {
      delayMs = maxDelayMs
      logger.warn(`Delay capped at maximum of 30 days (requested: ${duration} ${unit})`)
    }

    // Record start time
    const startTime = new Date().toISOString()

    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, delayMs))

    // Record end time
    const endTime = new Date().toISOString()

    return {
      success: true,
      output: {
        delayDurationSeconds: delayMs / 1000,
        startTime,
        endTime,
        success: true
      },
      message: `Delay completed after ${duration} ${unit}`
    }
    
  } catch (error: any) {
    logger.error("Delay action error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to execute delay action"
    }
  }
} 