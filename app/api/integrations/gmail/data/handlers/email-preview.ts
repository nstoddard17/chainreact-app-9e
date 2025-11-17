/**
 * Gmail Email Preview Handler
 * Provides preview of emails that match search criteria
 */

import { GmailIntegration, GmailDataHandler } from '../types'
import { validateGmailIntegration, getGmailAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

interface PreviewOptions {
  searchConfig?: {
    labels?: string
    query?: string
    startDate?: string
    endDate?: string
    maxResults?: number
    previewLimit?: number
  }
  advancedSearchConfig?: {
    searchMode?: 'filters' | 'query'
    from?: string
    to?: string
    subject?: string | string[]  // Can be single keyword or array of keywords
    hasAttachment?: string
    attachmentName?: string
    isRead?: string
    isStarred?: string
    dateRange?: string
    afterDate?: string
    beforeDate?: string
    hasLabel?: string
    customQuery?: string
    maxResults?: number
    includeSpam?: boolean
    previewLimit?: number
  }
  markAsReadConfig?: {
    from?: string
    to?: string
    subjectKeywords?: string[]
    bodyKeywords?: string[]
    keywordMatchType?: 'any' | 'all'
    hasAttachment?: string
    hasLabel?: string
    isUnread?: string
    maxMessages?: number
    previewLimit?: number
  }
  markAsUnreadConfig?: {
    from?: string
    to?: string
    subjectKeywords?: string[]
    bodyKeywords?: string[]
    keywordMatchType?: 'any' | 'all'
    hasAttachment?: string
    hasLabel?: string
    isUnread?: string
    maxMessages?: number
    previewLimit?: number
  }
}

/**
 * Build Gmail query from search config
 */
function buildGmailQuery(config: any): string {
  const parts: string[] = []

  // Basic search (searchEmails action)
  if (config.labels && config.labels !== 'INBOX') {
    parts.push(`label:${config.labels}`)
  }
  if (config.query) {
    parts.push(config.query)
  }
  if (config.startDate) {
    const date = new Date(config.startDate).toISOString().split('T')[0].replace(/-/g, '/')
    parts.push(`after:${date}`)
  }
  if (config.endDate) {
    const date = new Date(config.endDate).toISOString().split('T')[0].replace(/-/g, '/')
    parts.push(`before:${date}`)
  }

  return parts.join(' ')
}

/**
 * Build Gmail query from advanced search config
 */
function buildAdvancedGmailQuery(config: any): string {
  if (config.searchMode === 'query' && config.customQuery) {
    return config.customQuery
  }

  const parts: string[] = []

  if (config.from) {
    parts.push(`from:${config.from}`)
  }
  if (config.to) {
    parts.push(`to:${config.to}`)
  }
  // Handle subject keywords (can be string or array)
  if (config.subject) {
    if (Array.isArray(config.subject) && config.subject.length > 0) {
      // Multiple keywords: match ANY (OR logic)
      const keywords = config.subject.map((kw: string) => `subject:${kw}`).join(' OR ')
      parts.push(`(${keywords})`)
    } else if (typeof config.subject === 'string' && config.subject.trim()) {
      // Single keyword
      parts.push(`subject:${config.subject}`)
    }
  }
  if (config.hasAttachment === 'yes') {
    parts.push('has:attachment')
  }
  if (config.hasAttachment === 'no') {
    parts.push('-has:attachment')
  }
  if (config.attachmentName) {
    parts.push(`filename:${config.attachmentName}`)
  }
  if (config.isRead === 'read') {
    parts.push('is:read')
  }
  if (config.isRead === 'unread') {
    parts.push('is:unread')
  }
  if (config.isStarred === 'starred') {
    parts.push('is:starred')
  }
  if (config.isStarred === 'unstarred') {
    parts.push('-is:starred')
  }

  // Date range handling
  if (config.dateRange === 'today') {
    parts.push('newer_than:1d')
  } else if (config.dateRange === 'yesterday') {
    parts.push('newer_than:2d older_than:1d')
  } else if (config.dateRange === 'last_7_days') {
    parts.push('newer_than:7d')
  } else if (config.dateRange === 'last_30_days') {
    parts.push('newer_than:30d')
  } else if (config.dateRange === 'custom' && config.afterDate) {
    const afterDate = new Date(config.afterDate).toISOString().split('T')[0].replace(/-/g, '/')
    parts.push(`after:${afterDate}`)
    if (config.beforeDate) {
      const beforeDate = new Date(config.beforeDate).toISOString().split('T')[0].replace(/-/g, '/')
      parts.push(`before:${beforeDate}`)
    }
  }

  if (config.hasLabel) {
    parts.push(`label:${config.hasLabel}`)
  }

  return parts.join(' ')
}

/**
 * Extract email body from Gmail message payload
 */
function extractEmailBody(payload: any): { html: string | null; text: string | null } {
  let html: string | null = null
  let text: string | null = null

  // Helper to decode base64
  const decodeBase64 = (data: string): string => {
    try {
      // Gmail uses URL-safe base64 encoding (- and _ instead of + and /)
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
      return Buffer.from(base64, 'base64').toString('utf-8')
    } catch (error) {
      logger.warn('Failed to decode base64 email body:', error)
      return ''
    }
  }

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
 * Format email for preview
 */
function formatEmailForPreview(message: any) {
  const headers = message.payload?.headers || []
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const subject = getHeader('Subject') || '(No subject)'
  const from = getHeader('From') || 'Unknown sender'
  const date = getHeader('Date') || ''
  const to = getHeader('To') || ''

  // Extract snippet (first 150 chars of body)
  let snippet = message.snippet || ''
  if (snippet.length > 150) {
    snippet = snippet.substring(0, 150) + '...'
  }

  // Extract full email body
  const { html, text } = extractEmailBody(message.payload)

  // Check for attachments
  const hasAttachment = message.payload?.parts?.some((part: any) =>
    part.filename && part.filename.length > 0
  ) || false

  // Get attachment info
  const attachments = message.payload?.parts
    ?.filter((part: any) => part.filename && part.filename.length > 0)
    .map((part: any) => ({
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body?.size || 0,
    })) || []

  // Get labels
  const labels = message.labelIds || []

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    date,
    snippet,
    bodyHtml: html,
    bodyText: text,
    hasAttachment,
    attachments,
    labels,
    isUnread: labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
  }
}

/**
 * Preview emails from basic search
 */
export const getSearchEmailsPreview: GmailDataHandler = async (integration: GmailIntegration, options: PreviewOptions) => {
  const { searchConfig = {} } = options
  const previewLimit = searchConfig.previewLimit || 10

  logger.debug('[Gmail Preview] Search emails preview request:', { searchConfig, previewLimit })

  validateGmailIntegration(integration)
  const accessToken = getGmailAccessToken(integration)

  try {
    // Build query
    const query = buildGmailQuery(searchConfig)
    logger.debug('[Gmail Preview] Built query:', query)

    // Build URL with query params
    const params = new URLSearchParams({
      maxResults: Math.min(previewLimit, 50).toString(),
      includeSpamTrash: 'false',
    })
    if (query) {
      params.append('q', query)
    }

    // Search for messages
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
    logger.debug(`[Gmail Preview] Found ${messages.length} messages`)

    if (messages.length === 0) {
      return {
        emails: [],
        totalCount: 0,
        query: query || 'in:inbox',
      }
    }

    // Fetch full message details for preview
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
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
      return formatEmailForPreview(msgData)
    })

    const emailResults = await Promise.all(emailPromises)
    const emails = emailResults.filter(email => email !== null)

    return {
      emails,
      totalCount: messages.length,
      hasMore: messages.length >= previewLimit,
      query: query || 'in:inbox',
    }
  } catch (error: any) {
    logger.error('[Gmail Preview] Error fetching search preview:', error)
    throw new Error(`Failed to preview emails: ${error.message}`)
  }
}

