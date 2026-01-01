/**
 * Slack List Scheduled Messages Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function listScheduledMessages(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, limit = 100 } = config

    const accessToken = await getSlackToken(userId)
    const payload: any = { limit }
    if (channel) payload.channel = channel

    const result = await callSlackApi('chat.scheduledMessages.list', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    const messages = (result.scheduled_messages || []).map((m: any) => ({
      id: m.id,
      channel: m.channel_id,
      postAt: m.post_at,
      text: m.text,
      dateCreated: m.date_created
    }))

    return {
      success: true,
      output: { success: true, messages, count: messages.length },
      message: `Found ${messages.length} scheduled messages`
    }
  } catch (error: any) {
    logger.error('[Slack List Scheduled Messages] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionListScheduledMessages = listScheduledMessages
