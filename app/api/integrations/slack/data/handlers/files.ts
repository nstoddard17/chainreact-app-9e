/**
 * Slack Files Handler
 */

import { SlackIntegration, SlackDataHandler } from '../types'
import { validateSlackIntegration, makeSlackApiRequest } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface SlackFile {
  id: string
  name: string
  value: string
  title?: string
  filetype?: string
  size?: number
  created?: number
  user?: string
  url_private?: string
}

/**
 * Fetch Slack files from the authenticated workspace
 */
export const getSlackFiles: SlackDataHandler<SlackFile> = async (integration: SlackIntegration, options?: any) => {
  try {
    validateSlackIntegration(integration)

    // Check if we should use user token instead of bot token
    const asUser = options?.asUser === true
    let accessToken = integration.access_token

    // If asUser is true, we need the user token
    if (asUser) {
      if (!integration.metadata?.user_token) {
        logger.error("❌ [Slack Files] User token requested but not available", {
          integrationId: integration.id,
          hasMetadata: !!integration.metadata,
          metadataKeys: integration.metadata ? Object.keys(integration.metadata) : []
        })
        throw new Error("User token not available. Please reconnect your Slack account with user permissions enabled.")
      }

      const { decryptToken } = await import('@/lib/integrations/tokenUtils')
      try {
        accessToken = await decryptToken(integration.metadata.user_token)
        logger.debug("📎 [Slack Files] Successfully decrypted user token")
      } catch (error: any) {
        logger.error("❌ [Slack Files] Failed to decrypt user token:", {
          error: error.message,
          integrationId: integration.id
        })
        throw new Error("Failed to decrypt user token. Please reconnect your Slack account.")
      }
    }

    logger.debug("📎 [Slack Files] Fetching files", {
      integrationId: integration.id,
      workspaceName: integration.team_name,
      teamId: integration.team_id,
      asUser,
      hasAccessToken: !!accessToken,
      tokenPrefix: accessToken?.substring(0, 10),
      usingUserToken: asUser && accessToken !== integration.access_token
    })

    const response = await makeSlackApiRequest(
      "https://slack.com/api/files.list?count=100",
      accessToken
    )

    // Handle HTTP-level errors (4xx)
    if (!response.ok) {
      logger.error("❌ [Slack Files] HTTP error from Slack API:", {
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
      logger.error("❌ [Slack Files] Slack API returned error:", {
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

    const files = (data.files || []).map((file: any): SlackFile => ({
      id: file.id,
      name: file.name || file.title || `File ${file.id}`,
      value: file.id,
      title: file.title,
      filetype: file.filetype,
      size: file.size,
      created: file.created,
      user: file.user,
      url_private: file.url_private,
    }))

    logger.debug(`✅ [Slack Files] Retrieved ${files.length} files`, {
      integrationId: integration.id,
      workspaceName: integration.team_name,
      filesCount: files.length,
      firstFile: files[0] ? { id: files[0].id, name: files[0].name } : null
    })
    return files

  } catch (error: any) {
    logger.error("❌ [Slack Files] Error fetching files:", error)
    throw error
  }
}
