/**
 * Gmail Enhanced Recipients Handler
 * Fetches both Google Contacts and recent recipients for a richer experience
 */

import { GmailIntegration, EmailRecipient, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, getGmailAccessToken } from '../utils'

// Short-term cache to prevent redundant calls while modal is open
// This cache expires quickly (10 seconds) to ensure fresh data on modal re-open
const modalCache = new Map<string, { data: EmailRecipient[], timestamp: number }>()
const MODAL_CACHE_DURATION = 10 * 1000 // 10 seconds - just enough for a modal session

/**
 * Fetch Gmail contacts and recent recipients
 * Attempts to get Google Contacts first, then falls back to/combines with recent recipients
 */
export const getGmailEnhancedRecipients: GmailDataHandler<EmailRecipient> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)

    // Check short-term cache to prevent redundant calls
    const cacheKey = integration.id
    const cached = modalCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < MODAL_CACHE_DURATION) {
      console.log("📦 [Gmail API] Using cached recipients (within modal session)")
      return cached.data
    }

    console.log("🚀 [Gmail API] Fetching fresh enhanced recipients")

    // Get decrypted access token
    const accessToken = getGmailAccessToken(integration)

    if (integration.scopes && Array.isArray(integration.scopes)) {
      console.log("🔍 [Gmail API] Integration scopes:", integration.scopes);
    }

    // Use a Map to store unique recipients (email as key)
    const recipients = new Map<string, EmailRecipient>()

    // First, try to fetch Google Contacts (requires contacts.readonly scope)
    let contactsFetched = false
    try {
      console.log("📇 [Gmail API] Attempting to fetch Google Contacts...")

      // Try to get contacts from People API
      const contactsResponse = await fetch(
        'https://people.googleapis.com/v1/people/me/connections?' +
        'personFields=names,emailAddresses,photos&' +
        'pageSize=100&' +
        'sortOrder=LAST_MODIFIED_DESCENDING',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        const connections = contactsData.connections || []

        connections.forEach((person: any) => {
          if (person.emailAddresses && person.emailAddresses.length > 0) {
            const email = person.emailAddresses[0].value?.toLowerCase()
            const name = person.names?.[0]?.displayName
            const photo = person.photos?.[0]?.url

            if (email && email.includes('@')) {
              recipients.set(email, {
                value: email,
                label: name ? `${name} <${email}>` : email,
                email,
                name: name || undefined
              })
            }
          }
        })

        console.log(`✅ [Gmail API] Found ${connections.length} contacts from Google Contacts`)
        const rawPreview = connections.slice(0, 10).map((person: any) => ({
          names: person.names?.map((n: any) => n.displayName).filter(Boolean) || [],
          emails: person.emailAddresses?.map((e: any) => e.value).filter(Boolean) || [],
        }))
        console.log("👥 [Gmail API] Contacts raw preview:", rawPreview)

        const contactPreview = Array.from(recipients.values()).slice(0, 10).map(contact => ({
          email: contact.email,
          name: contact.name
        }))
        console.log("📬 [Gmail API] Contacts returned:", contactPreview)
        contactsFetched = true
      } else if (contactsResponse.status === 403) {
        let errorDetails: any = null
        try {
          errorDetails = await contactsResponse.json()
        } catch (parseError) {
          try {
            errorDetails = await contactsResponse.text()
          } catch (textError) {
            errorDetails = 'Unknown error'
          }
        }

        const errorMessage = typeof errorDetails === 'string'
          ? errorDetails
          : errorDetails?.error?.message || errorDetails?.error || JSON.stringify(errorDetails)

        console.log("⚠️ [Gmail API] Contacts request forbidden", {
          message: errorMessage,
          status: contactsResponse.status,
          scopes: integration.scopes,
        })

        if (errorMessage?.toLowerCase().includes('insufficient authentication scopes')) {
          console.log("⚠️ [Gmail API] Contacts scope missing from token - prompt user to reconnect Gmail")
        } else if (errorMessage?.toLowerCase().includes('googleapis.com has not been used') ||
                   errorMessage?.toLowerCase().includes('api has not been used before')) {
          console.log("⚠️ [Gmail API] People API not enabled for this Google project")
        }

        console.log("⚠️ [Gmail API] No contacts permission - falling back to recent recipients only")
      } else {
        console.log(`⚠️ [Gmail API] Could not fetch contacts: ${contactsResponse.status}`)
      }
    } catch (contactError: any) {
      console.log("⚠️ [Gmail API] Could not access Google Contacts:", contactError.message)
      // Continue to fetch recent recipients as fallback
    }

    // Fetch recent recipients from both sent and received emails
    try {
      console.log("📧 [Gmail API] Fetching recent email recipients from sent and received...")

      // Track frequency across all messages
      const recentRecipientFrequency = new Map<string, number>()

      // Get recent sent messages for TO recipients
      const sentResponse = await makeGmailApiRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=20`,
        accessToken
      )

      const sentData = await sentResponse.json()
      const sentMessages = sentData.messages || []

      // Get recent inbox messages for FROM senders
      const inboxResponse = await makeGmailApiRequest(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=20`,
        accessToken
      )

      const inboxData = await inboxResponse.json()
      const inboxMessages = inboxData.messages || []

      // Combine both message lists
      const allMessages = [
        ...sentMessages.map(m => ({ ...m, type: 'sent' })),
        ...inboxMessages.map(m => ({ ...m, type: 'inbox' }))
      ]

      if (allMessages.length > 0) {
        console.log(`📧 [Gmail API] Processing ${Math.min(30, allMessages.length)} messages (sent + received)...`)

        // Process messages in batches to avoid rate limiting
        const batchSize = 5
        const maxMessages = 30 // Process more messages total
        const messageDetails = []

        for (let i = 0; i < Math.min(maxMessages, allMessages.length); i += batchSize) {
          const batch = allMessages.slice(i, Math.min(i + batchSize, maxMessages))

          const batchResults = await Promise.all(
            batch.map(async (message: { id: string, type: string }) => {
              try {
                const response = await makeGmailApiRequest(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=From`,
                  accessToken
                )

                const data = await response.json()
                return { headers: data.payload?.headers || [], type: message.type }
              } catch (error: any) {
                console.warn(`Failed to fetch message ${message.id}:`, error.message)
                return null
              }
            })
          )

          messageDetails.push(...batchResults)

          // Small delay between batches
          if (i + batchSize < Math.min(maxMessages, allMessages.length)) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        // Extract recipients from email headers
        messageDetails
          .filter(detail => detail !== null)
          .forEach(({ headers, type }) => {
            headers.forEach((header: { name: string; value: string }) => {
              // Process TO, CC, BCC from sent messages and FROM from inbox messages
              if ((type === 'sent' && ['To', 'Cc', 'Bcc'].includes(header.name)) ||
                  (type === 'inbox' && header.name === 'From') ||
                  (header.name === 'From')) { // Also include From for sent (to see your own email)
                // Parse email addresses from header
                const emailRegex = /(?:"?([^"<>]+?)"?\s*)?<([^<>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
                let match

                while ((match = emailRegex.exec(header.value)) !== null) {
                  const name = match[1]?.trim()
                  const email = (match[2] || match[3])?.trim().toLowerCase()

                  if (email && email.includes('@')) {
                    // Track frequency for sorting
                    recentRecipientFrequency.set(email, (recentRecipientFrequency.get(email) || 0) + 1)

                    // Add to recipients if not already from contacts
                    if (!recipients.has(email)) {
                      recipients.set(email, {
                        value: email,
                        label: name ? `${name} <${email}>` : email,
                        email,
                        name: name || undefined
                      })
                    } else if (name && !recipients.get(email)?.name) {
                      // Update name if we found one and contacts didn't have it
                      const existing = recipients.get(email)!
                      existing.name = name
                      existing.label = `${name} <${email}>`
                    }
                  }
                }
              }
            })
          })

        console.log(`✅ [Gmail API] Found ${recentRecipientFrequency.size} unique recipients from sent and received emails`)

        // Sort recipients: Contacts first, then by email frequency
        const recipientArray = Array.from(recipients.values())

        // If we have frequency data, sort by it
        if (recentRecipientFrequency.size > 0) {
          recipientArray.sort((a, b) => {
            const freqA = recentRecipientFrequency.get(a.email) || 0
            const freqB = recentRecipientFrequency.get(b.email) || 0
            return freqB - freqA // Higher frequency first
          })
        }

        // Limit to top 50 recipients for performance
        const finalRecipients = recipientArray.slice(0, 50).map(recipient => ({
          value: recipient.email,
          label: recipient.label,
          email: recipient.email,
          name: recipient.name
        }))

        console.log(`✅ [Gmail API] Returning ${finalRecipients.length} enhanced recipients (contacts: ${contactsFetched})`)

        // Cache for modal session
        modalCache.set(cacheKey, {
          data: finalRecipients,
          timestamp: Date.now()
        })

        return finalRecipients
      }
    } catch (recentError: any) {
      console.error("❌ [Gmail API] Failed to get recent recipients:", recentError)
      // If we have contacts, return them even if recent recipients failed
      if (recipients.size > 0) {
        console.log("⚠️ [Gmail API] Returning contacts only due to recent recipients error")
        return Array.from(recipients.values()).slice(0, 50)
      }
      throw recentError
    }

    // Convert to array and return (limit to 50 for performance)
    const finalRecipients = Array.from(recipients.values()).slice(0, 50)
    console.log(`✅ [Gmail API] Total enhanced recipients: ${finalRecipients.length}`)

    // Cache for modal session
    modalCache.set(cacheKey, {
      data: finalRecipients,
      timestamp: Date.now()
    })

    return finalRecipients

  } catch (error: any) {
    console.error("❌ [Gmail API] Failed to get enhanced recipients:", error)
    throw new Error(`Failed to get Gmail enhanced recipients: ${error.message}`)
  }
}
