/**
 * Gmail Labels Handler
 */

import { GmailIntegration, GmailLabel, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, getGmailAccessToken } from '../utils'

/**
 * Fetch Gmail labels for the authenticated user
 */
export const getGmailLabels: GmailDataHandler<GmailLabel> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    console.log("📧 [Gmail Labels] Fetching with optimized caching")

    // Get decrypted access token
    const accessToken = getGmailAccessToken(integration)

    const response = await makeGmailApiRequest(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      accessToken
    )

    const data = await response.json()
    const labels = (data.labels || [])
      .filter((label: any) =>
        label.type === "user" ||
        ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"].includes(label.id)
      )
      .map((label: any): GmailLabel => ({
        id: label.id,
        name: label.name,
        value: label.id,
        type: label.type,
        messages_total: label.messagesTotal,
        messages_unread: label.messagesUnread,
      }))

    console.log(`✅ [Gmail Labels] Retrieved ${labels.length} labels`)
    return labels

  } catch (error: any) {
    console.error("❌ [Gmail Labels] Error fetching labels:", error)
    throw error
  }
}