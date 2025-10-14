/**
 * Slack Users Handler
 */

import { SlackIntegration, SlackUser, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Slack users in the workspace
 */
export const getSlackUsers: SlackDataHandler<SlackUser> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("👥 [Slack Users] Fetching users")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/users.list",
      integration.access_token
    )

    const data = await response.json()
    
    // Slack API returns ok: false for API errors even with 200 status
    if (!data.ok) {
      if (data.error === "invalid_auth" || data.error === "token_revoked") {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      throw new Error(`Slack API error: ${data.error}`)
    }

    // Filter out bots and return active users
    const users = (data.members || [])
      .filter((user: any) => !user.is_bot && !user.deleted && user.id !== 'USLACKBOT')
      .map((user: any): SlackUser => ({
        id: user.id,
        name: user.real_name || user.name,
        value: user.id,
        real_name: user.real_name,
        display_name: user.profile?.display_name,
        email: user.profile?.email,
        is_bot: user.is_bot,
        is_app_user: user.is_app_user,
        profile: {
          image_24: user.profile?.image_24,
          image_48: user.profile?.image_48,
          image_72: user.profile?.image_72,
        }
      }))

    logger.debug(`✅ [Slack Users] Retrieved ${users.length} users`)
    return users

  } catch (error: any) {
    logger.error("❌ [Slack Users] Error fetching users:", error)
    throw error
  }
}