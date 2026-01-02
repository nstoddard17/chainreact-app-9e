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
    const { workspace, channel, message, scheduleType, scheduledTime, delayMinutes, blocks, threadTs, linkNames, parse, unfurlLinks, unfurlMedia, asUser = false } = config
    if (!channel) throw new Error('Channel is required')
    if (!message && !blocks) throw new Error('Message or blocks required')

    // Calculate postAt based on scheduleType
    let timestamp: number
    if (scheduleType === 'delay') {
      if (!delayMinutes) throw new Error('Delay minutes is required')
      const delayMs = parseInt(delayMinutes) * 60 * 1000
      timestamp = Math.floor((Date.now() + delayMs) / 1000)
    } else {
      // specific_time
      if (!scheduledTime) throw new Error('Scheduled time is required')
      timestamp = typeof scheduledTime === 'number' ? scheduledTime : Math.floor(new Date(scheduledTime).getTime() / 1000)
    }

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)
    const payload: any = { channel, text: message, post_at: timestamp }
    if (blocks) payload.blocks = blocks
    if (threadTs) payload.thread_ts = threadTs
    if (linkNames !== undefined) payload.link_names = linkNames
    if (parse) payload.parse = parse
    if (unfurlLinks !== undefined) payload.unfurl_links = unfurlLinks
    if (unfurlMedia !== undefined) payload.unfurl_media = unfurlMedia

    const result = await callSlackApi('chat.scheduleMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    const scheduledDate = new Date(result.post_at * 1000)
    const formattedDate = scheduledDate.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })

    return {
      success: true,
      output: {
        success: true,
        scheduledMessageId: result.scheduled_message_id,
        channelId: result.channel,
        postAt: result.post_at,
        postAtFormatted: formattedDate
      },
      message: `Message scheduled for ${formattedDate}`
    }
  } catch (error: any) {
    logger.error('[Slack Schedule Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionScheduleMessage = scheduleMessage
