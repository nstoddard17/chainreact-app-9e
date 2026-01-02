/**
 * Slack Unpin Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage, normalizeMessageId } from './utils'

export async function unpinMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, messageId } = config
    if (!channel) throw new Error('Channel is required')
    if (!messageId) throw new Error('Message timestamp is required')

    // Normalize message ID (convert from URL format if needed)
    const timestamp = normalizeMessageId(messageId)

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const asUser = config.asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, asUser)
      : await getSlackToken(userId, false, asUser)

    const result = await callSlackApi('pins.remove', accessToken, { channel, timestamp })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channel, messageId },
      message: 'Message unpinned'
    }
  } catch (error: any) {
    logger.error('[Slack Unpin Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUnpinMessage = unpinMessage
