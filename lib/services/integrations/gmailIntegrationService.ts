import { ExecutionContext } from "../workflowExecutionService"
import { LegacyIntegrationService } from "../legacyIntegrationService"

export class GmailIntegrationService {
  private legacyService: LegacyIntegrationService

  constructor() {
    this.legacyService = new LegacyIntegrationService()
  }

  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type

    switch (nodeType) {
      case "gmail_action_send_email":
      case "gmail_send":  // Handle legacy/alternative type name
        return await this.executeSendEmail(node, context)
      case "gmail_action_add_label":
        return await this.executeAddLabel(node, context)
      case "gmail_action_remove_label":
        return await this.executeRemoveLabel(node, context)
      case "gmail_action_mark_read":
        return await this.executeMarkRead(node, context)
      case "gmail_action_mark_unread":
        return await this.executeMarkUnread(node, context)
      case "gmail_action_archive":
        return await this.executeArchive(node, context)
      case "gmail_action_delete":
        return await this.executeDelete(node, context)
      default:
        throw new Error(`Unknown Gmail action: ${nodeType}`)
    }
  }

  private async executeSendEmail(node: any, context: ExecutionContext) {
    console.log("📧 Executing Gmail send email")
    
    const config = node.data.config || {}
    const to = this.resolveValue(config.to, context)
    const subject = this.resolveValue(config.subject, context)
    const body = this.resolveValue(config.body, context)
    const cc = this.resolveValue(config.cc, context)
    const bcc = this.resolveValue(config.bcc, context)

    if (!to || !subject) {
      throw new Error("Gmail send email requires 'to' and 'subject' fields")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_send_email",
        to,
        subject,
        body,
        cc,
        bcc,
        status: "sent (test mode)",
        messageId: "test-message-id"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeAddLabel(node: any, context: ExecutionContext) {
    console.log("🏷️ Executing Gmail add label")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)
    const labelId = this.resolveValue(config.labelId || config.label_id, context)

    if (!messageId || !labelId) {
      throw new Error("Gmail add label requires 'messageId' and 'labelId' fields")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_add_label",
        messageId,
        labelId,
        status: "label added (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeRemoveLabel(node: any, context: ExecutionContext) {
    console.log("🏷️ Executing Gmail remove label")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)
    const labelId = this.resolveValue(config.labelId || config.label_id, context)

    if (!messageId || !labelId) {
      throw new Error("Gmail remove label requires 'messageId' and 'labelId' fields")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_remove_label",
        messageId,
        labelId,
        status: "label removed (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeMarkRead(node: any, context: ExecutionContext) {
    console.log("👁️ Executing Gmail mark read")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)

    if (!messageId) {
      throw new Error("Gmail mark read requires 'messageId' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_mark_read",
        messageId,
        status: "marked read (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeMarkUnread(node: any, context: ExecutionContext) {
    console.log("👁️ Executing Gmail mark unread")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)

    if (!messageId) {
      throw new Error("Gmail mark unread requires 'messageId' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_mark_unread",
        messageId,
        status: "marked unread (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeArchive(node: any, context: ExecutionContext) {
    console.log("📦 Executing Gmail archive")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)

    if (!messageId) {
      throw new Error("Gmail archive requires 'messageId' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_archive",
        messageId,
        status: "archived (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeDelete(node: any, context: ExecutionContext) {
    console.log("🗑️ Executing Gmail delete")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)

    if (!messageId) {
      throw new Error("Gmail delete requires 'messageId' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_delete",
        messageId,
        status: "deleted (test mode)"
      }
    }

    // Use legacy service for actual Gmail API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private resolveValue(value: any, context: ExecutionContext): any {
    if (typeof value === 'string' && context.dataFlowManager) {
      return context.dataFlowManager.resolveVariables(value)
    }
    return value
  }
}