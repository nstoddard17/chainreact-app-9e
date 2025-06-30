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
    
    // Add date range filters if provided
    const after = resolveValue(config.after, input)
    const before = resolveValue(config.before, input)
    
    if (after) {
      query += ` after:${after}`
    }
    
    if (before) {
      query += ` before:${before}`
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
    
    // Fetch details for each message
    const emails = []
    
    for (const messageId of messageIds) {
      try {
        const messageResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, 
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        )
        
        if (!messageResponse.ok) {
          console.error(`Failed to fetch message ${messageId}: ${messageResponse.status}`)
          continue
        }
        
        const message = await messageResponse.json()
        const headers = message.payload?.headers || []
        
        const email = {
          id: message.id,
          threadId: message.threadId,
          snippet: message.snippet,
          from: headers.find((h: any) => h.name === "From")?.value || "",
          to: headers.find((h: any) => h.name === "To")?.value || "",
          subject: headers.find((h: any) => h.name === "Subject")?.value || "",
          date: headers.find((h: any) => h.name === "Date")?.value || "",
          labelIds: message.labelIds || []
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