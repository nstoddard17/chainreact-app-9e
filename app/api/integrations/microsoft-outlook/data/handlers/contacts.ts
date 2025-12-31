/**
 * Microsoft Outlook Contacts Handler
 * Fetches user's contacts from Outlook for contact selection
 */

import { decryptToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

export interface OutlookContact {
  value: string
  label: string
  description?: string
}

interface ContactsOptions {
  search?: string
}

/**
 * Fetch Outlook contacts for selection
 * Returns contacts with their ID as value and display name as label
 */
export async function getOutlookContacts(
  integration: any,
  options: ContactsOptions = {}
): Promise<OutlookContact[]> {
  try {
    logger.debug('[Outlook API] Fetching contacts for selection')

    // Get decrypted access token
    if (!integration.access_token) {
      throw new Error('No access token available')
    }
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      throw new Error('Failed to decrypt access token')
    }

    const { search } = options

    // Build the endpoint
    const endpoint = 'https://graph.microsoft.com/v1.0/me/contacts'

    // Build query parameters
    const params = new URLSearchParams()
    params.append('$top', '100') // Limit to 100 contacts
    params.append('$orderby', 'displayName')
    params.append('$select', 'id,displayName,givenName,surname,emailAddresses,companyName,jobTitle')

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const response = await fetch(fullEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[Outlook API] Failed to fetch contacts:', errorText)
      return []
    }

    const data = await response.json()
    const contacts = data.value || []

    logger.debug(`[Outlook API] Found ${contacts.length} contacts`)

    // Map contacts to the format expected by the UI
    let contactOptions: OutlookContact[] = contacts.map((contact: any) => {
      const displayName = contact.displayName || `${contact.givenName || ''} ${contact.surname || ''}`.trim() || 'Unnamed Contact'

      // Build description from email and company
      const email = contact.emailAddresses?.[0]?.address || ''
      const company = contact.companyName || ''
      const jobTitle = contact.jobTitle || ''

      let descriptionParts: string[] = []
      if (email) descriptionParts.push(email)
      if (jobTitle && company) {
        descriptionParts.push(`${jobTitle} at ${company}`)
      } else if (company) {
        descriptionParts.push(company)
      } else if (jobTitle) {
        descriptionParts.push(jobTitle)
      }

      const description = descriptionParts.join(' - ') || undefined

      return {
        value: contact.id,
        label: displayName,
        description: description
      }
    })

    // Client-side search filtering if search term provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase()
      contactOptions = contactOptions.filter(contact =>
        contact.label.toLowerCase().includes(searchLower) ||
        (contact.description && contact.description.toLowerCase().includes(searchLower))
      )
    }

    return contactOptions

  } catch (error: any) {
    logger.error('[Outlook API] Failed to get contacts:', error)
    return []
  }
}
