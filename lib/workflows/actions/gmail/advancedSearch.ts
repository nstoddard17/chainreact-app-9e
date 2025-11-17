import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'
import { fetchEmailsWithRateLimiting } from './fetchEmailsWithRateLimiting'

/**
 * Build Gmail query from advanced search config
 */
function buildAdvancedGmailQuery(config: any, input: Record<string, any>): string {
  const searchMode = resolveValue(config.searchMode, input) || 'filters'

  // If using custom query mode, return the custom query directly
  if (searchMode === 'query') {
    const customQuery = resolveValue(config.customQuery, input)
    return customQuery || ''
  }

  // Build query from filter fields
  const parts: string[] = []

  const from = resolveValue(config.from, input)
  if (from) {
    parts.push(`from:${from}`)
  }

  const to = resolveValue(config.to, input)
  if (to) {
    parts.push(`to:${to}`)
  }

  // Handle subject keywords (can be string or array)
  const subject = resolveValue(config.subject, input)
  if (subject) {
    if (Array.isArray(subject) && subject.length > 0) {
      // Multiple keywords: match ANY (OR logic)
      const keywords = subject.map((kw: string) => `subject:${kw}`).join(' OR ')
      parts.push(`(${keywords})`)
    } else if (typeof subject === 'string' && subject.trim()) {
      // Single keyword
      parts.push(`subject:${subject}`)
    }
  }

  const hasAttachment = resolveValue(config.hasAttachment, input)
  if (hasAttachment === 'yes') {
    parts.push('has:attachment')
  }
  if (hasAttachment === 'no') {
    parts.push('-has:attachment')
  }

  const attachmentName = resolveValue(config.attachmentName, input)
  if (attachmentName) {
    parts.push(`filename:${attachmentName}`)
  }

  const isRead = resolveValue(config.isRead, input)
  if (isRead === 'read') {
    parts.push('is:read')
  }
  if (isRead === 'unread') {
    parts.push('is:unread')
  }

  const isStarred = resolveValue(config.isStarred, input)
  if (isStarred === 'starred') {
    parts.push('is:starred')
  }
  if (isStarred === 'unstarred') {
    parts.push('-is:starred')
  }

  // Date range handling
  const dateRange = resolveValue(config.dateRange, input)
  if (dateRange === 'today') {
    parts.push('newer_than:1d')
  } else if (dateRange === 'yesterday') {
    parts.push('newer_than:2d older_than:1d')
  } else if (dateRange === 'last_7_days') {
    parts.push('newer_than:7d')
  } else if (dateRange === 'last_30_days') {
    parts.push('newer_than:30d')
  } else if (dateRange === 'custom') {
    const afterDate = resolveValue(config.afterDate, input)
    if (afterDate) {
      const formattedAfterDate = new Date(afterDate).toISOString().split('T')[0].replace(/-/g, '/')
      parts.push(`after:${formattedAfterDate}`)
    }
    const beforeDate = resolveValue(config.beforeDate, input)
    if (beforeDate) {
      const formattedBeforeDate = new Date(beforeDate).toISOString().split('T')[0].replace(/-/g, '/')
      parts.push(`before:${formattedBeforeDate}`)
    }
  }

  const hasLabel = resolveValue(config.hasLabel, input)
  if (hasLabel) {
    parts.push(`label:${hasLabel}`)
  }

  return parts.join(' ')
}

/**
 * Extract email headers
 */
function getHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

/**
 * Decode base64 email body
 */
function decodeBase64(data: string): string {
  try {
    // Gmail uses URL-safe base64 encoding (- and _ instead of + and /)
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64').toString('utf-8')
  } catch (error) {
    logger.warn('[Gmail] Failed to decode base64 email body:', error)
    return ''
  }
}

/**
 * Extract email body from Gmail message payload
 */
function extractEmailBody(payload: any): { html: string | null; text: string | null } {
  let html: string | null = null
  let text: string | null = null

  // Helper to extract body from parts recursively
  const extractFromParts = (parts: any[]): void => {
    if (!parts) return

    for (const part of parts) {
      const mimeType = part.mimeType || ''

      // If this part has nested parts, recurse
      if (part.parts) {
        extractFromParts(part.parts)
      }

      // Extract HTML body
      if (mimeType === 'text/html' && part.body?.data && !html) {
        html = decodeBase64(part.body.data)
      }

      // Extract plain text body
      if (mimeType === 'text/plain' && part.body?.data && !text) {
        text = decodeBase64(part.body.data)
      }
    }
  }

  // Check if the body is directly in payload.body (simple email)
  if (payload.body?.data) {
    const mimeType = payload.mimeType || ''
    const bodyData = decodeBase64(payload.body.data)

    if (mimeType === 'text/html') {
      html = bodyData
    } else if (mimeType === 'text/plain') {
      text = bodyData
    }
  }

  // Check parts (multipart email)
  if (payload.parts) {
    extractFromParts(payload.parts)
  }

  return { html, text }
}

