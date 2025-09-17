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
      return await this.slackService.execute(node, context)
    }

    // Google integrations (Drive, Sheets, Docs, Calendar)
    if (nodeType.startsWith('google_') || nodeType.startsWith('google-') || nodeType.startsWith('sheets_') || nodeType.startsWith('calendar_')) {
      return await this.googleService.execute(node, context)
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

    // Other integrations - route to specific handlers
    switch (nodeType) {
      case "webhook_call":
        return await this.executeWebhookCall(node, context)
      case "send_email":
        return await this.executeSendEmail(node, context)
      case "onedrive_upload_file":
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
    const fileName = config.fileName || "file.txt"
    const fileContent = config.fileContent || config.content
    const folder = config.folder || "/"

    if (!fileName || !fileContent) {
      throw new Error("OneDrive upload requires 'fileName' and 'fileContent' fields")
    }

    if (context.testMode) {
      return {
        type: "onedrive_upload_file",
        fileName,
        folder,
        status: "uploaded (test mode)",
        fileId: "test-onedrive-file-id"
      }
    }

    // TODO: Implement actual OneDrive upload when action is available
    throw new Error("OneDrive upload is not yet implemented. This integration is coming soon.")
  }

  private async executeDiscordAction(node: any, context: ExecutionContext) {
    console.log("💬 Executing Discord action")

    const nodeType = node.data.type
    const config = node.data.config || {}

    // Import the actual Discord action handlers
    const { sendDiscordMessage } = await import("@/lib/workflows/actions/discord")

    // Handle different Discord action types
    switch (nodeType) {
      case "discord_action_send_message":
      case "discord_send_channel_message":
        // Use the actual Discord message sending function
        const result = await sendDiscordMessage(
          config,
          context.userId,
          context.data || {}
        )

        if (!result.success) {
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
          context
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
          context
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
          context
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
          context
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
          context
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
          context
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

  private async executeHubSpotAction(node: any, context: ExecutionContext) {
    console.log("🎯 Executing HubSpot action")
    const nodeType = node.data.type
    const config = node.data.config || {}

    // Resolve any variable references in the configuration
    const resolvedConfig = context.dataFlowManager.resolveVariables(config, context.data)

    // Handle different HubSpot action types
    switch (nodeType) {
      case "hubspot_action_create_contact":
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

}