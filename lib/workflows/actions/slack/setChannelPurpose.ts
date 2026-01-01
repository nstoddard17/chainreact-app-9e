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
    const { channel, purpose } = config
    if (!channel) throw new Error('Channel is required')
    if (!purpose) throw new Error('Purpose is required')

    const accessToken = await getSlackToken(userId)
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
