import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

import { logger } from '@/lib/utils/logger'

export class CommunicationActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Communication", intent)

    const communicationIntegrations = this.filterIntegrationsByProvider(integrations, [
      "slack", "discord", "mailchimp", "manychat", "beehiiv"
    ])
    this.logIntegrationsFound("Communication", communicationIntegrations)

    if (communicationIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("communication", "Slack, Discord, Mailchimp, ManyChat, or beehiiv")
    }

    try {
      const action = intent.action || "get_messages"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration

      const hasMailchimp = communicationIntegrations.some(i => i.provider === "mailchimp")
      if (
        hasMailchimp &&
        (requestedProvider === "mailchimp" || action === "get_subscribers" || action === "list_subscribers")
      ) {
        return this.handleMailchimpSubscribers(parameters, userId)
      }

      switch (action) {
        case "get_messages":
        case "fetch_messages":
          return this.handleGetMessages(parameters, communicationIntegrations, userId)
        default:
          return this.getErrorResponse(`Communication query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Communication query error:", error)
      return this.getErrorResponse("Failed to complete the communication request.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Communication Action", intent)

    const communicationIntegrations = this.filterIntegrationsByProvider(integrations, [
      "slack", "discord", "mailchimp", "manychat", "beehiiv"
    ])
    this.logIntegrationsFound("Communication", communicationIntegrations)

    if (communicationIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("communication", "Slack, Discord, Mailchimp, ManyChat, or beehiiv")
    }

    try {
      const action = intent.action || "send_message"
      const parameters = intent.parameters || {}

      switch (action) {
        case "send_message":
        case "post_message":
        case "notify_team":
          return this.handleSendMessage(parameters, communicationIntegrations, userId)
        default:
          return this.getErrorResponse(`Communication action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Communication action error:", error)
      return this.getErrorResponse("Failed to perform the communication action.")
    }
  }

  private getPreferredIntegration(
    integrations: Integration[],
    specified?: string
  ): Integration | null {
    if (specified) {
      const match = integrations.find(i => i.provider === specified)
      if (match) return match
    }
    return integrations.find(i => ["slack", "discord"].includes(i.provider)) || integrations[0] || null
  }

  private async handleGetMessages(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration) {
      return this.getErrorResponse("No compatible communication integration found.")
    }

    const channel = parameters.channel || parameters.channelId || parameters.conversation
    if (!channel) {
      return this.getErrorResponse("Please specify the channel or conversation to inspect.")
    }

    if (integration.provider === "slack") {
      const result = await this.executeAction(
        userId,
        "slack_action_get_messages",
        {
          channel,
          limit: Math.min(Number(parameters.limit || 50), 200)
        }
      )

      if (!result.success) {
        return this.getErrorResponse(result.message || "Failed to fetch Slack messages.")
      }

      return this.getSuccessResponse(
        `Fetched ${result.output?.count || 0} Slack message${(result.output?.count || 0) === 1 ? "" : "s"} from ${channel}.`,
        {
          type: "communication_query",
          provider: "slack",
          channel,
          messages: result.output?.messages || [],
          count: result.output?.count || 0
        }
      )
    }

    if (integration.provider === "discord") {
      const result = await this.executeAction(
        userId,
        "discord_action_fetch_messages",
        {
          channelId: channel,
          limit: Math.min(Number(parameters.limit || 50), 100)
        }
      )

      if (!result.success) {
        return this.getErrorResponse(result.message || "Failed to fetch Discord messages.")
      }

      return this.getSuccessResponse(
        `Fetched ${result.output?.messages?.length || 0} Discord message${(result.output?.messages?.length || 0) === 1 ? "" : "s"} from ${channel}.`,
        {
          type: "communication_query",
          provider: "discord",
          channel,
          messages: result.output?.messages || [],
          count: result.output?.messages?.length || 0
        }
      )
    }

    return this.getErrorResponse(`Fetching messages for ${integration.provider} is not yet supported.`)
  }

  private async handleMailchimpSubscribers(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const audienceId = parameters.audienceId || parameters.listId || parameters.audience_id
    if (!audienceId) {
      return this.getErrorResponse("Please provide the Mailchimp audience ID.")
    }

    const result = await this.executeAction(
      userId,
      "mailchimp_action_get_subscribers",
      {
        audience_id: audienceId,
        status: parameters.status,
        limit: parameters.limit,
        offset: parameters.offset
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to retrieve subscribers from Mailchimp.")
    }

    const subscribers = result.output?.subscribers || []

    return this.getSuccessResponse(
      `Retrieved ${subscribers.length} subscriber${subscribers.length === 1 ? "" : "s"} from Mailchimp.`,
      {
        type: "communication_query",
        provider: "mailchimp",
        audienceId,
        subscribers,
        total: result.output?.totalItems
      }
    )
  }

  private async handleSendMessage(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider || parameters.platform)
    if (!integration) {
      return this.getErrorResponse("No compatible communication integration found.")
    }

    const channel = parameters.channel || parameters.channelId || parameters.conversation
    const message = parameters.message || parameters.content || parameters.text

    if (!channel) {
      return this.getErrorResponse("Please specify the channel to send the message to.")
    }

    if (!message) {
      return this.getErrorResponse("Please provide the message content.")
    }

    if (integration.provider === "slack") {
      const result = await this.executeAction(
        userId,
        "slack_action_send_message",
        {
          channel,
          message,
          threadTs: parameters.threadTs,
          attachments: parameters.attachments,
          blocks: parameters.blocks
        }
      )

      if (!result.success) {
        return this.getErrorResponse(result.message || "Failed to send Slack message.", "communication_error")
      }

      return this.getSuccessResponse(
        `Sent Slack message to ${channel}.`,
        {
          type: "communication_action",
          provider: "slack",
          channel,
          message,
          slackResult: result.output
        }
      )
    }

    if (integration.provider === "discord") {
      const result = await this.executeAction(
        userId,
        "discord_action_send_message",
        {
          channelId: channel,
          content: message,
          embeds: parameters.embeds,
          username: parameters.username,
          avatarUrl: parameters.avatarUrl
        }
      )

      if (!result.success) {
        return this.getErrorResponse(result.message || "Failed to send Discord message.", "communication_error")
      }

      return this.getSuccessResponse(
        `Sent Discord message to ${channel}.`,
        {
          type: "communication_action",
          provider: "discord",
          channel,
          message,
          discordResult: result.output
        }
      )
    }

    return this.getErrorResponse(`Sending messages with ${integration.provider} is not yet supported.`)
  }
}
