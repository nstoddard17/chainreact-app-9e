/**
 * Slack Unarchive Channel Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function unarchiveChannel(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, asUser = false } = config
    if (!channel) throw new Error('Channel is required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)
    const result = await callSlackApi('conversations.unarchive', accessToken, { channel })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    return {
      success: true,
      output: { success: true, channelId: channel },
      message: 'Channel unarchived successfully'
    }
  } catch (error: any) {
    logger.error('[Slack Unarchive Channel] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUnarchiveChannel = unarchiveChannel
