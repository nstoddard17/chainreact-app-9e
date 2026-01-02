/**
 * Slack Update Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage, normalizeMessageId } from './utils'

export async function updateMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, messageId, message, newText, blocks, asUser = true } = config
    if (!channel) throw new Error('Channel is required')
    if (!messageId) throw new Error('Message timestamp is required')

    // Support both 'message' and 'newText' for backwards compatibility
    const messageText = newText || message
    if (!messageText && !blocks) throw new Error('Message or blocks required')

    // Normalize message ID (convert from URL format if needed)
    const timestamp = normalizeMessageId(messageId)

    const payload: any = { channel, ts: timestamp, text: messageText }
    if (blocks) payload.blocks = blocks

    // Smart token selection: Try bot token first, fall back to user token if permission denied
    let result: any
    let usedUserToken = false

    try {
      // First attempt: Use bot token (default)
      const botToken = workspace
        ? await getSlackToken(workspace, true, false)
        : await getSlackToken(userId, false, false)

      result = await callSlackApi('chat.update', botToken, payload)

      // If bot can't update (message was posted by user), try user token
      if (!result.ok && result.error === 'cant_update_message' && asUser) {
        logger.debug('[Slack Update Message] Bot token failed, retrying with user token')
        const userToken = workspace
          ? await getSlackToken(workspace, true, true)
          : await getSlackToken(userId, false, true)

        result = await callSlackApi('chat.update', userToken, payload)
        usedUserToken = true
      }
    } catch (tokenError: any) {
      // If getting user token fails, throw the original error
      throw tokenError
    }

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: {
        success: true,
        messageId: result.ts,
        channel: result.channel,
        text: result.text,
        updatedWith: usedUserToken ? 'user_token' : 'bot_token'
      },
      message: 'Message updated'
    }
  } catch (error: any) {
    logger.error('[Slack Update Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUpdateMessage = updateMessage
