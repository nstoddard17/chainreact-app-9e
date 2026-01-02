/**
 * Slack Get Thread Messages Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function getThreadMessages(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, threadTs, limit = 100 } = config
    if (!channel) throw new Error('Channel is required')
    if (!threadTs) throw new Error('Thread timestamp is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('conversations.replies', accessToken, {
      channel,
      ts: threadTs,
      limit
    })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    const messages = (result.messages || []).map((m: any) => ({
      ts: m.ts,
      user: m.user,
      text: m.text,
      threadTs: m.thread_ts,
      replyCount: m.reply_count,
      reactions: m.reactions
    }))

    return {
      success: true,
      output: { success: true, messages, count: messages.length, hasMore: result.has_more },
      message: `Found ${messages.length} messages in thread`
    }
  } catch (error: any) {
    logger.error('[Slack Get Thread Messages] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionGetThreadMessages = getThreadMessages
