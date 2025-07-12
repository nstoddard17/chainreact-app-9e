import { TokenRefreshService } from "../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { createClient } from "@supabase/supabase-js"
import { FileStorageService } from "@/lib/storage/fileStorage"
import { google } from 'googleapis'
import {
  // Core utilities
  ActionResult,
  
  // Gmail actions
  sendGmail,
  addGmailLabels,
  searchGmailEmails,
  
  // Google Sheets actions
  readGoogleSheetsData,
  
  // Airtable actions
  moveAirtableRecord,
  createAirtableRecord,
  updateAirtableRecord,
  listAirtableRecords,
  
  // Slack actions
  createSlackChannel,
  
  // Trello actions
  createTrelloList,
  createTrelloCard,
  moveTrelloCard,
  
  // Workflow control actions
  executeIfThenCondition,
  executeWaitForTime
} from './actions'

/**
 * Interface for action execution parameters
 */
export interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
}

export async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the user's integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    if (!integration) {
      throw new Error(`No integration found for ${provider}`)
    }

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 20) + '...'
    })
    
    try {
    const decryptedToken = decrypt(accessToken, secret)
    console.log(`Successfully decrypted access token for ${provider}`)
    return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: accessToken.includes(':') ? 'encrypted' : 'plain',
        tokenLength: accessToken.length
      })
      
      // If the token doesn't have the expected format, it might be stored as plain text
      if (!accessToken.includes(':')) {
        console.log(`Token for ${provider} appears to be stored as plain text, returning as-is`)
        return accessToken
      }
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
}

function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    // For simplicity, we'll support basic dot notation.
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

async function fetchGmailLabels(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) throw new Error("Failed to fetch Gmail labels")
  const data = await response.json()
  return data.labels || []
}

async function createGmailLabel(accessToken: string, labelName: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  })
  if (!response.ok) throw new Error("Failed to create Gmail label")
  return await response.json()
}

function convertToMilliseconds(duration: number, unit: string): number {
  switch (unit) {
    case "seconds":
      return duration * 1000
    case "minutes":
      return duration * 60 * 1000
    case "hours":
      return duration * 60 * 60 * 1000
    case "days":
      return duration * 24 * 60 * 60 * 1000
    case "weeks":
      return duration * 7 * 24 * 60 * 60 * 1000
    default:
      return duration * 60 * 1000 // Default to minutes
  }
}

function calculateBusinessHoursWait(
  now: Date, 
  startTime: string, 
  endTime: string, 
  businessDays: string[]
): Date {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const businessDayIndices = businessDays.map(day => dayNames.indexOf(day.toLowerCase()))
  
  let checkDate = new Date(now)
  
  // Find the next business day and time
  for (let i = 0; i < 14; i++) { // Check up to 2 weeks ahead
    const dayOfWeek = checkDate.getDay()
    
    if (businessDayIndices.includes(dayOfWeek)) {
      // This is a business day
      const businessStart = new Date(checkDate)
      businessStart.setHours(startHours, startMinutes, 0, 0)
      
      const businessEnd = new Date(checkDate)
      businessEnd.setHours(endHours, endMinutes, 0, 0)
      
      if (checkDate.getTime() === now.getTime()) {
        // Same day as now
        if (now < businessStart) {
          // Before business hours, wait until start
          return businessStart
        } else if (now < businessEnd) {
          // During business hours, continue immediately
          return now
        }
        // After business hours, check next day
      } else {
        // Future business day, wait until business hours start
        return businessStart
      }
    }
    
    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1)
    checkDate.setHours(0, 0, 0, 0)
  }
  
  // Fallback: wait 24 hours
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Post a tweet to Twitter
 */