/**
 * Preview emails from advanced search
 */
export const getAdvancedSearchPreview: GmailDataHandler = async (integration: GmailIntegration, options: PreviewOptions) => {
  const { advancedSearchConfig = {} } = options
  const previewLimit = advancedSearchConfig.previewLimit || 10

  logger.debug('[Gmail Preview] Advanced search preview request:', { advancedSearchConfig, previewLimit })

  validateGmailIntegration(integration)
  const accessToken = getGmailAccessToken(integration)

  try {
    // Build query from advanced search config
    const query = buildAdvancedGmailQuery(advancedSearchConfig)
    logger.debug('[Gmail Preview] Built advanced query:', query)

    if (!query || query.trim() === '') {
      return {
        emails: [],
        totalCount: 0,
        query: '',
        error: 'No search criteria specified',
      }
    }

    // Build URL with query params
    const params = new URLSearchParams({
      q: query,
      maxResults: Math.min(previewLimit, 50).toString(),
      includeSpamTrash: (advancedSearchConfig.includeSpam || false).toString(),
    })

    // Search for messages
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
    logger.debug(`[Gmail Preview] Found ${messages.length} messages`)

    if (messages.length === 0) {
      return {
        emails: [],
        totalCount: 0,
        query,
      }
    }

    // Fetch full message details for preview
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
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
      return formatEmailForPreview(msgData)
    })

    const emailResults = await Promise.all(emailPromises)
    const emails = emailResults.filter(email => email !== null)

    return {
      emails,
      totalCount: messages.length,
      hasMore: messages.length >= previewLimit,
      query,
    }
  } catch (error: any) {
    logger.error('[Gmail Preview] Error fetching advanced search preview:', error)
    throw new Error(`Failed to preview emails: ${error.message}`)
  }
}

/**
 * Build Gmail query from Mark as Read/Unread config
 */
