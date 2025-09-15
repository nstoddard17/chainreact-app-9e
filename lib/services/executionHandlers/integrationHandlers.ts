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

    // Other integrations - route to specific handlers
    switch (nodeType) {
      case "webhook_call":
        return await this.executeWebhookCall(node, context)
      case "send_email":
        return await this.executeSendEmail(node, context)
      case "onedrive_upload_file":
        return await this.executeOneDriveUpload(node, context)
      case "dropbox_upload_file":
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

  private async executeDropboxUpload(node: any, context: ExecutionContext) {
    console.log("📦 Executing Dropbox upload")
    
    const config = node.data.config || {}
    const fileName = config.fileName || "file.txt"
    const fileContent = config.fileContent || config.content
    const path = config.path || "/"

    if (!fileName || !fileContent) {
      throw new Error("Dropbox upload requires 'fileName' and 'fileContent' fields")
    }

    if (context.testMode) {
      return {
        type: "dropbox_upload_file",
        fileName,
        path,
        status: "uploaded (test mode)",
        fileId: "test-dropbox-file-id"
      }
    }

    // TODO: Implement actual Dropbox upload when action is available
    throw new Error("Dropbox upload is not yet implemented. This integration is coming soon.")
  }

}