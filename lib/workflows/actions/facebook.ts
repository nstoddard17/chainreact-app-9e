import { ActionResult } from './core/executeWait'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { resolveValue } from './core/resolveValue'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface FacebookMediaUploadResult {
  id: string
  success: boolean
  error?: string
}

interface FacebookPostResult {
  id: string
  success: boolean
  error?: string
}

/**
 * Create a post on a Facebook page with proper media upload
 */
export async function createFacebookPost(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      pageId,
      message,
      mediaFile,
      scheduledPublishTime,
      productLinkUrl,
      productLinkName,
      productPromoCode,
      paidPartnershipLabel
    } = resolvedConfig

    if (!pageId || !message) {
      throw new Error("Page ID and message are required")
    }

    // Get Facebook integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Facebook integration not connected")
    }

    // Get decrypted access token
    const accessToken = await getDecryptedAccessToken(userId, "facebook")

    // Get page access token for the specific page
    const pageAccessToken = await getPageAccessToken(pageId, accessToken)

    console.log('[Facebook] Starting create post action')
    console.log('[Facebook] Parameters:', { pageId, message, mediaFile })

    // Step 1: Upload media files and collect their IDs
    const mediaIds: string[] = []
    
    if (mediaFile) {
      console.log("Processing media file:", JSON.stringify(mediaFile, null, 2))
      
      // Handle different media file formats
      let fileIds: string[] = []
      
      if (typeof mediaFile === 'string') {
        // Single file ID
        fileIds = [mediaFile]
      } else if (Array.isArray(mediaFile)) {
        // Array of file IDs
        fileIds = mediaFile
      } else if (mediaFile && typeof mediaFile === 'object') {
        // Object with file IDs or other properties
        if (mediaFile.fileIds) {
          fileIds = Array.isArray(mediaFile.fileIds) ? mediaFile.fileIds : [mediaFile.fileIds]
        } else if (mediaFile.id) {
          fileIds = [mediaFile.id]
        }
      }
      
      for (const fileId of fileIds) {
        console.log(`[Facebook] Processing file ID: ${fileId}`)
        
        // Get file buffer from storage
        const fileBuffer = await getFileBuffer(fileId, userId)
        if (!fileBuffer) {
          console.error(`[Facebook] Failed to get file buffer for ID: ${fileId}`)
          continue
        }

        // Determine file type and upload accordingly
        const fileName = `file_${fileId}.jpg` // Default filename
        
        // Try photo upload first, then video if it fails
        let uploadResult = await uploadPhotoToFacebook(pageAccessToken, pageId, fileBuffer, fileName)
        
        if (!uploadResult.success) {
          // Try as video if photo upload failed
          uploadResult = await uploadVideoToFacebook(pageAccessToken, pageId, fileBuffer, fileName)
        }
        
        if (uploadResult.success) {
          mediaIds.push(uploadResult.id)
          console.log(`[Facebook] Media uploaded successfully: ${uploadResult.id}`)
        } else {
          console.error(`[Facebook] Failed to upload media: ${uploadResult.error}`)
        }
      }
    }

    // Step 2: Create the post with attached media
    const payload: any = {
      message: message
    }
    
    // Add attached media if we have media IDs
    if (mediaIds.length > 0) {
      payload.attached_media = mediaIds.map(mediaId => ({
        media_fbid: mediaId
      }))
    }

    // Add scheduling if specified
    if (scheduledPublishTime) {
      const publishTime = new Date(scheduledPublishTime)
      if (publishTime > new Date()) {
        payload.published = false
        payload.scheduled_publish_time = Math.floor(publishTime.getTime() / 1000)
      }
    }

    // Add monetization features if specified
    if (productLinkUrl || productLinkName || productPromoCode || paidPartnershipLabel) {
      const monetizationData: any = {}
      
      if (productLinkUrl) {
        monetizationData.link = productLinkUrl
      }
      
      if (productLinkName) {
        monetizationData.name = productLinkName
      }
      
      if (productPromoCode) {
        monetizationData.promo_code = productPromoCode
      }
      
      if (paidPartnershipLabel) {
        monetizationData.paid_partnership_label = true
      }
      
      // Add monetization data to payload
      Object.assign(payload, monetizationData)
    }

    // Create the post
    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    console.log('[Facebook] Create post action completed successfully')
    
    return {
      success: true,
      output: {
        postId: result.id,
        pageId: pageId,
        message: message,
        scheduledPublishTime: scheduledPublishTime,
        published: !scheduledPublishTime || new Date(scheduledPublishTime) <= new Date(),
        facebookResponse: result,
        mediaIds: mediaIds,
        monetization: {
          productLinkUrl,
          productLinkName,
          productPromoCode,
          paidPartnershipLabel
        }
      },
      message: scheduledPublishTime 
        ? `Post scheduled successfully for ${new Date(scheduledPublishTime).toLocaleString()}`
        : "Post created successfully on Facebook"
    }

  } catch (error: any) {
    console.error('[Facebook] Create post action failed:', error)
    return {
      success: false,
      error: error.message || "Failed to create Facebook post",
      output: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

/**
 * Get page access token for a specific Facebook page
 */
async function getPageAccessToken(pageId: string, userAccessToken: string): Promise<string> {
  const crypto = require('crypto')
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET
  
  if (!appSecret) {
    throw new Error("Facebook app secret not configured")
  }
  
  const appsecretProof = crypto
    .createHmac('sha256', appSecret)
    .update(userAccessToken)
    .digest('hex')

  const response = await fetch(`https://graph.facebook.com/v19.0/me/accounts?appsecret_proof=${appsecretProof}`, {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json"
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Failed to get page access token: ${response.status} - ${errorData.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const page = data.data?.find((p: any) => p.id === pageId)
  
  if (!page) {
    throw new Error(`Page with ID ${pageId} not found or access denied`)
  }

  return page.access_token
}

/**
 * Upload a photo to Facebook and return the photo ID
 */
async function uploadPhotoToFacebook(
  accessToken: string,
  pageId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<FacebookMediaUploadResult> {
  try {
    console.log(`[Facebook] Uploading photo to page ${pageId}`)
    
    const formData = new FormData()
    // Convert Buffer to Blob for native FormData
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' })
    formData.append('source', blob, fileName)
    formData.append('published', 'false') // Don't auto-publish
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/photos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
        // Don't set Content-Type header, let the browser set it with boundary
      },
      body: formData
    })

    const result = await response.json()
    
    if (!response.ok) {
      console.error('[Facebook] Photo upload failed:', result)
      return {
        id: '',
        success: false,
        error: result.error?.message || 'Failed to upload photo'
      }
    }

    console.log(`[Facebook] Photo uploaded successfully, ID: ${result.id}`)
    return {
      id: result.id,
      success: true
    }
  } catch (error) {
    console.error('[Facebook] Photo upload error:', error)
    return {
      id: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Upload a video to Facebook and return the video ID
 */
async function uploadVideoToFacebook(
  accessToken: string,
  pageId: string,
  fileBuffer: Buffer,
  fileName: string,
  description?: string,
  title?: string
): Promise<FacebookMediaUploadResult> {
  try {
    console.log(`[Facebook] Uploading video to page ${pageId}`)
    
    const formData = new FormData()
    // Convert Buffer to Blob for native FormData
    const blob = new Blob([fileBuffer], { type: 'video/mp4' })
    formData.append('source', blob, fileName)
    formData.append('published', 'false') // Don't auto-publish
    
    if (description) {
      formData.append('description', description)
    }
    if (title) {
      formData.append('title', title)
    }
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
        // Don't set Content-Type header, let the browser set it with boundary
      },
      body: formData
    })

    const result = await response.json()
    
    if (!response.ok) {
      console.error('[Facebook] Video upload failed:', result)
      return {
        id: '',
        success: false,
        error: result.error?.message || 'Failed to upload video'
      }
    }

    console.log(`[Facebook] Video uploaded successfully, ID: ${result.id}`)
    return {
      id: result.id,
      success: true
    }
  } catch (error) {
    console.error('[Facebook] Video upload error:', error)
    return {
      id: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Create a Facebook post with attached media
 */
async function createFacebookPostWithMedia(
  accessToken: string,
  pageId: string,
  message: string,
  mediaIds: string[]
): Promise<FacebookPostResult> {
  try {
    console.log(`[Facebook] Creating post with ${mediaIds.length} media items`)
    
    const payload: any = {
      message: message
    }
    
    // Add attached media if we have media IDs
    if (mediaIds.length > 0) {
      payload.attached_media = mediaIds.map(mediaId => ({
        media_fbid: mediaId
      }))
    }
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    
    if (!response.ok) {
      console.error('[Facebook] Post creation failed:', result)
      return {
        id: '',
        success: false,
        error: result.error?.message || 'Failed to create post'
      }
    }

    console.log(`[Facebook] Post created successfully, ID: ${result.id}`)
    return {
      id: result.id,
      success: true
    }
  } catch (error) {
    console.error('[Facebook] Post creation error:', error)
    return {
      id: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get file buffer from file storage by ID
 */
async function getFileBuffer(fileId: string, userId: string): Promise<Buffer | null> {
  try {
    // Import and use FileStorageService to get the actual file
    const { FileStorageService } = await import("@/lib/storage/fileStorage")
    const fileResult = await FileStorageService.getFile(fileId, userId)
    
    if (!fileResult) {
      console.error(`[Facebook] Failed to retrieve file for ID: ${fileId}`)
      return null
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileResult.file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log(`[Facebook] Successfully retrieved file: ${fileResult.metadata.fileName} (${buffer.length} bytes)`)
    return buffer
  } catch (error) {
    console.error('[Facebook] Error getting file buffer:', error)
    return null
  }
}



// Legacy function for backward compatibility
export async function uploadMediaToFacebook(
  accessToken: string,
  pageId: string,
  mediaFileIds: string[],
  userId: string
): Promise<string[]> {
  console.log('[Facebook] Legacy uploadMediaToFacebook called')
  
  const mediaIds: string[] = []
  
  for (const fileId of mediaFileIds) {
    const fileBuffer = await getFileBuffer(fileId, userId)
    if (!fileBuffer) {
      console.error(`[Facebook] Failed to get file buffer for ID: ${fileId}`)
      continue
    }

    const fileName = `file_${fileId}.jpg`
    
    // Try photo upload first
    let uploadResult = await uploadPhotoToFacebook(accessToken, pageId, fileBuffer, fileName)
    
    if (!uploadResult.success) {
      // Try video upload
      uploadResult = await uploadVideoToFacebook(accessToken, pageId, fileBuffer, fileName)
    }
    
    if (uploadResult.success) {
      mediaIds.push(uploadResult.id)
    }
  }
  
  return mediaIds
}

/**
 * Get Facebook page insights
 */
export async function getFacebookPageInsights(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      pageId,
      metric,
      period,
      periodCount
    } = resolvedConfig

    if (!pageId || !metric || !period || !periodCount) {
      throw new Error("Page ID, metric, period, and period count are required")
    }

    // Get Facebook integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Facebook integration not connected")
    }

    // Get decrypted access token
    const accessToken = await getDecryptedAccessToken(userId, "facebook")

    // Get page access token for the specific page
    const pageAccessToken = await getPageAccessToken(pageId, accessToken)

    // Generate appsecret_proof for server-side calls
    const crypto = require('crypto')
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET
    
    if (!appSecret) {
      throw new Error("Facebook app secret not configured")
    }
    
    const appsecretProof = crypto
      .createHmac('sha256', appSecret)
      .update(pageAccessToken)
      .digest('hex')

    // Build the insights URL - calculate the since date based on periodCount
    const now = new Date();
    let sinceDate: Date;
    
    switch (period) {
      case 'day':
        sinceDate = new Date(now.getTime() - (periodCount * 24 * 60 * 60 * 1000));
        break;
      case 'week':
        sinceDate = new Date(now.getTime() - (periodCount * 7 * 24 * 60 * 60 * 1000));
        break;
      case 'month':
        sinceDate = new Date(now.getTime() - (periodCount * 30 * 24 * 60 * 60 * 1000));
        break;
      default:
        sinceDate = new Date(now.getTime() - (periodCount * 24 * 60 * 60 * 1000));
    }
    
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
    const insightsUrl = `https://graph.facebook.com/v19.0/${pageId}/insights?metric=${metric}&period=${period}&since=${sinceTimestamp}&appsecret_proof=${appsecretProof}`

    const response = await fetch(insightsUrl, {
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json"
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        pageId: pageId,
        metric: metric,
        period: period,
        periodCount: periodCount,
        insights: result.data || [],
        facebookResponse: result
      },
      message: `Successfully retrieved ${metric} insights for the last ${periodCount} ${period}(s)`
    }

  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to get Facebook page insights",
      output: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

/**
 * Send a message to a person who has a conversation with the Facebook page
 */
export async function sendFacebookMessage(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      pageId,
      recipientId,
      message,
      quickReplies,
      typingIndicator = true
    } = resolvedConfig

    if (!pageId || !recipientId || !message) {
      throw new Error("Page ID, recipient ID, and message are required")
    }

    // Extract sender ID from conversation ID (format: conversationId:senderId)
    let senderId = recipientId
    if (recipientId.includes(':')) {
      const parts = recipientId.split(':')
      senderId = parts[1] || recipientId
    }

    // Get Facebook integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Facebook integration not connected")
    }

    // Get decrypted access token
    const accessToken = await getDecryptedAccessToken(userId, "facebook")

    // Get page access token for the specific page
    const pageAccessToken = await getPageAccessToken(pageId, accessToken)

    // Generate appsecret_proof for server-side calls
    const crypto = require('crypto')
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET
    
    if (!appSecret) {
      throw new Error("Facebook app secret not configured")
    }
    
    const appsecretProof = crypto
      .createHmac('sha256', appSecret)
      .update(pageAccessToken)
      .digest('hex')

    // Show typing indicator if enabled
    if (typingIndicator) {
      const typingUrl = `https://graph.facebook.com/v19.0/me/messages?appsecret_proof=${appsecretProof}`
      const typingPayload = {
        recipient: { id: senderId },
        sender_action: "typing_on"
      }

      await fetch(typingUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(typingPayload)
      })

      // Wait a bit to show typing indicator
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Prepare message payload
    const messagePayload: any = {
      recipient: { id: senderId },
      message: { text: message }
    }

    // Add quick replies if provided
    if (quickReplies && quickReplies.trim()) {
      const quickReplyOptions = quickReplies.split('\n').filter((line: string) => line.trim()).map((option: string) => ({
        content_type: "text",
        title: option.trim(),
        payload: option.trim().toUpperCase()
      }))

      if (quickReplyOptions.length > 0) {
        messagePayload.message.quick_replies = quickReplyOptions.slice(0, 11) // Facebook limit is 11 quick replies
      }
    }

    // Send the message
    const messageUrl = `https://graph.facebook.com/v19.0/me/messages?appsecret_proof=${appsecretProof}`
    
    const response = await fetch(messageUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messagePayload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        messageId: result.message_id,
        pageId: pageId,
        recipientId: senderId,
        conversationId: recipientId,
        message: message,
        quickReplies: quickReplies ? quickReplies.split('\n').filter((line: string) => line.trim()) : [],
        typingIndicator: typingIndicator,
        facebookResponse: result
      },
      message: `Message sent successfully to ${senderId}`
    }

  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to send Facebook message",
      output: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

/**
 * Add a comment to a Facebook post
 */
export async function commentOnFacebookPost(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      pageId,
      postId,
      comment,
      attachmentUrl,
      attachmentType
    } = resolvedConfig

    if (!pageId || !postId || !comment) {
      throw new Error("Page ID, post ID, and comment are required")
    }

    // Get Facebook integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "facebook")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Facebook integration not connected")
    }

    // Get decrypted access token
    const accessToken = await getDecryptedAccessToken(userId, "facebook")

    // Get page access token for the specific page
    const pageAccessToken = await getPageAccessToken(pageId, accessToken)

    // Generate appsecret_proof for server-side calls
    const crypto = require('crypto')
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET
    
    if (!appSecret) {
      throw new Error("Facebook app secret not configured")
    }
    
    const appsecretProof = crypto
      .createHmac('sha256', appSecret)
      .update(pageAccessToken)
      .digest('hex')

    // Prepare comment payload
    const commentPayload: any = {
      message: comment
    }

    // Add attachment if provided
    if (attachmentUrl && attachmentType) {
      switch (attachmentType) {
        case 'photo':
          commentPayload.attachment_url = attachmentUrl
          break
        case 'video':
          commentPayload.attachment_url = attachmentUrl
          break
        case 'link':
          commentPayload.attachment_url = attachmentUrl
          break
        default:
          // If no specific type, just add as URL
          commentPayload.attachment_url = attachmentUrl
      }
    }

    // Send the comment
    const commentUrl = `https://graph.facebook.com/v19.0/${postId}/comments?appsecret_proof=${appsecretProof}`
    
    const response = await fetch(commentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commentPayload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        commentId: result.id,
        pageId: pageId,
        postId: postId,
        comment: comment,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        facebookResponse: result
      },
      message: `Comment added successfully to post ${postId}`
    }

  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to comment on Facebook post",
      output: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
} 