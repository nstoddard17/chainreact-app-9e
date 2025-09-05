import { ExecutionContext } from "../workflowExecutionService"
import { GmailIntegrationService } from "../integrations/gmailIntegrationService"
import { SlackIntegrationService } from "../integrations/slackIntegrationService"
import { GoogleIntegrationService } from "../integrations/googleIntegrationService"
import { LegacyIntegrationService } from "../legacyIntegrationService"

export class IntegrationNodeHandlers {
  private gmailService: GmailIntegrationService
  private slackService: SlackIntegrationService
  private googleService: GoogleIntegrationService
  private legacyService: LegacyIntegrationService

  constructor() {
    this.gmailService = new GmailIntegrationService()
    this.slackService = new SlackIntegrationService()
    this.googleService = new GoogleIntegrationService()
    this.legacyService = new LegacyIntegrationService()
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
    if (nodeType.startsWith('google_') || nodeType.startsWith('sheets_') || nodeType.startsWith('calendar_')) {
      return await this.googleService.execute(node, context)
    }

    // Other integrations - route to specific handlers
    switch (nodeType) {
      case "webhook_call":
        return await this.executeWebhookCall(node, context)
      case "send_email":
        return await this.executeSendEmail(node, context)
      case "onedrive_upload_file":
        return await this.legacyService.executeOneDriveUpload(node, context)
      case "dropbox_upload_file":
        return await this.legacyService.executeDropboxUpload(node, context)
      default:
        // Fallback to legacy executeAction for unknown integrations
        return await this.legacyService.executeFallbackAction(node, context)
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

}