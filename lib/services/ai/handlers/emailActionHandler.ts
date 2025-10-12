import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

import { logger } from '@/lib/utils/logger'

export class EmailActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Email", intent)

    const emailIntegrations = this.filterIntegrationsByProvider(integrations, ["gmail", "microsoft-outlook"])
    this.logIntegrationsFound("Email", emailIntegrations)

    if (emailIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("email", "Gmail or Outlook")
    }

    try {
      const action = intent.action || "get_emails"
      const parameters = intent.parameters || {}

      switch (action) {
        case "get_emails":
        case "get_inbox":
          return this.handleGetEmails(parameters, emailIntegrations, userId)
        case "search_emails":
          return this.handleSearchEmails(parameters, emailIntegrations, userId)
        default:
          return this.getErrorResponse(`Email query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Email query error:", error)
      return this.getErrorResponse("Failed to fetch emails. Please try again.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Email Action", intent)

    const emailIntegrations = this.filterIntegrationsByProvider(integrations, ["gmail", "microsoft-outlook"])
    this.logIntegrationsFound("Email", emailIntegrations)

    if (emailIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("email", "Gmail or Outlook")
    }

    try {
      const action = intent.action || "send_email"
      const parameters = intent.parameters || {}

      switch (action) {
        case "send_email":
          return this.handleSendEmail(parameters, emailIntegrations, userId)
        case "reply_email":
          return this.handleReplyEmail(parameters, emailIntegrations, userId)
        case "forward_email":
          return this.handleForwardEmail(parameters, emailIntegrations, userId)
        default:
          return this.getErrorResponse(`Email action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Email action error:", error)
      return this.getErrorResponse("Failed to perform email action. Please try again.")
    }
  }

  private getPreferredEmailIntegration(
    integrations: Integration[],
    specified?: string
  ): Integration | null {
    if (specified) {
      const match = integrations.find(i => i.provider === specified)
      if (match) return match
    }
    return integrations.find(i => i.provider === "gmail") || integrations[0] || null
  }

  private async handleGetEmails(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredEmailIntegration(integrations, parameters.provider)
    if (!integration) {
      return this.getErrorResponse("No compatible email integration connected.")
    }

    if (integration.provider !== "gmail") {
      return this.getErrorResponse(`Email provider "${integration.provider}" is not yet supported for inbox queries.`)
    }

    const folder = (parameters.folder || "inbox").toString()
    const maxResults = Number(parameters.limit || 10)
    const query = folder === "inbox" ? "in:inbox" : `${parameters.query || ""} in:${folder}`.trim()

    const result = await this.executeAction(
      userId,
      "gmail_action_search_email",
      {
        query: query || "in:inbox",
        maxResults,
        includeSpamTrash: false
      }
    )

    const emails = result.output?.emails || []

    return this.getSuccessResponse(
      `Fetched ${emails.length} email${emails.length === 1 ? "" : "s"} from ${folder}.`,
      {
        type: "email_query",
        provider: integration.provider,
        folder,
        limit: maxResults,
        count: emails.length,
        emails
      }
    )
  }

  private async handleSearchEmails(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredEmailIntegration(integrations, parameters.provider)
    if (!integration) {
      return this.getErrorResponse("No compatible email integration connected.")
    }

    if (integration.provider !== "gmail") {
      return this.getErrorResponse(`Email provider "${integration.provider}" is not yet supported for search.`)
    }

    const query = parameters.query || parameters.search || ""
    if (!query) {
      return this.getErrorResponse("Please provide search keywords for the email lookup.")
    }

    const result = await this.executeAction(
      userId,
      "gmail_action_search_email",
      {
        query,
        maxResults: Number(parameters.limit || 10),
        includeSpamTrash: Boolean(parameters.includeSpam)
      }
    )

    const emails = result.output?.emails || []

    return this.getSuccessResponse(
      `Found ${emails.length} email${emails.length === 1 ? "" : "s"} matching "${query}".`,
      {
        type: "email_search",
        provider: integration.provider,
        query,
        count: emails.length,
        emails
      }
    )
  }

  private async handleSendEmail(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredEmailIntegration(integrations, parameters.provider)
    if (!integration) {
      return this.getErrorResponse("No compatible email integration connected.")
    }

    if (integration.provider !== "gmail") {
      return this.getErrorResponse(`Email provider "${integration.provider}" is not yet supported for sending.`)
    }

    const to = parameters.to || parameters.recipient || ""
    if (!to) {
      return this.getErrorResponse("Please specify a recipient email address.")
    }

    const subject = parameters.subject || parameters.title || "New Email"
    const body = parameters.body || parameters.content || ""
    const cc = parameters.cc
    const bcc = parameters.bcc
    const attachments = parameters.attachments

    const result = await this.executeAction(
      userId,
      "gmail_action_send_email",
      {
        to: Array.isArray(to) ? to.join(",") : to,
        cc,
        bcc,
        subject,
        body,
        isHtml: body?.includes("<"),
        attachments
      },
      {},
      { testMode: Boolean(parameters.testMode) }
    )

    if (!result.success) {
      return this.getErrorResponse(
        result.message || "Failed to send the email.",
        "email_send_failed"
      )
    }

    return this.getSuccessResponse(
      `Email sent to ${to}${cc ? ` (cc: ${cc})` : ""}.`,
      {
        type: "email_send",
        to,
        subject,
        cc,
        bcc,
        attachments,
        requiresConfirmation: false
      }
    )
  }

  private async handleReplyEmail(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const messageId = parameters.messageId || parameters.id || ""
    const content = parameters.content || parameters.body || ""

    if (!messageId) {
      return this.getErrorResponse("Provide the original message ID to reply.")
    }

    const integration = this.getPreferredEmailIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "gmail") {
      return this.getErrorResponse("Email replies currently require a connected Gmail account.")
    }

    const result = await this.executeAction(
      userId,
      "gmail_action_send_email",
      {
        to: parameters.to || parameters.recipient,
        subject: parameters.subject || "Re: your email",
        body: content,
        threadId: parameters.threadId,
        replyToMessageId: messageId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to send the reply.")
    }

    return this.getSuccessResponse(
      "Reply sent.",
      {
        type: "email_reply",
        messageId,
        content,
        requiresConfirmation: false
      }
    )
  }

  private async handleForwardEmail(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const messageId = parameters.messageId || parameters.id || ""
    const to = parameters.to || parameters.recipient || ""

    if (!to) {
      return this.getErrorResponse("Please specify a recipient email address for forwarding.")
    }

    const integration = this.getPreferredEmailIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "gmail") {
      return this.getErrorResponse("Email forwarding currently requires a connected Gmail account.")
    }

    const result = await this.executeAction(
      userId,
      "gmail_action_send_email",
      {
        to,
        subject: parameters.subject || "Fwd:",
        body: parameters.body || "",
        attachments: parameters.attachments,
        forwardMessageId: messageId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to forward the email.")
    }

    return this.getSuccessResponse(
      `Forwarded to ${to}.`,
      {
        type: "email_forward",
        messageId,
        to,
        requiresConfirmation: false
      }
    )
  }
}
