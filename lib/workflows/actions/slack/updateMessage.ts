/**
 * Slack Update Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function updateMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, timestamp, message, blocks } = config
    if (!channel) throw new Error('Channel is required')
    if (!timestamp) throw new Error('Message timestamp is required')
    if (!message && !blocks) throw new Error('Message or blocks required')

    const accessToken = await getSlackToken(userId)
    const payload: any = { channel, ts: timestamp, text: message }
    if (blocks) payload.blocks = blocks

    const result = await callSlackApi('chat.update', accessToken, payload)
    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: {
        success: true,
        messageId: result.ts,
        channel: result.channel,
        text: result.text
      },
      message: 'Message updated'
    }
  } catch (error: any) {
    logger.error('[Slack Update Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUpdateMessage = updateMessage
