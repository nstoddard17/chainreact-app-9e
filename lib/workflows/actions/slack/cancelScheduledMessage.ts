/**
 * Slack Cancel Scheduled Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function cancelScheduledMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, scheduledMessageId } = config
    if (!channel) throw new Error('Channel is required')
    if (!scheduledMessageId) throw new Error('Scheduled message ID is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('chat.deleteScheduledMessage', accessToken, {
      channel,
      scheduled_message_id: scheduledMessageId
    })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channel, scheduledMessageId },
      message: 'Scheduled message cancelled'
    }
  } catch (error: any) {
    logger.error('[Slack Cancel Scheduled Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionCancelScheduledMessage = cancelScheduledMessage
