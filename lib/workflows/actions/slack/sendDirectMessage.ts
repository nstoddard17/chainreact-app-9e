/**
 * Slack Send Direct Message Action
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
    const { user, message, blocks } = config
    if (!user) throw new Error('User is required')
    if (!message && !blocks) throw new Error('Message or blocks required')

    const accessToken = await getSlackToken(userId)

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
        messageId: result.ts,
        channel: channelId,
        timestamp: result.ts
      },
      message: 'Direct message sent'
    }
  } catch (error: any) {
    logger.error('[Slack Send DM] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionSendDirectMessage = sendDirectMessage
