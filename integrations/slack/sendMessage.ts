/**
 * Slack Send Message Action Handler
 * 
 * Sends a message to a Slack channel using the Slack API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "slack_action_send_message",
  name: "Send Slack Message",
  description: "Send a message to a Slack channel or user",
  icon: "message-square"
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
 * Sends a message to Slack
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function sendSlackMessage(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Slack OAuth token
    const credentials = await getIntegrationCredentials(userId, "slack")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      channel, 
      message, 
      thread_ts,
      username,
      icon_emoji,
      icon_url,
      unfurl_links = true,
      unfurl_media = true
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!channel) {
      return {
        success: false,
        error: "Missing required parameter: channel"
      }
    }
    
    if (!message) {
      return {
        success: false,
        error: "Missing required parameter: message"
      }
    }
    
    // 5. Prepare the request payload
    const payload: any = {
      channel,
      text: message,
      unfurl_links,
      unfurl_media
    }
    
    // Add optional parameters if provided
    if (thread_ts) payload.thread_ts = thread_ts
    if (username) payload.username = username
    if (icon_emoji) payload.icon_emoji = icon_emoji
    if (icon_url) payload.icon_url = icon_url
    
    // 6. Make Slack API request
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Slack API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        ts: data.ts,
        channel: data.channel,
        message: data.message,
        ok: data.ok
      },
      message: "Message sent successfully to Slack"
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Slack send message failed:", error)
    return {
      success: false,
      error: error.message || "Failed to send Slack message"
    }
  }
} 