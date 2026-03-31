/**
 * Microsoft Outlook Enhanced Recipients Handler
 * Fetches contacts, suggested people, and recent correspondents from Outlook
 */

import { logger } from '@/lib/utils/logger'

export interface EmailRecipient {
  value: string
  label: string
  email: string
  name?: string
  type?: string
}

// Short-term cache to prevent redundant calls while modal is open
// This cache expires quickly (10 seconds) to ensure fresh data on modal re-open
const modalCache = new Map<string, { data: EmailRecipient[], timestamp: number }>()
const MODAL_CACHE_DURATION = 10 * 1000 // 10 seconds - just enough for a modal session

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * Helper to normalize and add a recipient without duplicating entries
 */
function addRecipient(
  recipients: Map<string, EmailRecipient>,
  email: string | undefined,
  name: string | undefined,
  type: EmailRecipient['type']
) {
  if (!email || !email.includes('@')) {
    return
  }

  const normalized = email.trim().toLowerCase()
  if (recipients.has(normalized)) {
    return
  }

  recipients.set(normalized, {
    value: normalized,
    label: name ? `${name} <${normalized}>` : normalized,
    email: normalized,
    name: name || undefined,
    type
  })
}

function buildGraphUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${GRAPH_BASE_URL}/${path.replace(/^\/?/, '')}`
}

/**
 * Fetch Outlook contacts and recent recipients
 * Token refresh is handled by the dynamic route's refresh-and-retry mechanism.
 */
export async function getOutlookEnhancedRecipients(integration: any): Promise<EmailRecipient[]> {
  try {
    // Check short-term cache to prevent redundant calls
    const cacheKey = integration.id
    const cached = modalCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < MODAL_CACHE_DURATION) {
      logger.info('[Outlook API] Using cached recipients (within modal session)')
      return cached.data
    }

    logger.info('[Outlook API] Fetching fresh recipients (contacts + people + recent)')
    logger.info('[Outlook API] Integration info:', {
      id: integration.id,
      provider: integration.provider,
      userId: integration.user_id,
      email: integration.email,
      accountName: integration.account_name
    })

    if (!integration.access_token) {
      throw new Error('No access token available for this Outlook integration')
    }

    const recipients = new Map<string, EmailRecipient>()

    const getHeaders = () => ({
      Authorization: `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json'
    })

    // First, verify which account we're using
    try {
      const meResponse = await fetch(buildGraphUrl('me?$select=mail,userPrincipalName,displayName'), {
        headers: getHeaders(),
        cache: 'no-store'
      })
      if (meResponse.ok) {
        const meData = await meResponse.json()
        logger.info('[Outlook API] Authenticated as:', {
          email: meData.mail,
          userPrincipalName: meData.userPrincipalName,
          displayName: meData.displayName
        })
      }
    } catch (error) {
      logger.warn('[Outlook API] Could not fetch user info:', error)
    }

    const fetchGraph = async (path: string) => {
      const url = buildGraphUrl(path)
      return await fetch(url, {
        headers: getHeaders(),
        cache: 'no-store'
      })
    }

    // Fetch Outlook contacts (requires Contacts scope)
    try {
      const contactsResponse = await fetchGraph('me/contacts?$top=50&$select=displayName,emailAddresses')

      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        const contacts = contactsData.value || []

        logger.debug(`[Outlook API] Contacts received:`, contacts.length)

        contacts.forEach((contact: any) => {
          const primaryEmail = contact.emailAddresses?.[0]?.address
          addRecipient(recipients, primaryEmail, contact.displayName, 'contact')
        })

        logger.info(`[Outlook API] Added ${contacts.length} contacts`)
      } else {
        logger.warn(`[Outlook API] Contacts API returned status ${contactsResponse.status}`)
      }
    } catch (error) {
      logger.warn('[Outlook API] Could not fetch contacts:', error)
    }

    // Fetch top people suggestions (frequently interacted recipients)
    try {
      const peopleResponse = await fetchGraph('me/people?$top=25&$select=displayName,scoredEmailAddresses')

      if (peopleResponse.ok) {
        const peopleData = await peopleResponse.json()
        const people = peopleData.value || []

        people.forEach((person: any) => {
          const scoredEmails = person.scoredEmailAddresses || []
          scoredEmails.forEach((entry: any) => {
            const email = entry.address
            const displayName = person.displayName || entry.displayName
            addRecipient(recipients, email, displayName, 'contact')
          })
        })

        logger.info(`[Outlook API] Added ${people.length} suggested people`)
      } else {
        logger.warn(`[Outlook API] People API returned status ${peopleResponse.status}`)
      }
    } catch (error) {
      logger.warn('[Outlook API] Could not fetch people suggestions:', error)
    }

    // Fetch recent sent messages to gather TO/CC/BCC recipients
    try {
      const sentResponse = await fetchGraph('me/mailFolders/sentitems/messages?$top=40&$select=toRecipients,ccRecipients,bccRecipients')

      if (sentResponse.ok) {
        const sentData = await sentResponse.json()
        const messages = sentData.value || []

        messages.forEach((message: any) => {
          const allRecipients = [
            ...(message.toRecipients || []),
            ...(message.ccRecipients || []),
            ...(message.bccRecipients || [])
          ]

          allRecipients.forEach((recipient: any) => {
            const email = recipient.emailAddress?.address
            const name = recipient.emailAddress?.name
            addRecipient(recipients, email, name, 'recent')
          })
        })

        logger.info(`[Outlook API] Added recipients from ${messages.length} sent messages`)
      } else {
        logger.warn(`[Outlook API] Sent messages API returned status ${sentResponse.status}`)
      }
    } catch (error) {
      logger.warn('[Outlook API] Could not fetch sent messages:', error)
    }

    // Fetch recent inbox messages to gather FROM (senders) and other participants
    try {
      const inboxResponse = await fetchGraph('me/messages?$top=40&$select=from,toRecipients,ccRecipients,bccRecipients')

      if (inboxResponse.ok) {
        const inboxData = await inboxResponse.json()
        const messages = inboxData.value || []

        logger.debug(`[Outlook API] Inbox messages received:`, {
          messageCount: messages.length
        })

        messages.forEach((message: any) => {
          const senderEmail = message.from?.emailAddress?.address
          const senderName = message.from?.emailAddress?.name
          addRecipient(recipients, senderEmail, senderName, 'recent')

          const participants = [
            ...(message.toRecipients || []),
            ...(message.ccRecipients || []),
            ...(message.bccRecipients || [])
          ]

          participants.forEach((participant: any) => {
            const email = participant.emailAddress?.address
            const name = participant.emailAddress?.name
            addRecipient(recipients, email, name, 'recent')
          })
        })

        logger.info(`[Outlook API] Added participants from ${messages.length} inbox messages`)
      } else {
        logger.warn(`[Outlook API] Inbox messages API returned status ${inboxResponse.status}`)
      }
    } catch (error) {
      logger.warn('[Outlook API] Could not fetch inbox messages:', error)
    }

    // Convert to array and limit to 75 recipients (contacts + recents + suggested)
    const recipientArray = Array.from(recipients.values()).slice(0, 75)

    logger.info(`[Outlook API] Total recipients prepared: ${recipientArray.length}`)

    // Cache for modal session
    modalCache.set(cacheKey, {
      data: recipientArray,
      timestamp: Date.now()
    })

    return recipientArray

  } catch (error: any) {
    logger.error('[Outlook API] Failed to get recipients:', error)
    throw new Error(`Failed to get Outlook recipients: ${error.message}`)
  }
}
