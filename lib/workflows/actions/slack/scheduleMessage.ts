/**
 * Slack Schedule Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function scheduleMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, message, postAt, blocks } = config
    if (!channel) throw new Error('Channel is required')
    if (!message && !blocks) throw new Error('Message or blocks required')
    if (!postAt) throw new Error('Schedule time is required')

    // Convert to Unix timestamp
    const timestamp = typeof postAt === 'number' ? postAt : Math.floor(new Date(postAt).getTime() / 1000)

    const accessToken = await getSlackToken(userId)
    const payload: any = { channel, text: message, post_at: timestamp }
    if (blocks) payload.blocks = blocks

    const result = await callSlackApi('chat.scheduleMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    return {
      success: true,
      output: {
        success: true,
        scheduledMessageId: result.scheduled_message_id,
        channel: result.channel,
        postAt: result.post_at
      },
      message: `Message scheduled for ${new Date(result.post_at * 1000).toISOString()}`
    }
  } catch (error: any) {
    logger.error('[Slack Schedule Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionScheduleMessage = scheduleMessage