async function postTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    // Get Twitter OAuth token
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    
    // Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, { input })
    
    // Extract required parameters
    const { 
      text, 
      mediaFiles, 
      altTexts, 
      pollQuestion, 
      pollOptions, 
      pollDuration, 
      location, 
      sensitiveMedia, 
      scheduledTime 
    } = resolvedConfig
    
    // Validate required parameters
    if (!text) {
      return {
        success: false,
        error: "Missing required parameter: text"
      }
    }
    
    // Validate text length (Twitter limit is 280 characters)
    if (text.length > 280) {
      return {
        success: false,
        error: "Tweet text exceeds 280 character limit"
      }
    }
    
    // Prepare the tweet payload
    const tweetPayload: any = {
      text: text
    }
    
    // Handle media uploads if provided
    let mediaIds: string[] = []
    if (mediaFiles && mediaFiles.length > 0) {
      // Upload media files to Twitter
      for (let i = 0; i < Math.min(mediaFiles.length, 4); i++) {
        const mediaFile = mediaFiles[i]
        const altText = altTexts && altTexts.split('\n')[i] ? altTexts.split('\n')[i].trim() : null
        
        try {
          const mediaId = await uploadTwitterMedia(accessToken, mediaFile, altText)
          mediaIds.push(mediaId)
        } catch (error) {
          console.error(`Failed to upload media file ${i + 1}:`, error)
          return {
            success: false,
            error: `Failed to upload media file ${i + 1}: ${error}`
          }
        }
      }
      
      if (mediaIds.length > 0) {
        tweetPayload.media = { media_ids: mediaIds }
      }
    }
    
    // Handle poll if provided
    if (pollQuestion && pollOptions) {
      const options = pollOptions.split('\n').filter((opt: string) => opt.trim()).slice(0, 4)
      if (options.length >= 2 && options.length <= 4) {
        tweetPayload.poll = {
          options: options,
          duration_minutes: parseInt(pollDuration) || 15
        }
      }
    }
    
    // Handle location if provided
    if (location && location.coordinates) {
      tweetPayload.geo = {
        place_id: location.placeId || null,
        coordinates: {
          type: "Point",
          coordinates: [location.coordinates.lng, location.coordinates.lat]
        }
      }
    }
    
    // Handle sensitive media flag
    if (sensitiveMedia) {
      tweetPayload.possibly_sensitive = true
    }
    
    // Handle scheduled tweet
    if (scheduledTime) {
      const scheduledDate = new Date(scheduledTime)
      if (scheduledDate > new Date()) {
        // Use Twitter's scheduled tweets endpoint
        tweetPayload.scheduled_at = scheduledDate.toISOString()
      }
    }
    
    // Make Twitter API request
    const endpoint = scheduledTime ? 
      "https://api.twitter.com/2/tweets" : 
      "https://api.twitter.com/2/tweets"
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(tweetPayload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        tweetId: data.data.id,
        text: data.data.text,
        mediaIds: mediaIds,
        scheduled: !!scheduledTime,
        scheduledAt: scheduledTime
      },
      message: scheduledTime ? 
        `Tweet scheduled successfully for ${new Date(scheduledTime).toLocaleString()}` : 
        "Tweet posted successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter post tweet error:", error)
    return {
      success: false,
      error: error.message || "Failed to post tweet"
    }
  }
}

/**
 * Upload media to Twitter
 */
async function uploadTwitterMedia(accessToken: string, mediaFile: any, altText?: string): Promise<string> {
  // First, initialize media upload
  const initResponse = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      command: "INIT",
      total_bytes: mediaFile.size,
      media_type: mediaFile.type,
      media_category: mediaFile.type.startsWith('image/') ? 'tweet_image' : 'tweet_video'
    })
  })
  
  if (!initResponse.ok) {
    throw new Error(`Failed to initialize media upload: ${await initResponse.text()}`)
  }
  
  const initData = await initResponse.json()
  const mediaId = initData.media_id_string
  
  // Upload media data in chunks
  const chunkSize = 1024 * 1024 // 1MB chunks
  const totalChunks = Math.ceil(mediaFile.size / chunkSize)
  
  for (let segmentIndex = 0; segmentIndex < totalChunks; segmentIndex++) {
    const start = segmentIndex * chunkSize
    const end = Math.min(start + chunkSize, mediaFile.size)
    const chunk = mediaFile.slice(start, end)
    
    const appendResponse = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        command: "APPEND",
        media_id: mediaId,
        segment_index: segmentIndex,
        media_data: await chunkToBase64(chunk)
      })
    })
    
    if (!appendResponse.ok) {
      throw new Error(`Failed to append media chunk: ${await appendResponse.text()}`)
    }
  }
  
  // Finalize media upload
  const finalizeResponse = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      command: "FINALIZE",
      media_id: mediaId
    })
  })
  
  if (!finalizeResponse.ok) {
    throw new Error(`Failed to finalize media upload: ${await finalizeResponse.text()}`)
  }
  
  // Add alt text if provided
  if (altText) {
    const altTextResponse = await fetch("https://upload.twitter.com/1.1/media/metadata/create.json", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        media_id: mediaId,
        alt_text: { text: altText }
      })
    })
    
    if (!altTextResponse.ok) {
      console.warn(`Failed to add alt text: ${await altTextResponse.text()}`)
    }
  }
  
  return mediaId
}

