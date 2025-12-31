/**
 * Slack Channels Handler
 */

import { SlackIntegration, SlackChannel, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch all Slack channels (public and private) for the authenticated workspace
 */
export const getSlackChannels: SlackDataHandler<SlackChannel> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("💬 [Slack Channels] Fetching all channels")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000",
      integration.access_token
    )

    // Handle HTTP-level errors (4xx)
    if (!response.ok) {
      logger.error("❌ [Slack Channels] HTTP error from Slack API:", {
        status: response.status,
        statusText: response.statusText
      })
      if (response.status === 401 || response.status === 403) {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      throw new Error(`Slack API error: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()

    // Slack API returns ok: false for API errors even with 200 status
    if (!data.ok) {
      logger.error("❌ [Slack Channels] Slack API returned error:", {
        error: data.error,
        needed: data.needed,
        provided: data.provided
      })
      if (data.error === "invalid_auth" || data.error === "token_revoked") {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      if (data.error === "missing_scope") {
        throw new Error(`Missing required Slack scope: ${data.needed}. Please reconnect with the required permissions.`)
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

    logger.debug(`✅ [Slack Channels] Retrieved ${channels.length} channels (public + private)`)
    return channels

  } catch (error: any) {
    logger.error("❌ [Slack Channels] Error fetching channels:", error)
    throw error
  }
}

/**
 * Fetch only public Slack channels for the authenticated workspace
 */
export const getSlackPublicChannels: SlackDataHandler<SlackChannel> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("💬 [Slack Public Channels] Fetching public channels only")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/conversations.list?types=public_channel&limit=1000",
      integration.access_token
    )

    // Handle HTTP-level errors (4xx)
    if (!response.ok) {
      logger.error("❌ [Slack Public Channels] HTTP error from Slack API:", {
        status: response.status,
        statusText: response.statusText
      })
      if (response.status === 401 || response.status === 403) {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      throw new Error(`Slack API error: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.ok) {
      logger.error("❌ [Slack Public Channels] Slack API returned error:", {
        error: data.error,
        needed: data.needed,
        provided: data.provided
      })
      if (data.error === "invalid_auth" || data.error === "token_revoked") {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      if (data.error === "missing_scope") {
        throw new Error(`Missing required Slack scope: ${data.needed}. Please reconnect with the required permissions.`)
      }
      throw new Error(`Slack API error: ${data.error}`)
    }

    const channels = (data.channels || [])
      .filter((channel: any) => !channel.is_archived && !channel.is_private)
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

    logger.debug(`✅ [Slack Public Channels] Retrieved ${channels.length} public channels`)
    return channels

  } catch (error: any) {
    logger.error("❌ [Slack Public Channels] Error fetching public channels:", error)
    throw error
  }
}

/**
 * Fetch only private Slack channels for the authenticated workspace
 */
export const getSlackPrivateChannels: SlackDataHandler<SlackChannel> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("💬 [Slack Private Channels] Fetching private channels only")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/conversations.list?types=private_channel&limit=1000",
      integration.access_token
    )

    // Handle HTTP-level errors (4xx)
    if (!response.ok) {
      logger.error("❌ [Slack Private Channels] HTTP error from Slack API:", {
        status: response.status,
        statusText: response.statusText
      })
      if (response.status === 401 || response.status === 403) {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      throw new Error(`Slack API error: ${response.status} - ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.ok) {
      logger.error("❌ [Slack Private Channels] Slack API returned error:", {
        error: data.error,
        needed: data.needed,
        provided: data.provided
      })
      if (data.error === "invalid_auth" || data.error === "token_revoked") {
        throw new Error("Slack authentication expired. Please reconnect your account.")
      }
      if (data.error === "missing_scope") {
        throw new Error(`Missing required Slack scope: ${data.needed}. Please reconnect with the required permissions.`)
      }
      throw new Error(`Slack API error: ${data.error}`)
    }

    const channels = (data.channels || [])
      .filter((channel: any) => !channel.is_archived && channel.is_private)
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

    logger.debug(`✅ [Slack Private Channels] Retrieved ${channels.length} private channels`)
    return channels

  } catch (error: any) {
    logger.error("❌ [Slack Private Channels] Error fetching private channels:", error)
    throw error
  }
}