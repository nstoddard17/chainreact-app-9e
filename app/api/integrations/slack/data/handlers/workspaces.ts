/**
 * Slack Workspaces Handler
 */

import { SlackIntegration, SlackWorkspace, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

/**
 * Fetch Slack workspace information (team info)
 */
export const getSlackWorkspaces: SlackDataHandler<SlackWorkspace> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    console.log("🏢 [Slack Workspaces] Fetching workspace info")

    // Slack doesn't have a direct API for multiple workspaces, but we can get team info
    const response = await makeSlackApiRequest(
      "https://slack.com/api/team.info",
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

    // Return the team/workspace info
    const workspaces: SlackWorkspace[] = [{
      id: data.team.id,
      name: data.team.name,
      value: data.team.id,
      domain: data.team.domain,
      url: data.team.url,
      icon: data.team.icon
    }]
    
    console.log(`✅ [Slack Workspaces] Retrieved workspace: ${data.team.name}`)
    return workspaces

  } catch (error: any) {
    console.error("❌ [Slack Workspaces] Error fetching workspaces:", error)
    throw error
  }
}