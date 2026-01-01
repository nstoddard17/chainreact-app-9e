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
export const getSlackFiles: SlackDataHandler<SlackFile> = async (integration: SlackIntegration) => {
  try {
    validateSlackIntegration(integration)
    logger.debug("📎 [Slack Files] Fetching files")

    const response = await makeSlackApiRequest(
      "https://slack.com/api/files.list?count=100",
      integration.access_token
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

    logger.debug(`✅ [Slack Files] Retrieved ${files.length} files`)
    return files

  } catch (error: any) {
    logger.error("❌ [Slack Files] Error fetching files:", error)
    throw error
  }
}
