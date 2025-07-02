/**
 * Gmail Add Label Action Handler
 * 
 * Adds one or more labels to an email in Gmail
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "gmail_action_add_label",
  name: "Apply Gmail Labels",
  description: "Add one or more labels to existing Gmail messages",
  icon: "tag"
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
 * Adds one or more labels to an email via the Gmail API
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function addGmailLabels(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      messageId, 
      labelIds = [],
      labelNames = []
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!messageId) {
      return {
        success: false,
        error: "Missing required parameter: messageId"
      }
    }
    
    if (labelIds.length === 0 && labelNames.length === 0) {
      return {
        success: false,
        error: "You must specify at least one label ID or label name"
      }
    }
    
    // 5. If label names are provided, get or create those labels
    let allLabelIds = [...labelIds]
    
    if (labelNames.length > 0) {
      const labelIdsFromNames = await getOrCreateLabels(credentials.accessToken, labelNames)
      allLabelIds = [...allLabelIds, ...labelIdsFromNames]
    }
    
    // 6. Make Gmail API request to add labels
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        addLabelIds: allLabelIds,
        removeLabelIds: []
      })
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gmail API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        messageId: data.id,
        threadId: data.threadId,
        labelIds: data.labelIds
      },
      message: `Successfully added ${allLabelIds.length} label(s) to the email`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Gmail add labels failed:", error)
    return {
      success: false,
      error: error.message || "Failed to add labels to email"
    }
  }
}

/**
 * Gets or creates Gmail labels by name
 * 
 * @param accessToken - Gmail API access token
 * @param labelNames - Array of label names to get or create
 * @returns Array of label IDs
 */
async function getOrCreateLabels(accessToken: string, labelNames: string[]): Promise<string[]> {
  // 1. Get existing labels
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get labels: ${errorText}`)
  }
  
  const labelsResponse = await response.json()
  const existingLabels = labelsResponse.labels || []
  
  // 2. Map of existing label names to IDs
  const labelNameToId: Record<string, string> = {}
  existingLabels.forEach((label: any) => {
    labelNameToId[label.name.toLowerCase()] = label.id
  })
  
  // 3. Process each label name
  const labelIds: string[] = []
  for (const name of labelNames) {
    const normalizedName = name.toLowerCase()
    
    // If label exists, use its ID
    if (labelNameToId[normalizedName]) {
      labelIds.push(labelNameToId[normalizedName])
      continue
    }
    
    // Otherwise create a new label
    const createResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      })
    })
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Failed to create label "${name}": ${errorText}`)
    }
    
    const newLabel = await createResponse.json()
    labelIds.push(newLabel.id)
  }
  
  return labelIds
} 