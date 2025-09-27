/**
 * Microsoft Outlook Enhanced Recipients Handler
 * Fetches contacts and recent recipients from Outlook
 */

import { decryptToken } from '@/lib/integrations/tokenUtils'

export interface EmailRecipient {
  value: string
  label: string
  email: string
  name?: string
  type?: string
}

/**
 * Fetch Outlook contacts and recent recipients
 */
export async function getOutlookEnhancedRecipients(integration: any): Promise<EmailRecipient[]> {
  try {
    console.log(" [Outlook API] Fetching fresh recipients")

    // Get decrypted access token
    if (!integration.access_token) {
      throw new Error('No access token available')
    }
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      throw new Error('Failed to decrypt access token')
    }

    const recipients = new Map<string, EmailRecipient>()

    // Fetch contacts first
    try {
      const contactsResponse = await fetch('https://graph.microsoft.com/v1.0/me/contacts?$top=50&$select=displayName,emailAddresses', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        const contacts = contactsData.value || []

        contacts.forEach((contact: any) => {
          if (contact.emailAddresses && contact.emailAddresses.length > 0) {
            const email = contact.emailAddresses[0].address?.toLowerCase()
            const name = contact.displayName

            if (email && email.includes('@')) {
              recipients.set(email, {
                value: email,
                label: name ? `${name} <${email}>` : email,
                email,
                name: name || undefined,
                type: 'contact'
              })
            }
          }
        })
        console.log(` [Outlook API] Found ${contacts.length} contacts`)
      }
    } catch (error) {
      console.warn(' [Outlook API] Could not fetch contacts:', error)
    }

    // Fetch recent sent emails to get additional recipients
    try {
      const sentResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=20&$select=toRecipients,ccRecipients,bccRecipients', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (sentResponse.ok) {
        const sentData = await sentResponse.json()
        const messages = sentData.value || []

        messages.forEach((message: any) => {
          // Process all recipient types
          const allRecipients = [
            ...(message.toRecipients || []),
            ...(message.ccRecipients || []),
            ...(message.bccRecipients || [])
          ]

          allRecipients.forEach((recipient: any) => {
            const email = recipient.emailAddress?.address?.toLowerCase()
            const name = recipient.emailAddress?.name

            if (email && email.includes('@') && !recipients.has(email)) {
              recipients.set(email, {
                value: email,
                label: name ? `${name} <${email}>` : email,
                email,
                name: name || undefined,
                type: 'recent'
              })
            }
          })
        })
        console.log(` [Outlook API] Processed ${messages.length} sent messages`)
      }
    } catch (error) {
      console.warn(' [Outlook API] Could not fetch sent messages:', error)
    }

    // Fetch recent received emails to get senders
    try {
      const inboxResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=from', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (inboxResponse.ok) {
        const inboxData = await inboxResponse.json()
        const messages = inboxData.value || []

        messages.forEach((message: any) => {
          if (message.from?.emailAddress) {
            const email = message.from.emailAddress.address?.toLowerCase()
            const name = message.from.emailAddress.name

            if (email && email.includes('@') && !recipients.has(email)) {
              recipients.set(email, {
                value: email,
                label: name ? `${name} <${email}>` : email,
                email,
                name: name || undefined,
                type: 'recent'
              })
            }
          }
        })
        console.log(` [Outlook API] Processed inbox messages`)
      }
    } catch (error) {
      console.warn(' [Outlook API] Could not fetch inbox messages:', error)
    }

    // Convert to array and limit to 50 recipients
    const recipientArray = Array.from(recipients.values()).slice(0, 50)

    console.log(` [Outlook API] Total recipients found: ${recipientArray.length}`)

    return recipientArray

  } catch (error: any) {
    console.error(" [Outlook API] Failed to get recipients:", error)
    throw new Error(`Failed to get Outlook recipients: ${error.message}`)
  }
}


