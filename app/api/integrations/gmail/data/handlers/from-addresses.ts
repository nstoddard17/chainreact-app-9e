/**
 * Gmail From Addresses Handler
 * Fetches user's send-as addresses and recent from addresses with grouped headers
 */

import { GmailIntegration, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, getGmailAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

interface FromAddress {
  value: string
  label: string
  email: string
  name?: string
  isDefault?: boolean
  group?: string
}

// Short-term cache to prevent redundant calls while modal is open
const modalCache = new Map<string, { data: FromAddress[], timestamp: number }>()
const MODAL_CACHE_DURATION = 10 * 1000 // 10 seconds

/**
 * Fetch Gmail from addresses including send-as aliases and recent senders
 */
export const getGmailFromAddresses: GmailDataHandler<FromAddress> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)

    // Check short-term cache
    const cacheKey = integration.id
    const cached = modalCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < MODAL_CACHE_DURATION) {
      logger.debug("📦 [Gmail From Addresses] Using cached from addresses")
      return cached.data
    }

    logger.debug("🚀 [Gmail From Addresses] Fetching fresh from addresses")

    const accessToken = getGmailAccessToken(integration)
    const fromAddresses: FromAddress[] = []
    const seenEmails = new Set<string>()

    // 1. Fetch user's Gmail profile to get primary email
    try {
      logger.debug("👤 [Gmail From Addresses] Fetching user profile...")

      const profileResponse = await makeGmailApiRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        accessToken
      )

      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        const primaryEmail = profileData.emailAddress?.toLowerCase()

        if (primaryEmail) {
          fromAddresses.push({
            value: primaryEmail,
            label: `${primaryEmail} (Primary)`,
            email: primaryEmail,
            isDefault: true,
            group: 'Your Email Addresses'
          })
          seenEmails.add(primaryEmail)
          logger.debug(`✅ [Gmail From Addresses] Primary email: ${primaryEmail}`)
        }
      }
    } catch (profileError: any) {
      logger.warn("⚠️ [Gmail From Addresses] Could not fetch profile:", profileError.message)
    }

    // 2. Fetch send-as aliases from Gmail settings
    try {
      logger.debug("📧 [Gmail From Addresses] Fetching send-as aliases...")

      const sendAsResponse = await makeGmailApiRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
        accessToken
      )

      if (sendAsResponse.ok) {
        const sendAsData = await sendAsResponse.json()
        const sendAsAddresses = sendAsData.sendAs || []

        sendAsAddresses.forEach((sendAs: any) => {
          const email = sendAs.sendAsEmail?.toLowerCase()
          const displayName = sendAs.displayName
          const isDefault = sendAs.isDefault || false

          if (email && !seenEmails.has(email)) {
            fromAddresses.push({
              value: email,
              label: displayName ? `${displayName} <${email}>` : email,
              email,
              name: displayName || undefined,
              isDefault,
              group: 'Your Email Addresses'
            })
            seenEmails.add(email)
          } else if (email && seenEmails.has(email)) {
            // Update the existing entry with display name if we have it
            const existing = fromAddresses.find(f => f.email === email)
            if (existing && displayName && !existing.name) {
              existing.name = displayName
              existing.label = `${displayName} <${email}>${existing.isDefault ? ' (Primary)' : ''}`
            }
          }
        })

        logger.debug(`✅ [Gmail From Addresses] Found ${sendAsAddresses.length} send-as aliases`)
      }
    } catch (sendAsError: any) {
      logger.warn("⚠️ [Gmail From Addresses] Could not fetch send-as aliases:", sendAsError.message)
    }

    // 3. Fetch recent "From" addresses from sent emails (last 20 messages)
    try {
      logger.debug("📨 [Gmail From Addresses] Fetching recent sent emails...")

      const sentResponse = await makeGmailApiRequest(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=20',
        accessToken
      )

      if (sentResponse.ok) {
        const sentData = await sentResponse.json()
        const sentMessages = sentData.messages || []

        if (sentMessages.length > 0) {
          logger.debug(`📨 [Gmail From Addresses] Processing ${sentMessages.length} sent messages...`)

          // Track frequency of from addresses
          const fromFrequency = new Map<string, { email: string; name?: string; count: number }>()

          // Process messages in batches
          const batchSize = 5
          for (let i = 0; i < Math.min(20, sentMessages.length); i += batchSize) {
            const batch = sentMessages.slice(i, Math.min(i + batchSize, 20))

            const batchResults = await Promise.all(
              batch.map(async (message: { id: string }) => {
                try {
                  const response = await makeGmailApiRequest(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From`,
                    accessToken
                  )

                  if (response.ok) {
                    const data = await response.json()
                    const fromHeader = data.payload?.headers?.find((h: any) => h.name === 'From')

                    if (fromHeader) {
                      // Parse "Name <email@example.com>" format
                      const emailRegex = /(?:"?([^"<>]+?)"?\s*)?<([^<>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
                      const match = emailRegex.exec(fromHeader.value)

                      if (match) {
                        const name = match[1]?.trim()
                        const email = (match[2] || match[3])?.trim().toLowerCase()

                        if (email && email.includes('@')) {
                          const existing = fromFrequency.get(email)
                          if (existing) {
                            existing.count++
                            if (name && !existing.name) {
                              existing.name = name
                            }
                          } else {
                            fromFrequency.set(email, { email, name, count: 1 })
                          }
                        }
                      }
                    }
                  }
                  return null
                } catch (error: any) {
                  logger.warn(`Failed to fetch message ${message.id}:`, error.message)
                  return null
                }
              })
            )

            // Small delay between batches
            if (i + batchSize < Math.min(20, sentMessages.length)) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }

          // Add recent from addresses that aren't already in the list
          const recentFroms = Array.from(fromFrequency.entries())
            .sort((a, b) => b[1].count - a[1].count) // Sort by frequency
            .slice(0, 10) // Top 10 most frequent

          recentFroms.forEach(([email, data]) => {
            if (!seenEmails.has(email)) {
              fromAddresses.push({
                value: email,
                label: data.name ? `${data.name} <${email}>` : email,
                email,
                name: data.name,
                group: 'Recent Senders'
              })
              seenEmails.add(email)
            }
          })

          logger.debug(`✅ [Gmail From Addresses] Found ${recentFroms.length} recent from addresses`)
        }
      }
    } catch (recentError: any) {
      logger.warn("⚠️ [Gmail From Addresses] Could not fetch recent senders:", recentError.message)
    }

    logger.debug(`✅ [Gmail From Addresses] Total: ${fromAddresses.length} from addresses`)

    // Cache for modal session
    modalCache.set(cacheKey, {
      data: fromAddresses,
      timestamp: Date.now()
    })

    return fromAddresses

  } catch (error: any) {
    logger.error("❌ [Gmail From Addresses] Failed to get from addresses:", error)
    throw new Error(`Failed to get Gmail from addresses: ${error.message}`)
  }
}
