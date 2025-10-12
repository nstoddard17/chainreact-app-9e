/**
 * Microsoft Outlook Enhanced Recipients Handler
 * Fetches contacts, suggested people, and recent correspondents from Outlook
 */

import { decryptToken, encryptTokens } from '@/lib/integrations/tokenUtils'
import { createSupabaseServiceClient } from '@/utils/supabase/server'

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

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
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

/**
 * Refresh the Outlook OAuth token for an integration and return the new access token
 */
async function refreshOutlookAccessToken(integration: any): Promise<string> {
  const refreshTokenEncrypted = integration.refresh_token
  if (!refreshTokenEncrypted) {
    throw new Error('No refresh token available for this Outlook integration')
  }

  const refreshToken = await decryptToken(refreshTokenEncrypted)
  if (!refreshToken) {
    throw new Error('Failed to decrypt Outlook refresh token')
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials are not configured')
  }

  const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access https://graph.microsoft.com/.default'
    }).toString(),
    cache: 'no-store'
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text().catch(() => 'Unknown error')
    throw new Error(`Microsoft token refresh failed: ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  const newAccessToken: string = tokenData.access_token
  const newRefreshToken: string | undefined = tokenData.refresh_token || refreshToken

  const { encryptedAccessToken, encryptedRefreshToken } = await encryptTokens(newAccessToken, newRefreshToken)

  const updates: Record<string, any> = {
    access_token: encryptedAccessToken,
    updated_at: new Date().toISOString()
  }

  if (encryptedRefreshToken) {
    updates.refresh_token = encryptedRefreshToken
  }

  if (typeof tokenData.expires_in === 'number') {
    updates.expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
  }

  if (typeof tokenData.refresh_token_expires_in === 'number') {
    updates.refresh_token_expires_at = new Date(Date.now() + tokenData.refresh_token_expires_in * 1000).toISOString()
  }

  if (typeof tokenData.scope === 'string') {
    updates.scopes = tokenData.scope.split(' ')
  }

  const supabase = await createSupabaseServiceClient()
  const { error: updateError } = await supabase
    .from('integrations')
    .update(updates)
    .eq('id', integration.id)

  if (updateError) {
    throw new Error(`Failed to persist refreshed Outlook tokens: ${updateError.message}`)
  }

  // Keep the in-memory integration reference up-to-date
  integration.access_token = updates.access_token
  if (updates.refresh_token) {
    integration.refresh_token = updates.refresh_token
  }
  if (updates.expires_at) {
    integration.expires_at = updates.expires_at
  }
  if (updates.refresh_token_expires_at) {
    integration.refresh_token_expires_at = updates.refresh_token_expires_at
  }
  if (updates.scopes) {
    integration.scopes = updates.scopes
  }

  return newAccessToken
}

function buildGraphUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${GRAPH_BASE_URL}/${path.replace(/^\/?/, '')}`
}

function shouldAttemptRefresh(status: number): boolean {
  return status === 401
}

/**
 * Fetch Outlook contacts and recent recipients
 */
