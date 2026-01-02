import { ActionResult } from '../core/executeWait'
import { ExecutionContext } from '../../execution/types'
import { getSlackToken } from './utils'

import { logger } from '@/lib/utils/logger'

/**
 * Get messages from a Slack channel
 */
export async function getSlackMessages(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Resolve dynamic values
    const workspace = context.dataFlowManager.resolveVariable(config.workspace)
    const channel = context.dataFlowManager.resolveVariable(config.channel)
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const oldest = context.dataFlowManager.resolveVariable(config.oldest)
    const latest = context.dataFlowManager.resolveVariable(config.latest)
    const includeThreads = context.dataFlowManager.resolveVariable(config.includeThreads) || false
    const asUser = config.asUser === true

    if (!channel) {
      throw new Error("Channel is required")
    }

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const accessToken = workspace
      ? await getSlackToken(workspace, true, asUser)
      : await getSlackToken(context.userId, false, asUser)

    // Build query params
    const params: any = {
      channel,
      limit: Math.min(limit, 1000)
    }

    if (oldest) {
      // Convert datetime to Unix timestamp if needed
      params.oldest = typeof oldest === 'string' ? new Date(oldest).getTime() / 1000 : oldest
    }

    if (latest) {
      params.latest = typeof latest === 'string' ? new Date(latest).getTime() / 1000 : latest
    }

    const queryString = new URLSearchParams(params).toString()

    const response = await fetch(`https://slack.com/api/conversations.history?${queryString}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error || 'Unknown error'}`)
    }

    const messages = data.messages || []

    return {
      success: true,
      output: {
        messages,
        count: messages.length,
        hasMore: data.has_more || false
      },
      message: `Successfully retrieved ${messages.length} messages from channel`
    }
  } catch (error: any) {
    logger.error('Slack Get Messages error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve messages from Slack'
    }
  }
}
