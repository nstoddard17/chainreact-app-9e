/**
 * Slack Pin Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage, normalizeMessageId } from './utils'

export async function pinMessage(params: {
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

    // Use workspace (integration ID) to get the correct Slack token
    const accessToken = workspace
      ? await getSlackToken(workspace, true)
      : await getSlackToken(userId, false)

    const result = await callSlackApi('pins.add', accessToken, { channel, timestamp })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channel, messageId },
      message: 'Message pinned'
    }
  } catch (error: any) {
    logger.error('[Slack Pin Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionPinMessage = pinMessage
