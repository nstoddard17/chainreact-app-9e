import { ExecutionContext } from "../workflowExecutionService"
import { GmailIntegrationService } from "../integrations/gmailIntegrationService"
import { SlackIntegrationService } from "../integrations/slackIntegrationService"
import { GoogleIntegrationService } from "../integrations/googleIntegrationService"

export class IntegrationNodeHandlers {
  private gmailService: GmailIntegrationService
  private slackService: SlackIntegrationService
  private googleService: GoogleIntegrationService

  constructor() {
    this.gmailService = new GmailIntegrationService()
    this.slackService = new SlackIntegrationService()
    this.googleService = new GoogleIntegrationService()
  }

  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type
    console.log(`🔌 Executing integration node: ${nodeType}`)
    console.log(`📌 IntegrationHandlers - Context userId: ${context.userId}`)

    // Gmail integrations
    if (nodeType.startsWith('gmail_')) {
      return await this.gmailService.execute(node, context)
    }

    // Slack integrations
    if (nodeType.startsWith('slack_')) {
      // Use the new action handlers for specific actions
      if (nodeType === 'slack_action_send_message') {
        const { slackActionSendMessage } = await import('@/lib/workflows/actions/slack')
        const config = node.data.config || {}
        const result = await slackActionSendMessage(config, context.userId, context.data || {})

        if (!result.success) {
          throw new Error(result.message || 'Failed to send Slack message')
        }

        return result.output
      }

      if (nodeType === 'slack_action_create_channel') {
        const { createSlackChannel } = await import('@/lib/workflows/actions/slack')
        const config = node.data.config || {}
        const result = await createSlackChannel(config, context.userId, context.data || {})

        if (!result.success) {
          throw new Error(result.message || 'Failed to create Slack channel')
        }

        return result.output
      }

      // Fall back to the service for other Slack actions
      return await this.slackService.execute(node, context)
    }

    // Google integrations (Drive, Sheets, Docs, Calendar)
    if (nodeType.startsWith('google_') || nodeType.startsWith('google-') || nodeType.startsWith('sheets_') || nodeType.startsWith('calendar_')) {
      return await this.googleService.execute(node, context)
    }

    // Microsoft Outlook integrations
    if (nodeType.startsWith('microsoft-outlook_') || nodeType.startsWith('outlook_')) {
      const config = node.data.config || {}
      switch (nodeType) {
        case 'microsoft-outlook_trigger_new_email':
          // Triggers in manual execution return sample data
          // In production, webhooks would provide real data
          console.log('📧 Outlook email trigger executing in mode:', context.testMode ? 'test' : 'live')

          // For manual workflow execution (Run Once), always return sample data
          // Real triggers would be handled by webhooks that provide actual email data
          return {
            id: context.testMode ? 'test-email-123' : `email-${Date.now()}`,
            subject: 'Sample Email for Workflow Testing',
            from: {
              name: 'Workflow Test Sender',
              email: 'test@example.com'
            },
            to: [{
              name: 'Workflow Test Recipient',
              email: 'recipient@example.com'
            }],
            body: 'This is sample email content used for testing your workflow execution.',
            bodyPreview: 'This is sample email content...',
            receivedDateTime: new Date().toISOString(),
            hasAttachments: false,
            isRead: false,
            importance: 'normal',
            conversationId: `conv-${Date.now()}`,
            messageId: `msg-${Date.now()}@outlook.com`
          }

        case 'microsoft-outlook_action_send_email': {
          const { sendOutlookEmail } = await import('@/lib/workflows/actions/microsoft-outlook')
          const result = await sendOutlookEmail(config, context.userId, context.data || {})
          if (!result?.success) {
            throw new Error(result?.message || 'Failed to send Outlook email')
          }
          return result.output
        }
        case 'microsoft-outlook_action_create_calendar_event': {
          const { createOutlookCalendarEvent } = await import('@/lib/workflows/actions/microsoft-outlook')
          const result = await createOutlookCalendarEvent(config, context.userId, context.data || {})
          if (!result?.success) {
            throw new Error(result?.message || 'Failed to create Outlook calendar event')
          }
          return result.output
        }
        default:
          throw new Error(`Unsupported Microsoft Outlook action: ${nodeType}`)
      }
    }

