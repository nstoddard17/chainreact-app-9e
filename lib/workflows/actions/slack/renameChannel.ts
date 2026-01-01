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
    const { channel, newName } = config
    if (!channel) throw new Error('Channel is required')
    if (!newName) throw new Error('New name is required')

    const accessToken = await getSlackToken(userId)
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