/**
 * Convert a file chunk to base64
 */
async function chunkToBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // Remove data URL prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(chunk)
  })
}

/**
 * Reply to a tweet
 */
async function replyTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId, text, mediaFiles, altTexts } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    if (!text) {
      return { success: false, error: "Missing required parameter: text" }
    }
    if (text.length > 280) {
      return { success: false, error: "Reply text exceeds 280 character limit" }
    }
    
    const replyPayload: any = {
      text: text,
      reply: { in_reply_to_tweet_id: tweetId }
    }
    
    // Handle media uploads if provided
    let mediaIds: string[] = []
    if (mediaFiles && mediaFiles.length > 0) {
      for (let i = 0; i < Math.min(mediaFiles.length, 4); i++) {
        const mediaFile = mediaFiles[i]
        const altText = altTexts && altTexts.split('\n')[i] ? altTexts.split('\n')[i].trim() : null
        
        try {
          const mediaId = await uploadTwitterMedia(accessToken, mediaFile, altText)
          mediaIds.push(mediaId)
        } catch (error) {
          return { success: false, error: `Failed to upload media file ${i + 1}: ${error}` }
        }
      }
      
      if (mediaIds.length > 0) {
        replyPayload.media = { media_ids: mediaIds }
      }
    }
    
    const response = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(replyPayload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        tweetId: data.data.id,
        text: data.data.text,
        replyToTweetId: tweetId,
        mediaIds: mediaIds
      },
      message: "Reply posted successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter reply tweet error:", error)
    return { success: false, error: error.message || "Failed to reply to tweet" }
  }
}

/**
 * Retweet a tweet
 */
async function retweetTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/retweets`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tweet_id: tweetId })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        retweetedTweetId: tweetId,
        retweetId: data.data.id
      },
      message: "Tweet retweeted successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter retweet error:", error)
    return { success: false, error: error.message || "Failed to retweet" }
  }
}

/**
 * Undo retweet
 */
async function unretweetTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/retweets/${tweetId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    return {
      success: true,
      output: { unretweetedTweetId: tweetId },
      message: "Retweet removed successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter unretweet error:", error)
    return { success: false, error: error.message || "Failed to remove retweet" }
  }
}

/**
 * Like a tweet
 */
async function likeTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/likes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tweet_id: tweetId })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        likedTweetId: tweetId,
        likeId: data.data.id
      },
      message: "Tweet liked successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter like tweet error:", error)
    return { success: false, error: error.message || "Failed to like tweet" }
  }
}

/**
 * Unlike a tweet
 */
async function unlikeTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/likes/${tweetId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    return {
      success: true,
      output: { unlikedTweetId: tweetId },
      message: "Tweet unliked successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter unlike tweet error:", error)
    return { success: false, error: error.message || "Failed to unlike tweet" }
  }
}

/**
 * Send a direct message
 */
async function sendTwitterDM(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { recipientId, message, mediaFiles } = resolvedConfig
    
    if (!recipientId) {
      return { success: false, error: "Missing required parameter: recipientId" }
    }
    if (!message) {
      return { success: false, error: "Missing required parameter: message" }
    }
    
    // First, get the conversation ID
    const conversationResponse = await fetch(`https://api.twitter.com/2/dm_conversations/with/${recipientId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!conversationResponse.ok) {
      const errorText = await conversationResponse.text()
      throw new Error(`Failed to get conversation: ${errorText}`)
    }
    
    const conversationData = await conversationResponse.json()
    const conversationId = conversationData.data.id
    
    // Send the message
    const dmPayload: any = {
      text: message
    }
    
    // Handle media if provided
    if (mediaFiles && mediaFiles.length > 0) {
      const mediaFile = mediaFiles[0] // DMs typically support one media file
      try {
        const mediaId = await uploadTwitterMedia(accessToken, mediaFile)
        dmPayload.attachments = [{ media_id: mediaId }]
      } catch (error) {
        return { success: false, error: `Failed to upload media: ${error}` }
      }
    }
    
    const response = await fetch(`https://api.twitter.com/2/dm_conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(dmPayload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        messageId: data.data.id,
        recipientId: recipientId,
        conversationId: conversationId,
        message: message
      },
      message: "Direct message sent successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter send DM error:", error)
    return { success: false, error: error.message || "Failed to send direct message" }
  }
}

/**
 * Follow a user
 */
async function followTwitterUser(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { userId: targetUserId } = resolvedConfig
    
    if (!targetUserId) {
      return { success: false, error: "Missing required parameter: userId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/following`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ target_user_id: targetUserId })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        followedUserId: targetUserId,
        followId: data.data.id
      },
      message: "User followed successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter follow user error:", error)
    return { success: false, error: error.message || "Failed to follow user" }
  }
}

