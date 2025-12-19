import { ExecutionContext } from "../workflowExecutionService"
import { TriggerTestMode } from "../testMode/types"
import { getMockTriggerData } from "../testMode/mockTriggerData"

import { logger } from '@/lib/utils/logger'

export class TriggerNodeHandlers {
  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type

    // Check if we should use mock data
    const useMockData = context.testMode &&
      context.testModeConfig?.triggerMode === TriggerTestMode.USE_MOCK_DATA

    logger.debug(`🎯 Trigger execution mode: ${useMockData ? 'MOCK DATA' : 'REAL DATA'}`, {
      nodeType,
      testMode: context.testMode,
      triggerMode: context.testModeConfig?.triggerMode
    })

    // If using mock data, return it immediately
    if (useMockData) {
      const mockData = getMockTriggerData(nodeType)
      logger.debug(`📝 Using mock data for ${nodeType}`, mockData)
      return {
        success: true,
        output: mockData,
        mockData: true,
        triggerType: nodeType
      }
    }

    switch (nodeType) {
      case "webhook":
        return await this.executeWebhookTrigger(node, context)
      case "schedule":
        return await this.executeScheduleTrigger(node, context)
      case "manual":
      case "manual_trigger":
        return await this.executeManualTrigger(node, context)
      case "gmail_trigger_new_email":
        return await this.executeGmailTrigger(node, context)
      case "gmail_trigger_new_attachment":
        return await this.executeGmailAttachmentTrigger(node, context)
      case "gmail_trigger_new_label":
        return await this.executeGmailLabelTrigger(node, context)
      case "google_calendar_trigger_new_event":
        return await this.executeCalendarNewEventTrigger(node, context)
      case "google_calendar_trigger_event_updated":
        return await this.executeCalendarEventUpdatedTrigger(node, context)
      case "google_calendar_trigger_event_canceled":
        return await this.executeCalendarEventCanceledTrigger(node, context)
      case "google-drive:new_file_in_folder":
      case "google-drive:new_folder_in_folder":
      case "google-drive:file_updated":
        return await this.executeGoogleDriveTrigger(node, context)
      default:
        throw new Error(`Unknown trigger node type: ${nodeType}`)
    }
  }

  private async executeWebhookTrigger(node: any, context: ExecutionContext) {
    logger.debug("🪝 Executing webhook trigger")

    const timestamp = new Date().toISOString()
    const config = node.data?.config || {}

    // In test mode, return mock data
    if (context.testMode) {
      return {
        type: "webhook",
        triggered: true,
        data: context.data || { message: "Test webhook data", test: true },
        headers: { "content-type": "application/json", "x-test-mode": "true" },
        query: { test: "true" },
        method: config.method || "POST",
        path: config.path || "/webhook-path",
        timestamp
      }
    }

    // In real execution, extract webhook data from context
    // Context should contain the full webhook request data including headers, query params, etc.
    return {
      type: "webhook",
      triggered: true,
      data: context.data?.body || context.data || {},
      headers: context.data?.headers || {},
      query: context.data?.query || {},
      method: context.data?.method || config.method || "POST",
      path: context.data?.path || config.path || "/webhook-path",
      timestamp
    }
  }

  private async executeScheduleTrigger(node: any, context: ExecutionContext) {
    logger.debug("⏰ Executing schedule trigger")

    const config = node.data?.config || {}
    const scheduledTime = new Date().toISOString()

    // Calculate next run time based on cron expression
    // For now, we'll just add 1 hour as a placeholder
    const nextRunDate = new Date()
    nextRunDate.setHours(nextRunDate.getHours() + 1)
    const nextRun = nextRunDate.toISOString()

    return {
      type: "schedule",
      triggered: true,
      scheduledTime,
      cronExpression: config.cron || "0 * * * *",
      timezone: config.timezone || "UTC",
      nextRun,
      data: context.data || {}
    }
  }

  private async executeManualTrigger(node: any, context: ExecutionContext) {
    logger.debug("👆 Executing manual trigger")

    const config = node.data?.config || {}
    const timestamp = new Date().toISOString()

    // Parse input data if provided in config
    let inputData = {}
    if (config.inputData) {
      try {
        inputData = typeof config.inputData === 'string'
          ? JSON.parse(config.inputData)
          : config.inputData
      } catch (e) {
        logger.warn("Failed to parse manual trigger input data:", e)
        inputData = { raw: config.inputData }
      }
    }

    // Merge config input data with context data
    const manualData = {
      ...inputData,
      ...(context.data || {})
    }

    return {
      type: "manual",
      triggered: true,
      triggeredBy: context.userId || "unknown",
      manualData,
      timestamp
    }
  }

  private async executeGmailTrigger(node: any, context: ExecutionContext) {
    logger.debug("📧 Executing Gmail new email trigger")
    
    if (context.testMode) {
      return {
        type: "gmail_trigger_new_email",
        triggered: true,
        email: {
          id: "test-email-id",
          subject: "Test Email Subject",
          from: "test@example.com",
          body: "This is a test email body",
          timestamp: new Date().toISOString()
        }
      }
    }

    // TODO: Implement actual Gmail webhook processing
    return {
      type: "gmail_trigger_new_email",
      triggered: true,
      email: context.data?.email || {}
    }
  }

  private async executeGmailAttachmentTrigger(node: any, context: ExecutionContext) {
    logger.debug("📎 Executing Gmail attachment trigger")
    
    if (context.testMode) {
      return {
        type: "gmail_trigger_new_attachment",
        triggered: true,
        email: {
          id: "test-email-id",
          subject: "Email with Attachment",
          attachments: [
            {
              filename: "test-document.pdf",
              mimeType: "application/pdf",
              size: 12345
            }
          ]
        }
      }
    }

    // TODO: Implement actual Gmail attachment processing
    return {
      type: "gmail_trigger_new_attachment",
      triggered: true,
      email: context.data?.email || {}
    }
  }

  private async executeGmailLabelTrigger(node: any, context: ExecutionContext) {
    logger.debug("🏷️ Executing Gmail label trigger")
    
    return {
      type: "gmail_trigger_new_label",
      triggered: true,
      data: context.data || {}
    }
  }

  private async executeCalendarNewEventTrigger(node: any, context: ExecutionContext) {
    logger.debug("📅 Executing Calendar new event trigger")
    
    return {
      type: "google_calendar_trigger_new_event",
      triggered: true,
      data: context.data || {}
    }
  }

  private async executeCalendarEventUpdatedTrigger(node: any, context: ExecutionContext) {
    logger.debug("📅 Executing Calendar event updated trigger")
    
    return {
      type: "google_calendar_trigger_event_updated",
      triggered: true,
      data: context.data || {}
    }
  }

  private async executeCalendarEventCanceledTrigger(node: any, context: ExecutionContext) {
    logger.debug("📅 Executing Calendar event canceled trigger")
    
    return {
      type: "google_calendar_trigger_event_canceled",
      triggered: true,
      data: context.data || {}
    }
  }

  private async executeGoogleDriveTrigger(node: any, context: ExecutionContext) {
    logger.debug("📁 Executing Google Drive trigger")
    
    return {
      type: node.data.type,
      triggered: true,
      data: context.data || {}
    }
  }
}