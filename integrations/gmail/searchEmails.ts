/**
 * Gmail Search Emails Action Handler
 * 
 * Searches for emails matching criteria in Gmail
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

import { logger } from '@/lib/utils/logger'

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "gmail_action_search_email",
  name: "Get Email",
  description: "Find emails by search criteria",
  icon: "search"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Gmail Email interface
 */
interface GmailEmail {
  id: string
  threadId: string
  subject?: string
  from?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  date?: string
  snippet?: string
  body?: string
  attachments?: Array<{
    filename: string
    mimeType: string
    size: number
    attachmentId: string
  }>
  labelIds?: string[]
}

/**
 * Searches for emails in Gmail based on query criteria
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and matching emails
 */
export async function searchGmailEmails(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract parameters
    const { 
      query,
      emailAddress,
      quantity = 10,
      includeBody = false,
      includeAttachments = false,
      labelIds = []
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!query && !emailAddress && labelIds.length === 0) {
      return {
        success: false,
        error: "You must provide either a search query, email addresses, or label IDs"
      }
    }
    
    // 5. Build search query
    let searchQuery = query || ''
    
    // Add email address filters if specified
    if (emailAddress) {
      const emails = emailAddress.split(',').map((email: string) => email.trim()).filter(Boolean)
      if (emails.length > 0) {
        const emailFilters = emails.map((email: string) => `from:${email}`).join(' OR ')
        searchQuery = searchQuery ? `${searchQuery} (${emailFilters})` : `(${emailFilters})`
      }
    }
    
    // Add label filters if specified
    if (labelIds && labelIds.length > 0) {
      const labelFilters = labelIds.map((id: string) => `label:${id}`).join(' ')
      searchQuery = searchQuery ? `${searchQuery} ${labelFilters}` : labelFilters
    }
    
    // Set maxResults based on quantity
    const maxResults = quantity === 'all' ? 500 : parseInt(quantity) || 10
    
    // 6. Search for messages matching the query
    const searchUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    searchUrl.searchParams.append('q', searchQuery)
    searchUrl.searchParams.append('maxResults', maxResults.toString())
    
    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gmail API search error (${response.status}): ${errorText}`)
    }
    
    const searchResult = await response.json()
    const messages = searchResult.messages || []
    
    // 7. If no messages found, return empty result
    if (messages.length === 0) {
      return {
        success: true,
        output: {
          emails: [],
          totalCount: 0,
          hasMore: false,
          latestEmail: null,
          latestSubject: null,
          latestSnippet: null,
          latestBody: null,
          latestFrom: null,
          latestTo: null,
          latestDate: null,
          latestEmailId: null
        },
        message: "No emails found matching the search criteria"
      }
    }
    
    // 8. Fetch details for each message
    const emails: GmailEmail[] = []
    
    for (const message of messages) {
      const messageId = message.id
      
      // Build message URL with appropriate format parameters
      const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`)
      messageUrl.searchParams.append('format', includeBody ? 'full' : 'metadata')
      
      const messageResponse = await fetch(messageUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`
        }
      })
      
      if (!messageResponse.ok) {
        logger.error(`Failed to fetch email ${messageId}:`, await messageResponse.text())
        continue
      }
      
      const messageData = await messageResponse.json()
      
      // Extract email details from headers
      const headers = messageData.payload?.headers || []
      const getHeader = (name: string) => {
        const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
        return header ? header.value : undefined
      }
      
      const email: GmailEmail = {
        id: messageData.id,
        threadId: messageData.threadId,
        subject: getHeader('subject'),
        from: getHeader('from'),
        to: getHeader('to')?.split(',').map((e: string) => e.trim()) || [],
        date: getHeader('date'),
        snippet: messageData.snippet,
        labelIds: messageData.labelIds || []
      }
      
      // Extract message body if requested
      if (includeBody && messageData.payload) {
        email.body = extractMessageBody(messageData.payload)
      }
      
      // Extract attachment info if requested
      if (includeAttachments && messageData.payload) {
        email.attachments = extractAttachments(messageData.payload)
      }
      
      emails.push(email)
    }
    
    // 9. Return success result with emails
    const latestEmail = emails[0] || null

    return {
      success: true,
      output: {
        emails,
        totalCount: searchResult.resultSizeEstimate || emails.length,
        hasMore: Boolean(searchResult.nextPageToken),
        latestEmail,
        latestSubject: latestEmail?.subject ?? null,
        latestSnippet: latestEmail?.snippet ?? null,
        latestBody: latestEmail?.body ?? null,
        latestFrom: latestEmail?.from ?? null,
        latestTo: latestEmail?.to?.join(', ') ?? null,
        latestDate: latestEmail?.date ?? null,
        latestEmailId: latestEmail?.id ?? null
      },
      message: `Found ${emails.length} matching email(s)`
    }
    
  } catch (error: any) {
    // 10. Handle errors and return failure result
    logger.error("Gmail search emails failed:", error)
    return {
      success: false,
      error: error.message || "Failed to search emails"
    }
  }
}

/**
 * Extracts the email body from a Gmail message payload
 * 
 * @param payload - Gmail message payload
 * @returns Email body as plain text or HTML
 */
function extractMessageBody(payload: any): string {
  // Check for simple body in the payload
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  
  // Check parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      // Prefer HTML parts
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      
      // Fall back to plain text
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      
      // Check nested parts
      if (part.parts) {
        const nestedBody = extractMessageBody(part)
        if (nestedBody) {
          return nestedBody
        }
      }
    }
  }
  
  return ''
}

/**
 * Extracts attachment info from a Gmail message payload
 * 
 * @param payload - Gmail message payload
 * @returns Array of attachment metadata
 */
function extractAttachments(payload: any): Array<{
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}> {
  const attachments: Array<{
    filename: string
    mimeType: string
    size: number
    attachmentId: string
  }> = []
  
  // Process payload parts recursively to find attachments
  function processPayloadParts(parts: any[]) {
    if (!parts) return
    
    for (const part of parts) {
      // Check if this part is an attachment
      if (
        part.filename && 
        part.body && 
        part.body.attachmentId && 
        part.mimeType !== 'text/plain' && 
        part.mimeType !== 'text/html'
      ) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: parseInt(part.body.size || '0', 10),
          attachmentId: part.body.attachmentId
        })
      }
      
      // Process nested parts
      if (part.parts) {
        processPayloadParts(part.parts)
      }
    }
  }
  
  if (payload.parts) {
    processPayloadParts(payload.parts)
  }
  
  return attachments
} 
