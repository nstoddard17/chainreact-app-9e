/**
 * Slack Workspaces Handler
 * Returns the current integration's workspace info with integration ID as value
 */

import { SlackIntegration, SlackWorkspace, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Slack workspace information (team info)
 * IMPORTANT: Returns integration ID as value so it can be used for data fetching
 */
export const getSlackWorkspaces: SlackDataHandler<SlackWorkspace> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("🏢 [Slack Workspaces] Fetching workspace info")

    // Slack doesn't have a direct API for multiple workspaces, but we can get team info
    const response = await makeSlackApiRequest(
      "https://slack.com/api/team.info",
      integration.access_token
    )

    // Handle HTTP-level errors (4xx)
    if (!response.ok) {
      logger.error("❌ [Slack Workspaces] HTTP error from Slack API:", {
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
      logger.error("❌ [Slack Workspaces] Slack API returned error:", {
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

    // CRITICAL: Return integration ID as value, not Slack team ID
    // This allows the channel field to use this value to fetch channels from the correct integration
    const workspaces: SlackWorkspace[] = [{
      id: integration.id, // Use integration ID, not team ID
      name: data.team.name,
      value: integration.id, // CRITICAL: Use integration ID for cascading
      domain: data.team.domain,
      url: data.team.url,
      icon: data.team.icon,
      teamId: data.team.id // Keep team ID for reference
    }]

    logger.debug(`✅ [Slack Workspaces] Retrieved workspace: ${data.team.name} (integration: ${integration.id})`)
    return workspaces

  } catch (error: any) {
    logger.error("❌ [Slack Workspaces] Error fetching workspaces:", error)
    throw error
  }
}