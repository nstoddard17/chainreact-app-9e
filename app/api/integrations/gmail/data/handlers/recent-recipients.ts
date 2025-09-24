/**
 * Gmail Recent Recipients Handler
 */

import { GmailIntegration, EmailRecipient, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, extractEmailAddresses, getGmailAccessToken } from '../utils'

// Simple in-memory cache for recent recipients
const recipientCache = new Map<string, { data: EmailRecipient[], timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache

/**
 * Fetch Gmail recent recipients using the proven working method (no contacts permission needed)
 */
export const getGmailRecentRecipients: GmailDataHandler<EmailRecipient> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)

    // Check cache first
    const cacheKey = integration.id
    const cached = recipientCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log("📧 [Gmail API] Returning cached recipients")
      return cached.data
    }

    console.log("🚀 [Gmail API] Fetching fresh recipients (cache miss or expired)")

    // Get decrypted access token
    const accessToken = getGmailAccessToken(integration)

    // Get recent sent messages (last 20 to reduce API calls)
    const messagesResponse = await makeGmailApiRequest(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=20`,
      accessToken
    )

    const messagesData = await messagesResponse.json()
    const messages = messagesData.messages || []

    if (messages.length === 0) {
      console.log('📧 [Gmail API] No sent messages found')
      return []
    }

    console.log(`📧 [Gmail API] Found ${messages.length} sent messages, processing first 10 with rate limiting`)

    // Process messages in smaller batches to avoid rate limiting
    const batchSize = 3 // Process 3 messages at a time
    const maxMessages = 10 // Only process first 10 messages to reduce API calls
    const messageDetails = []

    for (let i = 0; i < Math.min(maxMessages, messages.length); i += batchSize) {
      const batch = messages.slice(i, Math.min(i + batchSize, maxMessages))

      const batchResults = await Promise.all(
        batch.map(async (message: { id: string }) => {
          try {
            const response = await makeGmailApiRequest(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
              accessToken
            )

            const data = await response.json()
            return data.payload?.headers || []
          } catch (error: any) {
            // If we hit rate limit, return null and continue
            if (error.status === 429) {
              console.warn(`Rate limited on message ${message.id}, skipping`)
              return null
            }
            console.warn(`Failed to fetch message ${message.id}:`, error.message)
            return null
          }
        })
      )

      messageDetails.push(...batchResults)

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < Math.min(maxMessages, messages.length)) {
        await new Promise(resolve => setTimeout(resolve, 200)) // 200ms delay between batches
      }
    }

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

    // Cache the results
    recipientCache.set(integration.id, {
      data: recipientArray,
      timestamp: Date.now()
    })

    return recipientArray

  } catch (error: any) {
    console.error("❌ [Gmail API] Failed to get recent recipients:", error)

    // If we have cached data and hit a rate limit, return cached data
    if (error.status === 429 || error.message?.includes('rate limit')) {
      const cached = recipientCache.get(integration.id)
      if (cached) {
        console.log("📧 [Gmail API] Rate limited, returning stale cached data")
        return cached.data
      }
    }

    throw new Error(`Failed to get Gmail recent recipients: ${error.message}`)
  }
}