    // Microsoft OneNote integrations
    if (nodeType.startsWith('microsoft-onenote_') || nodeType.startsWith('onenote_')) {
      const config = node.data.config || {}
      switch (nodeType) {
        case 'microsoft-onenote_action_create_notebook': {
          const { onenoteCreateNotebook } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteCreateNotebook({
            displayName: config.displayName,
            userRole: config.userRole,
            overwriteIfExists: config.overwriteIfExists
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to create OneNote notebook')
          }
          return result
        }
        case 'microsoft-onenote_action_create_section': {
          const { onenoteCreateSection } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteCreateSection({
            notebookId: config.notebookId,
            displayName: config.displayName
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to create OneNote section')
          }
          return result
        }
        case 'microsoft-onenote_action_create_page': {
          const { onenoteCreatePage } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteCreatePage({
            notebookId: config.notebookId,
            sectionId: config.sectionId,
            title: config.title,
            content: config.content,
            contentType: config.contentType
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to create OneNote page')
          }
          return result
        }
        case 'microsoft-onenote_action_update_page': {
          const { onenoteUpdatePage } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteUpdatePage({
            notebookId: config.notebookId,
            sectionId: config.sectionId,
            pageId: config.pageId,
            content: config.content,
            updateMode: config.updateMode,
            target: config.target,
            position: config.position
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to update OneNote page')
          }
          return result
        }
        case 'microsoft-onenote_action_get_page_content': {
          const { onenoteGetPageContent } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteGetPageContent({
            notebookId: config.notebookId,
            sectionId: config.sectionId,
            pageId: config.pageId,
            includeIDs: config.includeIDs
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to get OneNote page content')
          }
          return result
        }
        case 'microsoft-onenote_action_get_pages': {
          const { onenoteGetPages } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteGetPages({
            notebookId: config.notebookId,
            sectionId: config.sectionId
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to get OneNote pages')
          }
          return result
        }
        case 'microsoft-onenote_action_copy_page': {
          const { onenoteCopyPage } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteCopyPage({
            pageId: config.pageId,
            destinationSectionId: config.destinationSectionId
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to copy OneNote page')
          }
          return result
        }
        case 'microsoft-onenote_action_search': {
          const { onenoteSearch } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteSearch({
            query: config.query,
            notebookId: config.notebookId,
            sectionId: config.sectionId
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to search OneNote')
          }
          return result
        }
        case 'microsoft-onenote_action_delete_page': {
          const { onenoteDeletePage } = await import('@/lib/workflows/actions/microsoft-onenote')
          const result = await onenoteDeletePage({
            pageId: config.pageId
          }, context as any)
          if (!result?.success) {
            throw new Error(result?.error || result?.message || 'Failed to delete OneNote page')
          }
          return result
        }
        default:
          throw new Error(`Unknown OneNote action type: ${nodeType}`)
      }
    }

    // Discord integrations
    if (nodeType.startsWith('discord_')) {
      return await this.executeDiscordAction(node, context)
    }

    // Airtable integrations
    if (nodeType.startsWith('airtable_')) {
      return await this.executeAirtableAction(node, context)
    }

    // Notion integrations
    if (nodeType.startsWith('notion_')) {
      return await this.executeNotionAction(node, context)
    }

    // HubSpot integrations
    if (nodeType.startsWith('hubspot_')) {
      return await this.executeHubSpotAction(node, context)
    }

    // Trello integrations
    if (nodeType.startsWith('trello_')) {
      return await this.executeTrelloAction(node, context)
    }

    // Microsoft Excel integrations
    if (nodeType.startsWith('microsoft_excel_') || nodeType.startsWith('microsoft-excel_')) {
      return await this.executeMicrosoftExcelAction(node, context)
    }

    // Other integrations - route to specific handlers
    switch (nodeType) {
      case "webhook_call":
        return await this.executeWebhookCall(node, context)
      case "send_email":
        return await this.executeSendEmail(node, context)
      case "onedrive_upload_file":
      case "onedrive_action_upload_file":
        return await this.executeOneDriveUpload(node, context)
      case "dropbox_upload_file":
      case "dropbox_action_upload_file":
        return await this.executeDropboxUpload(node, context)
      default:
        // For unknown integrations, return a descriptive error
        throw new Error(`Integration type '${nodeType}' is not yet implemented. Please check if this action is available.`)
    }
  }

  private async executeWebhookCall(node: any, context: ExecutionContext) {
    console.log("🌐 Executing webhook call")
    
    const url = node.data.config?.url
    const method = node.data.config?.method || 'POST'
    const headers = node.data.config?.headers || {}
    const body = node.data.config?.body || context.data

    if (!url) {
      throw new Error("Webhook URL is required")
    }

    if (context.testMode) {
      return {
        type: "webhook_call",
        url,
        method,
        status: "success (test mode)",
        response: { message: "Test webhook response" }
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: method !== 'GET' ? JSON.stringify(body) : undefined
      })

      const responseData = await response.json().catch(() => ({}))

      return {
        type: "webhook_call",
        url,
        method,
        status: response.status,
        response: responseData
      }
    } catch (error: any) {
      throw new Error(`Webhook call failed: ${error.message}`)
    }
  }

  private async executeSendEmail(node: any, context: ExecutionContext) {
    console.log("📧 Executing send email")
    
    const to = node.data.config?.to
    const subject = node.data.config?.subject
    const body = node.data.config?.body

    if (!to || !subject) {
      throw new Error("Email recipient and subject are required")
    }

    if (context.testMode) {
      return {
        type: "send_email",
        to,
        subject,
        status: "sent (test mode)"
      }
    }

    // TODO: Implement actual email sending logic
    return {
      type: "send_email",
      to,
      subject,
      body,
      status: "sent"
    }
  }

  private async executeOneDriveUpload(node: any, context: ExecutionContext) {
    console.log("☁️ Executing OneDrive upload")

    const config = node.data.config || {}

    console.log("📦 OneDrive config received:", JSON.stringify(config, null, 2))
    console.log("📦 Node data:", JSON.stringify(node.data, null, 2))

    // Process OneDrive file upload

    // If in test mode, return mock data
    if (context.testMode) {
      return {
        type: "onedrive_action_upload_file",
        fileName: config.fileName || "test.txt",
        folder: config.folderId || "/",
        status: "uploaded (test mode)",
        fileId: "test-onedrive-file-id"
      }
    }

    try {
      // Import the OneDrive action handler directly
      const { uploadFileToOneDrive } = await import('@/lib/workflows/actions/onedrive')

      // Get node outputs from context
      const nodeOutputs = {}
      if (context.dataFlowManager && typeof context.dataFlowManager.getNodeOutput === 'function') {
        // Get outputs from all previous nodes
        const allNodes = context.dataFlowManager.nodeOutputs || {}
        Object.assign(nodeOutputs, allNodes)
      }

      // Call the handler
      const result = await uploadFileToOneDrive(
        config,
        context.userId,
        {
          nodeOutputs,
          ...context.data
        }
      )

      // Check if the action failed
      if (!result.success) {
        throw new Error(result.message || "OneDrive upload failed")
      }

      return result.output || result
    } catch (error: any) {
      console.error("❌ OneDrive upload error:", error)
      throw error
    }
  }

  private async executeDiscordAction(node: any, context: ExecutionContext) {
    console.log("💬 Executing Discord action")
    console.log(`   Node type: "${node.data.type}"`)
    console.log(`   User ID: ${context.userId}`)
    console.log(`🔍 [INTEGRATION DEBUG] Full context:`)
    console.log(`   context.userId: ${context.userId}`)
    console.log(`   context.data:`, JSON.stringify(context.data, null, 2))

    const nodeType = node.data.type
    const config = node.data.config || {}

    console.log(`🔍 [INTEGRATION DEBUG] Node config:`)
    console.log(JSON.stringify(config, null, 2))

    // Import the actual Discord action handlers
    const { sendDiscordMessage } = await import("@/lib/workflows/actions/discord")

    // Handle different Discord action types
    switch (nodeType) {
      case "discord_action_send_message":
      case "discord_action_send_channel_message": // This is the actual type used
      case "discord_send_channel_message":
        console.log("📤 Sending Discord channel message...")
        console.log(`   Channel ID: ${config.channelId || 'not set'}`)
        console.log(`   Has message: ${!!config.message}`)
        console.log(`🔍 [INTEGRATION DEBUG] About to call sendDiscordMessage with userId: ${context.userId}`)

        // Use the actual Discord message sending function
        const result = await sendDiscordMessage(
          config,
          context.userId,
          context.data || {}
        )

        console.log(`   Discord send result: ${result.success ? '✅ Success' : '❌ Failed'}`)
        if (!result.success) {
          console.log(`   Error: ${result.message}`)
          throw new Error(result.message || "Failed to send Discord message")
        }

        return result.output
      
      case "discord_action_send_dm":
      case "discord_send_dm":
        const { sendDiscordDirectMessage } = await import("@/lib/workflows/actions/discord")
        const dmResult = await sendDiscordDirectMessage(
          config,
          context.userId,
          context.data || {}
        )
        if (!dmResult.success) {
          throw new Error(dmResult.message || "Failed to send Discord DM")
        }
        return dmResult.output

      case "discord_action_edit_message":
        const { editDiscordMessage } = await import("@/lib/workflows/actions/discord")
        const editResult = await editDiscordMessage(
          config,
          context.userId,
          context.data || {}
        )
        if (!editResult.success) {
          throw new Error(editResult.message || "Failed to edit Discord message")
        }
        return editResult.output

      case "discord_action_delete_message":
        const { deleteDiscordMessage } = await import("@/lib/workflows/actions/discord")
        const deleteResult = await deleteDiscordMessage(
          config,
          context.userId,
          context.data || {}
        )
        if (!deleteResult.success) {
          throw new Error(deleteResult.message || "Failed to delete Discord message")
        }
        return deleteResult.output

      case "discord_action_fetch_messages":
        const { fetchDiscordMessages } = await import("@/lib/workflows/actions/discord")
        const fetchResult = await fetchDiscordMessages(
          config,
          context.userId,
          context.data || {}
        )
        if (!fetchResult.success) {
          throw new Error(fetchResult.message || "Failed to fetch Discord messages")
        }
        return fetchResult.output

      default:
        throw new Error(`Unknown Discord action type: ${nodeType}`)
    }
  }

  private async executeAirtableAction(node: any, context: ExecutionContext) {
    console.log("📊 Executing Airtable action")

    const nodeType = node.data.type
    const config = node.data.config || {}

    // Handle different Airtable action types
    switch (nodeType) {
      case "airtable_create_record":
      case "airtable_action_create_record":  // Handle both naming conventions
        // Import and use the actual Airtable create record handler
        const { createAirtableRecord } = await import("@/lib/workflows/actions/airtable/createRecord")

        const createResult = await createAirtableRecord(
          config,
          context.userId,
          context.data || {}
        )

        if (!createResult.success) {
          throw new Error(createResult.error || createResult.message || "Failed to create Airtable record")
        }

        return createResult.output

      case "airtable_update_record":
      case "airtable_action_update_record":  // Handle both naming conventions
        // Import and use the actual Airtable update record handler
        const { updateAirtableRecord } = await import("@/lib/workflows/actions/airtable/updateRecord")

        const updateResult = await updateAirtableRecord(
          config,
          context.userId,
          context.data || {}
        )

        if (!updateResult.success) {
          throw new Error(updateResult.error || updateResult.message || "Failed to update Airtable record")
        }

        return updateResult.output

      case "airtable_delete_record":
      case "airtable_action_delete_record":  // Handle both naming conventions
        // TODO: Implement when delete record handler is available
        throw new Error("Airtable delete record is not yet implemented")

      case "airtable_list_records":
      case "airtable_action_list_records":  // Handle both naming conventions
        // Import and use the actual Airtable list records handler
        const { listAirtableRecords } = await import("@/lib/workflows/actions/airtable/listRecords")

        const listResult = await listAirtableRecords(
          config,
          context.userId,
          context.data || {}
        )

        if (!listResult.success) {
          throw new Error(listResult.error || listResult.message || "Failed to list Airtable records")
        }

        return listResult.output

      default:
        throw new Error(`Unknown Airtable action type: ${nodeType}`)
    }
  }

  private async executeNotionAction(node: any, context: ExecutionContext) {
    console.log("📝 Executing Notion action")

    const nodeType = node.data.type
    const config = node.data.config || {}

    // Handle different Notion action types
    switch (nodeType) {
      case "notion_action_manage_page":
        // Import and use the actual Notion manage page handler
        const { executeNotionManagePage } = await import("@/lib/workflows/actions/registry")

        const managePageResult = await executeNotionManagePage(
          config,
          context.userId,
          context.data || {}
        )

        if (!managePageResult.success) {
          throw new Error(managePageResult.message || "Failed to execute Notion manage page action")
        }

        return managePageResult.output

      case "notion_action_manage_database":
        // Import and use the actual Notion manage database handler
        const { executeNotionManageDatabase } = await import("@/lib/workflows/actions/registry")

        const manageDatabaseResult = await executeNotionManageDatabase(
          config,
          context.userId,
          context.data || {}
        )

        if (!manageDatabaseResult.success) {
          throw new Error(manageDatabaseResult.message || "Failed to execute Notion manage database action")
        }

        return manageDatabaseResult.output

      case "notion_action_manage_comments":
        // Import and use the actual Notion manage comments handler
        const { executeNotionManageComments } = await import("@/lib/workflows/actions/registry")

        const manageCommentsResult = await executeNotionManageComments(
          config,
          context.userId,
          context.data || {}
        )

        if (!manageCommentsResult.success) {
          throw new Error(manageCommentsResult.message || "Failed to execute Notion manage comments action")
        }

        return manageCommentsResult.output

      case "notion_action_manage_users":
        // Import and use the actual Notion manage users handler
        const { executeNotionManageUsers } = await import("@/lib/workflows/actions/registry")

        const manageUsersResult = await executeNotionManageUsers(
          config,
          context.userId,
          context.data || {}
        )

        if (!manageUsersResult.success) {
          throw new Error(manageUsersResult.message || "Failed to execute Notion manage users action")
        }

        return manageUsersResult.output

      case "notion_action_get_page_details":
        // Import and use the actual Notion get page details handler
        const { executeNotionGetPageDetails } = await import("@/lib/workflows/actions/registry")

        const getPageDetailsResult = await executeNotionGetPageDetails(
          config,
          context.userId,
          context.data || {}
        )

        if (!getPageDetailsResult.success) {
          throw new Error(getPageDetailsResult.message || "Failed to execute Notion get page details action")
        }

        return getPageDetailsResult.output

      case "notion_action_search":
        // Import and use the actual Notion search handler
        const { executeNotionSearch } = await import("@/lib/workflows/actions/registry")

        const searchResult = await executeNotionSearch(
          config,
          context.userId,
          context.data || {}
        )

        if (!searchResult.success) {
          throw new Error(searchResult.message || "Failed to execute Notion search action")
        }

        return searchResult.output

      default:
        throw new Error(`Unknown Notion action type: ${nodeType}`)
    }
  }

  private async executeDropboxUpload(node: any, context: ExecutionContext) {
    console.log("📦 Executing Dropbox upload")

    const config = node.data.config || {}

    // Import the actual Dropbox upload handler
    const { uploadDropboxFile } = await import('@/lib/workflows/actions/dropbox/uploadFile')

    // Call the handler with the proper config and context
    const result = await uploadDropboxFile(config, context)

    if (!result.success) {
      throw new Error(result.error || "Dropbox upload failed")
    }

    return result.output
  }

  private async executeTrelloAction(node: any, context: ExecutionContext) {
    console.log("📋 Executing Trello action")
    const nodeType = node.data.type
    const config = node.data.config || {}

    // Handle different Trello action types
    switch (nodeType) {
      case "trello_action_create_card":
        // Import and use the actual Trello create card handler
        const { createTrelloCard } = await import("@/lib/workflows/actions/trello")
        const createCardResult = await createTrelloCard(
          config,
          context.userId,
          context.data || {}
        )

        if (!createCardResult.success) {
          throw new Error(createCardResult.message || "Failed to create Trello card")
        }

        return createCardResult.output

      case "trello_action_create_list":
        // Import and use the actual Trello create list handler
        const { createTrelloList } = await import("@/lib/workflows/actions/trello")
        const createListResult = await createTrelloList(
          config,
          context.userId,
          context.data || {}
        )

        if (!createListResult.success) {
          throw new Error(createListResult.message || "Failed to create Trello list")
        }

        return createListResult.output

      case "trello_action_move_card":
        // Import and use the actual Trello move card handler
        const { moveTrelloCard } = await import("@/lib/workflows/actions/trello")
        const moveCardResult = await moveTrelloCard(
          config,
          context.userId,
          context.data || {}
        )

        if (!moveCardResult.success) {
          throw new Error(moveCardResult.message || "Failed to move Trello card")
        }

        return moveCardResult.output

      case "trello_action_create_board":
        // Import and use the actual Trello create board handler
        const { createTrelloBoard } = await import("@/lib/workflows/actions/trello")
        const createBoardResult = await createTrelloBoard(
          config,
          context.userId,
          context.data || {}
        )

        if (!createBoardResult.success) {
          throw new Error(createBoardResult.message || "Failed to create Trello board")
        }

        return createBoardResult.output

      default:
        throw new Error(`Unknown Trello action type: ${nodeType}`)
    }
  }

  private async executeHubSpotAction(node: any, context: ExecutionContext) {
    console.log("🎯 Executing HubSpot action")
    const nodeType = node.data.type
    const config = node.data.config || {}

    // Resolve any variable references in the configuration
    // Note: We'll use the config as-is since variable resolution happens in the action handlers
    const resolvedConfig = config

    // Handle different HubSpot action types
    switch (nodeType) {
      case "hubspot_action_create_contact":
      case "hubspot_action_create_contact_dynamic": // Handle dynamic version too
        // Import and use the actual HubSpot create contact handler
        const { createHubSpotContact } = await import("@/lib/workflows/actions/hubspot")
        const createContactResult = await createHubSpotContact(
          resolvedConfig,
          context.userId,
          context.data || {}
        )

        if (!createContactResult.success) {
          throw new Error(createContactResult.message || "Failed to create HubSpot contact")
        }

        return createContactResult.output

      case "hubspot_action_create_company":
        // Import and use the actual HubSpot create company handler
        const { createHubSpotCompany } = await import("@/lib/workflows/actions/hubspot")
        const createCompanyResult = await createHubSpotCompany(
          resolvedConfig,
          context.userId,
          context.data || {}
        )

        if (!createCompanyResult.success) {
          throw new Error(createCompanyResult.message || "Failed to create HubSpot company")
        }

        return createCompanyResult.output

      case "hubspot_action_create_deal":
        // Import and use the actual HubSpot create deal handler
        const { createHubSpotDeal } = await import("@/lib/workflows/actions/hubspot")
        const createDealResult = await createHubSpotDeal(
          resolvedConfig,
          context.userId,
          context.data || {}
        )

        if (!createDealResult.success) {
          throw new Error(createDealResult.message || "Failed to create HubSpot deal")
        }

        return createDealResult.output

      case "hubspot_action_add_contact_to_list":
        // Import and use the actual HubSpot add contact to list handler
        const { addContactToHubSpotList } = await import("@/lib/workflows/actions/hubspot")
        const addToListResult = await addContactToHubSpotList(
          resolvedConfig,
          context.userId,
          context.data || {}
        )

        if (!addToListResult.success) {
          throw new Error(addToListResult.message || "Failed to add contact to HubSpot list")
        }

        return addToListResult.output

      case "hubspot_action_update_deal":
        // Import and use the actual HubSpot update deal handler
        const { updateHubSpotDeal } = await import("@/lib/workflows/actions/hubspot")
        const updateDealResult = await updateHubSpotDeal(
          resolvedConfig,
          context.userId,
          context.data || {}
        )

        if (!updateDealResult.success) {
          throw new Error(updateDealResult.message || "Failed to update HubSpot deal")
        }

        return updateDealResult.output

      default:
        throw new Error(`Unknown HubSpot action type: ${nodeType}`)
    }
  }

  private async executeMicrosoftExcelAction(node: any, context: ExecutionContext) {
    console.log("📊 Executing Microsoft Excel action")
    const nodeType = node.data.type
    const config = node.data.config || {}

    console.log(`   Excel action type: ${nodeType}`)
    console.log(`   Config:`, JSON.stringify(config, null, 2))

    // Handle different Microsoft Excel action types
    switch (nodeType) {
      case "microsoft_excel_action_create_workbook":
      case "microsoft-excel_action_create_workbook":
        // Import and use the actual Excel create workbook handler
        const { createMicrosoftExcelWorkbook } = await import("@/lib/workflows/actions/microsoft-excel")
        const createWorkbookResult = await createMicrosoftExcelWorkbook(
          config,
          context.userId,
          context.data || {}
        )

        if (!createWorkbookResult.success) {
          throw new Error(createWorkbookResult.message || "Failed to create Excel workbook")
        }

        return createWorkbookResult.output

      case "microsoft_excel_action_create_row":
      case "microsoft-excel_action_create_row":
        // Import and use the actual Excel create row handler
        const { createMicrosoftExcelRow } = await import("@/lib/workflows/actions/microsoft-excel")
        const createRowResult = await createMicrosoftExcelRow(
          config,
          context.userId,
          context.data || {}
        )

        if (!createRowResult.success) {
          throw new Error(createRowResult.message || "Failed to create Excel row")
        }

        return createRowResult.output

      case "microsoft_excel_action_update_row":
      case "microsoft-excel_action_update_row":
        // Import and use the actual Excel update row handler
        const { updateMicrosoftExcelRow } = await import("@/lib/workflows/actions/microsoft-excel")
        const updateRowResult = await updateMicrosoftExcelRow(
          config,
          context.userId,
          context.data || {}
        )

        if (!updateRowResult.success) {
          throw new Error(updateRowResult.message || "Failed to update Excel row")
        }

        return updateRowResult.output

      case "microsoft_excel_action_delete_row":
      case "microsoft-excel_action_delete_row":
        // Import and use the actual Excel delete row handler
        const { deleteMicrosoftExcelRow } = await import("@/lib/workflows/actions/microsoft-excel")
        const deleteRowResult = await deleteMicrosoftExcelRow(
          config,
          context.userId,
          context.data || {}
        )

        if (!deleteRowResult.success) {
          throw new Error(deleteRowResult.message || "Failed to delete Excel row")
        }

        return deleteRowResult.output

      case "microsoft_excel_action_export_sheet":
      case "microsoft-excel_action_export_sheet":
        // Import and use the actual Excel export sheet handler
        const { exportMicrosoftExcelSheet } = await import("@/lib/workflows/actions/microsoft-excel")
        const exportSheetResult = await exportMicrosoftExcelSheet(
          config,
          context.userId,
          context.data || {}
        )

        if (!exportSheetResult.success) {
          throw new Error(exportSheetResult.message || "Failed to export Excel sheet")
        }

        return exportSheetResult.output

      case "microsoft_excel_action_manage_data":
      case "microsoft-excel_action_manage_data":
        // Use the unified action handler for manage data
        const { executeMicrosoftExcelUnifiedAction } = await import("@/lib/workflows/actions/microsoft-excel")
        const manageDataResult = await executeMicrosoftExcelUnifiedAction(
          config,
          context.userId,
          context.data || {}
        )

        if (!manageDataResult.success) {
          throw new Error(manageDataResult.message || "Failed to manage Excel data")
        }

        return manageDataResult.output

      default:
        throw new Error(`Unknown Microsoft Excel action type: ${nodeType}`)
    }
  }

}