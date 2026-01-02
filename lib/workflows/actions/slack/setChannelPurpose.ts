/**
 * Slack Set Channel Purpose Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function setChannelPurpose(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, purpose, asUser = false } = config
    if (!channel) throw new Error('Channel is required')
    if (!purpose) throw new Error('Purpose is required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)
    const result = await callSlackApi('conversations.setPurpose', accessToken, { channel, purpose })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channelId: channel, purpose: result.purpose },
      message: 'Channel purpose updated'
    }
  } catch (error: any) {
    logger.error('[Slack Set Channel Purpose] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionSetChannelPurpose = setChannelPurpose
