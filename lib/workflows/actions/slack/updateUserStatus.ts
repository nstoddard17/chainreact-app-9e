/**
 * Slack Update User Status Action
 * NOTE: This requires a user token with users.profile:write scope, not a bot token.
 */
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { getSlackToken, callSlackApi, getSlackErrorMessage } from './utils'

export async function updateUserStatus(params: {
  config: any
  userId: string
  input: Record<string, any>
}): Promise<ActionResult> {
  const { config, userId } = params
  try {
    const { statusText, statusEmoji, statusExpiration } = config

    const accessToken = await getSlackToken(userId)

    const profile: any = {}
    if (statusText !== undefined) profile.status_text = statusText
    if (statusEmoji !== undefined) profile.status_emoji = statusEmoji
    if (statusExpiration) {
      // Convert to Unix timestamp if it's a date string
      profile.status_expiration = typeof statusExpiration === 'number'
        ? statusExpiration
        : Math.floor(new Date(statusExpiration).getTime() / 1000)
    }

    const result = await callSlackApi('users.profile.set', accessToken, { profile })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error))

    return {
      success: true,
      output: {
        success: true,
        statusText: result.profile?.status_text,
        statusEmoji: result.profile?.status_emoji,
        statusExpiration: result.profile?.status_expiration
      },
      message: 'User status updated'
    }
  } catch (error: any) {
    logger.error('[Slack Update Status] Error:', error)
    return { success: false, output: { success: false, error: error.message }, message: `Failed: ${error.message}` }
  }
}
export const slackActionUpdateUserStatus = updateUserStatus
