/**
 * Slack Rename Channel Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function renameChannel(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, newName, asUser = false } = config
    if (!channel) throw new Error('Channel is required')
    if (!newName) throw new Error('New name is required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)
    const result = await callSlackApi('conversations.rename', accessToken, { channel, name: newName })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channelId: channel, newName: result.channel?.name },
      message: `Channel renamed to ${result.channel?.name}`
    }
  } catch (error: any) {
    logger.error('[Slack Rename Channel] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionRenameChannel = renameChannel