function buildMarkAsReadQuery(config: any): string {
  const parts: string[] = []

  if (config.from) {
    parts.push(`from:${config.from}`)
  }
  if (config.to) {
    parts.push(`to:${config.to}`)
  }

  // Handle subject keywords (array of strings)
  if (config.subjectKeywords && Array.isArray(config.subjectKeywords) && config.subjectKeywords.length > 0) {
    if (config.keywordMatchType === 'all') {
      // All keywords must match (AND)
      config.subjectKeywords.forEach((keyword: string) => {
        parts.push(`subject:${keyword}`)
      })
    } else {
      // Any keyword can match (OR) - use parentheses for grouping
      const keywords = config.subjectKeywords.map((kw: string) => `subject:${kw}`).join(' OR ')
      parts.push(`(${keywords})`)
    }
  }

  // Handle body keywords (array of strings)
  if (config.bodyKeywords && Array.isArray(config.bodyKeywords) && config.bodyKeywords.length > 0) {
    if (config.keywordMatchType === 'all') {
      // All keywords must match (AND)
      config.bodyKeywords.forEach((keyword: string) => {
        parts.push(keyword)
      })
    } else {
      // Any keyword can match (OR) - use parentheses for grouping
      const keywords = config.bodyKeywords.join(' OR ')
      parts.push(`(${keywords})`)
    }
  }

  if (config.hasAttachment === 'yes') {
    parts.push('has:attachment')
  }
  if (config.hasAttachment === 'no') {
    parts.push('-has:attachment')
  }

  if (config.isUnread === 'read') {
    parts.push('is:read')
  }
  if (config.isUnread === 'unread') {
    parts.push('is:unread')
  }

  if (config.hasLabel) {
    parts.push(`label:${config.hasLabel}`)
  }

  return parts.join(' ')
}

/**
 * Preview emails that would be marked as read
 */
export const getMarkAsReadPreview: GmailDataHandler = async (integration: GmailIntegration, options: PreviewOptions) => {
  const { markAsReadConfig = {} } = options
  const previewLimit = markAsReadConfig.previewLimit || 10

  logger.debug('[Gmail Preview] Mark as Read preview request:', { markAsReadConfig, previewLimit })

  validateGmailIntegration(integration)
  const accessToken = getGmailAccessToken(integration)

  try {
    // Build query from Mark as Read config
    const query = buildMarkAsReadQuery(markAsReadConfig)
    logger.debug('[Gmail Preview] Built mark as read query:', query)

    if (!query || query.trim() === '') {
      return {
        emails: [],
        totalCount: 0,
        query: '',
        error: 'No search criteria specified',
      }
    }

    // Build URL with query params
    const params = new URLSearchParams({
      q: query,
      maxResults: Math.min(previewLimit, 50).toString(),
      includeSpamTrash: 'false',
    })

    // Search for messages
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
    logger.debug(`[Gmail Preview] Found ${messages.length} messages that would be marked as read`)

    if (messages.length === 0) {
      return {
        emails: [],
        totalCount: 0,
        query,
      }
    }

    // Fetch full message details for preview
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
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
      return formatEmailForPreview(msgData)
    })

    const emailResults = await Promise.all(emailPromises)
    const emails = emailResults.filter(email => email !== null)

    return {
      emails,
      totalCount: messages.length,
      hasMore: messages.length >= previewLimit,
      query,
    }
  } catch (error: any) {
    logger.error('[Gmail Preview] Error fetching mark as read preview:', error)
    throw new Error(`Failed to preview emails: ${error.message}`)
  }
}

/**
 * Preview emails that would be marked as unread
 */
export const getMarkAsUnreadPreview: GmailDataHandler = async (integration: GmailIntegration, options: PreviewOptions) => {
  const { markAsUnreadConfig = {} } = options
  const previewLimit = markAsUnreadConfig.previewLimit || 10

  logger.debug('[Gmail Preview] Mark as Unread preview request:', { markAsUnreadConfig, previewLimit })

  validateGmailIntegration(integration)
  const accessToken = getGmailAccessToken(integration)

  try {
    // Build query from Mark as Unread config (uses same query builder)
    const query = buildMarkAsReadQuery(markAsUnreadConfig)
    logger.debug('[Gmail Preview] Built mark as unread query:', query)

    if (!query || query.trim() === '') {
      return {
        emails: [],
        totalCount: 0,
        query: '',
        error: 'No search criteria specified',
      }
    }

    // Build URL with query params
    const params = new URLSearchParams({
      q: query,
      maxResults: Math.min(previewLimit, 50).toString(),
      includeSpamTrash: 'false',
    })

    // Search for messages
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
    logger.debug(`[Gmail Preview] Found ${messages.length} messages that would be marked as unread`)

    if (messages.length === 0) {
      return {
        emails: [],
        totalCount: 0,
        query,
      }
    }

    // Fetch full message details for preview
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
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
      return formatEmailForPreview(msgData)
    })

    const emailResults = await Promise.all(emailPromises)
    const emails = emailResults.filter(email => email !== null)

    return {
      emails,
      totalCount: messages.length,
      hasMore: messages.length >= previewLimit,
      query,
    }
  } catch (error: any) {
    logger.error('[Gmail Preview] Error fetching mark as unread preview:', error)
    throw new Error(`Failed to preview emails: ${error.message}`)
  }
}
