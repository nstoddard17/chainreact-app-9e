import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

import { logger } from '@/lib/utils/logger'

/**
 * Searches for emails in Gmail using the Gmail API
 * Supports Gmail search query syntax
 */
export async function searchGmailEmails(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    
    // Get search query from config
    let query = resolveValue(config.query, input) || ""
    const maxResults = Number(config.maxResults) || 10

    // Add from filter if provided
    const from = resolveValue(config.from, input)
    if (from && from.trim()) {
      // Wrap in quotes if it contains spaces
      const fromValue = from.includes(' ') ? `"${from.trim()}"` : from.trim()
      query += ` from:${fromValue}`
    }

    // Add to filter if provided
    const to = resolveValue(config.to, input)
    if (to && to.trim()) {
      // Wrap in quotes if it contains spaces
      const toValue = to.includes(' ') ? `"${to.trim()}"` : to.trim()
      query += ` to:${toValue}`
    }

    // Add date range filters if provided (using correct field names)
    const startDate = resolveValue(config.startDate, input)
    const endDate = resolveValue(config.endDate, input)

    if (startDate) {
      query += ` after:${startDate}`
    }

    if (endDate) {
      query += ` before:${endDate}`
    }

    // Add thread ID filter if provided
    const threadId = resolveValue(config.threadId, input)
    if (threadId) {
      query += ` threadId:${threadId}`
    }

    // Add label filters if provided (including the 'labels' field from schema)
    const labels = resolveValue(config.labels, input)
    const labelFilters = resolveValue(config.labelFilters, input)

    // Combine both labels and labelFilters
    const allLabels = []
    if (labels && Array.isArray(labels)) {
      allLabels.push(...labels)
    } else if (labels && typeof labels === 'string') {
      allLabels.push(labels)
    }
    if (labelFilters && Array.isArray(labelFilters)) {
      allLabels.push(...labelFilters)
    }

    if (allLabels.length > 0) {
      const labelQuery = allLabels.map((label: string) => `label:${label}`).join(' ')
      query += ` ${labelQuery}`
    }
    
    if (!query.trim()) {
      return { 
        success: false, 
        message: "No search query provided" 
      }
    }
    
    logger.debug(`Searching Gmail with query: "${query}"`)
    
    // First, search for message IDs
    const searchParams = new URLSearchParams({
      q: query,
      maxResults: maxResults.toString()
    })
    
    // Add includeSpamTrash parameter if configured
    const includeSpamTrash = resolveValue(config.includeSpamTrash, input)
    if (includeSpamTrash) {
      searchParams.append('includeSpamTrash', 'true')
    }
    
    const searchResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?${searchParams}`, 
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )
    
    if (!searchResponse.ok) {
      const error = await searchResponse.json()
      throw new Error(error.error?.message || `Gmail search failed: ${searchResponse.status}`)
    }
    
    const searchResults = await searchResponse.json()
    const messageIds = (searchResults.messages || []).map((msg: any) => msg.id)
    
    if (messageIds.length === 0) {
      return {
        success: true,
        output: {
          ...input,
          emails: [],
          count: 0,
          query
        },
        message: "No emails found matching the search criteria"
      }
    }
    
    // Determine format and fields based on config
    const format = resolveValue(config.format, input) || "full"
    const fieldsMask = resolveValue(config.fieldsMask, input) || "messages"
    
    // Fetch details for each message with rate limiting
    const emails = []
    const BATCH_SIZE = 25
    const DELAY_BETWEEN_BATCHES_MS = 500

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batchIds = messageIds.slice(i, i + BATCH_SIZE)
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(messageIds.length / BATCH_SIZE)

      logger.debug(`[Gmail Search] Fetching batch ${batchNumber}/${totalBatches} (${batchIds.length} messages)`)

      // Fetch messages in parallel within each batch
      const batchPromises = batchIds.map(async (messageId) => {
      try {
        // Build message URL with appropriate parameters
        const messageUrl = new URL(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`)
        
        // Handle different format and fields mask combinations
        if (format && format !== "full") {
          // Use specific format (metadata, minimal, raw)
          messageUrl.searchParams.append('format', format)
          
          // Add metadata headers for metadata format
          if (format === "metadata") {
            messageUrl.searchParams.append('metadataHeaders', 'From')
            messageUrl.searchParams.append('metadataHeaders', 'To')
            messageUrl.searchParams.append('metadataHeaders', 'Subject')
            messageUrl.searchParams.append('metadataHeaders', 'Date')
            messageUrl.searchParams.append('metadataHeaders', 'Cc')
            messageUrl.searchParams.append('metadataHeaders', 'Bcc')
          }
        } else if (fieldsMask && fieldsMask !== "messages") {
          // For fields masks that include body content, we need to use format=full
          // and then filter the response manually since the fields parameter
          // doesn't work well with body content
          if (fieldsMask.includes('payload(body)') || fieldsMask.includes('payload(parts)')) {
            messageUrl.searchParams.append('format', 'full')
          } else {
            // For metadata-only fields masks, we can use the fields parameter
            messageUrl.searchParams.append('format', 'full')
            messageUrl.searchParams.append('fields', fieldsMask)
          }
        } else {
          // Default: use full format
          messageUrl.searchParams.append('format', 'full')
        }
        
        const messageResponse = await fetch(messageUrl.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })
        
        if (!messageResponse.ok) {
          if (messageResponse.status === 429) {
            logger.warn(`[Gmail Search] Rate limit hit for message ${messageId}, skipping`)
          } else {
            logger.warn(`[Gmail Search] Failed to fetch message ${messageId}: ${messageResponse.status}`)
          }
          return null
        }
        
        const message = await messageResponse.json()
        const headers = message.payload?.headers || []
        
        // Extract email data based on format/fields
        const email: any = {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds || []
        }
        
        // Only include snippet if headers are being extracted
        const shouldExtractHeaders = !fieldsMask || 
          fieldsMask === "messages" || 
          fieldsMask.includes('payload(headers)')
        
        if (shouldExtractHeaders) {
          email.snippet = message.snippet
        }
        
        const shouldExtractBody = !fieldsMask || 
          fieldsMask === "messages" || 
          fieldsMask.includes('payload(body)')
        
        const shouldExtractAttachments = !fieldsMask || 
          fieldsMask === "messages" || 
          fieldsMask.includes('payload(parts)')
        
        // Extract headers if available and needed
        if (shouldExtractHeaders && headers.length > 0) {
          email.from = headers.find((h: any) => h.name === "From")?.value || ""
          email.to = headers.find((h: any) => h.name === "To")?.value || ""
          email.subject = headers.find((h: any) => h.name === "Subject")?.value || ""
          email.date = headers.find((h: any) => h.name === "Date")?.value || ""
          email.cc = headers.find((h: any) => h.name === "Cc")?.value || ""
          email.bcc = headers.find((h: any) => h.name === "Bcc")?.value || ""
        }
        
        // Extract body content if available and needed
        if (shouldExtractBody) {
          if (message.payload?.body?.data) {
            email.body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
          } else if (message.payload?.parts) {
            // Try to extract body from parts
            const extractBody = (parts: any[]): string => {
              for (const part of parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                  return Buffer.from(part.body.data, 'base64').toString('utf-8')
                }
                if (part.mimeType === 'text/html' && part.body?.data) {
                  return Buffer.from(part.body.data, 'base64').toString('utf-8')
                }
                if (part.parts) {
                  const body = extractBody(part.parts)
                  if (body) return body
                }
              }
              return ""
            }
            email.body = extractBody(message.payload.parts)
          }
        }
        
        // Extract attachments if available and needed
        if (shouldExtractAttachments && message.payload?.parts) {
          const extractAttachments = (parts: any[]): any[] => {
            const attachments: any[] = []
            for (const part of parts) {
              if (part.filename && part.body?.attachmentId && 
                  part.mimeType !== 'text/plain' && part.mimeType !== 'text/html') {
                attachments.push({
                  filename: part.filename,
                  mimeType: part.mimeType,
                  size: parseInt(part.body.size || '0', 10),
                  attachmentId: part.body.attachmentId
                })
              }
              if (part.parts) {
                attachments.push(...extractAttachments(part.parts))
              }
            }
            return attachments
          }
          email.attachments = extractAttachments(message.payload.parts)
        }
        
        return email
      } catch (error) {
        logger.error(`[Gmail Search] Error fetching message ${messageId}:`, error)
        return null
      }
    })

    const batchResults = await Promise.all(batchPromises)
    emails.push(...batchResults.filter((email): email is NonNullable<typeof email> => email !== null))

    logger.debug(`[Gmail Search] Batch ${batchNumber}/${totalBatches} complete. Total emails fetched: ${emails.length}/${messageIds.length}`)

    // Add delay between batches to avoid rate limiting (except for the last batch)
    if (i + BATCH_SIZE < messageIds.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  const failedCount = messageIds.length - emails.length
  if (failedCount > 0) {
    logger.debug(`[Gmail Search] Finished: ${emails.length}/${messageIds.length} emails (${failedCount} failed due to rate limits)`)
  }
    
    // Return emails array and metadata
    // For single email scenarios, users can access emails[0]
    // For multiple emails, they have the full array to work with
    const result = {
      success: true,
      output: {
        ...input,
        // Full email results array
        emails,
        // Add a messages field as an alias for emails (for compatibility)
        messages: emails,
        // Metadata about the search
        count: emails.length,
        query,
        totalResults: searchResults.resultSizeEstimate || messageIds.length,
        // Convenience fields for single email use case (when maxResults=1)
        // Only include these if exactly 1 email was requested and found
        ...(config.maxResults === 1 && emails.length === 1 ? {
          from: emails[0].from || "",
          to: emails[0].to || "",
          subject: emails[0].subject || "",
          body: emails[0].body || "",
          attachments: emails[0].attachments || [],
          date: emails[0].date || "",
          messageId: emails[0].id || "",
          threadId: emails[0].threadId || "",
          snippet: emails[0].snippet || ""
        } : {})
      },
      message: failedCount > 0
        ? `Found ${emails.length} email(s). Note: ${failedCount} could not be fetched (likely Gmail API rate limits)`
        : `Found ${emails.length} email(s) matching the search criteria`
    }
    
    return result
  } catch (error: any) {
    logger.error("Gmail search error:", error)
    return {
      success: false,
      message: `Failed to search emails: ${error.message}`,
      error: error.message
    }
  }
} 