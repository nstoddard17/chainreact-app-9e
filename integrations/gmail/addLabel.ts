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
    
    // 4. Handle multiple emails - convert to array if single email
    const emailIds = Array.isArray(messageId) ? messageId : [messageId]
    
    // 5. Validate required parameters
    if (!messageId || emailIds.length === 0) {
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
    
    // 6. If label names are provided, get or create those labels
    let allLabelIds = [...labelIds]
    
    if (labelNames.length > 0) {
      const labelIdsFromNames = await getOrCreateLabels(credentials.accessToken, labelNames)
      allLabelIds = [...allLabelIds, ...labelIdsFromNames]
    }
    
    // 7. Process each email and add labels
    const results = []
    const errors = []
    
    for (const emailId of emailIds) {
      try {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`, {
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
        
        if (!response.ok) {
          const errorText = await response.text()
          errors.push(`Failed to add labels to email ${emailId}: ${errorText}`)
        } else {
          const data = await response.json()
          results.push({
            messageId: data.id,
            threadId: data.threadId,
            labelIds: data.labelIds
          })
        }
      } catch (error: any) {
        errors.push(`Error processing email ${emailId}: ${error.message}`)
      }
    }
    
    // 8. Return results
    if (errors.length > 0 && results.length === 0) {
      return {
        success: false,
        error: `Failed to add labels to any emails: ${errors.join('; ')}`
      }
    }
    
    const successMessage = results.length === 1 
      ? `Successfully added ${allLabelIds.length} label(s) to 1 email`
      : `Successfully added ${allLabelIds.length} label(s) to ${results.length} emails`
    
    if (errors.length > 0) {
      return {
        success: true,
        output: {
          messageIds: results.map(r => r.messageId),
          threadIds: results.map(r => r.threadId),
          labelIds: allLabelIds,
          errors: errors
        },
        message: `${successMessage} (${errors.length} errors occurred)`
      }
    }
    
    return {
      success: true,
      output: {
        messageIds: results.map(r => r.messageId),
        threadIds: results.map(r => r.threadId),
        labelIds: allLabelIds
      },
      message: successMessage
    }
    
  } catch (error: any) {
    // 10. Handle errors and return failure result
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