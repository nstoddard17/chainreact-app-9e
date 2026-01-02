/**
 * Slack Remove Reaction Action
 * Removes ALL reactions the authenticated bot/user has added to a message
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage, normalizeMessageId } from './utils'

export async function removeReaction(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { workspace, channel, messageId, timestamp: configTimestamp } = config
    const messageTs = messageId || configTimestamp

    if (!channel) throw new Error('Channel is required')
    if (!messageTs) throw new Error('Message timestamp is required')

    // Normalize message ID (convert from URL format if needed)
    const timestamp = normalizeMessageId(messageTs)

    // If asUser is true, use the user token (xoxp-) instead of bot token (xoxb-)
    const asUser = config.asUser === true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, asUser)
      : await getSlackToken(userId, false, asUser)

    // First, get all reactions on the message
    const reactionsResult = await callSlackApi('reactions.get', accessToken, {
      channel,
      timestamp,
      full: true
    })

    if (!reactionsResult.ok) {
      // If no reactions or message not found, return success with 0 removed
      if (reactionsResult.error === 'no_reactions') {
        return {
          success: true,
          output: { success: true, channel, timestamp, removedEmojis: [], removedCount: 0 },
          message: 'No reactions to remove'
        }
      }
      throw new Error(getSlackErrorMessage(reactionsResult.error))
    }

    // Get the bot's user ID from auth.test
    const authResult = await callSlackApi('auth.test', accessToken, {})
    if (!authResult.ok) {
      throw new Error('Failed to identify bot user')
    }
    const botUserId = authResult.user_id

    // Find all reactions where the bot has reacted
    const reactions = reactionsResult.message?.reactions || []
    const myReactions: string[] = []

    for (const reaction of reactions) {
      // Check if the bot is in the list of users who reacted
      if (reaction.users?.includes(botUserId)) {
        myReactions.push(reaction.name)
      }
    }

    if (myReactions.length === 0) {
      return {
        success: true,
        output: { success: true, channel, timestamp, removedEmojis: [], removedCount: 0 },
        message: 'No reactions from you to remove'
      }
    }

    // Remove each reaction
    const removedEmojis: string[] = []
    const errors: string[] = []

    for (const emoji of myReactions) {
      const removeResult = await callSlackApi('reactions.remove', accessToken, {
        channel,
        timestamp,
        name: emoji
      })

      if (removeResult.ok) {
        removedEmojis.push(emoji)
      } else {
        errors.push(`Failed to remove :${emoji}:: ${getSlackErrorMessage(removeResult.error)}`)
      }
    }

    if (removedEmojis.length === 0 && errors.length > 0) {
      throw new Error(errors.join('; '))
    }

    const emojiList = removedEmojis.map(e => `:${e}:`).join(' ')
    return {
      success: true,
      output: {
        success: true,
        channel,
        timestamp,
        removedEmojis,
        removedCount: removedEmojis.length
      },
      message: removedEmojis.length === 1
        ? `Removed ${emojiList} reaction`
        : `Removed ${removedEmojis.length} reactions: ${emojiList}`
    }
  } catch (error: any) {
    logger.error('[Slack Remove Reaction] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionRemoveReaction = removeReaction
