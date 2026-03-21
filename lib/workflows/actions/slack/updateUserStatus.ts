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
    const { statusText, statusEmoji, statusExpiration, workspace, asUser = true } = config

    // IMPORTANT: This action requires a Slack USER token (xoxp-), not a BOT token (xoxb-)
    // asUser defaults to true because bot tokens cannot update user status
    const useUserToken = asUser !== false // Default to true
    const accessToken = workspace
      ? await getSlackToken(workspace, true, useUserToken)
      : await getSlackToken(userId, false, useUserToken)

    const profile: any = {}
    if (statusText !== undefined) profile.status_text = statusText
    if (statusEmoji !== undefined) profile.status_emoji = statusEmoji

    // Handle expiration from select dropdown or direct values
    if (statusExpiration && statusExpiration !== '0') {
      const now = Math.floor(Date.now() / 1000)
      if (typeof statusExpiration === 'number') {
        profile.status_expiration = statusExpiration
      } else if (/^\d+$/.test(statusExpiration)) {
        // Numeric string from select: minutes to add
        const minutes = parseInt(statusExpiration, 10)
        if (minutes > 0) {
          profile.status_expiration = now + minutes * 60
        }
      } else if (statusExpiration === 'today') {
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 0)
        profile.status_expiration = Math.floor(endOfDay.getTime() / 1000)
      } else if (statusExpiration === 'week') {
        const endOfWeek = new Date()
        const daysUntilSunday = 7 - endOfWeek.getDay()
        endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday)
        endOfWeek.setHours(23, 59, 59, 0)
        profile.status_expiration = Math.floor(endOfWeek.getTime() / 1000)
      } else if (statusExpiration === 'custom') {
        // Use customExpiration field (minutes)
        const customMinutes = parseInt(config.customExpiration, 10)
        if (customMinutes > 0) {
          profile.status_expiration = now + customMinutes * 60
        }
      } else {
        // Try parsing as date string
        const parsed = new Date(statusExpiration).getTime()
        if (!isNaN(parsed)) {
          profile.status_expiration = Math.floor(parsed / 1000)
        }
      }
    }

    // Validate that at least one profile field is set
    if (Object.keys(profile).length === 0) {
      profile.status_text = ''
      profile.status_emoji = ''
    }

    const result = await callSlackApi('users.profile.set', accessToken, { profile })

    if (!result.ok) throw new Error(getSlackErrorMessage(result.error, result))

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
