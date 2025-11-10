/**
 * Gmail Recent Emails Handler
 * Provides list of recent emails for dropdown selection
 */

import { GmailIntegration, GmailDataHandler } from '../types'
import { validateGmailIntegration, getGmailAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

interface RecentEmailsOptions {
  searchQuery?: string
  limit?: number
}

/**
 * Fetch recent emails for dropdown selection
 */
export const getRecentEmails: GmailDataHandler = async (
  integration: GmailIntegration,
  options: RecentEmailsOptions = {}
) => {
  const { searchQuery = '', limit = 50 } = options

  logger.debug('[Gmail Recent Emails] Fetching emails:', {
    searchQuery,
    limit,
    fullOptions: JSON.stringify(options)
  })

  validateGmailIntegration(integration)
  const accessToken = getGmailAccessToken(integration)

  try {
    // Build URL with query params
    const params = new URLSearchParams({
      maxResults: Math.min(limit, 100).toString(),
    })

    // Add search query if provided
    if (searchQuery && searchQuery.trim()) {
      params.append('q', searchQuery.trim())
    }

    // Fetch message list
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    )

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      throw new Error(`Gmail API error: ${listResponse.status} - ${errorText}`)
    }

    const listData = await listResponse.json()
    const messages = listData.messages || []
    logger.debug(`[Gmail Recent Emails] Found ${messages.length} messages`)

    if (messages.length === 0) {
      return []
    }

    // Fetch message metadata (subject, from, date) for each message
    // Use format=metadata to get only headers, not full body
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          }
        }
      )

      if (!msgResponse.ok) {
        logger.warn(`Failed to fetch message ${msg.id}`)
        return null
      }

      const msgData = await msgResponse.json()
      const headers = msgData.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

      const subject = getHeader('Subject') || '(No subject)'
      const from = getHeader('From') || 'Unknown sender'
      const date = getHeader('Date') || ''

      // Extract just the email address from "Name <email@domain.com>" format
      const emailMatch = from.match(/<([^>]+)>/)
      const fromEmail = emailMatch ? emailMatch[1] : from

      // Parse date to readable format
      let formattedDate = ''
      if (date) {
        try {
          const dateObj = new Date(date)
          const now = new Date()
          const diffMs = now.getTime() - dateObj.getTime()
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

          if (diffDays === 0) {
            formattedDate = 'Today'
          } else if (diffDays === 1) {
            formattedDate = 'Yesterday'
          } else if (diffDays < 7) {
            formattedDate = `${diffDays}d ago`
          } else {
            formattedDate = dateObj.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })
          }
        } catch (error) {
          logger.warn('Failed to parse date:', date)
          formattedDate = ''
        }
      }

      // Format: "Subject - From: sender (Date)"
      let label = subject
      if (fromEmail && formattedDate) {
        label = `${subject} - From: ${fromEmail} (${formattedDate})`
      } else if (fromEmail) {
        label = `${subject} - From: ${fromEmail}`
      } else if (formattedDate) {
        label = `${subject} (${formattedDate})`
      }

      return {
        value: msg.id,
        label: label,
        // Store additional data for potential future use
        metadata: {
          subject,
          from: fromEmail,
          date: formattedDate,
        }
      }
    })

    const emailResults = await Promise.all(emailPromises)
    const emails = emailResults.filter(email => email !== null)

    logger.debug(`[Gmail Recent Emails] Returning ${emails.length} formatted emails`)
    return emails
  } catch (error: any) {
    logger.error('[Gmail Recent Emails] Error fetching emails:', error)
    throw new Error(`Failed to fetch recent emails: ${error.message}`)
  }
}
