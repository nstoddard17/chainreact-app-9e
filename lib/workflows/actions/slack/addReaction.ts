/**
 * Slack Add Reaction Action
 * Adds an emoji reaction to a message in Slack
 */

import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

export async function addSlackReaction(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId, input } = params

  try {
    const {
      channel,
      timestamp,
      emoji
    } = config

    // Validate required fields
    if (!channel) {
      throw new Error('Channel is required')
    }

    if (!timestamp) {
      throw new Error('Message timestamp is required')
    }

    if (!emoji) {
      throw new Error('Emoji is required')
    }

    // Clean up the emoji name - remove colons if present
    let cleanEmoji = emoji
    if (cleanEmoji.startsWith(':') && cleanEmoji.endsWith(':')) {
      cleanEmoji = cleanEmoji.slice(1, -1)
    }
    // Also remove any skin tone modifiers format issues
    cleanEmoji = cleanEmoji.replace(/^:/, '').replace(/:$/, '')

    // Ensure timestamp is in correct format (should have a decimal point)
    let formattedTimestamp = timestamp
    if (typeof timestamp === 'string' && !timestamp.includes('.')) {
      // If it's a number without decimal, try to format it
      // Slack timestamps are Unix time with microseconds: 1234567890.123456
      if (timestamp.length > 10) {
        formattedTimestamp = timestamp.slice(0, 10) + '.' + timestamp.slice(10)
      }
    }

    // Get the Slack integration
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .eq('status', 'connected')
      .single()

    if (integrationError || !integration) {
      throw new Error('Slack integration not found. Please connect your Slack account.')
    }

    if (!integration.access_token) {
      throw new Error('Slack access token not found. Please reconnect your Slack account.')
    }

    // Decrypt the token
    const { decryptToken } = await import('@/lib/integrations/tokenUtils')
    const accessToken = await decryptToken(integration.access_token)

    if (!accessToken) {
      throw new Error('Failed to decrypt Slack token. Please reconnect your Slack account.')
    }

    // Prepare the reaction request
    const reactionPayload = {
      channel: channel,
      timestamp: formattedTimestamp,
      name: cleanEmoji
    }

    logger.debug('[Slack Add Reaction] Adding reaction:', {
      channel,
      timestamp: formattedTimestamp,
      emoji: cleanEmoji
    })

    // Call Slack API to add the reaction
    const response = await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(reactionPayload)
    })

    const result = await response.json()

    if (!result.ok) {
      logger.error('[Slack Add Reaction] API error:', result.error)

      // Provide more helpful error messages
      let errorMessage = result.error || 'Unknown error'
      if (result.error === 'message_not_found') {
        errorMessage = 'Message not found. Please check the timestamp is correct (format: 1234567890.123456)'
      } else if (result.error === 'already_reacted') {
        errorMessage = 'You have already added this reaction to the message'
      } else if (result.error === 'channel_not_found') {
        errorMessage = 'Channel not found. Please check the channel ID.'
      } else if (result.error === 'invalid_name') {
        errorMessage = `Invalid emoji name: ${cleanEmoji}. Please use a valid emoji.`
      } else if (result.error === 'too_many_emoji') {
        errorMessage = 'Too many reactions on this message.'
      } else if (result.error === 'too_many_reactions') {
        errorMessage = 'You have added too many reactions to this message.'
      }

      throw new Error(`Slack API error: ${errorMessage}`)
    }

    return {
      success: true,
      output: {
        success: true,
        channel: channel,
        timestamp: formattedTimestamp,
        emoji: cleanEmoji,
        addedAt: new Date().toISOString()
      },
      message: `Reaction :${cleanEmoji}: added successfully`
    }

  } catch (error: any) {
    logger.error('[Slack Add Reaction] Error:', error)
    return {
      success: false,
      output: {
        success: false,
        error: error.message
      },
      message: `Failed to add reaction: ${error.message}`
    }
  }
}

// Export with the expected action name
export const slackActionAddReaction = addSlackReaction
