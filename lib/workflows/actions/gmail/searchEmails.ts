import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

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
    
    // Add label filters if provided
    const labelFilters = resolveValue(config.labelFilters, input)
    if (labelFilters && Array.isArray(labelFilters) && labelFilters.length > 0) {
      const labelQuery = labelFilters.map((label: string) => `label:${label}`).join(' ')
      query += ` ${labelQuery}`
    }
    
    if (!query.trim()) {
      return { 
        success: false, 
        message: "No search query provided" 
      }
    }
    
    console.log(`Searching Gmail with query: "${query}"`)
    
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
    
    // Fetch details for each message
    const emails = []
    
    for (const messageId of messageIds) {
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
          console.error(`Failed to fetch message ${messageId}: ${messageResponse.status}`)
          continue
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
        
        emails.push(email)
      } catch (error) {
        console.error(`Error fetching message ${messageId}:`, error)
        // Continue with other messages
      }
    }
    
    return {
      success: true,
      output: {
        ...input,
        emails,
        count: emails.length,
        query,
        totalResults: searchResults.resultSizeEstimate || messageIds.length
      },
      message: `Found ${emails.length} emails matching the search criteria`
    }
  } catch (error: any) {
    console.error("Gmail search error:", error)
    return {
      success: false,
      message: `Failed to search emails: ${error.message}`,
      error: error.message
    }
  }
} 