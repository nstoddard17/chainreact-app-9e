import { ActionResult } from '../index'

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
 * Upload media to Twitter
 */
export async function uploadTwitterMedia(accessToken: string, mediaFile: any, altText?: string): Promise<string> {
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
 * Post a tweet to Twitter
 */
export async function postTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
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
    } = config
    
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
 * Reply to a tweet
 */
export async function replyTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId, text, mediaFiles, altTexts } = config
    
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
export async function retweetTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId } = config
    
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
export async function unretweetTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId } = config
    
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
export async function likeTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId } = config
    
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
export async function unlikeTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId } = config
    
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
export async function sendTwitterDM(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { recipientId, message, mediaFiles } = config
    
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
export async function followTwitterUser(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { userId: targetUserId } = config
    
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
export async function unfollowTwitterUser(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { userId: targetUserId } = config
    
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
export async function deleteTwitterTweet(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { tweetId } = config
    
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
export async function searchTwitterTweets(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { query, filters, maxResults, startTime, endTime } = config
    
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
export async function getTwitterUserTimeline(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { userId: targetUserId, maxResults, excludeRetweets, excludeReplies } = config
    
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
 * Get mentions timeline
 */
export async function getTwitterMentions(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { maxResults, startTime, endTime } = config
    
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