export async function getOutlookEnhancedRecipients(integration: any): Promise<EmailRecipient[]> {
  try {
    // Check short-term cache to prevent redundant calls
    const cacheKey = integration.id
    const cached = modalCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < MODAL_CACHE_DURATION) {
      console.log('[Outlook API] Using cached recipients (within modal session)')
      return cached.data
    }

    console.log('[Outlook API] Fetching fresh recipients (contacts + people + recent)')
    console.log('[Outlook API] Integration info:', {
      id: integration.id,
      provider: integration.provider,
      userId: integration.user_id,
      email: integration.email,
      accountName: integration.account_name
    })

    if (!integration.access_token && !integration.refresh_token) {
      throw new Error('No access credentials available for this Outlook integration')
    }

    let accessToken = integration.access_token
      ? await decryptToken(integration.access_token)
      : null

    if (!accessToken && integration.refresh_token) {
      console.log('[Outlook API] Access token missing, attempting refresh before fetching recipients')
      accessToken = await refreshOutlookAccessToken(integration)
    }

    if (!accessToken) {
      throw new Error('Failed to resolve Outlook access token')
    }

    const recipients = new Map<string, EmailRecipient>()
    let attemptedRefresh = false

    const getHeaders = () => ({
      Authorization: `Bearer ${accessToken}`,
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
        console.log('[Outlook API] Authenticated as:', {
          email: meData.mail,
          userPrincipalName: meData.userPrincipalName,
          displayName: meData.displayName
        })
      }
    } catch (error) {
      console.warn('[Outlook API] Could not fetch user info:', error)
    }

    const fetchGraph = async (path: string) => {
      const url = buildGraphUrl(path)
      const response = await fetch(url, {
        headers: getHeaders(),
        cache: 'no-store'
      })

      if (shouldAttemptRefresh(response.status) && !attemptedRefresh && integration.refresh_token) {
        attemptedRefresh = true
        console.warn('[Outlook API] Access token expired. Refreshing and retrying request.')
        try {
          accessToken = await refreshOutlookAccessToken(integration)
          return await fetch(url, {
            headers: getHeaders(),
            cache: 'no-store'
          })
        } catch (refreshError) {
          console.error('[Outlook API] Token refresh failed:', refreshError)
        }
      }

      return response
    }

    // Fetch Outlook contacts (requires Contacts scope)
    try {
      const contactsResponse = await fetchGraph('me/contacts?$top=50&$select=displayName,emailAddresses')

      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        const contacts = contactsData.value || []

        console.log(`[Outlook API] Contacts API response:`, {
          totalCount: contactsData['@odata.count'],
          valueLength: contacts.length,
          firstContact: contacts[0]
        })

        contacts.forEach((contact: any) => {
          const primaryEmail = contact.emailAddresses?.[0]?.address
          addRecipient(recipients, primaryEmail, contact.displayName, 'contact')
        })

        console.log(`[Outlook API] Added ${contacts.length} contacts`)
      } else {
        console.warn(`[Outlook API] Contacts API returned status ${contactsResponse.status}`)
      }
    } catch (error) {
      console.warn('[Outlook API] Could not fetch contacts:', error)
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

        console.log(`[Outlook API] Added ${people.length} suggested people`)
      } else {
        console.warn(`[Outlook API] People API returned status ${peopleResponse.status}`)
      }
    } catch (error) {
      console.warn('[Outlook API] Could not fetch people suggestions:', error)
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

        console.log(`[Outlook API] Added recipients from ${messages.length} sent messages`)
      } else {
        console.warn(`[Outlook API] Sent messages API returned status ${sentResponse.status}`)
      }
    } catch (error) {
      console.warn('[Outlook API] Could not fetch sent messages:', error)
    }

    // Fetch recent inbox messages to gather FROM (senders) and other participants
    try {
      const inboxResponse = await fetchGraph('me/messages?$top=40&$select=from,toRecipients,ccRecipients,bccRecipients')

      if (inboxResponse.ok) {
        const inboxData = await inboxResponse.json()
        const messages = inboxData.value || []

        console.log(`[Outlook API] Inbox API response:`, {
          totalCount: inboxData['@odata.count'],
          valueLength: messages.length,
          firstMessage: messages[0] ? {
            from: messages[0].from,
            hasTo: !!messages[0].toRecipients
          } : null
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

        console.log(`[Outlook API] Added participants from ${messages.length} inbox messages`)
      } else {
        console.warn(`[Outlook API] Inbox messages API returned status ${inboxResponse.status}`)
      }
    } catch (error) {
      console.warn('[Outlook API] Could not fetch inbox messages:', error)
    }

    // Convert to array and limit to 75 recipients (contacts + recents + suggested)
    const recipientArray = Array.from(recipients.values()).slice(0, 75)

    console.log(`[Outlook API] Total recipients prepared: ${recipientArray.length}`)

    // Cache for modal session
    modalCache.set(cacheKey, {
      data: recipientArray,
      timestamp: Date.now()
    })

    return recipientArray

  } catch (error: any) {
    console.error('[Outlook API] Failed to get recipients:', error)
    throw new Error(`Failed to get Outlook recipients: ${error.message}`)
  }
}
