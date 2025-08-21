/**
 * Gmail Recent Recipients Handler
 */

import { GmailIntegration, EmailRecipient, GmailDataHandler } from '../types'
import { validateGmailIntegration, makeGmailApiRequest, extractEmailAddresses } from '../utils'
import { EmailCacheService } from '../../../../../../lib/services/emailCacheService'

/**
 * Fetch Gmail recent recipients using efficient People API + smart caching
 */
export const getGmailRecentRecipients: GmailDataHandler<EmailRecipient> = async (integration: GmailIntegration) => {
  try {
    validateGmailIntegration(integration)
    console.log("🚀 [Gmail API] Using efficient approach with smart caching")

    // Initialize email cache service
    const emailCache = new EmailCacheService(true) // Server-side
    const source = "gmail-recent-recipients"

    // Step 1: Get cached email suggestions (fast)
    let cachedEmails: any[] = []
    try {
      cachedEmails = await emailCache.getFrequentEmails(source, 30)
      console.log(`📧 [Cache] Found ${cachedEmails.length} cached emails`)
    } catch (cacheError) {
      console.warn("⚠️ [Cache] Failed to get cached emails:", cacheError)
    }

    // Step 2: Fetch fresh data efficiently
    let freshEmails: any[] = []
    
    // Strategy 1: Try Gmail People API first (most efficient)
    try {
      const peopleResponse = await makeGmailApiRequest(
        `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=25&sortOrder=LAST_MODIFIED_DESCENDING`,
        integration.access_token
      )

      const peopleData = await peopleResponse.json()
      const connections = peopleData.connections || []
      
      freshEmails = connections
        .filter((person: any) => person.emailAddresses?.length > 0)
        .slice(0, 20)
        .map((person: any) => {
          const primaryEmail = person.emailAddresses[0]
          const name = person.names?.[0]?.displayName || person.names?.[0]?.givenName
          return {
            value: primaryEmail.value,
            label: name ? `${name} <${primaryEmail.value}>` : primaryEmail.value,
            email: primaryEmail.value,
            name: name,
            source: source,
            frequency: 0 // Will be updated from cache
          }
        })
      
      console.log(`✅ [Gmail API] Got ${freshEmails.length} contacts from People API`)

    } catch (peopleError: any) {
      console.warn("⚠️ [Gmail API] People API failed, falling back to search:", peopleError)
      if (peopleError.status === 403) {
        console.warn('⚠️ [Gmail API] Missing contacts permission. User needs to reconnect Gmail integration to enable contact suggestions.')
      }
    }

    // Strategy 2: Supplement with efficient search if needed
    if (freshEmails.length < 10) {
      try {
        // First get message IDs
        const searchResponse = await makeGmailApiRequest(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=5`,
          integration.access_token
        )

        const searchData = await searchResponse.json()
        const messageIds = (searchData.messages || []).map((msg: any) => msg.id)
        
        console.log(`🔍 [Gmail API] Search found ${messageIds.length} messages, fetching individual message headers`)
        
        const emailSet = new Set(freshEmails.map(r => r.email.toLowerCase()))
        
        // Fetch individual messages to get headers
        for (const messageId of messageIds.slice(0, 3)) { // Limit to 3 to avoid rate limits
          try {
            const messageResponse = await makeGmailApiRequest(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?fields=payload(headers)`,
              integration.access_token
            )
            
            const messageData = await messageResponse.json()
            const headers = messageData.payload?.headers || []
            
            headers.forEach((header: any) => {
              if (['To', 'Cc'].includes(header.name) && header.value) {
                const emailAddresses = extractEmailAddresses(header.value)
                emailAddresses.forEach(({ email, name }) => {
                  if (email && !emailSet.has(email.toLowerCase()) && freshEmails.length < 20) {
                    emailSet.add(email.toLowerCase())
                    freshEmails.push({
                      value: email,
                      label: name ? `${name} <${email}>` : email,
                      email,
                      name,
                      source: source,
                      frequency: 0
                    })
                  }
                })
              }
            })
          } catch (messageError) {
            console.warn(`⚠️ [Gmail API] Failed to fetch message ${messageId}:`, messageError)
          }
        }

        console.log(`✅ [Gmail API] Total fresh emails: ${freshEmails.length}`)

      } catch (searchError) {
        console.warn("⚠️ [Gmail API] Search fallback failed:", searchError)
      }
    }

    // Step 3: Merge cached and fresh data intelligently
    let mergedResults: any[] = []
    try {
      mergedResults = await emailCache.getMergedEmailSuggestions(freshEmails, source, 25)
      console.log(`✅ [Cache] Merged to ${mergedResults.length} total suggestions`)
    } catch (mergeError) {
      console.warn("⚠️ [Cache] Failed to merge suggestions, using fresh data:", mergeError)
      mergedResults = freshEmails.slice(0, 25)
    }

    // Step 4: Track usage for fresh emails (background task)
    if (freshEmails.length > 0) {
      // Don't await this - run in background
      emailCache.trackMultipleEmails(
        freshEmails.map(email => ({
          email: email.email,
          name: email.name,
          source: source,
          integrationId: integration.id,
          metadata: { 
            fetchedAt: new Date().toISOString(),
            apiSource: email.name ? 'people_api' : 'search_api'
          }
        }))
      ).catch(error => {
        console.warn("⚠️ [Cache] Failed to track emails in background:", error)
      })
    }

    console.log(`✅ [Gmail API] Returning ${mergedResults.length} optimized recipients`)
    return mergedResults

  } catch (error: any) {
    console.error("❌ [Gmail API] Failed to get recent recipients:", error)
    throw new Error(`Failed to get Gmail recent recipients: ${error.message}`)
  }
}