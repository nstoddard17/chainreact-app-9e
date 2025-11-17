import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

import { logger } from '@/lib/utils/logger'

/**
 * Searches Gmail messages based on query string
 */
async function searchGmailMessages(accessToken: string, query: string, maxResults: number = 100) {
  const url = new URL('https://www.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', maxResults.toString())

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to search Gmail messages: ${response.status}`)
  }

  return await response.json()
}

/**
 * Marks Gmail messages as read by modifying the UNREAD label
 */
async function markMessagesAsRead(accessToken: string, messageIds: string[]) {
  // Gmail API uses label modification to mark as read
  // Remove the UNREAD label from messages
  const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/batchModify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids: messageIds,
      removeLabelIds: ['UNREAD'],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `Failed to mark messages as read: ${response.status}`)
  }

  // Batch modify returns 204 No Content on success
  return { success: true }
}

/**
 * Marks one or more Gmail messages as read
 */
export async function markGmailAsRead(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    const messageSelection = config.messageSelection || 'single'
    let messageIds: string[] = []

    // Handle different message selection modes
    switch (messageSelection) {
      case 'single': {
        const messageId = resolveValue(config.messageId, input)
        if (!messageId) {
          return { success: false, message: 'No message ID provided' }
        }
        // Handle different messageId formats:
        // 1. Array of objects with id property (e.g., from search results)
        // 2. Array of strings (message IDs)
        // 3. Single string (message ID)
        if (Array.isArray(messageId)) {
          messageIds = messageId
            .map(item => typeof item === 'object' && item?.id ? item.id : item)
            .filter(Boolean)
        } else {
          messageIds = [messageId]
        }
        break
      }

      case 'multiple': {
        const rawIds = resolveValue(config.messageIds, input)
        if (!rawIds) {
          return { success: false, message: 'No message IDs provided' }
        }

        // Parse message IDs (one per line, comma-separated, or space-separated)
        messageIds = rawIds
          .toString()
          .split(/[\n,\s]+/)
          .map((id: string) => id.trim())
          .filter((id: string) => id.length > 0)

        if (messageIds.length === 0) {
          return { success: false, message: 'No valid message IDs found' }
        }

        if (messageIds.length > 1000) {
          return { success: false, message: 'Too many message IDs (max 1000 per request)' }
        }
        break
      }

      case 'search': {
        // Build Gmail search query from config
        const queryParts: string[] = []

        // From filter
        const from = resolveValue(config.from, input)
        if (from) {
          queryParts.push(`from:${from}`)
        }

        // To filter
        const to = resolveValue(config.to, input)
        if (to) {
          queryParts.push(`to:${to}`)
        }

        // Subject keywords
        const subjectKeywords = config.subjectKeywords || []
        if (subjectKeywords.length > 0) {
          const matchType = config.keywordMatchType || 'any'
          if (matchType === 'all') {
            subjectKeywords.forEach((keyword: string) => {
              queryParts.push(`subject:${keyword}`)
            })
          } else {
            queryParts.push(`subject:(${subjectKeywords.join(' OR ')})`)
          }
        }

        // Body keywords
        const bodyKeywords = config.bodyKeywords || []
        if (bodyKeywords.length > 0) {
          const matchType = config.keywordMatchType || 'any'
          if (matchType === 'all') {
            bodyKeywords.forEach((keyword: string) => {
              queryParts.push(`${keyword}`)
            })
          } else {
            queryParts.push(`(${bodyKeywords.join(' OR ')})`)
          }
        }

        // Attachment filter
        const hasAttachment = config.hasAttachment
        if (hasAttachment === 'yes') {
          queryParts.push('has:attachment')
        } else if (hasAttachment === 'no') {
          queryParts.push('-has:attachment')
        }

        // Label filter
        const hasLabel = resolveValue(config.hasLabel, input)
        if (hasLabel) {
          queryParts.push(`label:${hasLabel}`)
        }

        // Read status filter
        const isUnread = config.isUnread || 'unread'
        if (isUnread === 'unread') {
          queryParts.push('is:unread')
        } else if (isUnread === 'read') {
          queryParts.push('is:read')
        }

        if (queryParts.length === 0) {
          return { success: false, message: 'No search filters specified' }
        }

        const query = queryParts.join(' ')
        const maxMessages = Math.min(config.maxMessages || 100, 1000)

        logger.debug(`[markGmailAsRead] Searching with query: ${query}, maxMessages: ${maxMessages}`)

        const searchResult = await searchGmailMessages(accessToken, query, maxMessages)

        if (!searchResult.messages || searchResult.messages.length === 0) {
          return {
            success: true,
            output: {
              ...input,
              messageIds: [],
              count: 0,
              markedAt: new Date().toISOString(),
            },
            message: 'No messages found matching the search criteria',
          }
        }

        messageIds = searchResult.messages.map((msg: any) => msg.id)
        break
      }

      default:
        return { success: false, message: `Invalid message selection mode: ${messageSelection}` }
    }

    // Mark messages as read
    logger.debug(`[markGmailAsRead] Marking ${messageIds.length} message(s) as read`)

    await markMessagesAsRead(accessToken, messageIds)

    return {
      success: true,
      output: {
        ...input,
        messageIds,
        count: messageIds.length,
        success: true,
        markedAt: new Date().toISOString(),
      },
      message: `Successfully marked ${messageIds.length} message(s) as read`,
    }
  } catch (error: any) {
    logger.error('[markGmailAsRead] Error:', error)
    return {
      success: false,
      message: `Failed to mark messages as read: ${error.message}`,
      error: error.message,
    }
  }
}
