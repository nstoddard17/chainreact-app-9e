import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

import { logger } from '@/lib/utils/logger'

export class SocialActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Social", intent)

    const socialIntegrations = this.filterIntegrationsByProvider(integrations, [
      "twitter", "linkedin", "facebook", "instagram", "youtube"
    ])
    this.logIntegrationsFound("Social", socialIntegrations)

    if (socialIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("social media", "Twitter, LinkedIn, Facebook, Instagram, or YouTube")
    }

    try {
      const action = intent.action || "get_mentions"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(socialIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible social integration is connected.")
      }

      if (integration.provider === "facebook") {
        if (action === "get_page_insights" || action === "get_insights") {
          return this.handleFacebookInsights(parameters, userId)
        }
        return this.getErrorResponse("Facebook queries are limited to page insights at the moment.")
      }

      switch (action) {
        case "get_mentions":
          return this.handleGetMentions(parameters, integration, userId)
        case "search_posts":
          return this.handleSearchPosts(parameters, integration, userId)
        case "get_posts":
        case "get_timeline":
          return this.handleTimeline(parameters, integration, userId)
        default:
          return this.getErrorResponse(`Social query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Social query error:", error)
      return this.getErrorResponse("Failed to fetch social data.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Social Action", intent)

    const socialIntegrations = this.filterIntegrationsByProvider(integrations, [
      "twitter", "linkedin", "facebook", "instagram", "youtube"
    ])
    this.logIntegrationsFound("Social", socialIntegrations)

    if (socialIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("social media", "Twitter, LinkedIn, Facebook, Instagram, or YouTube")
    }

    try {
      const action = intent.action || "post_update"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || parameters.platform || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(socialIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible social integration is connected.")
      }

      if (integration.provider === "facebook") {
        if (action === "post_update" || action === "create_post") {
          return this.handleFacebookPost(parameters, userId)
        }
        if (action === "send_message") {
          return this.handleFacebookSendMessage(parameters, userId)
        }
        return this.getErrorResponse(`Facebook action "${action}" is not supported yet.`)
      }

      switch (action) {
        case "post_update":
          return this.handlePostUpdate(parameters, integration, userId)
        case "reply_post":
          return this.handleReply(parameters, integration, userId)
        default:
          return this.getErrorResponse(`Social action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Social action error:", error)
      return this.getErrorResponse("Failed to complete the social action.")
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
    return integrations[0] || null
  }

  private async handleGetMentions(
    parameters: any,
    integration: Integration,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (integration.provider !== "twitter") {
      return this.getErrorResponse("Mentions lookup currently supports Twitter accounts.")
    }

    const result = await this.executeAction(
      userId,
      "twitter_action_get_mentions",
      {
        limit: Math.min(Number(parameters.limit || 20), 100)
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch mentions.")
    }

    const mentions = result.output?.mentions || []

    return this.getSuccessResponse(
      `Found ${mentions.length} mention${mentions.length === 1 ? "" : "s"} on Twitter.`,
      {
        type: "social_query",
        provider: "twitter",
        mentions
      }
    )
  }

  private async handleSearchPosts(
    parameters: any,
    integration: Integration,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (integration.provider !== "twitter") {
      return this.getErrorResponse("Post search currently supports Twitter accounts.")
    }

    const query = parameters.query || parameters.search
    if (!query) {
      return this.getErrorResponse("Provide keywords to search posts.")
    }

    const result = await this.executeAction(
      userId,
      "twitter_action_search_tweets",
      {
        query,
        maxResults: Math.min(Number(parameters.limit || 25), 100)
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to search posts.")
    }

    return this.getSuccessResponse(
      `Found ${result.output?.tweets?.length || 0} post${(result.output?.tweets?.length || 0) === 1 ? "" : "s"} matching "${query}".`,
      {
        type: "social_query",
        provider: "twitter",
        query,
        tweets: result.output?.tweets || []
      }
    )
  }

  private async handleTimeline(
    parameters: any,
    integration: Integration,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (integration.provider !== "twitter") {
      return this.getErrorResponse("Timeline retrieval currently supports Twitter accounts.")
    }

    const username = parameters.username || parameters.handle

    const config: Record<string, any> = {
      username,
      maxResults: Math.min(Number(parameters.limit || 20), 100)
    }

    const result = await this.executeAction(
      userId,
      "twitter_action_get_user_timeline",
      config
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch the timeline.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.tweets?.length || 0} timeline post${(result.output?.tweets?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "social_query",
        provider: "twitter",
        username,
        tweets: result.output?.tweets || []
      }
    )
  }

  private async handlePostUpdate(
    parameters: any,
    integration: Integration,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (integration.provider !== "twitter") {
      return this.getErrorResponse("Posting updates currently supports Twitter accounts.")
    }

    const text = parameters.message || parameters.content || parameters.text
    if (!text) {
      return this.getErrorResponse("Provide the content for the tweet.")
    }

    const result = await this.executeAction(
      userId,
      "twitter_action_post_tweet",
      {
        text,
        mediaIds: parameters.mediaIds,
        inReplyToStatusId: parameters.replyToId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to post the update.")
    }

    return this.getSuccessResponse(
      "Tweet posted successfully.",
      {
        type: "social_action",
        provider: "twitter",
        tweet: result.output?.tweet || {},
        text
      }
    )
  }

  private async handleReply(
    parameters: any,
    integration: Integration,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (integration.provider !== "twitter") {
      return this.getErrorResponse("Replying currently supports Twitter accounts.")
    }

    const text = parameters.message || parameters.content || parameters.text
    const replyToId = parameters.replyToId || parameters.tweetId

    if (!text || !replyToId) {
      return this.getErrorResponse("Provide both the reply content and the tweet ID to reply to.")
    }

    const result = await this.executeAction(
      userId,
      "twitter_action_reply_tweet",
      {
        text,
        inReplyToStatusId: replyToId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to reply to the tweet.")
    }

    return this.getSuccessResponse(
      "Reply posted successfully.",
      {
        type: "social_action",
        provider: "twitter",
        reply: result.output?.tweet || {},
        text,
      replyToId
      }
    )
  }

  private async handleFacebookInsights(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const pageId = parameters.pageId || parameters.page_id
    const metric = parameters.metric || "page_engaged_users"
    const period = (parameters.period || "day").toLowerCase()
    const periodCount = Number(parameters.periodCount || parameters.period_count || 1)

    if (!pageId) {
      return this.getErrorResponse("Please provide the Facebook page ID.")
    }

    const result = await this.executeAction(
      userId,
      "facebook_action_get_page_insights",
      {
        pageId,
        metric,
        period,
        periodCount
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to retrieve Facebook page insights.")
    }

    return this.getSuccessResponse(
      `Retrieved ${metric} insights for Facebook page ${pageId}.`,
      {
        type: "social_query",
        provider: "facebook",
        pageId,
        metric,
        period,
        periodCount,
        insights: result.output?.insights || result.output
      }
    )
  }

  private async handleFacebookPost(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const pageId = parameters.pageId || parameters.page_id
    const message = parameters.message || parameters.content || parameters.text

    if (!pageId || !message) {
      return this.getErrorResponse("Facebook posts require both page ID and message content.")
    }

    const result = await this.executeAction(
      userId,
      "facebook_action_create_post",
      {
        pageId,
        message,
        mediaFile: parameters.mediaFile || parameters.media || parameters.file,
        scheduledPublishTime: parameters.scheduledPublishTime || parameters.scheduledTime,
        productLinkUrl: parameters.productLinkUrl,
        productLinkName: parameters.productLinkName,
        productPromoCode: parameters.productPromoCode,
        paidPartnershipLabel: parameters.paidPartnershipLabel
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to publish the Facebook post.")
    }

    return this.getSuccessResponse(
      "Facebook post created successfully.",
      {
        type: "social_action",
        provider: "facebook",
        pageId,
        post: result.output?.post || result.output
      }
    )
  }

  private async handleFacebookSendMessage(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const pageId = parameters.pageId || parameters.page_id
    const recipientId = parameters.recipientId || parameters.conversationId || parameters.userId
    const message = parameters.message || parameters.content || parameters.text

    if (!pageId || !recipientId || !message) {
      return this.getErrorResponse("Facebook messaging requires page ID, recipient ID, and message content.")
    }

    const result = await this.executeAction(
      userId,
      "facebook_action_send_message",
      {
        pageId,
        recipientId,
        message,
        quickReplies: parameters.quickReplies,
        typingIndicator: parameters.typingIndicator
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to send the Facebook message.")
    }

    return this.getSuccessResponse(
      "Sent Facebook message successfully.",
      {
        type: "social_action",
        provider: "facebook",
        pageId,
        recipientId,
        message
      }
    )
  }
}
