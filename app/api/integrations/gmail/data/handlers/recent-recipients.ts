/**
 * Gmail Recent Recipients Handler
 */

import { GmailIntegration, EmailRecipient, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, extractEmailAddresses, getGmailAccessToken } from '../utils'

/**
 * Fetch Gmail recent recipients using the proven working method (no contacts permission needed)
 */
export const getGmailRecentRecipients: GmailDataHandler<EmailRecipient> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    console.log("🚀 [Gmail API] Using proven working method (no contacts permission needed)")

    // Get decrypted access token
    const accessToken = getGmailAccessToken(integration)

    // Get recent sent messages (last 50) - original working approach
    const messagesResponse = await makeGmailApiRequest(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=50`,
      accessToken
    )

    const messagesData = await messagesResponse.json()
    const messages = messagesData.messages || []

    if (messages.length === 0) {
      console.log('📧 [Gmail API] No sent messages found')
      return []
    }

    console.log(`📧 [Gmail API] Found ${messages.length} sent messages, processing first 25`)

    // Get detailed information for each message
    const messageDetails = await Promise.all(
      messages.slice(0, 25).map(async (message: { id: string }) => {
        try {
          const response = await makeGmailApiRequest(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
            accessToken
          )

          const data = await response.json()
          return data.payload?.headers || []
        } catch (error) {
          console.warn(`Failed to fetch message ${message.id}:`, error)
          return null
        }
      })
    )

    // Extract all recipient email addresses
    const recipients = new Map<string, { email: string; name?: string; frequency: number }>()

    messageDetails
      .filter(headers => headers !== null)
      .forEach(headers => {
        headers.forEach((header: { name: string; value: string }) => {
          if (['To', 'Cc', 'Bcc'].includes(header.name)) {
            // Parse email addresses from the header value
            const emailRegex = /(?:"?([^"<>]+?)"?\s*)?<([^<>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
            let match

            while ((match = emailRegex.exec(header.value)) !== null) {
              const name = match[1]?.trim()
              const email = (match[2] || match[3])?.trim().toLowerCase()

              if (email && email.includes('@')) {
                const existing = recipients.get(email)
                if (existing) {
                  existing.frequency += 1
                } else {
                  recipients.set(email, {
                    email,
                    name: name || undefined,
                    frequency: 1
                  })
                }
              }
            }
          }
        })
      })

    // Convert to array and sort by frequency
    const recipientArray = Array.from(recipients.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20)
      .map(recipient => ({
        value: recipient.email,
        label: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
        email: recipient.email,
        name: recipient.name
      }))

    console.log(`✅ [Gmail API] Found ${recipientArray.length} recipients`)
    return recipientArray

  } catch (error: any) {
    console.error("❌ [Gmail API] Failed to get recent recipients:", error)
    throw new Error(`Failed to get Gmail recent recipients: ${error.message}`)
  }
}