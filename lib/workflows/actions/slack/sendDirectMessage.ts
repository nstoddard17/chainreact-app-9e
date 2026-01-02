/**
 * Slack Send Direct Message Action
 * Can send DMs as either the bot or the user
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function sendDirectMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, user, message, blocks, asUser } = config
    if (!user) throw new Error('User is required')
    if (!message && !blocks) throw new Error('Message or blocks required')

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const useUserToken = asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    // Open DM conversation first
    const dmResult = await callSlackApi('conversations.open', accessToken, { users: user })
    if (!dmResult.ok) throw new Error(getSlackErrorMessage(dmResult.error))

    const channelId = dmResult.channel.id

    // Send message
    const payload: any = { channel: channelId, text: message }
    if (blocks) payload.blocks = blocks

    const result = await callSlackApi('chat.postMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

    return {
      success: true,
      output: {
        success: true,
        ts: result.ts,
        messageId: result.ts,
        channel: channelId,
        userId: user,
        timestamp: result.ts,
        message: result.message
      },
      message: 'Direct message sent'
    }
  } catch (error: any) {
    logger.error('[Slack Send DM] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionSendDirectMessage = sendDirectMessage
