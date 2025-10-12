/**
 * Gmail Labels Handler
 */

import { GmailIntegration, GmailLabel, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, getGmailAccessToken } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Gmail labels for the authenticated user
 */
export const getGmailLabels: GmailDataHandler<GmailLabel> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)

    // Get decrypted access token
    const accessToken = getGmailAccessToken(integration)

    const response = await makeGmailApiRequest(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      accessToken
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const labels = (data.labels || [])
      .filter((label: any) =>
        label.type === "user" ||
        ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"].includes(label.id)
      )
      .map((label: any): GmailLabel => ({
        id: label.id,
        name: label.name,
        label: label.name, // Add label property for dropdown compatibility
        value: label.id,
        type: label.type,
        messages_total: label.messagesTotal,
        messages_unread: label.messagesUnread,
      }))

    return labels

  } catch (error: any) {
    logger.error("❌ [Gmail Labels] Error fetching labels:", error)
    throw new Error(`Failed to fetch Gmail labels: ${error.message}`)
  }
}