/**
 * Slack Remove Reaction Action
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function removeReaction(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { channel, timestamp, emoji } = config
    if (!channel) throw new Error('Channel is required')
    if (!timestamp) throw new Error('Message timestamp is required')
    if (!emoji) throw new Error('Emoji is required')

    // Clean emoji name
    let cleanEmoji = emoji.replace(/^:|:$/g, '')

    const accessToken = await getSlackToken(userId)
    const result = await callSlackApi('reactions.remove', accessToken, {
      channel,
      timestamp,
      name: cleanEmoji
    })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: { success: true, channel, timestamp, emoji: cleanEmoji },
      message: `Removed :${cleanEmoji}: reaction`
    }
  } catch (error: any) {
    logger.error('[Slack Remove Reaction] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionRemoveReaction = removeReaction
