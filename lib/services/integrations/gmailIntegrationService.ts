import { ExecutionContext } from "../workflowExecutionService"

export class GmailIntegrationService {
  constructor() {
    // No legacy service needed - we use direct implementations
  }

  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type
    console.log(`📧 GmailIntegrationService - nodeType: ${nodeType}`)
    console.log(`📌 GmailIntegrationService - Context userId: ${context.userId}`)

    switch (nodeType) {
      case "gmail_action_send_email":
      case "gmail_send":  // Handle legacy/alternative type name
        return await this.executeSendEmail(node, context)
      case "gmail_action_search_email":
        return await this.executeSearchEmail(node, context)
      case "gmail_action_fetch_message":
        return await this.executeFetchMessage(node, context)
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

    // Import and use the actual Gmail send implementation directly
    const { sendGmailEmail } = await import('@/lib/workflows/actions/gmail/sendEmail')
    
    // Call the Gmail send function with proper parameters
    const result = await sendGmailEmail(
      config,
      context.userId,  // Pass the userId directly from context
      context.data || {}
    )
    
    return result
  }

  private async executeSearchEmail(node: any, context: ExecutionContext) {
    console.log("🔍 Executing Gmail search email")
    
    const config = node.data.config || {}
    const query = this.resolveValue(config.query, context)
    const maxResults = this.resolveValue(config.maxResults || 10, context)

    if (!query) {
      throw new Error("Gmail search email requires 'query' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_search_email",
        query,
        maxResults,
        status: "searched (test mode)",
        messages: []
      }
    }

    // Import and use the actual Gmail search implementation directly
    const { searchGmailEmails } = await import('@/lib/workflows/actions/gmail')
    
    // Call the Gmail search function with proper parameters
    const result = await searchGmailEmails(
      config,
      context.userId,  // Pass the userId directly from context
      context.data || {}
    )
    
    return result
  }

  private async executeFetchMessage(node: any, context: ExecutionContext) {
    console.log("📨 Executing Gmail fetch message")
    
    const config = node.data.config || {}
    const messageId = this.resolveValue(config.messageId || config.message_id, context)

    if (!messageId) {
      throw new Error("Gmail fetch message requires 'messageId' field")
    }

    if (context.testMode) {
      return {
        type: "gmail_action_fetch_message",
        messageId,
        status: "fetched (test mode)",
        message: null
      }
    }

    // Import and use the actual Gmail fetch implementation directly
    const { fetchGmailMessage } = await import('@/lib/workflows/actions/gmail/fetchMessage')
    
    // Call the Gmail fetch function with proper parameters
    const result = await fetchGmailMessage(
      config,
      context.userId,  // Pass the userId directly from context
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Call with proper parameters
    const result = await applyGmailLabels(
      {
        ...config,
        addLabels: [labelId],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Call with proper parameters
    const result = await applyGmailLabels(
      {
        ...config,
        removeLabels: [labelId],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Remove UNREAD label to mark as read
    const result = await applyGmailLabels(
      {
        ...config,
        removeLabels: ['UNREAD'],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Add UNREAD label to mark as unread
    const result = await applyGmailLabels(
      {
        ...config,
        addLabels: ['UNREAD'],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Remove INBOX label to archive
    const result = await applyGmailLabels(
      {
        ...config,
        removeLabels: ['INBOX'],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
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

    // Import and use the actual Gmail implementation directly
    const { applyGmailLabels } = await import('@/lib/workflows/actions/gmail/applyLabels')
    
    // Add TRASH label to move to trash
    const result = await applyGmailLabels(
      {
        ...config,
        addLabels: ['TRASH'],
        messageId
      },
      context.userId,
      context.data || {}
    )
    
    return result
  }

  private resolveValue(value: any, context: ExecutionContext): any {
    if (typeof value === 'string' && context.dataFlowManager) {
      return context.dataFlowManager.resolveVariable(value)
    }
    return value
  }
}