/**
 * Unfollow a user
 */
async function unfollowTwitterUser(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { userId: targetUserId } = resolvedConfig
    
    if (!targetUserId) {
      return { success: false, error: "Missing required parameter: userId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/users/me/following/${targetUserId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    return {
      success: true,
      output: { unfollowedUserId: targetUserId },
      message: "User unfollowed successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter unfollow user error:", error)
    return { success: false, error: error.message || "Failed to unfollow user" }
  }
}

/**
 * Delete a tweet
 */
async function deleteTwitterTweet(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { tweetId } = resolvedConfig
    
    if (!tweetId) {
      return { success: false, error: "Missing required parameter: tweetId" }
    }
    
    const response = await fetch(`https://api.twitter.com/2/tweets/${tweetId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    return {
      success: true,
      output: { deletedTweetId: tweetId },
      message: "Tweet deleted successfully"
    }
    
  } catch (error: any) {
    console.error("Twitter delete tweet error:", error)
    return { success: false, error: error.message || "Failed to delete tweet" }
  }
}

/**
 * Search tweets
 */
async function searchTwitterTweets(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { query, filters, maxResults, startTime, endTime } = resolvedConfig
    
    if (!query) {
      return { success: false, error: "Missing required parameter: query" }
    }
    
    const url = new URL("https://api.twitter.com/2/tweets/search/recent")
    url.searchParams.set("query", query)
    url.searchParams.set("max_results", (maxResults || 10).toString())
    url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics,entities")
    url.searchParams.set("user.fields", "username,name,profile_image_url")
    url.searchParams.set("expansions", "author_id")
    
    if (filters && filters.length > 0) {
      const filterQuery = filters.join(" ")
      url.searchParams.set("query", `${query} ${filterQuery}`)
    }
    
    if (startTime) {
      url.searchParams.set("start_time", new Date(startTime).toISOString())
    }
    
    if (endTime) {
      url.searchParams.set("end_time", new Date(endTime).toISOString())
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        tweets: data.data || [],
        users: data.includes?.users || [],
        meta: data.meta,
        query: query
      },
      message: `Found ${data.data?.length || 0} tweets matching your search`
    }
    
  } catch (error: any) {
    console.error("Twitter search tweets error:", error)
    return { success: false, error: error.message || "Failed to search tweets" }
  }
}

/**
 * Get user timeline
 */
async function getTwitterUserTimeline(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { userId: targetUserId, maxResults, excludeRetweets, excludeReplies } = resolvedConfig
    
    if (!targetUserId) {
      return { success: false, error: "Missing required parameter: userId" }
    }
    
    const url = new URL(`https://api.twitter.com/2/users/${targetUserId}/tweets`)
    url.searchParams.set("max_results", (maxResults || 10).toString())
    url.searchParams.set("tweet.fields", "created_at,public_metrics,entities")
    url.searchParams.set("user.fields", "username,name,profile_image_url")
    url.searchParams.set("expansions", "author_id")
    
    if (excludeRetweets) {
      url.searchParams.set("exclude", "retweets")
    }
    
    if (excludeReplies) {
      url.searchParams.set("exclude", "replies")
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        tweets: data.data || [],
        users: data.includes?.users || [],
        meta: data.meta,
        userId: targetUserId
      },
      message: `Retrieved ${data.data?.length || 0} tweets from user timeline`
    }
    
  } catch (error: any) {
    console.error("Twitter get user timeline error:", error)
    return { success: false, error: error.message || "Failed to get user timeline" }
  }
}

