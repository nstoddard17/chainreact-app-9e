/**
 * Shared utilities for Slack actions
 */

import { logger } from '@/lib/utils/logger'

/**
 * Get decrypted Slack token for a user
 */
export async function getSlackToken(userId: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: integration, error } = await supabase
    .from('integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .eq('status', 'connected')
    .single()

  if (error || !integration) {
    throw new Error('Slack integration not found. Please connect your Slack account.')
  }

  if (!integration.access_token) {
    throw new Error('Slack access token not found. Please reconnect your Slack account.')
  }

  const { decryptToken } = await import('@/lib/integrations/tokenUtils')
  const accessToken = await decryptToken(integration.access_token)

  if (!accessToken) {
    throw new Error('Failed to decrypt Slack token. Please reconnect your Slack account.')
  }

  return accessToken
}

/**
 * Call Slack API with error handling
 */
export async function callSlackApi(endpoint: string, accessToken: string, payload: any): Promise<any> {
  const response = await fetch(`https://slack.com/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  })
  return response.json()
}

/**
 * Common error message mapping
 */
export function getSlackErrorMessage(error: string): string {
  const errorMessages: Record<string, string> = {
    'invalid_auth': 'Slack authentication expired. Please reconnect your account.',
    'token_revoked': 'Slack token has been revoked. Please reconnect your account.',
    'channel_not_found': 'Channel not found. Please check the channel ID.',
    'not_in_channel': 'Bot is not in this channel. Please invite the bot first.',
    'is_archived': 'Cannot perform action on archived channel.',
    'user_not_found': 'User not found.',
    'missing_scope': 'Missing required Slack permissions. Please reconnect your account.',
    'cant_invite_self': 'Cannot invite the bot itself.',
    'already_in_channel': 'User is already in the channel.',
    'message_not_found': 'Message not found.',
    'no_permission': 'Bot does not have permission to perform this action.',
    'restricted_action': 'This action is restricted by workspace settings.'
  }
  return errorMessages[error] || `Slack API error: ${error}`
}
