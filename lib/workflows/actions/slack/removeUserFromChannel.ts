/**
 * Slack Remove User From Channel Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function removeUserFromChannel(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, user } = config
    if (!channel) throw new Error('Channel is required')
    if (!user) throw new Error('User is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('conversations.kick', accessToken, { channel, user })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channelId: channel, userId: user },
      message: 'User removed from channel'
    }
  } catch (error: any) {
    logger.error('[Slack Remove User] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionRemoveUserFromChannel = removeUserFromChannel
