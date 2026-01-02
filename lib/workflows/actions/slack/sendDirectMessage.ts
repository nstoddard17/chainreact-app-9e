/**
 * Slack Send Direct Message Action
 * Uses user token to open DM conversations (bots can't initiate DMs)
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
    const { workspace, user, message, blocks } = config
    if (!user) throw new Error('User is required')
    if (!message && !blocks) throw new Error('Message or blocks required')

    // DMs require user token (xoxp-) to open conversations
    // Bot tokens can't initiate DM conversations with users
    const accessToken = workspace
      ? await getSlackToken(workspace, true, true) // useUserToken = true
      : await getSlackToken(userId, false, true)

    // Open DM conversation first
    const dmResult = await callSlackApi('conversations.open', accessToken, { users: user })
    if (!dmResult.ok) throw new Error(getSlackErrorMessage(dmResult.error))

    const channelId = dmResult.channel.id

    // Send message
    const payload: any = { channel: channelId, text: message }
    if (blocks) payload.blocks = blocks

    const result = await callSlackApi('chat.postMessage', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

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