/**
 * Download image from URL and convert to buffer
 */
async function downloadImageFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error: any) {
    throw new Error(`Failed to download image from URL: ${error.message}`)
  }
}

/**
 * Upload video to YouTube
 */
async function uploadYouTubeVideo(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "youtube")
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      videoFile,
      title,
      description = "",
      tags = [],
      category,
      privacyStatus = "private",
      publishAt,
      thumbnailMode,
      thumbnailFile,
      thumbnailUrl,
      playlists = [],
      license = "youtube",
      madeForKids = false,
      ageRestriction = "none",
      locationLatitude,
      locationLongitude,
      locationName,
      recordingDate,
      notifySubscribers = true,
      allowComments = true,
      allowRatings = true,
      allowEmbedding = true
    } = resolvedConfig

    // Validate required fields
    if (!videoFile || !title) {
      throw new Error("Video file and title are required")
    }

    // Initialize YouTube API client
    const youtube = google.youtube({
      version: 'v3',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    // Prepare video metadata
    const videoMetadata: any = {
      snippet: {
        title,
        description,
        tags: Array.isArray(tags) ? tags : tags.split(',').map((tag: string) => tag.trim()),
        categoryId: category,
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: madeForKids,
        notifySubscribers
      }
    }

    // Add publish date if specified
    if (publishAt) {
      videoMetadata.status.publishAt = new Date(publishAt).toISOString()
    }

    // Add location if specified
    if (locationLatitude && locationLongitude) {
      videoMetadata.recordingDetails = {
        location: {
          latitude: parseFloat(locationLatitude),
          longitude: parseFloat(locationLongitude),
          description: locationName
        }
      }
    }

    // Add recording date if specified
    if (recordingDate) {
      if (!videoMetadata.recordingDetails) {
        videoMetadata.recordingDetails = {}
      }
      videoMetadata.recordingDetails.recordingDate = new Date(recordingDate).toISOString()
    }

    // Add content details
    videoMetadata.contentDetails = {
      licensedContent: license === 'creativeCommon',
      projection: 'rectangular'
    }

    // Add statistics
    videoMetadata.statistics = {
      commentCount: allowComments ? undefined : 0,
      likeCount: allowRatings ? undefined : 0
    }

    // Add access control
    videoMetadata.accessControl = {
      comment: {
        access: allowComments ? 'allowed' : 'denied'
      },
      commentVote: {
        access: allowComments ? 'allowed' : 'denied'
      },
      videoRespond: {
        access: allowComments ? 'allowed' : 'denied'
      },
      rate: {
        access: allowRatings ? 'allowed' : 'denied'
      },
      embed: {
        access: allowEmbedding ? 'allowed' : 'denied'
      }
    }

    // Add age restriction if specified
    if (ageRestriction === '18+') {
      videoMetadata.contentDetails.contentRating = {
        acbRating: '18+',
        agcomRating: '18+',
        anatelRating: '18+',
        bbfcRating: '18+',
        bfvcRating: '18+',
        bmukkRating: '18+',
        catvRating: '18+',
        catvfrRating: '18+',
        cbfcRating: '18+',
        cccRating: '18+',
        cceRating: '18+',
        chfilmRating: '18+',
        chvrsRating: '18+',
        cicfRating: '18+',
        cnaRating: '18+',
        cncRating: '18+',
        csaRating: '18+',
        cscfRating: '18+',
        czfilmRating: '18+',
        djctqRating: '18+',
        djctqRatingReasons: ['violence'],
        ecbmctRating: '18+',
        eefilmRating: '18+',
        egfilmRating: '18+',
        eirinRating: '18+',
        fcbmRating: '18+',
        fcoRating: '18+',
        fmocRating: '18+',
        fpbRating: '18+',
        fpbRatingReasons: ['violence'],
        fskRating: '18+',
        grfilmRating: '18+',
        icaaRating: '18+',
        ifcoRating: '18+',
        ilfilmRating: '18+',
        incaaRating: '18+',
        kfcbRating: '18+',
        kijkwijzerRating: '18+',
        kmrbRating: '18+',
        lsfRating: '18+',
        mccaaRating: '18+',
        mccypRating: '18+',
        mcstRating: '18+',
        mdaRating: '18+',
        medietilsynetRating: '18+',
        mekuRating: '18+',
        menaMpaaRating: '18+',
        mibacRating: '18+',
        mocRating: '18+',
        moctwRating: '18+',
        mpaaRating: '18+',
        mpaatRating: '18+',
        mtrcbRating: '18+',
        nbcRating: '18+',
        nbcplRating: '18+',
        nfrcRating: '18+',
        nfvcbRating: '18+',
        nkclvRating: '18+',
        oflcRating: '18+',
        pefilmRating: '18+',
        rcnofRating: '18+',
        resorteviolenciaRating: '18+',
        rtcRating: '18+',
        rteRating: '18+',
        russiaRating: '18+',
        skfilmRating: '18+',
        smaisRating: '18+',
        smsaRating: '18+',
        tvpgRating: '18+',
        ytRating: 'yt_age_restricted'
      }
    }

    // Upload video file
    console.log('Starting video upload to YouTube...')
    
    // Convert video file to readable stream
    let videoStream: any
    if (videoFile instanceof File || videoFile instanceof Blob) {
      videoStream = videoFile.stream()
    } else if (videoFile.buffer) {
      videoStream = require('stream').Readable.from(videoFile.buffer)
    } else {
      throw new Error('Invalid video file format')
    }

    const uploadResponse = await youtube.videos.insert({
      part: ['snippet', 'status', 'contentDetails', 'recordingDetails', 'statistics', 'accessControl'],
      requestBody: videoMetadata,
      media: {
        body: videoStream
      }
    })

    if (!uploadResponse.data.id) {
      throw new Error('Failed to upload video: No video ID returned')
    }

    const videoId = uploadResponse.data.id
    console.log(`Video uploaded successfully with ID: ${videoId}`)

    // Handle thumbnail upload if specified
    if (thumbnailMode === 'upload' && thumbnailFile) {
      console.log('Uploading custom thumbnail...')
      
      let thumbnailBuffer: Buffer
      if (thumbnailFile instanceof File || thumbnailFile instanceof Blob) {
        const arrayBuffer = await thumbnailFile.arrayBuffer()
        thumbnailBuffer = Buffer.from(arrayBuffer)
      } else if (thumbnailFile.buffer) {
        thumbnailBuffer = thumbnailFile.buffer
      } else {
        throw new Error('Invalid thumbnail file format')
      }

      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: require('stream').Readable.from(thumbnailBuffer)
        }
      })
      
      console.log('Custom thumbnail uploaded successfully')
    } else if (thumbnailMode === 'url' && thumbnailUrl) {
      console.log('Downloading and uploading thumbnail from URL...')
      
      try {
        const thumbnailBuffer = await downloadImageFromUrl(thumbnailUrl)
        
        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            body: require('stream').Readable.from(thumbnailBuffer)
          }
        })
        
        console.log('Thumbnail from URL uploaded successfully')
      } catch (error: any) {
        console.warn(`Failed to upload thumbnail from URL: ${error.message}`)
        // Continue without thumbnail - video upload was successful
      }
    }

    // Add video to playlists if specified
    if (playlists.length > 0) {
      console.log('Adding video to playlists...')
      
      for (const playlistId of playlists) {
        try {
          await youtube.playlistItems.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                playlistId: playlistId,
                resourceId: {
                  kind: 'youtube#video',
                  videoId: videoId
                }
              }
            }
          })
        } catch (error: any) {
          console.warn(`Failed to add video to playlist ${playlistId}: ${error.message}`)
        }
      }
    }

    return {
      success: true,
      output: {
        videoId: videoId,
        title: title,
        description: description,
        privacyStatus: privacyStatus,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      },
      message: `Video "${title}" uploaded successfully to YouTube`
    }

  } catch (error: any) {
    console.error("YouTube upload video error:", error)
    return { 
      success: false, 
      error: error.message || "Failed to upload video to YouTube" 
    }
  }
}

