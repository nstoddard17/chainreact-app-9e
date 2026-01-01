/**
 * Slack Pin Message Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function pinMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, timestamp } = config
    if (!channel) throw new Error('Channel is required')
    if (!timestamp) throw new Error('Message timestamp is required')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('pins.add', accessToken, { channel, timestamp })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channel, timestamp },
      message: 'Message pinned'
    }
  } catch (error: any) {
    logger.error('[Slack Pin Message] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionPinMessage = pinMessage
