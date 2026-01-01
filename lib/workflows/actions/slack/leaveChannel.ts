/**
 * Slack Leave Channel Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function leaveChannel(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel } = config
    if (!channel) throw new Error('Channel is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('conversations.leave', accessToken, { channel })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channelId: channel },
      message: 'Left channel successfully'
    }
  } catch (error: any) {
    logger.error('[Slack Leave Channel] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionLeaveChannel = leaveChannel