/**
 * List all YouTube videos for the user, with automatic pagination and field mask support
 */
async function listYouTubeVideos(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "youtube")
    const resolvedConfig = resolveValue(config, { input })
    const { 
      fieldsToReturn = [],
      channelId,
      playlistId,
      searchQuery,
      orderBy = "date",
      publishedAfter,
      publishedBefore,
      videoDefinition = "any",
      videoDuration = "any",
      regionCode,
      videoCategoryId
    } = resolvedConfig

    // Build the fields param
    let fieldsParam = fieldsToReturn && Array.isArray(fieldsToReturn) && fieldsToReturn.length > 0
      ? fieldsToReturn.join(",")
      : "items(snippet(title,description,publishedAt,thumbnails(default(url)))),items(statistics(viewCount,likeCount,commentCount))"

    // Always include kind and etag for root
    if (!fieldsParam.includes("kind")) {
      fieldsParam = "kind,etag," + fieldsParam
    }

    const youtube = google.youtube({
      version: 'v3',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    // 1. Get the user's channelId if not specified
    let targetChannelId = channelId
    if (!targetChannelId) {
      const channelResp = await youtube.channels.list({
        part: ['id'],
        mine: true
      })
      targetChannelId = channelResp.data.items?.[0]?.id
      if (!targetChannelId) throw new Error('Could not determine YouTube channel ID for user.')
    }

    // 2. Use search.list to get all video IDs (paginated)
    let videoIds: string[] = []
    let nextPageToken: string | undefined = undefined
    
    // Build search parameters
    const searchParams: any = {
      part: ['id'],
      type: ['video'],
      maxResults: 50,
      order: orderBy,
      pageToken: nextPageToken
    }
    
    // Add filters based on configuration
    if (searchQuery) {
      searchParams.q = searchQuery
    } else if (playlistId) {
      // If playlist is specified, we'll need to get videos from playlist instead
      searchParams.playlistId = playlistId
    } else {
      searchParams.channelId = targetChannelId
    }
    
    if (publishedAfter) {
      searchParams.publishedAfter = new Date(publishedAfter).toISOString()
    }
    
    if (publishedBefore) {
      searchParams.publishedBefore = new Date(publishedBefore).toISOString()
    }
    
    if (videoDefinition !== "any") {
      searchParams.videoDefinition = videoDefinition
    }
    
    if (videoDuration !== "any") {
      searchParams.videoDuration = videoDuration
    }
    
    if (regionCode) {
      searchParams.regionCode = regionCode
    }
    
    if (videoCategoryId) {
      searchParams.videoCategoryId = videoCategoryId
    }
    
    do {
      const searchResp = await youtube.search.list(searchParams) as any
      const ids = (searchResp.data.items || [])
        .map((item: any) => item.id?.videoId)
        .filter((id: string | undefined) => !!id)
      videoIds.push(...ids)
      nextPageToken = searchResp.data.nextPageToken
      searchParams.pageToken = nextPageToken
    } while (nextPageToken)

    // 3. Use videos.list in batches of 50
    let allVideos: any[] = []
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50)
      if (batchIds.length === 0) continue
      const videosResp = await youtube.videos.list({
        part: [
          'id', 'snippet', 'statistics', 'contentDetails', 'status'
        ],
        id: batchIds,
        fields: fieldsParam
      }) as any // Explicitly type as any for now
      if (videosResp.data.items) {
        allVideos.push(...videosResp.data.items)
      }
    }

    return {
      success: true,
      output: {
        videos: allVideos
      },
      message: `Fetched ${allVideos.length} videos from YouTube.`
    }
  } catch (error: any) {
    console.error("YouTube list videos error:", error)
    return {
      success: false,
      error: error.message || "Failed to list YouTube videos"
    }
  }
}

