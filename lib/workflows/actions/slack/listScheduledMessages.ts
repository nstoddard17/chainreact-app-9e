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
    const { workspace, channel, limit = 100, oldest, latest, asUser = false } = config

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    // NOTE: You can only see scheduled messages created with the same token type
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    const payload: any = { limit }
    if (channel) payload.channel = channel
    if (oldest) payload.oldest = oldest
    if (latest) payload.latest = latest

    const result = await callSlackApi('chat.scheduledMessages.list', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    const scheduledMessages = (result.scheduled_messages || []).map((m: any) => {
      const postAtDate = new Date(m.post_at * 1000)
      const formattedDate = postAtDate.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })

      return {
        id: m.id,
        channelId: m.channel_id,
        postAt: m.post_at,
        postAtFormatted: formattedDate,
        text: m.text,
        dateCreated: m.date_created
      }
    })

    return {
      success: true,
      output: { success: true, scheduledMessages, totalCount: scheduledMessages.length },
      message: `Found ${scheduledMessages.length} scheduled message${scheduledMessages.length !== 1 ? 's' : ''}`
    }
  } catch (error: any) {
    logger.error('[Slack List Scheduled Messages] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionListScheduledMessages = listScheduledMessages
