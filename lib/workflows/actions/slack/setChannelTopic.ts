/**
 * Slack Set Channel Topic Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function setChannelTopic(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, topic } = config
    if (!channel) throw new Error('Channel is required')
    if (!topic) throw new Error('Topic is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('conversations.setTopic', accessToken, { channel, topic })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channelId: channel, topic: result.topic },
      message: 'Channel topic updated'
    }
  } catch (error: any) {
    logger.error('[Slack Set Channel Topic] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionSetChannelTopic = setChannelTopic
