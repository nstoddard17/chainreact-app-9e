/**
 * Slack Channels Handler
 */

import { SlackIntegration, SlackChannel, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

/**
 * Fetch Slack channels for the authenticated workspace
 */
export const getSlackChannels: SlackDataHandler<SlackChannel> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    console.log("💬 [Slack Channels] Fetching channels")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000",
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

    const channels = (data.channels || [])
      .filter((channel: any) => !channel.is_archived)
      .map((channel: any): SlackChannel => ({
        id: channel.id,
        name: `#${channel.name}`,
        value: channel.id,
        is_private: channel.is_private,
        is_archived: channel.is_archived,
        is_member: channel.is_member,
        topic: channel.topic,
        purpose: channel.purpose,
      }))

    console.log(`✅ [Slack Channels] Retrieved ${channels.length} channels`)
    return channels

  } catch (error: any) {
    console.error("❌ [Slack Channels] Error fetching channels:", error)
    throw error
  }
}