/**
 * Get mentions timeline
 */
async function getTwitterMentions(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, "twitter")
    const resolvedConfig = resolveValue(config, { input })
    const { maxResults, startTime, endTime } = resolvedConfig
    
    // First, get the current user's ID
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      throw new Error(`Failed to get user info: ${errorText}`)
    }
    
    const userData = await userResponse.json()
    const currentUserId = userData.data.id
    
    const url = new URL(`https://api.twitter.com/2/users/${currentUserId}/mentions`)
    url.searchParams.set("max_results", (maxResults || 10).toString())
    url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics,entities")
    url.searchParams.set("user.fields", "username,name,profile_image_url")
    url.searchParams.set("expansions", "author_id")
    
    if (startTime) {
      url.searchParams.set("start_time", new Date(startTime).toISOString())
    }
    
    if (endTime) {
      url.searchParams.set("end_time", new Date(endTime).toISOString())
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Twitter API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    return {
      success: true,
      output: {
        mentions: data.data || [],
        users: data.includes?.users || [],
        meta: data.meta
      },
      message: `Retrieved ${data.data?.length || 0} mentions`
    }
    
  } catch (error: any) {
    console.error("Twitter get mentions error:", error)
    return { success: false, error: error.message || "Failed to get mentions" }
  }
}

