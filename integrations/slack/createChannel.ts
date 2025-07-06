/**
 * Slack Create Channel Action Handler
 * 
 * Creates a new Slack channel using the Slack API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "slack_action_create_channel",
  name: "Create Slack Channel",
  description: "Create a new public or private Slack channel",
  icon: "hash"
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
 * Creates a new Slack channel
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createSlackChannel(params: ActionParams): Promise<ActionResult> {
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
      name, 
      is_private = false,
      description
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!name) {
      return {
        success: false,
        error: "Missing required parameter: name"
      }
    }
    
    // 5. Prepare the request payload
    const payload: any = {
      name: name.toLowerCase().replace(/\s+/g, '-'),
      is_private
    }
    
    if (description) {
      payload.description = description
    }
    
    // 6. Make Slack API request
    const response = await fetch('https://slack.com/api/conversations.create', {
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
        channel: data.channel,
        channelId: data.channel.id,
        channelName: data.channel.name,
        isPrivate: data.channel.is_private,
        created: data.channel.created,
        creator: data.channel.creator
      },
      message: `Channel "${data.channel.name}" created successfully`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Slack create channel failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create Slack channel"
    }
  }
} 