/**
 * Format email message for output
 */
function formatEmailMessage(message: any) {
  const headers = message.payload?.headers || []

  const subject = getHeader(headers, 'Subject') || '(No subject)'
  const from = getHeader(headers, 'From') || 'Unknown sender'
  const to = getHeader(headers, 'To') || ''
  const cc = getHeader(headers, 'Cc') || ''
  const bcc = getHeader(headers, 'Bcc') || ''
  const date = getHeader(headers, 'Date') || ''
  const messageId = getHeader(headers, 'Message-ID') || ''
  const inReplyTo = getHeader(headers, 'In-Reply-To') || ''
  const references = getHeader(headers, 'References') || ''

  // Extract email body
  const { html, text } = extractEmailBody(message.payload)

  // Extract snippet
  const snippet = message.snippet || ''

  // Check for attachments
  const attachments = message.payload?.parts
    ?.filter((part: any) => part.filename && part.filename.length > 0)
    .map((part: any) => ({
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body?.size || 0,
      attachmentId: part.body?.attachmentId || null,
    })) || []

  // Get labels
  const labels = message.labelIds || []

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    cc,
    bcc,
    date,
    snippet,
    bodyHtml: html,
    bodyText: text,
    hasAttachment: attachments.length > 0,
    attachments,
    labels,
    isUnread: labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    isImportant: labels.includes('IMPORTANT'),
    messageId,
    inReplyTo,
    references,
    internalDate: message.internalDate,
    sizeEstimate: message.sizeEstimate,
  }
}

/**
 * Performs advanced search for emails in Gmail using filters or custom query
 */
export async function advancedGmailSearch(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Build Gmail query
    const query = buildAdvancedGmailQuery(config, input)

    if (!query || query.trim() === '') {
      return {
        success: false,
        message: 'No search criteria specified. Please configure at least one search filter or provide a custom query.',
      }
    }

    logger.debug(`[Gmail Advanced Search] Executing query: "${query}"`)

    // Get max results (default 10, max 100 to balance speed vs rate limits)
    const rawMaxResults = resolveValue(config.maxResults, input)
    const maxResults = Math.min(Number(rawMaxResults) || 10, 100)
    const includeSpam = resolveValue(config.includeSpam, input) === true

    logger.debug(`[Gmail Advanced Search] Configuration:`, {
      rawMaxResults,
      resolvedMaxResults: maxResults,
      includeSpam,
      configMaxResults: config.maxResults
    })

    // Build search parameters
    const searchParams = new URLSearchParams({
      q: query,
      maxResults: maxResults.toString(),
      includeSpamTrash: includeSpam.toString(),
    })

    // Search for message IDs
    const searchResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?${searchParams}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!searchResponse.ok) {
      const error = await searchResponse.json()
      throw new Error(error.error?.message || `Gmail search failed: ${searchResponse.status}`)
    }

    const searchResults = await searchResponse.json()
    const messageIds = (searchResults.messages || []).map((msg: any) => msg.id)
    const resultSizeEstimate = searchResults.resultSizeEstimate || 0

    if (messageIds.length === 0) {
      return {
        success: true,
        output: {
          ...input,
          emails: [],
          totalResults: 0,
          resultCount: 0,
          query,
        },
        message: 'No emails found matching the search criteria',
      }
    }

    // Fetch full details for messages using rate-limited helper
    const emails = await fetchEmailsWithRateLimiting(
      accessToken,
      messageIds,
      formatEmailMessage,
      {
        batchSize: 25,
        delayBetweenBatchesMs: 500,
        format: 'full',
        logPrefix: '[Gmail Advanced Search]'
      }
    )

    const failedCount = messageIds.length - emails.length

    // Build result message
    let message = `Found ${emails.length} email(s) matching search criteria`
    if (failedCount > 0) {
      message += `. Note: ${failedCount} email(s) could not be fetched (likely due to Gmail API rate limits). Try reducing Max Results or running again in a few seconds.`
    }

    return {
      success: true,
      output: {
        ...input,
        emails,
        totalResults: resultSizeEstimate,
        resultCount: emails.length,
        nextPageToken: searchResults.nextPageToken || null,
        query,
      },
      message,
    }
  } catch (error: any) {
    logger.error('[Gmail Advanced Search] Error:', error)
    return {
      success: false,
      message: `Gmail advanced search failed: ${error.message}`,
      error: error.message,
    }
  }
}