/**
 * Main function to execute a workflow action node
 * Routes to the appropriate handler based on node type
 */
export async function executeAction({ node, input, userId, workflowId }: ExecuteActionParams): Promise<ActionResult> {
  const { type, config } = node.data

  // Check if environment is properly configured
  const hasSupabaseConfig = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasEncryptionKey = process.env.ENCRYPTION_KEY

  if (!hasSupabaseConfig) {
    console.warn("Supabase configuration missing, running in test mode")
    return { 
      success: true, 
      output: { test: true, mockResult: true }, 
      message: `Test mode: ${type} executed successfully (missing Supabase config)` 
    }
  }

  // Map of action types to handler functions
  const handlerMap: Record<string, Function> = {
    // Gmail actions
    "gmail_action_send_email": sendGmail,
    "gmail_action_add_label": addGmailLabels,
    "gmail_action_search_email": searchGmailEmails,
    
    // Google Sheets actions
    "google_sheets_action_read_data": readGoogleSheetsData,
    
    // Airtable actions
    "airtable_action_move_record": moveAirtableRecord,
    "airtable_action_create_record": createAirtableRecord,
    "airtable_action_update_record": updateAirtableRecord,
    "airtable_action_list_records": listAirtableRecords,
    
    // Slack actions
    "slack_action_create_channel": createSlackChannel,
    
    // Trello actions
    "trello_action_create_list": createTrelloList,
    "trello_action_create_card": createTrelloCard,
    "trello_action_move_card": moveTrelloCard,
    
    // YouTube actions
    "youtube_action_upload_video": uploadYouTubeVideo,
    "youtube_action_list_videos": listYouTubeVideos,
    
    // Twitter actions
    "twitter_action_post_tweet": postTwitterTweet,
    "twitter_action_reply_tweet": replyTwitterTweet,
    "twitter_action_retweet": retweetTwitterTweet,
    "twitter_action_unretweet": unretweetTwitterTweet,
    "twitter_action_like_tweet": likeTwitterTweet,
    "twitter_action_unlike_tweet": unlikeTwitterTweet,
    "twitter_action_send_dm": sendTwitterDM,
    "twitter_action_follow_user": followTwitterUser,
    "twitter_action_unfollow_user": unfollowTwitterUser,
    "twitter_action_delete_tweet": deleteTwitterTweet,
    "twitter_action_search_tweets": searchTwitterTweets,
    "twitter_action_get_user_timeline": getTwitterUserTimeline,
    "twitter_action_get_mentions": getTwitterMentions,
    
    // Workflow control actions
    "if_then_condition": executeIfThenCondition,
    "wait_for_time": (cfg: any, uid: string, inp: any) => 
      executeWaitForTime(cfg, uid, inp, { workflowId, nodeId: node.id })
  }

  // Get the appropriate handler for this node type
  const handler = handlerMap[type]

  // If there's no handler for this node type, return a default response
  if (!handler) {
    console.warn(`No execution logic for node type: ${type}`)
    return { 
      success: true, 
      output: input, 
      message: `No action found for ${type}` 
    }
  }

  // For encryption-dependent handlers, check if encryption key is available
  if (!hasEncryptionKey && 
      (type.startsWith('gmail_') || 
       type.startsWith('google_sheets_') || 
       type.startsWith('google_drive_') ||
       type.startsWith('airtable_'))) {
    console.warn(`Encryption key missing, running ${type} in test mode`)
    return { 
      success: true, 
      output: { 
        test: true,
        mockResult: true,
        mockType: type
      }, 
      message: `Test mode: ${type} executed successfully (missing encryption key)` 
    }
  }

  // Execute the handler with the provided parameters
  return handler(config, userId, input)
}
