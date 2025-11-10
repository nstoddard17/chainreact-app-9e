/**
 * Slack Delete Message Action
 * Deletes a message from a Slack channel or DM
 */

import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

export async function deleteSlackMessage(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId, input } = params

  try {
    const {
      workspace,
      channelType = 'channel',
      channel,
      user,
      messageId,
      asUser = true
    } = config

    // Validate required fields
    if (!workspace) {
      throw new Error('Workspace is required')
    }

    if (!messageId) {
      throw new Error('Message timestamp is required')
    }

    // Determine the target channel
    let targetChannel: string
    if (channelType === 'dm') {
      if (!user) {
        throw new Error('User is required for direct messages')
      }
      // For DMs, we use the user ID - Slack will open/use the DM channel
      targetChannel = user
    } else {
      if (!channel) {
        throw new Error('Channel is required')
      }
      targetChannel = channel
    }

    // Get the Slack integration
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // Prepare the delete request
    const deletePayload: any = {
      channel: targetChannel,
      ts: messageId
    }

    // Add as_user parameter if requested
    if (asUser) {
      deletePayload.as_user = true
    }

    // Call Slack API to delete the message
    const response = await fetch('https://slack.com/api/chat.delete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(deletePayload)
    })

    const result = await response.json()

    if (!result.ok) {
      logger.error('[Slack Delete Message] API error:', result.error)

      // Provide more helpful error messages
      let errorMessage = result.error || 'Unknown error'
      if (result.error === 'message_not_found') {
        errorMessage = 'Message not found. It may have already been deleted.'
      } else if (result.error === 'cant_delete_message') {
        errorMessage = 'Cannot delete message. Only the message author, workspace admin, or workspace owner can delete messages.'
      } else if (result.error === 'channel_not_found') {
        errorMessage = 'Channel not found. Please check the channel ID.'
      }

      throw new Error(`Slack API error: ${errorMessage}`)
    }

    return {
      success: true,
      output: {
        deleted: true,
        channel: result.channel,
        messageId: result.ts,
        deletedAt: new Date().toISOString(),
        channelType: channelType === 'dm' ? 'direct_message' : 'channel'
      },
      message: 'Message deleted successfully'
    }

  } catch (error: any) {
    logger.error('[Slack Delete Message] Error:', error)
    return {
      success: false,
      output: {
        deleted: false,
        error: error.message
      },
      message: `Failed to delete message: ${error.message}`
    }
  }
}

// Export with the expected action name
export const slackActionDeleteMessage = deleteSlackMessage
