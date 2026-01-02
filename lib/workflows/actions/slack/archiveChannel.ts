/**
 * Slack Archive Channel Action
 */

import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken } from './utils'

export async function archiveChannel(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params

  try {
    const { workspace, channel, channelId, asUser = false } = config

    // Use channelId if provided, otherwise use channel from dropdown
    const targetChannel = channelId || channel
    if (!targetChannel) {
      throw new Error('Channel or Channel ID is required')
    }

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    const response = await fetch('https://slack.com/api/conversations.archive', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ channel: targetChannel })
    })

    const result = await response.json()

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`)
    }

    return {
      success: true,
      output: { success: true, channelId: targetChannel },
      message: 'Channel archived successfully'
    }
  } catch (error: any) {
    logger.error('[Slack Archive Channel] Error:', error)
    return {
      success: false,
      output: { success: false, error: error.message },
      message: `Failed to archive channel: ${error.message}`
    }
  }
}

export const slackActionArchiveChannel = archiveChannel
